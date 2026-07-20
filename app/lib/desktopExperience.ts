export type ExperienceMode = 'legacy' | 'desktop-cinematic';

export type EffectTier = 'ultra' | 'cinematic' | 'balanced' | 'safe';

export type EffectQuality = 'auto' | EffectTier;

export type MotionPriority = 'interaction' | 'transition' | 'feedback' | 'ambient';

export type DesktopPlanMode = 'inbox' | 'calendar' | 'spaces';

export interface ExperiencePreferences {
  quality: EffectQuality;
  reducedMotion: boolean;
  celebrations: boolean;
  cursorEffects: boolean;
}

export interface SceneSnapshot {
  route: string;
  completion: number;
  overdue: number;
  activeSpaces: number;
  focusedMinutes: number;
  cycleCount: number;
}

export const DESKTOP_EXPERIENCE_QUERY =
  '(min-width: 1024px) and (pointer: fine) and (hover: hover)';

export const DESKTOP_EXPERIENCE_PREFERENCES_KEY =
  'life-manager-desktop-experience';

export const DEFAULT_EXPERIENCE_PREFERENCES: ExperiencePreferences = {
  quality: 'auto',
  reducedMotion: false,
  celebrations: true,
  cursorEffects: true,
};

const effectQualities: readonly EffectQuality[] = [
  'auto',
  'ultra',
  'cinematic',
  'balanced',
  'safe',
];

export function isEffectQuality(value: unknown): value is EffectQuality {
  return typeof value === 'string' && effectQualities.includes(value as EffectQuality);
}

export function parseExperiencePreferences(value: string | null): ExperiencePreferences {
  if (!value) return DEFAULT_EXPERIENCE_PREFERENCES;

  try {
    const candidate = JSON.parse(value) as Partial<ExperiencePreferences>;
    return {
      quality: isEffectQuality(candidate.quality)
        ? candidate.quality
        : DEFAULT_EXPERIENCE_PREFERENCES.quality,
      reducedMotion:
        typeof candidate.reducedMotion === 'boolean'
          ? candidate.reducedMotion
          : DEFAULT_EXPERIENCE_PREFERENCES.reducedMotion,
      celebrations:
        typeof candidate.celebrations === 'boolean'
          ? candidate.celebrations
          : DEFAULT_EXPERIENCE_PREFERENCES.celebrations,
      cursorEffects:
        typeof candidate.cursorEffects === 'boolean'
          ? candidate.cursorEffects
          : DEFAULT_EXPERIENCE_PREFERENCES.cursorEffects,
    };
  } catch {
    return DEFAULT_EXPERIENCE_PREFERENCES;
  }
}

export function isDesktopExperienceFlagEnabled(): boolean {
  // The task topology is the released desktop experience, not an optional
  // experiment. Keeping this deterministic prevents a stale Vercel variable
  // from silently routing production back to the legacy task tree.
  return true;
}
