'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DEFAULT_EXPERIENCE_PREFERENCES,
  DEFAULT_SCENE_SNAPSHOT,
  type EffectTier,
  type ExperiencePreferences,
  type MotionPriority,
  type SceneActions,
  type ScenePulse,
  type ScenePulseKind,
  type SceneSnapshot,
  resolveSceneMode,
} from './types'

interface SceneRuntimeState {
  snapshot: SceneSnapshot
  preferences: ExperiencePreferences
  runtimeTier: EffectTier
  isInteracting: boolean
  interactionPriority: MotionPriority
  routeTransitionNonce: number
  pulse: ScenePulse
}

export interface SceneProviderProps {
  children: ReactNode
  initialSnapshot?: Partial<SceneSnapshot>
  initialPreferences?: Partial<ExperiencePreferences>
  preferences?: ExperiencePreferences
  runtimeTier?: EffectTier
  onPreferencesChange?: (preferences: ExperiencePreferences) => void
  onRuntimeTierChange?: (tier: EffectTier) => void
}

const TIER_ORDER: readonly EffectTier[] = [
  'safe',
  'balanced',
  'cinematic',
  'ultra',
]

const SceneStateContext = createContext<SceneRuntimeState | null>(null)
const SceneActionsContext = createContext<SceneActions | null>(null)

function explicitTier(preference: ExperiencePreferences['quality']): EffectTier {
  return preference === 'auto' ? 'cinematic' : preference
}

function adjacentTier(tier: EffectTier, direction: -1 | 1): EffectTier {
  const currentIndex = TIER_ORDER.indexOf(tier)
  const nextIndex = Math.min(
    TIER_ORDER.length - 1,
    Math.max(0, currentIndex + direction),
  )
  return TIER_ORDER[nextIndex]
}

