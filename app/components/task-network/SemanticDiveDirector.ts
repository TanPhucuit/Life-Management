export type SemanticDivePhase = 'idle' | 'lock' | 'dive' | 'reconstruct' | 'settle';
export type SemanticDiveDirection = 'forward' | 'reverse';

export type SemanticDiveRunOptions = {
  direction: SemanticDiveDirection;
  portal: { x: number; y: number };
  reducedMotion: boolean;
  onPhase?: (phase: SemanticDivePhase, runId: number) => void;
  onSwap?: (runId: number) => void;
  onComplete?: (runId: number) => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (value: number) => {
  const progress = clamp01(value);
  return progress < .5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);

export class SemanticDiveDirector {
  private host: HTMLElement;
  private frame: number | null = null;
  private runId = 0;
  private startedAt = 0;
  private pausedAt = 0;
  private currentOptions: SemanticDiveRunOptions | null = null;
  private currentPhase: SemanticDivePhase = 'idle';
  private swapped = false;

  constructor(host: HTMLElement) {
    this.host = host;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  start(options: SemanticDiveRunOptions) {
    this.cancelFrame();
    this.runId += 1;
    this.currentOptions = options;
    this.startedAt = performance.now();
    this.pausedAt = 0;
    this.swapped = false;
    this.currentPhase = 'idle';
    this.host.dataset.diveDirection = options.direction;
    this.host.style.setProperty('--dive-portal-x', `${options.portal.x.toFixed(2)}px`);
    this.host.style.setProperty('--dive-portal-y', `${options.portal.y.toFixed(2)}px`);
    this.host.style.setProperty('--dive-overlay-opacity', '1');
    this.host.style.setProperty('--dive-overlay-scale', '1');
    this.host.style.setProperty('--dive-live-opacity', '0');
    this.host.style.setProperty('--dive-live-scale', options.reducedMotion ? '.985' : '.72');
    this.host.style.setProperty('--dive-blur', '0px');
    this.host.style.setProperty('--dive-grid-rotate', '0deg');
    this.host.style.setProperty('--dive-grid-scale', '1');
    this.host.style.setProperty('--dive-grid-size-x', '26px');
    this.host.style.setProperty('--dive-grid-size-y', '26px');
    this.host.style.setProperty('--dive-portal-scale', '.35');
    this.host.style.setProperty('--dive-field-scale', '.3');
    this.host.style.setProperty('--dive-grid-opacity', '.38');
    this.host.style.setProperty('--dive-portal-opacity', '.12');
    this.setPhase(options.reducedMotion ? 'dive' : 'lock');
    this.frame = window.requestAnimationFrame(this.tick);
    return this.runId;
  }

  cancel() {
    this.runId += 1;
    this.cancelFrame();
    this.currentOptions = null;
    this.clearVisualState();
  }

  destroy() {
    this.cancel();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private tick = (frameAt: number) => {
    this.frame = null;
    const options = this.currentOptions;
    if (!options || document.hidden) return;
    const duration = options.reducedMotion ? 260 : 1400;
    const elapsed = Math.min(duration, frameAt - this.startedAt);

    if (options.reducedMotion) {
      const progress = clamp01(elapsed / duration);
      const swapAt = .46;
      this.setPhase(progress < swapAt ? 'dive' : progress < .82 ? 'reconstruct' : 'settle');
      if (!this.swapped && progress >= swapAt) this.swap();
      this.host.style.setProperty('--dive-overlay-opacity', `${1 - easeOut(progress)}`);
      this.host.style.setProperty('--dive-overlay-scale', `${1 + progress * .018}`);
      this.host.style.setProperty('--dive-live-opacity', `${easeOut(clamp01((progress - swapAt) / (1 - swapAt)))}`);
      this.host.style.setProperty('--dive-live-scale', `${.985 + easeOut(progress) * .015}`);
      this.host.style.setProperty('--dive-blur', '0px');
      this.host.style.setProperty('--dive-tunnel', '0');
      this.host.style.setProperty('--dive-portal-scale', `${.35 + progress * .18}`);
      this.host.style.setProperty('--dive-portal-opacity', `${.12 + progress * .88}`);
      this.host.style.setProperty('--dive-field-scale', `${(.3 + progress * .7).toFixed(3)}`);
    } else {
      const lock = clamp01(elapsed / 180);
      const dive = clamp01((elapsed - 180) / 470);
      const reconstruct = clamp01((elapsed - 650) / 400);
      const settle = clamp01((elapsed - 1050) / 350);
      const direction = options.direction === 'forward' ? 1 : -1;
      const lockProgress = easeOut(lock);
      const diveProgress = easeInOut(dive);
      const reconstructProgress = easeOut(reconstruct);
      const viewportCenterX = this.host.clientWidth * .5;
      const viewportCenterY = this.host.clientHeight * .5;
      const travelX = (viewportCenterX - options.portal.x) * diveProgress;
      const travelY = (viewportCenterY - options.portal.y) * diveProgress;
      const diveScale = options.direction === 'forward'
        ? 1 + diveProgress * 5.8
        : 1 - diveProgress * .84;
      const blur = Math.sin(Math.PI * dive) * 3.8;
      const liveScale = reconstruct < 1
        ? .72 + easeOut(reconstruct) * .298
        : 1.018 - easeOut(settle) * .018;

      if (elapsed < 180) this.setPhase('lock');
      else if (elapsed < 650) this.setPhase('dive');
      else if (elapsed < 1050) this.setPhase('reconstruct');
      else this.setPhase('settle');
      if (!this.swapped && elapsed >= 650) this.swap();
      this.applyTargetLock(lockProgress, options.portal);
      this.applyDiveField(diveProgress, direction);

      const tunnel = Math.max(0, direction * diveProgress * (1 - reconstruct));

      this.host.style.setProperty('--dive-lock', `${lockProgress}`);
      this.host.style.setProperty('--dive-progress', `${diveProgress}`);
      this.host.style.setProperty('--dive-camera-x', `${travelX.toFixed(2)}px`);
      this.host.style.setProperty('--dive-camera-y', `${travelY.toFixed(2)}px`);
      this.host.style.setProperty('--dive-overlay-scale', `${diveScale}`);
      this.host.style.setProperty('--dive-overlay-opacity', `${1 - reconstructProgress}`);
      this.host.style.setProperty('--dive-live-scale', `${liveScale}`);
      this.host.style.setProperty('--dive-live-opacity', `${reconstructProgress}`);
      this.host.style.setProperty('--dive-blur', `${blur.toFixed(2)}px`);
      this.host.style.setProperty('--dive-tunnel', `${tunnel.toFixed(3)}`);
      this.host.style.setProperty('--dive-reconstruct', `${reconstructProgress}`);
      this.host.style.setProperty('--dive-grid-rotate', `${(direction * lockProgress * 2.4 + tunnel * 58).toFixed(2)}deg`);
      this.host.style.setProperty('--dive-grid-scale', `${(1 + lockProgress * .025 + diveProgress * 1.6).toFixed(3)}`);
      this.host.style.setProperty('--dive-grid-size-x', `${(26 - diveProgress * 13).toFixed(2)}px`);
      this.host.style.setProperty('--dive-grid-size-y', `${(26 + diveProgress * 22).toFixed(2)}px`);
      this.host.style.setProperty('--dive-portal-scale', `${(.35 + lockProgress * .32 + diveProgress * 1.75).toFixed(3)}`);
      this.host.style.setProperty('--dive-grid-opacity', `${(.38 + diveProgress * .34).toFixed(3)}`);
      this.host.style.setProperty('--dive-portal-opacity', `${(.12 + lockProgress * .88).toFixed(3)}`);
      this.host.style.setProperty('--dive-field-scale', `${(.3 + lockProgress * .38 + diveProgress * 5.6).toFixed(3)}`);
    }

    if (elapsed >= duration) {
      const completedRun = this.runId;
      this.currentOptions = null;
      this.currentPhase = 'idle';
      options.onComplete?.(completedRun);
      window.requestAnimationFrame(() => {
        if (this.runId === completedRun && !this.currentOptions) this.clearVisualState();
      });
      return;
    }
    this.frame = window.requestAnimationFrame(this.tick);
  };

  private setPhase(phase: SemanticDivePhase) {
    if (phase === this.currentPhase) return;
    this.currentPhase = phase;
    this.host.dataset.divePhase = phase;
    this.currentOptions?.onPhase?.(phase, this.runId);
  }

  private swap() {
    this.swapped = true;
    this.currentOptions?.onSwap?.(this.runId);
  }

  private applyTargetLock(progress: number, portal: { x: number; y: number }) {
    if (!progress) return;
    const positions = new Map<string, { x: number; y: number }>();
    this.host.querySelectorAll<HTMLElement>('.semantic-dive-node').forEach((element) => {
      const x = Number.parseFloat(element.style.getPropertyValue('--snapshot-x'));
      const y = Number.parseFloat(element.style.getPropertyValue('--snapshot-y'));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const offsetX = (portal.x - x) * .045 * progress;
      const offsetY = (portal.y - y) * .045 * progress;
      element.style.setProperty('--dive-lock-x', `${offsetX.toFixed(2)}px`);
      element.style.setProperty('--dive-lock-y', `${offsetY.toFixed(2)}px`);
      positions.set(element.dataset.nodeId || '', { x: x + offsetX, y: y + offsetY });
    });
    this.host.querySelectorAll<SVGPathElement>('.semantic-dive-overlay path[data-from]').forEach((path) => {
      const from = positions.get(path.dataset.from || '');
      const to = positions.get(path.dataset.to || '');
      if (!from || !to) return;
      const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
      const bend = Math.min(42, distance * .11);
      const baseControlX = (from.x + to.x) / 2 - (to.y - from.y) / distance * bend;
      const baseControlY = (from.y + to.y) / 2 + (to.x - from.x) / distance * bend;
      const pull = .32 * progress;
      const controlX = baseControlX + (portal.x - baseControlX) * pull;
      const controlY = baseControlY + (portal.y - baseControlY) * pull;
      path.setAttribute('d', `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
    });
  }

  private applyDiveField(progress: number, direction: number) {
    this.host.querySelectorAll<HTMLElement>('.semantic-dive-node').forEach((element) => {
      const orbit = Number.parseFloat(element.style.getPropertyValue('--snapshot-orbit')) || 0;
      const curve = Math.sin(progress * Math.PI * .82);
      element.style.setProperty('--dive-orbit-x', `${(orbit * progress * direction).toFixed(2)}px`);
      element.style.setProperty('--dive-orbit-y', `${(-Math.abs(orbit) * curve * .34).toFixed(2)}px`);
      element.style.setProperty('--dive-orbit-rotate', `${(orbit * progress * .055 * direction).toFixed(2)}deg`);
    });
  }

  private clearVisualState() {
    delete this.host.dataset.divePhase;
    delete this.host.dataset.diveDirection;
    [
      '--dive-lock', '--dive-progress', '--dive-camera-x', '--dive-camera-y',
      '--dive-overlay-scale', '--dive-overlay-opacity', '--dive-live-scale',
      '--dive-live-opacity', '--dive-blur', '--dive-tunnel', '--dive-reconstruct',
      '--dive-live-origin-x', '--dive-live-origin-y',
      '--dive-grid-rotate', '--dive-grid-scale', '--dive-grid-size-x',
      '--dive-grid-size-y', '--dive-portal-scale',
      '--dive-grid-opacity', '--dive-portal-opacity', '--dive-field-scale',
    ].forEach((property) => this.host.style.removeProperty(property));
  }

  private cancelFrame() {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.pausedAt = performance.now();
      this.cancelFrame();
      return;
    }
    if (!this.currentOptions) return;
    if (this.pausedAt) this.startedAt += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    this.frame = window.requestAnimationFrame(this.tick);
  };
}
