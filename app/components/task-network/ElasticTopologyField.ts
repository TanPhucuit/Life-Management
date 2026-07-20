export type FieldPosition = { x: number; y: number };

export type FieldNodeInput = {
  id: string;
  target: FieldPosition;
  parentId: string | null;
  depth: number;
  descendantCount: number;
  importance: number;
  radius: number;
  selected: boolean;
};

export type FieldEdgeInput = { key: string; from: string; to: string };

type FieldNode = FieldNodeInput & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  damping: number;
  delayUntil: number;
  pinned: FieldPosition | null;
  targetAngle: number;
  sectorHalfAngle: number;
  fieldX: number;
  fieldY: number;
  fieldResponse: number;
};

type DirectManipulation = {
  sourceId: string;
  origin: FieldPosition;
  current: FieldPosition;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const deterministicAngle = (id: string) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2;
};

export class ElasticTopologyField {
  private nodes = new Map<string, FieldNode>();
  private edges: FieldEdgeInput[] = [];
  private edgeByKey = new Map<string, FieldEdgeInput>();
  private nodeElements = new Map<string, HTMLElement>();
  private edgeElements = new Map<string, SVGPathElement>();
  private reverseEdgeElements = new Map<string, SVGPathElement>();
  private frame: number | null = null;
  private lastFrameAt = 0;
  private quietFrames = 0;
  private destroyed = false;
  private reducedMotion = false;
  private sourceId: string | null = null;
  private stage: HTMLElement | null = null;
  private viewport: HTMLElement | null = null;
  private paused = false;
  private manipulation: DirectManipulation | null = null;
  // Per-edge stroke-draw state. While an entry exists the connector is drawn
  // progressively from the child end toward the parent, using the element's
  // real geometric length so it works regardless of how `d` changes each frame.
  private edgeReveal = new Map<string, { start: number; duration: number }>();

  constructor(stage: HTMLElement, viewport: HTMLElement) {
    this.stage = stage;
    this.viewport = viewport;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    viewport.addEventListener('scroll', this.handleViewportActivity, { passive: true });
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }

  registerNode(id: string, element: HTMLElement | null) {
    if (element) {
      this.nodeElements.set(id, element);
      const node = this.nodes.get(id);
      if (node) element.style.transform = `translate3d(${node.x.toFixed(2)}px,${node.y.toFixed(2)}px,0)`;
    }
    else this.nodeElements.delete(id);
  }

  registerEdge(key: string, element: SVGPathElement | null, reverse = false) {
    const collection = reverse ? this.reverseEdgeElements : this.edgeElements;
    if (element) {
      // A brand-new forward connector must start hidden BEFORE its first paint.
      // Ref callbacks fire synchronously during commit, so marking it for reveal
      // here — before the first renderEdge() call below — means the very first
      // frame already shows the hidden (dashoffset = -length) state. Waiting for
      // a separate effect to call revealEdge() one tick later would let the
      // browser paint the fully-drawn line for a frame first (a visible flash),
      // which is exactly the "appears instantly" symptom this replaces.
      const isNewForward = !reverse && !collection.has(key);
      collection.set(key, element);
      if (isNewForward && !this.reducedMotion) {
        this.edgeReveal.set(key, { start: performance.now(), duration: 1150 });
        this.quietFrames = 0;
        this.start();
      }
      this.renderEdge(key);
    }
    else {
      collection.delete(key);
      if (!reverse) this.edgeReveal.delete(key);
    }
  }

  // Start (or restart) drawing a forward connector from its child end toward
  // the parent over `duration` ms. Safe to call the moment the path mounts.
  revealEdge(key: string, duration = 1150) {
    if (this.reducedMotion) return;
    this.edgeReveal.set(key, { start: performance.now(), duration });
    this.quietFrames = 0;
    this.renderEdge(key);
    this.start();
  }

  pause() {
    this.paused = true;
    this.stop();
  }

  resume() {
    this.paused = false;
    this.quietFrames = 0;
    this.start();
  }

