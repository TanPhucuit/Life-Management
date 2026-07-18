import {
  DEFAULT_EXPERIENCE_PREFERENCES as CORE_DEFAULT_EXPERIENCE_PREFERENCES,
  type EffectQuality,
  type ExperiencePreferences,
  type MotionPriority,
  type SceneSnapshot as CoreSceneSnapshot,
} from '@/app/lib/desktopExperience'

export type {
  EffectTier,
  ExperiencePreferences,
  MotionPriority,
} from '@/app/lib/desktopExperience'

export type SceneMode =
  | 'login'
  | 'today'
  | 'plan'
  | 'spaces'
  | 'focus'
  | 'ielts'
  | 'insights'
  | 'settings'

export type QualityPreference = EffectQuality

export type ScenePulseKind =
  | 'complete'
  | 'project-complete'
  | 'focus-complete'
  | 'save'
  | 'error'
  | 'route'

export interface SceneSnapshot extends CoreSceneSnapshot {
  mode: SceneMode
  /** Completion ratio. Both 0..1 and 0..100 inputs are accepted. */
  completion: number
}

export interface ScenePulse {
  kind: ScenePulseKind
  nonce: number
  origin?: readonly [number, number]
}

export interface SceneActions {
  updateSnapshot: (patch: Partial<SceneSnapshot>) => void
  replaceSnapshot: (snapshot: SceneSnapshot) => void
  setPreferences: (patch: Partial<ExperiencePreferences>) => void
  beginInteraction: (priority?: MotionPriority) => void
  endInteraction: () => void
  triggerPulse: (
    kind: ScenePulseKind,
    origin?: readonly [number, number],
  ) => void
  reportPerformanceDecline: () => void
  reportPerformanceIncline: () => void
  forceSafeTier: () => void
}

export const DEFAULT_SCENE_SNAPSHOT: SceneSnapshot = {
  route: '/overview',
  mode: 'today',
  completion: 0,
  overdue: 0,
  activeSpaces: 0,
  focusedMinutes: 0,
  cycleCount: 0,
}

export const DEFAULT_EXPERIENCE_PREFERENCES = CORE_DEFAULT_EXPERIENCE_PREFERENCES

export function resolveSceneMode(route: string): SceneMode {
  const normalized = route.toLowerCase()

  if (normalized.includes('mode=spaces')) return 'spaces'
  if (normalized.startsWith('/tasks') || normalized.startsWith('/calendar')) {
    return 'plan'
  }
  if (normalized.startsWith('/cycles')) return 'focus'
  if (normalized.startsWith('/ielts')) return 'ielts'
  if (normalized.startsWith('/analytics')) return 'insights'
  if (normalized.startsWith('/settings')) return 'settings'
  if (normalized === '/' || normalized.startsWith('/login')) return 'login'

  return 'today'
}

export function normalizeCompletion(value: number): number {
  const ratio = value > 1 ? value / 100 : value
  return Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
}
