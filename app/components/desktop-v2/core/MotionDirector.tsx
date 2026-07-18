'use client';

import {
  Dispatch,
  ReactNode,
  SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { MotionConfig, useReducedMotion } from 'framer-motion';
import {
  DEFAULT_EXPERIENCE_PREFERENCES,
  DESKTOP_EXPERIENCE_PREFERENCES_KEY,
  EffectTier,
  ExperiencePreferences,
  MotionPriority,
  parseExperiencePreferences,
} from '@/app/lib/desktopExperience';

const priorityOrder: readonly MotionPriority[] = [
  'interaction',
  'transition',
  'feedback',
  'ambient',
];

type ActivityCounts = Record<MotionPriority, number>;

const emptyActivityCounts: ActivityCounts = {
  interaction: 0,
  transition: 0,
  feedback: 0,
  ambient: 0,
};

export const MOTION_SPRINGS = {
  drag: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 },
  sharedLayout: { type: 'spring', stiffness: 380, damping: 34 },
  magnetic: { type: 'spring', stiffness: 500, damping: 38 },
} as const;

type PreferenceUpdate =
  | Partial<ExperiencePreferences>
  | ((current: ExperiencePreferences) => Partial<ExperiencePreferences>);

export interface MotionDirectorValue {
  preferences: ExperiencePreferences;
  setPreferences: (update: PreferenceUpdate) => void;
  resetPreferences: () => void;
  systemReducedMotion: boolean;
  reducedMotion: boolean;
  effectTier: EffectTier;
  setAutoTier: Dispatch<SetStateAction<EffectTier>>;
  activePriority: MotionPriority | null;
  ambientIntensity: number;
  startActivity: (priority: MotionPriority) => () => void;
  pulseActivity: (priority: MotionPriority, duration?: number) => () => void;
  isActive: (priority: MotionPriority) => boolean;
  shouldAnimate: (priority: MotionPriority) => boolean;
}

const MotionDirectorContext = createContext<MotionDirectorValue | null>(null);

export function MotionDirectorProvider({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const [preferences, setPreferencesState] =
    useState<ExperiencePreferences>(DEFAULT_EXPERIENCE_PREFERENCES);
  const [autoTier, setAutoTier] = useState<EffectTier>('cinematic');
  const [activities, setActivities] =
    useState<ActivityCounts>(emptyActivityCounts);
  const [storageHydrated, setStorageHydrated] = useState(false);

  useEffect(() => {
    let storedPreferences: string | null = null;
    try {
      storedPreferences = window.localStorage.getItem(
        DESKTOP_EXPERIENCE_PREFERENCES_KEY,
      );
    } catch {
      // Storage can be unavailable in hardened/private browsing contexts.
    }
    setPreferencesState(parseExperiencePreferences(storedPreferences));
    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(
        DESKTOP_EXPERIENCE_PREFERENCES_KEY,
        JSON.stringify(preferences),
      );
    } catch {
      // Preferences remain valid for the current session when storage fails.
    }
  }, [preferences, storageHydrated]);

  const setPreferences = useCallback((update: PreferenceUpdate) => {
    setPreferencesState((current) => ({
      ...current,
      ...(typeof update === 'function' ? update(current) : update),
    }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferencesState(DEFAULT_EXPERIENCE_PREFERENCES);
    setAutoTier('cinematic');
  }, []);

  const startActivity = useCallback((priority: MotionPriority) => {
    let active = true;
    setActivities((current) => ({
      ...current,
      [priority]: current[priority] + 1,
    }));

    return () => {
      if (!active) return;
      active = false;
      setActivities((current) => ({
        ...current,
        [priority]: Math.max(0, current[priority] - 1),
      }));
    };
  }, []);

  const pulseActivity = useCallback(
    (priority: MotionPriority, duration = 520) => {
      const stop = startActivity(priority);
      const timeout = window.setTimeout(stop, duration);
      return () => {
        window.clearTimeout(timeout);
        stop();
      };
    },
    [startActivity],
  );

  const activePriority = useMemo(
    () => priorityOrder.find((priority) => activities[priority] > 0) ?? null,
    [activities],
  );

  const systemReducedMotion = Boolean(prefersReducedMotion);
  const reducedMotion = systemReducedMotion || preferences.reducedMotion;
  const effectTier: EffectTier = reducedMotion
    ? 'safe'
    : preferences.quality === 'auto'
      ? autoTier
      : preferences.quality;

  const ambientIntensity = reducedMotion
    ? 0
    : activePriority === 'interaction'
      ? 0.16
      : activePriority === 'transition'
        ? 0.32
        : activePriority === 'feedback'
          ? 0.58
          : 1;

  const isActive = useCallback(
    (priority: MotionPriority) => activities[priority] > 0,
    [activities],
  );

  const shouldAnimate = useCallback(
    (priority: MotionPriority) => {
      if (reducedMotion) return false;
      if (priority === 'ambient') return ambientIntensity > 0.2;
      return true;
    },
    [ambientIntensity, reducedMotion],
  );

  const value = useMemo<MotionDirectorValue>(
    () => ({
      preferences,
      setPreferences,
      resetPreferences,
      systemReducedMotion,
      reducedMotion,
      effectTier,
      setAutoTier,
      activePriority,
      ambientIntensity,
      startActivity,
      pulseActivity,
      isActive,
      shouldAnimate,
    }),
    [
      activePriority,
      ambientIntensity,
      effectTier,
      isActive,
      preferences,
      pulseActivity,
      reducedMotion,
      resetPreferences,
      setPreferences,
      shouldAnimate,
      startActivity,
      systemReducedMotion,
    ],
  );

  return (
    <MotionDirectorContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
        {children}
      </MotionConfig>
    </MotionDirectorContext.Provider>
  );
}

export function useMotionDirector(): MotionDirectorValue {
  const value = useContext(MotionDirectorContext);
  if (!value) {
    throw new Error(
      'useMotionDirector must be used inside MotionDirectorProvider',
    );
  }
  return value;
}

export function useMotionActivity(
  priority: MotionPriority,
  active: boolean,
): void {
  const { startActivity } = useMotionDirector();

  useEffect(() => {
    if (!active) return;
    return startActivity(priority);
  }, [active, priority, startActivity]);
}