  sync(nodeInputs: FieldNodeInput[], edges: FieldEdgeInput[], sourceId?: string | null) {
    if (this.destroyed) return;
    const now = performance.now();
    const nextIds = new Set(nodeInputs.map((node) => node.id));
    this.nodes.forEach((_, id) => {
      if (!nextIds.has(id)) this.nodes.delete(id);
    });
    this.edges = edges;
    this.edgeByKey = new Map(edges.map((edge) => [edge.key, edge]));
    this.sourceId = sourceId || null;

    const waveDistance = this.getWaveDistances(sourceId || null, edges);
    [...nodeInputs].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id)).forEach((input) => {
      const existing = this.nodes.get(input.id);
      const parent = input.parentId ? this.nodes.get(input.parentId) : null;
      const angle = deterministicAngle(input.id);
      const targetAngle = parent
        ? Math.atan2(input.target.y - parent.target.y, input.target.x - parent.target.x)
        : angle;
      const mass = 1 + Math.log2(input.descendantCount + 1) * .34 + input.depth * .07 + input.importance * .42 + (input.selected ? .78 : 0);
      const delay = clamp((waveDistance.get(input.id) || 0) * 58, 0, 520);
      if (existing) {
        Object.assign(existing, input, {
          mass,
          damping: clamp(.72 + mass * .018, .74, .84),
          delayUntil: now + delay,
          targetAngle,
          sectorHalfAngle: clamp(.7 / Math.max(1, input.depth), .18, .62),
          fieldResponse: clamp(Math.exp(-(waveDistance.get(input.id) || 0) * .34), .18, 1),
        });
        return;
      }
      const origin = parent || null;
      this.nodes.set(input.id, {
        ...input,
        x: origin ? origin.x + Math.cos(angle) * 14 : input.target.x,
        y: origin ? origin.y + Math.sin(angle) * 14 : input.target.y,
        vx: 0,
        vy: 0,
        mass,
        damping: clamp(.72 + mass * .018, .74, .84),
        delayUntil: now + delay,
        pinned: null,
        targetAngle,
        sectorHalfAngle: clamp(.7 / Math.max(1, input.depth), .18, .62),
        fieldX: 0,
        fieldY: 0,
        fieldResponse: clamp(Math.exp(-(waveDistance.get(input.id) || 0) * .34), .18, 1),
      });
    });

    if (this.reducedMotion) {
      this.nodes.forEach((node) => {
        node.x = node.target.x;
        node.y = node.target.y;
        node.vx = 0;
        node.vy = 0;
      });
      this.render();
      this.stop();
      return;
    }
    this.render();
    this.quietFrames = 0;
    this.start();
  }

  kick(sourceId?: string | null, strength = .58) {
    const origin = sourceId ? this.nodes.get(sourceId) : null;
    if (origin) {
      this.nodes.forEach((node) => {
        if (node.id === origin.id) return;
        const dx = node.x - origin.x;
        const dy = node.y - origin.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const impulse = strength * Math.exp(-distance / 520);
        node.vx += dx / distance * impulse;
        node.vy += dy / distance * impulse;
      });
    }
    this.quietFrames = 0;
    this.start();
  }

  pin(id: string, position: FieldPosition) {
    const node = this.nodes.get(id);
    if (!node) return;
    if (!node.pinned || this.manipulation?.sourceId !== id) {
      const distances = this.getWaveDistances(id, this.edges);
      this.nodes.forEach((candidate) => {
        const graphDistance = distances.get(candidate.id);
        candidate.fieldResponse = graphDistance === undefined
          ? .18
          : clamp(Math.exp(-graphDistance * .34), .18, 1);
      });
      this.manipulation = {
        sourceId: id,
        origin: { x: node.x, y: node.y },
        current: { ...position },
      };
    } else {
      this.manipulation.current = { ...position };
    }
    node.pinned = position;
    node.x = position.x;
    node.y = position.y;
    node.vx = 0;
    node.vy = 0;
    this.quietFrames = 0;
    this.render();
    this.start();
  }

  // Pin a node hard to a position WITHOUT engaging the manipulation "field"
  // (the elastic wobble it normally radiates to neighbours). Used for the comet
  // head so followers move only via their own retargeted spring — no double
  // push that would make them overshoot.
  pinSilent(id: string, position: FieldPosition) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.manipulation = null;
    node.pinned = position;
    node.x = position.x;
    node.y = position.y;
    node.vx = 0;
    node.vy = 0;
    this.quietFrames = 0;
    this.start();
  }

  pinMany(positions: Record<string, FieldPosition>) {
    this.manipulation = null;
    Object.entries(positions).forEach(([id, position]) => {
      const node = this.nodes.get(id);
      if (!node) return;
      node.pinned = position;
      node.x = position.x;
      node.y = position.y;
      node.vx = 0;
      node.vy = 0;
    });
    this.quietFrames = 0;
    this.render();
    this.start();
  }

  // Unlike pin/pinMany (which snap a node's position exactly, every frame),
  // retarget only moves the spring's destination — the node still eases
  // toward it under its own stiffness/damping. Used for a "comet trail" drag:
  // the dragged node tracks the pointer 1:1 (pinned), while its followers
  // retarget toward a moving point and visibly lag behind, catching up once
  // the target stops moving.
  retarget(id: string, target: FieldPosition) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.pinned = null;
    node.target = target;
    this.quietFrames = 0;
    this.start();
  }

  retargetMany(targets: Record<string, FieldPosition>) {
    Object.entries(targets).forEach(([id, target]) => {
      const node = this.nodes.get(id);
      if (!node) return;
      node.pinned = null;
      node.target = target;
    });
    this.quietFrames = 0;
    this.start();
  }

  release(id: string) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.pinned = null;
    if (this.manipulation?.sourceId === id) this.manipulation = null;
    this.quietFrames = 0;
    this.start();
  }

  releaseMany(ids: Iterable<string>) {
    let firstReleased: string | null = null;
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (!node) continue;
      node.pinned = null;
      firstReleased ||= id;
    }
    if (!firstReleased) return;
    this.manipulation = null;
    this.quietFrames = 0;
    this.start();
  }

  getPosition(id: string): FieldPosition | null {
    const node = this.nodes.get(id);
    return node ? { x: node.x, y: node.y } : null;
  }

  snapshot() {
    return Object.fromEntries([...this.nodes.entries()].map(([id, node]) => [id, { x: node.x, y: node.y }]));
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.viewport?.removeEventListener('scroll', this.handleViewportActivity);
    this.nodes.clear();
    this.edgeByKey.clear();
    this.nodeElements.clear();
    this.edgeElements.clear();
    this.reverseEdgeElements.clear();
    this.manipulation = null;
    this.stage = null;
    this.viewport = null;
  }

  private getWaveDistances(sourceId: string | null, edges: FieldEdgeInput[]) {
    const distances = new Map<string, number>();
    if (!sourceId) return distances;
    const neighbors = new Map<string, string[]>();
    edges.forEach((edge) => {
      neighbors.set(edge.from, [...(neighbors.get(edge.from) || []), edge.to]);
      neighbors.set(edge.to, [...(neighbors.get(edge.to) || []), edge.from]);
    });
    const queue = [sourceId];
    distances.set(sourceId, 0);
    while (queue.length) {
      const current = queue.shift() as string;
      const distance = distances.get(current) || 0;
      (neighbors.get(current) || []).forEach((neighbor) => {
        if (distances.has(neighbor)) return;
        distances.set(neighbor, distance + 1);
        queue.push(neighbor);
      });
    }
    return distances;
  }

  private start() {
    if (this.frame !== null || this.destroyed || this.paused || document.hidden) return;
    this.lastFrameAt = performance.now();
    this.frame = window.requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private tick = (frameAt: number) => {
    this.frame = null;
    if (this.destroyed || document.hidden) return;
    const frameScale = clamp((frameAt - this.lastFrameAt) / 16.67, .45, 1.8);
    this.lastFrameAt = frameAt;
    const activeNodes = this.getActiveNodes();
    const directManipulationActive = activeNodes.some((node) => node.pinned !== null);
    const forces = new Map<string, FieldPosition>();
    activeNodes.forEach((node) => forces.set(node.id, { x: 0, y: 0 }));

    activeNodes.forEach((node) => {
      const force = forces.get(node.id) as FieldPosition;
      if (node.pinned) {
        node.x = node.pinned.x;
        node.y = node.pinned.y;
        node.vx = 0;
        node.vy = 0;
        return;
      }
      const manipulation = this.manipulation;
      const manipulationX = manipulation ? manipulation.current.x - manipulation.origin.x : 0;
      const manipulationY = manipulation ? manipulation.current.y - manipulation.origin.y : 0;
      const manipulationDistance = Math.max(1, Math.hypot(manipulationX, manipulationY));
      const boundedManipulation = Math.min(150, manipulationDistance);
      const desiredFieldX = manipulation ? manipulationX / manipulationDistance * boundedManipulation * node.fieldResponse : 0;
      const desiredFieldY = manipulation ? manipulationY / manipulationDistance * boundedManipulation * node.fieldResponse : 0;
      const fieldFollow = manipulation ? .14 + node.fieldResponse * .16 : .11;
      node.fieldX += (desiredFieldX - node.fieldX) * fieldFollow * frameScale;
      node.fieldY += (desiredFieldY - node.fieldY) * fieldFollow * frameScale;
      if (frameAt < node.delayUntil) return;
      // While something is being dragged, followers ease toward their retargeted
      // point with a springier stiffness than before (.026 → .055) so the comet
      // trail visibly tracks the head instead of lagging so far it feels
      // disconnected, yet still trails enough to read as a tail.
      const stiffness = (directManipulationActive ? .055 : node.selected ? .105 : .065) / node.mass;
      force.x += (node.target.x + node.fieldX - node.x) * stiffness;
      force.y += (node.target.y + node.fieldY - node.y) * stiffness;
      if (node.parentId) {
        const parent = this.nodes.get(node.parentId);
        if (parent) {
          const currentAngle = Math.atan2(node.y - parent.y, node.x - parent.x);
          const angularError = Math.atan2(Math.sin(currentAngle - node.targetAngle), Math.cos(currentAngle - node.targetAngle));
          if (Math.abs(angularError) > node.sectorHalfAngle) {
            const correction = (Math.abs(angularError) - node.sectorHalfAngle) * Math.sign(angularError) * -.42;
            force.x += -Math.sin(currentAngle) * correction;
            force.y += Math.cos(currentAngle) * correction;
          }
        }
      }
    });

    this.edges.forEach((edge) => {
      const parent = this.nodes.get(edge.from);
      const child = this.nodes.get(edge.to);
      if (!parent || !child) return;
      const targetX = child.target.x - parent.target.x;
      const targetY = child.target.y - parent.target.y;
      const targetDistance = Math.max(1, Math.hypot(targetX, targetY));
      const desiredDistance = clamp(targetDistance, 100, 220);
      const desiredX = targetX / targetDistance * desiredDistance;
      const desiredY = targetY / targetDistance * desiredDistance;
      const errorX = child.x - parent.x - desiredX;
      const errorY = child.y - parent.y - desiredY;
      const parentForce = forces.get(parent.id);
      const childForce = forces.get(child.id);
      if (parentForce && !parent.pinned) {
        parentForce.x += errorX * (directManipulationActive ? .02 : .012) / parent.mass;
        parentForce.y += errorY * (directManipulationActive ? .02 : .012) / parent.mass;
      }
      if (childForce && !child.pinned) {
        childForce.x -= errorX * (directManipulationActive ? .034 : .02) / child.mass;
        childForce.y -= errorY * (directManipulationActive ? .034 : .02) / child.mass;
      }
    });

    const cellSize = 260;
    const spatial = new Map<string, FieldNode[]>();
    activeNodes.forEach((node) => {
      const key = `${Math.floor(node.x / cellSize)}:${Math.floor(node.y / cellSize)}`;
      spatial.set(key, [...(spatial.get(key) || []), node]);
    });
    activeNodes.forEach((node) => {
      const cellX = Math.floor(node.x / cellSize);
      const cellY = Math.floor(node.y / cellSize);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          (spatial.get(`${cellX + offsetX}:${cellY + offsetY}`) || []).forEach((other) => {
            if (other.id <= node.id) return;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const rawDistance = Math.hypot(dx, dy);
            const distance = Math.max(1, rawDistance);
            const minimum = node.radius + other.radius + 22;
            const influenceRadius = Math.max(260, minimum);
            if (distance >= influenceRadius) return;
            const normalizedDistance = (influenceRadius - distance) / influenceRadius;
            const repulsion = normalizedDistance * normalizedDistance * (directManipulationActive ? .2 : .34);
            const overlap = distance < minimum ? (minimum - distance) * .052 : 0;
            const angle = rawDistance < 1 ? deterministicAngle(`${node.id}:${other.id}`) : Math.atan2(dy, dx);
            const pushX = Math.cos(angle) * (overlap + repulsion);
            const pushY = Math.sin(angle) * (overlap + repulsion);
            const nodeForce = forces.get(node.id);
            const otherForce = forces.get(other.id);
            if (nodeForce && !node.pinned) {
              nodeForce.x -= pushX / node.mass;
              nodeForce.y -= pushY / node.mass;
            }
            if (otherForce && !other.pinned) {
              otherForce.x += pushX / other.mass;
              otherForce.y += pushY / other.mass;
            }
          });
        }
      }
    });

    let energy = 0;
    activeNodes.forEach((node) => {
      if (frameAt < node.delayUntil) return;
      const force = forces.get(node.id) || { x: 0, y: 0 };
      const damping = node.pinned ? .62 : node.damping;
      node.vx = (node.vx + force.x * frameScale) * damping;
      node.vy = (node.vy + force.y * frameScale) * damping;
      const speed = Math.hypot(node.vx, node.vy);
      const maximumSpeed = node.pinned ? 30 : 16;
      if (speed > maximumSpeed) {
        node.vx = node.vx / speed * maximumSpeed;
        node.vy = node.vy / speed * maximumSpeed;
      }
      node.x += node.vx * frameScale;
      node.y += node.vy * frameScale;
      energy += Math.abs(node.vx) + Math.abs(node.vy)
        + Math.hypot(node.target.x + node.fieldX - node.x, node.target.y + node.fieldY - node.y) * .008
        + Math.hypot(node.fieldX, node.fieldY) * .002;
    });
    this.render();
    this.quietFrames = energy / Math.max(1, activeNodes.length) < .018 ? this.quietFrames + 1 : 0;
    // Keep animating while nodes are still settling OR any connector is still
    // being drawn, so the stroke-draw always runs to completion.
    if (this.quietFrames < 18 || this.edgeReveal.size > 0) this.frame = window.requestAnimationFrame(this.tick);
    else if (![...this.nodes.values()].some((node) => node.pinned)) {
      this.nodes.forEach((node) => {
        node.x = node.target.x;
        node.y = node.target.y;
        node.vx = 0;
        node.vy = 0;
        node.fieldX = 0;
        node.fieldY = 0;
      });
      this.render();
    }
  };

  private getActiveNodes() {
    if (!this.viewport || this.nodes.size <= 170) return [...this.nodes.values()];
    const left = this.viewport.scrollLeft - 520;
    const top = this.viewport.scrollTop - 520;
    const right = left + this.viewport.clientWidth + 1040;
    const bottom = top + this.viewport.clientHeight + 1040;
    const related = new Set<string>();
    let currentId = this.sourceId;
    while (currentId && !related.has(currentId)) {
      related.add(currentId);
      currentId = this.nodes.get(currentId)?.parentId || null;
    }
    return [...this.nodes.values()].filter((node) => node.pinned || related.has(node.id)
      || (node.x >= left && node.x <= right && node.y >= top && node.y <= bottom));
  }

  private render() {
    let velocityX = 0;
    let velocityY = 0;
    let energy = 0;
    this.nodes.forEach((node) => {
      const element = this.nodeElements.get(node.id);
      if (element) element.style.transform = `translate3d(${node.x.toFixed(2)}px,${node.y.toFixed(2)}px,0)`;
      velocityX += node.vx;
      velocityY += node.vy;
      energy += Math.hypot(node.vx, node.vy);
    });
    this.edges.forEach((edge) => this.renderEdge(edge.key));
    if (this.stage) {
      const count = Math.max(1, this.nodes.size);
      const dragX = this.manipulation ? (this.manipulation.current.x - this.manipulation.origin.x) * .085 : 0;
      const dragY = this.manipulation ? (this.manipulation.current.y - this.manipulation.origin.y) * .085 : 0;
      this.stage.style.setProperty('--field-x', `${clamp(velocityX / count + dragX, -28, 28).toFixed(2)}px`);
      this.stage.style.setProperty('--field-y', `${clamp(velocityY / count + dragY, -28, 28).toFixed(2)}px`);
      const normalizedEnergy = clamp(energy / count / 4, 0, 1);
      this.stage.style.setProperty('--field-energy', normalizedEnergy.toFixed(3));
      this.stage.style.setProperty('--field-scale', (1 + normalizedEnergy * .008).toFixed(4));
    }
  }

  private renderEdge(key: string) {
    const edge = this.edgeByKey.get(key);
    if (!edge) return;
      const from = this.nodes.get(edge.from);
      const to = this.nodes.get(edge.to);
      if (!from || !to) return;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const relativeVelocity = (to.vx - from.vx) * -dy / distance + (to.vy - from.vy) * dx / distance;
      const baseBend = Math.min(44, distance * .105);
      const bend = clamp(baseBend + relativeVelocity * 2.4, -72, 72);
      const controlX = (from.x + to.x) / 2 - dy / distance * bend;
      const controlY = (from.y + to.y) / 2 + dx / distance * bend;
      const path = `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
      const reversePath = `M ${to.x.toFixed(2)} ${to.y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${from.x.toFixed(2)} ${from.y.toFixed(2)}`;
      const forwardElement = this.edgeElements.get(edge.key);
      forwardElement?.setAttribute('d', path);
      this.reverseEdgeElements.get(edge.key)?.setAttribute('d', reversePath);

      // Progressive draw: reveal the connector from the child end (path end)
      // growing back toward the parent (path start). Uses the real path length
      // so it's immune to the per-frame `d` updates above.
      const reveal = this.edgeReveal.get(key);
      if (forwardElement && reveal) {
        const elapsed = performance.now() - reveal.start;
        const t = clamp(elapsed / reveal.duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        let length = distance;
        try { length = forwardElement.getTotalLength() || distance; } catch { length = distance; }
        forwardElement.style.strokeDasharray = `${length}`;
        // offset length*(eased-1): eased 0 → -length (hidden); eased 1 → 0
        // (fully drawn), sliding the dash in from the child end.
        forwardElement.style.strokeDashoffset = `${length * (eased - 1)}`;
        if (t >= 1) {
          this.edgeReveal.delete(key);
          forwardElement.style.strokeDasharray = '';
          forwardElement.style.strokeDashoffset = '';
        }
      }
  }

  private handleVisibilityChange = () => {
    if (document.hidden) this.stop();
    else if (!this.paused) this.resume();
  };

  private handleViewportActivity = () => {
    if (!this.paused && this.nodes.size > 170) this.start();
  };
}
