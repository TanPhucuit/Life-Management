'use client';

import {
  ComponentType,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DESKTOP_EXPERIENCE_QUERY,
  ExperienceMode,
  isDesktopExperienceFlagEnabled,
} from '@/app/lib/desktopExperience';

export interface DesktopExperienceModule<Props extends object> {
  default: ComponentType<Props>;
}

export interface DesktopExperienceGateProps<Props extends object> {
  legacy: ReactNode;
  loadDesktop: () => Promise<DesktopExperienceModule<Props>>;
  desktopProps: Props;
  desktopFallback?: ReactNode;
  enabled?: boolean;
  onLoadError?: (error: unknown) => void;
}

let latchedExperienceMode: ExperienceMode | null = null;

/**
 * Chooses an experience once per mount and deliberately never listens for
 * subsequent viewport changes. Keeping the decision latched prevents a resize
 * from destroying in-progress forms, drags, timers, or inspector state.
 *
 * The desktop importer is only invoked after the desktop media query matches,
 * so its R3F/motion chunks cannot leak into the mobile or tablet bundle path.
 */
export function DesktopExperienceGate<Props extends object>({
  legacy,
  loadDesktop,
  desktopProps,
  desktopFallback,
  enabled = isDesktopExperienceFlagEnabled(),
  onLoadError,
}: DesktopExperienceGateProps<Props>) {
  const [mode, setMode] = useState<ExperienceMode | null>(null);
  const [DesktopComponent, setDesktopComponent] =
    useState<ComponentType<Props> | null>(null);
  const [failed, setFailed] = useState(false);
  const importerRef = useRef(loadDesktop);
  const onLoadErrorRef = useRef(onLoadError);

  useEffect(() => {
    importerRef.current = loadDesktop;
  }, [loadDesktop]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    if (!latchedExperienceMode) {
      latchedExperienceMode =
        enabled && window.matchMedia(DESKTOP_EXPERIENCE_QUERY).matches
          ? 'desktop-cinematic'
          : 'legacy';
    }
    const selectedMode = latchedExperienceMode;

    setMode(selectedMode);

    if (selectedMode !== 'desktop-cinematic') return;

    let cancelled = false;
    void importerRef
      .current()
      .then((module) => {
        if (!cancelled) setDesktopComponent(() => module.default);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailed(true);
        onLoadErrorRef.current?.(error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (mode !== 'desktop-cinematic' || failed) return <>{legacy}</>;
  if (!DesktopComponent) {
    return <>{desktopFallback ?? <DesktopExperienceLoading />}</>;
  }

  return <DesktopComponent {...desktopProps} />;
}

function DesktopExperienceLoading() {
  return (
    <div
      className="grid min-h-dvh place-items-center bg-[#05060d] text-white"
      aria-label="Loading cinematic workspace"
      role="status"
    >
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/15" />
        <span className="absolute inset-2 animate-spin rounded-full border border-cyan-200/20 border-t-cyan-300/90" />
        <span className="h-3 w-3 rounded-full bg-white shadow-[0_0_30px_rgba(103,232,249,.9)]" />
      </div>
    </div>
  );
}
