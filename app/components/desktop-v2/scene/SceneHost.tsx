'use client'

import { Canvas, useThree } from '@react-three/fiber'
import {
  type CSSProperties,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { PostEffects } from './PostEffects'
import { SceneErrorBoundary, SceneFallback } from './SceneErrorBoundary'
import { useSceneActions, useSceneRuntimeState } from './scene-context'
import { SceneWorld } from './SceneWorld'
import type { EffectTier } from './types'

export interface SceneHostProps {
  className?: string
  style?: CSSProperties
  fallback?: ReactNode
  zIndex?: number
  trackGlobalInteraction?: boolean
  onError?: (error: Error, info?: ErrorInfo) => void
}
interface CanvasLifecycleProps {
  invalidationKey: string
  onContextLost: () => void
  onContextRestored: () => void
}

function CanvasLifecycle({
  invalidationKey,
  onContextLost,
  onContextRestored,
}: CanvasLifecycleProps) {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    invalidate()
  }, [invalidate, invalidationKey])

  useEffect(() => {
    const canvas = gl.domElement
    const handleLost = (event: Event) => {
      event.preventDefault()
      onContextLost()
    }
    const handleRestored = () => {
      onContextRestored()
      invalidate()
    }

    canvas.addEventListener('webglcontextlost', handleLost, false)
    canvas.addEventListener('webglcontextrestored', handleRestored, false)
    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost, false)
      canvas.removeEventListener('webglcontextrestored', handleRestored, false)
    }
  }, [gl, invalidate, onContextLost, onContextRestored])

  return null
}

function tierDpr(tier: EffectTier): number | [number, number] {
  if (tier === 'ultra') return [1.25, 2]
  if (tier === 'cinematic') return [1.1, 1.5]
  return 1
}

function useSceneCapabilities() {
  const [visible, setVisible] = useState(true)
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const [webGL2Available, setWebGL2Available] = useState<boolean | null>(null)

  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setSystemReducedMotion(media.matches)
    updateMotion()
    media.addEventListener('change', updateMotion)
    return () => media.removeEventListener('change', updateMotion)
  }, [])

  useEffect(() => {
    const probe = document.createElement('canvas')
    const context = probe.getContext('webgl2', {
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    })
    setWebGL2Available(context !== null)
  }, [])

  return { visible, systemReducedMotion, webGL2Available }
}

function usePointerTracking(
  pointerRef: MutableRefObject<THREE.Vector2>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) {
      pointerRef.current.set(0, 0)
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current.set(
        event.clientX / Math.max(1, window.innerWidth) * 2 - 1,
        -(event.clientY / Math.max(1, window.innerHeight) * 2 - 1),
      )
    }
    const resetPointer = () => pointerRef.current.set(0, 0)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', resetPointer)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.documentElement.removeEventListener('pointerleave', resetPointer)
    }
  }, [enabled, pointerRef])
}

function useGlobalInteractionTracking(enabled: boolean) {
  const actions = useSceneActions()

  useEffect(() => {
    if (!enabled) return

    const handlePointerDown = () => actions.beginInteraction('interaction')
    const handlePointerUp = () => actions.endInteraction()
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        actions.beginInteraction('interaction')
      }
    }
    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        actions.endInteraction()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('pointerup', handlePointerUp, { passive: true })
    window.addEventListener('pointercancel', handlePointerUp, { passive: true })
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [actions, enabled])
}

const BASE_HOST_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  isolation: 'isolate',
  background:
    'radial-gradient(circle at 50% 42%, rgba(26, 35, 78, .38), transparent 44%), #050914',
}

export function SceneHost({
  className,
  style,
  fallback = <SceneFallback />,
  zIndex = 0,
  trackGlobalInteraction = true,
  onError,
}: SceneHostProps) {
  const runtime = useSceneRuntimeState()
  const actions = useSceneActions()
  const { visible, systemReducedMotion, webGL2Available } = useSceneCapabilities()
  const [contextLost, setContextLost] = useState(false)
  const pointerRef = useRef(new THREE.Vector2())
  const reducedMotion = runtime.preferences.reducedMotion || systemReducedMotion
  const shouldAnimate = visible && !reducedMotion && runtime.runtimeTier !== 'safe'
  const invalidationKey = `${runtime.snapshot.mode}:${runtime.routeTransitionNonce}:${runtime.runtimeTier}:${reducedMotion}`
  const resetKey = `${invalidationKey}:${webGL2Available}`
  const hostStyle = useMemo<CSSProperties>(
    () => ({ ...BASE_HOST_STYLE, zIndex, ...style }),
    [style, zIndex],
  )

  usePointerTracking(
    pointerRef,
    visible && runtime.preferences.cursorEffects && !reducedMotion,
  )
  useGlobalInteractionTracking(trackGlobalInteraction)

  useEffect(() => {
    if (webGL2Available === false) actions.forceSafeTier()
  }, [actions, webGL2Available])

  if (webGL2Available !== true) {
    return (
      <div className={className} style={hostStyle} aria-hidden="true">
        {fallback}
      </div>
    )
  }

  return (
    <div className={className} style={hostStyle} aria-hidden="true">
      <SceneErrorBoundary
        fallback={fallback}
        resetKey={resetKey}
        onError={(error, info) => onError?.(error, info)}
      >
        <Canvas
          camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 80 }}
          dpr={tierDpr(runtime.runtimeTier)}
          frameloop={shouldAnimate ? 'always' : 'demand'}
          gl={{
            alpha: true,
            antialias: runtime.runtimeTier !== 'safe',
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
            gl.setClearColor(0x000000, 0)
            gl.domElement.setAttribute('aria-hidden', 'true')
          }}
          style={{ pointerEvents: 'none' }}
        >
          <Suspense fallback={null}>
            <CanvasLifecycle
              invalidationKey={invalidationKey}
              onContextLost={() => setContextLost(true)}
              onContextRestored={() => setContextLost(false)}
            />
            <SceneWorld
              pointerRef={pointerRef}
              reducedMotion={reducedMotion}
              visible={visible}
            />
            <PostEffects reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
      {contextLost ? fallback : null}
    </div>
  )
}
