'use client'

import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction } from 'postprocessing'
import { useMemo, useRef } from 'react'
import { Vector2 } from 'three'
import { useSceneRuntimeState } from './scene-context'

function TransitionChromatic({ transitionNonce }: { transitionNonce: number }) {
  const offset = useMemo(() => new Vector2(0, 0), [])
  const previousNonceRef = useRef(transitionNonce)
  const energyRef = useRef(0)

  useFrame((_state, delta) => {
    if (previousNonceRef.current !== transitionNonce) {
      previousNonceRef.current = transitionNonce
      energyRef.current = 1
    }
    energyRef.current = Math.max(0, energyRef.current - delta * 8.5)
    const strength = Math.sin(energyRef.current * Math.PI) * 0.0018
    offset.set(strength, strength * 0.55)
  })

  return (
    <ChromaticAberration
      offset={offset}
      radialModulation={false}
      modulationOffset={0.5}
    />
  )
}
export function PostEffects({ reducedMotion }: { reducedMotion: boolean }) {
  const { runtimeTier, routeTransitionNonce, isInteracting } =
    useSceneRuntimeState()

  if (reducedMotion || runtimeTier === 'safe' || runtimeTier === 'balanced') {
    return null
  }

  const ultra = runtimeTier === 'ultra'
  return (
    <EffectComposer multisampling={ultra ? 4 : 0} enableNormalPass={false}>
      <Bloom
        intensity={isInteracting ? 0.32 : ultra ? 0.68 : 0.48}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.2}
        mipmapBlur
      />
      <TransitionChromatic transitionNonce={routeTransitionNonce} />
      <Noise
        premultiply
        opacity={ultra ? 0.04 : 0.025}
        blendFunction={BlendFunction.SOFT_LIGHT}
      />
      <Vignette eskil={false} offset={0.18} darkness={ultra ? 0.44 : 0.34} />
    </EffectComposer>
  )
}