export function SceneProvider({
  children,
  initialSnapshot,
  initialPreferences,
  preferences: controlledPreferences,
  runtimeTier: controlledRuntimeTier,
  onPreferencesChange,
  onRuntimeTierChange,
}: SceneProviderProps) {
  const initialMode = initialSnapshot?.mode
    ?? resolveSceneMode(initialSnapshot?.route ?? DEFAULT_SCENE_SNAPSHOT.route)
  const [snapshot, setSnapshot] = useState<SceneSnapshot>({
    ...DEFAULT_SCENE_SNAPSHOT,
    ...initialSnapshot,
    mode: initialMode,
  })
  const snapshotRef = useRef(snapshot)
  const [internalPreferences, setPreferencesState] =
    useState<ExperiencePreferences>({
      ...DEFAULT_EXPERIENCE_PREFERENCES,
      ...initialPreferences,
    })
  const preferences = controlledPreferences ?? internalPreferences
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const [internalRuntimeTier, setRuntimeTier] = useState<EffectTier>(() =>
    explicitTier(initialPreferences?.quality ?? 'auto'),
  )
  const runtimeTier = controlledRuntimeTier ?? internalRuntimeTier
  const runtimeTierRef = useRef(runtimeTier)
  runtimeTierRef.current = runtimeTier
  const controlledTierRef = useRef(controlledRuntimeTier !== undefined)
  controlledTierRef.current = controlledRuntimeTier !== undefined
  const onPreferencesChangeRef = useRef(onPreferencesChange)
  onPreferencesChangeRef.current = onPreferencesChange
  const onRuntimeTierChangeRef = useRef(onRuntimeTierChange)
  onRuntimeTierChangeRef.current = onRuntimeTierChange
  const [isInteracting, setIsInteracting] = useState(false)
  const [interactionPriority, setInteractionPriority] =
    useState<MotionPriority>('ambient')
  const [routeTransitionNonce, setRouteTransitionNonce] = useState(0)
  const [pulse, setPulse] = useState<ScenePulse>({
    kind: 'route',
    nonce: 0,
  })
  const interactionDepthRef = useRef(0)
  const lastTierChangeRef = useRef(0)

  const commitRuntimeTier = useCallback((next: EffectTier) => {
    if (!controlledTierRef.current) setRuntimeTier(next)
    onRuntimeTierChangeRef.current?.(next)
  }, [])

  const updateSnapshot = useCallback((patch: Partial<SceneSnapshot>) => {
    const current = snapshotRef.current
    const routeChanged = patch.route !== undefined && patch.route !== current.route
    const nextRoute = patch.route ?? current.route
    const next = {
      ...current,
      ...patch,
      mode: patch.mode ?? (routeChanged ? resolveSceneMode(nextRoute) : current.mode),
    }
    snapshotRef.current = next
    setSnapshot(next)
    if (routeChanged) setRouteTransitionNonce((nonce) => nonce + 1)
  }, [])

  const replaceSnapshot = useCallback((nextSnapshot: SceneSnapshot) => {
    const current = snapshotRef.current
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    if (current.route !== nextSnapshot.route || current.mode !== nextSnapshot.mode) {
      setRouteTransitionNonce((nonce) => nonce + 1)
    }
  }, [])

  const setPreferences = useCallback(
    (patch: Partial<ExperiencePreferences>) => {
      const next = { ...preferencesRef.current, ...patch }
      preferencesRef.current = next
      if (controlledPreferences === undefined) setPreferencesState(next)
      onPreferencesChangeRef.current?.(next)
      if (patch.quality !== undefined && patch.quality !== 'auto') {
        commitRuntimeTier(patch.quality)
        lastTierChangeRef.current = performance.now()
      }
    },
    [commitRuntimeTier, controlledPreferences],
  )

  const beginInteraction = useCallback(
    (priority: MotionPriority = 'interaction') => {
      interactionDepthRef.current += 1
      setInteractionPriority(priority)
      setIsInteracting(true)
    },
    [],
  )

  const endInteraction = useCallback(() => {
    interactionDepthRef.current = Math.max(0, interactionDepthRef.current - 1)
    if (interactionDepthRef.current === 0) {
      setIsInteracting(false)
      setInteractionPriority('ambient')
    }
  }, [])

  const triggerPulse = useCallback(
    (kind: ScenePulseKind, origin?: readonly [number, number]) => {
      setPulse((current) => ({ kind, origin, nonce: current.nonce + 1 }))
    },
    [],
  )

  const reportPerformanceDecline = useCallback(() => {
    if (preferencesRef.current.quality !== 'auto') return
    if (performance.now() - lastTierChangeRef.current < 800) return
    commitRuntimeTier(adjacentTier(runtimeTierRef.current, -1))
    lastTierChangeRef.current = performance.now()
  }, [commitRuntimeTier])

  const reportPerformanceIncline = useCallback(() => {
    if (preferencesRef.current.quality !== 'auto') return
    if (performance.now() - lastTierChangeRef.current < 5_000) return
    commitRuntimeTier(adjacentTier(runtimeTierRef.current, 1))
    lastTierChangeRef.current = performance.now()
  }, [commitRuntimeTier])

  const forceSafeTier = useCallback(() => {
    if (preferencesRef.current.quality !== 'auto') return
    commitRuntimeTier('safe')
    lastTierChangeRef.current = performance.now()
  }, [commitRuntimeTier])

  const actions = useMemo<SceneActions>(
    () => ({
      updateSnapshot,
      replaceSnapshot,
      setPreferences,
      beginInteraction,
      endInteraction,
      triggerPulse,
      reportPerformanceDecline,
      reportPerformanceIncline,
      forceSafeTier,
    }),
    [
      beginInteraction,
      endInteraction,
      forceSafeTier,
      replaceSnapshot,
      reportPerformanceDecline,
      reportPerformanceIncline,
      setPreferences,
      triggerPulse,
      updateSnapshot,
    ],
  )

  const state = useMemo<SceneRuntimeState>(
    () => ({
      snapshot,
      preferences,
      runtimeTier,
      isInteracting,
      interactionPriority,
      routeTransitionNonce,
      pulse,
    }),
    [
      interactionPriority,
      isInteracting,
      preferences,
      pulse,
      routeTransitionNonce,
      runtimeTier,
      snapshot,
    ],
  )

  return (
    <SceneActionsContext.Provider value={actions}>
      <SceneStateContext.Provider value={state}>
        {children}
      </SceneStateContext.Provider>
    </SceneActionsContext.Provider>
  )
}

function useSceneRuntime(): SceneRuntimeState {
  const state = useContext(SceneStateContext)
  if (state === null) {
    throw new Error('Scene hooks must be used inside <SceneProvider>.')
  }
  return state
}

export function useSceneSnapshot(): SceneSnapshot {
  return useSceneRuntime().snapshot
}

export function useSceneActions(): SceneActions {
  const actions = useContext(SceneActionsContext)
  if (actions === null) {
    throw new Error('useSceneActions must be used inside <SceneProvider>.')
  }
  return actions
}

export function useSceneRuntimeState(): Readonly<SceneRuntimeState> {
  return useSceneRuntime()
}
