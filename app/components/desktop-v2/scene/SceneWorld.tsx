'use client'

import { PerformanceMonitor } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import * as THREE from 'three'
import { getScenePalette, sceneModeIndex } from './scene-palette'
import { useSceneActions, useSceneRuntimeState } from './scene-context'
import {
  AURORA_FRAGMENT_SHADER,
  AURORA_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from './shaders'
import {
  normalizeCompletion,
  type EffectTier,
  type SceneMode,
  type ScenePulse,
  type SceneSnapshot,
} from './types'

interface SceneWorldProps {
  pointerRef: MutableRefObject<THREE.Vector2>
  reducedMotion: boolean
  visible: boolean
}

interface AnimatedLayerProps {
  pointerRef: MutableRefObject<THREE.Vector2>
  snapshot: SceneSnapshot
  tier: EffectTier
  activityScale: number
  reducedMotion: boolean
}

const PARTICLE_COUNTS: Record<EffectTier, number> = {
  ultra: 1_900,
  cinematic: 1_250,
  balanced: 680,
  safe: 220,
}

const POINT_SIZES: Record<EffectTier, number> = {
  ultra: 3.2,
  cinematic: 2.9,
  balanced: 2.55,
  safe: 2.1,
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0
    return value / 4_294_967_296
  }
}

function PerformanceGovernor() {
  const actions = useSceneActions()
  const inclineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelIncline = useCallback(() => {
    if (inclineTimerRef.current !== null) {
      clearTimeout(inclineTimerRef.current)
      inclineTimerRef.current = null
    }
  }, [])

  useEffect(() => cancelIncline, [cancelIncline])

  return (
    <PerformanceMonitor
      flipflops={3}
      bounds={(refreshRate) => [
        Math.min(55, refreshRate * 0.8),
        Math.max(58, Math.min(72, refreshRate - 2)),
      ]}
      onDecline={() => {
        cancelIncline()
        actions.reportPerformanceDecline()
      }}
      onIncline={() => {
        cancelIncline()
        inclineTimerRef.current = setTimeout(() => {
          actions.reportPerformanceIncline()
          inclineTimerRef.current = null
        }, 5_000)
      }}
      onFallback={() => {
        cancelIncline()
        actions.forceSafeTier()
      }}
    />
  )
}

function FrameBudgetSampler({ enabled }: { enabled: boolean }) {
  const actions = useSceneActions()
  const bucketRef = useRef({ duration: 0, frames: 0, fastSeconds: 0 })
  const lastAdjustmentRef = useRef(0)

  useFrame((_state, delta) => {
    if (!enabled) return
    const bucket = bucketRef.current
    bucket.duration += Math.min(delta, 0.1)
    bucket.frames += 1
    if (bucket.duration < 1) return

    const averageFrameTime = bucket.duration / Math.max(1, bucket.frames)
    const now = performance.now()
    if (averageFrameTime > 0.018) {
      bucket.fastSeconds = 0
      if (now - lastAdjustmentRef.current >= 1_000) {
        actions.reportPerformanceDecline()
        lastAdjustmentRef.current = now
      }
    } else if (averageFrameTime < 0.014) {
      bucket.fastSeconds += bucket.duration
      if (
        bucket.fastSeconds >= 5
        && now - lastAdjustmentRef.current >= 5_000
      ) {
        actions.reportPerformanceIncline()
        lastAdjustmentRef.current = now
        bucket.fastSeconds = 0
      }
    } else {
      bucket.fastSeconds = 0
    }

    bucket.duration = 0
    bucket.frames = 0
  })

  return null
}

function CameraRig({
  pointerRef,
  snapshot,
  tier,
  activityScale,
  reducedMotion,
}: AnimatedLayerProps) {
  const camera = useThree((state) => state.camera)
  const targetPosition = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())

  useFrame(({ clock }, delta) => {
    const pointer = pointerRef.current
    const modePosition: Record<SceneMode, readonly [number, number, number]> = {
      login: [0, 0, 8.2],
      today: [0.35, 0.05, 7.8],
      plan: [-0.45, 0.15, 8.4],
      spaces: [0, 0.1, 9.2],
      focus: [0, 0, 6.9],
      ielts: [0.4, 0.2, 8.1],
      insights: [-0.25, 0.45, 8.7],
      settings: [0, 0, 8.5],
    }
    const destination = modePosition[snapshot.mode]
    const staticScene = reducedMotion || tier === 'safe'
    const idleDrift = reducedMotion
      ? 0
      : Math.sin(clock.elapsedTime * 0.11) * 0.1 * activityScale
    targetPosition.current.set(
      destination[0] + pointer.x * 0.18 * activityScale,
      destination[1] + pointer.y * 0.12 * activityScale + idleDrift,
      destination[2],
    )
    if (staticScene) camera.position.copy(targetPosition.current)
    else camera.position.lerp(targetPosition.current, 1 - Math.exp(-delta * 2.8))
    lookTarget.current.set(
      pointer.x * 0.08 * activityScale,
      pointer.y * 0.05 * activityScale,
      0,
    )
    camera.lookAt(lookTarget.current)
  })

  return null
}

function AuroraBackdrop({
  pointerRef,
  snapshot,
  tier,
  activityScale,
  reducedMotion,
}: AnimatedLayerProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const timeRef = useRef(0)
  const palette = getScenePalette(snapshot.mode)
  const targetA = useMemo(() => new THREE.Color(palette.primary), [palette.primary])
  const targetB = useMemo(() => new THREE.Color(palette.secondary), [palette.secondary])
  const targetC = useMemo(() => new THREE.Color(palette.accent), [palette.accent])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uPointer: { value: new THREE.Vector2() },
      uIntensity: { value: 0.44 },
      uColorA: { value: new THREE.Color(palette.primary) },
      uColorB: { value: new THREE.Color(palette.secondary) },
      uColorC: { value: new THREE.Color(palette.accent) },
    }),
    [palette.accent, palette.primary, palette.secondary],
  )

  useFrame((_state, delta) => {
    const material = materialRef.current
    if (material === null) return
    if (!reducedMotion) timeRef.current += delta * activityScale
    material.uniforms.uTime.value = timeRef.current
    material.uniforms.uMotion.value = reducedMotion ? 0.08 : activityScale
    material.uniforms.uPointer.value.lerp(pointerRef.current, 1 - Math.exp(-delta * 3))
    const intensity = tier === 'safe' ? 0.18 : tier === 'balanced' ? 0.3 : 0.44
    material.uniforms.uIntensity.value = THREE.MathUtils.damp(
      material.uniforms.uIntensity.value,
      intensity,
      3,
      delta,
    )
    if (reducedMotion || tier === 'safe') {
      material.uniforms.uColorA.value.copy(targetA)
      material.uniforms.uColorB.value.copy(targetB)
      material.uniforms.uColorC.value.copy(targetC)
    } else {
      material.uniforms.uColorA.value.lerp(targetA, 1 - Math.exp(-delta * 1.6))
      material.uniforms.uColorB.value.lerp(targetB, 1 - Math.exp(-delta * 1.6))
      material.uniforms.uColorC.value.lerp(targetC, 1 - Math.exp(-delta * 1.6))
    }
  })

  return (
    <mesh position={[0, 0, -7]} rotation={[-0.025, 0, 0]}>
      <planeGeometry args={[27, 17, 72, 48]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={AURORA_VERTEX_SHADER}
        fragmentShader={AURORA_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function FlowParticles({
  pointerRef,
  snapshot,
  tier,
  activityScale,
  reducedMotion,
}: AnimatedLayerProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const timeRef = useRef(0)
  const count = PARTICLE_COUNTS[tier]
  const palette = getScenePalette(snapshot.mode)
  const targetA = useMemo(() => new THREE.Color(palette.primary), [palette.primary])
  const targetB = useMemo(() => new THREE.Color(palette.accent), [palette.accent])
  const geometry = useMemo(() => {
    const random = seededRandom(8_314 + count)
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const scales = new Float32Array(count)
    const layers = new Float32Array(count)

    for (let index = 0; index < count; index += 1) {
      const stride = index * 3
      const layer = random()
      const angle = random() * Math.PI * 2
      const radius = 2.2 + random() * (layer > 0.62 ? 8.8 : 5.2)
      positions[stride] = Math.cos(angle) * radius + (random() - 0.5) * 2.2
      positions[stride + 1] = Math.sin(angle) * radius * 0.58 + (random() - 0.5) * 3.5
      positions[stride + 2] = -5.5 + random() * 7.5
      phases[index] = random() * Math.PI * 2
      scales[index] = 0.35 + random() * 0.9
      layers[index] = layer
    }

    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    result.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    result.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    result.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1))
    result.computeBoundingSphere()
    return result
  }, [count])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uPointSize: { value: POINT_SIZES[tier] },
      uMode: { value: sceneModeIndex(snapshot.mode) },
      uPointer: { value: new THREE.Vector2() },
      uColorA: { value: new THREE.Color(palette.primary) },
      uColorB: { value: new THREE.Color(palette.accent) },
      uOpacity: { value: tier === 'safe' ? 0.28 : 0.62 },
    }),
    [palette.accent, palette.primary, snapshot.mode, tier],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_state, delta) => {
    const material = materialRef.current
    if (material === null) return
    const modeSpeed = snapshot.mode === 'focus' ? 1.7 : snapshot.mode === 'spaces' ? 1.18 : 1
    if (!reducedMotion) timeRef.current += delta * activityScale * modeSpeed
    material.uniforms.uTime.value = timeRef.current
    material.uniforms.uMotion.value = reducedMotion ? 0 : activityScale
    material.uniforms.uPointSize.value = THREE.MathUtils.damp(
      material.uniforms.uPointSize.value,
      POINT_SIZES[tier],
      5,
      delta,
    )
    material.uniforms.uMode.value = THREE.MathUtils.damp(
      material.uniforms.uMode.value,
      sceneModeIndex(snapshot.mode),
      2,
      delta,
    )
    material.uniforms.uPointer.value.lerp(pointerRef.current, 1 - Math.exp(-delta * 4))
    if (reducedMotion || tier === 'safe') {
      material.uniforms.uColorA.value.copy(targetA)
      material.uniforms.uColorB.value.copy(targetB)
    } else {
      material.uniforms.uColorA.value.lerp(targetA, 1 - Math.exp(-delta * 2))
      material.uniforms.uColorB.value.lerp(targetB, 1 - Math.exp(-delta * 2))
    }
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={PARTICLE_VERTEX_SHADER}
        fragmentShader={PARTICLE_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

interface LifeCoreProps extends Omit<AnimatedLayerProps, 'pointerRef'> {
  pulse: ScenePulse
}

function LifeCore({
  snapshot,
  tier,
  activityScale,
  reducedMotion,
  pulse,
}: LifeCoreProps) {
  const groupRef = useRef<THREE.Group>(null)
  const orbitRef = useRef<THREE.Group>(null)
  const shellMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const innerMaterialRef = useRef<THREE.MeshStandardMaterial>(null)
  const ringMaterialRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const palette = getScenePalette(snapshot.mode)
  const targetPrimary = useMemo(() => new THREE.Color(palette.primary), [palette.primary])
  const targetSecondary = useMemo(() => new THREE.Color(palette.secondary), [palette.secondary])
  const targetAccent = useMemo(() => new THREE.Color(palette.accent), [palette.accent])
  const errorColor = useMemo(() => new THREE.Color('#ff5876'), [])
  const lastPulseRef = useRef(pulse.nonce)
  const pulseEnergyRef = useRef(0)
  const completion = normalizeCompletion(snapshot.completion)

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    const orbit = orbitRef.current
    const shellMaterial = shellMaterialRef.current
    const innerMaterial = innerMaterialRef.current
    if (group === null || orbit === null || shellMaterial === null || innerMaterial === null) {
      return
    }

    if (lastPulseRef.current !== pulse.nonce) {
      lastPulseRef.current = pulse.nonce
      pulseEnergyRef.current = pulse.kind === 'error' ? -0.75 : 1
    }
    pulseEnergyRef.current = THREE.MathUtils.damp(pulseEnergyRef.current, 0, 4.2, delta)

    const focusEnergy = Math.min(1, snapshot.focusedMinutes / 120)
    const cycleEnergy = Math.min(1, snapshot.cycleCount / 14)
    const spacesEnergy = Math.min(1, snapshot.activeSpaces / 8)
    const dataEnergy = completion * 0.5 + focusEnergy * 0.22 + cycleEnergy * 0.18 + spacesEnergy * 0.1
    const overdueBreath = snapshot.overdue > 0 && !reducedMotion
      ? Math.sin(clock.elapsedTime * 1.15) * 0.025
      : 0
    const modeScale = snapshot.mode === 'focus' ? 1.16 : snapshot.mode === 'spaces' ? 0.9 : 1
    const targetScale = modeScale + dataEnergy * 0.12 + Math.abs(pulseEnergyRef.current) * 0.16 + overdueBreath
    const staticScene = reducedMotion || tier === 'safe'
    const scale = staticScene
      ? targetScale
      : THREE.MathUtils.damp(group.scale.x, targetScale, 7, delta)
    group.scale.setScalar(scale)

    if (!reducedMotion) {
      group.rotation.y += delta * 0.09 * activityScale
      group.rotation.x = Math.sin(clock.elapsedTime * 0.17) * 0.08 * activityScale
      const orbitSpeed = snapshot.mode === 'focus' ? 0.42 : 0.16
      orbit.rotation.z += delta * orbitSpeed * activityScale
      orbit.rotation.y -= delta * orbitSpeed * 0.38 * activityScale
    }

    const errorMix = Math.max(0, -pulseEnergyRef.current)
    const shellTarget = errorMix > 0.02 ? errorColor : targetPrimary
    if (staticScene) {
      shellMaterial.color.copy(shellTarget)
      shellMaterial.emissive.copy(targetSecondary)
      innerMaterial.color.copy(targetSecondary)
      innerMaterial.emissive.copy(targetAccent)
    } else {
      shellMaterial.color.lerp(shellTarget, 1 - Math.exp(-delta * 5))
      shellMaterial.emissive.lerp(targetSecondary, 1 - Math.exp(-delta * 2.2))
      innerMaterial.color.lerp(targetSecondary, 1 - Math.exp(-delta * 2.2))
      innerMaterial.emissive.lerp(targetAccent, 1 - Math.exp(-delta * 2.2))
    }
    shellMaterial.emissiveIntensity = THREE.MathUtils.damp(
      shellMaterial.emissiveIntensity,
      0.35 + dataEnergy * 0.9 + Math.max(0, pulseEnergyRef.current) * 1.8,
      6,
      delta,
    )
    innerMaterial.emissiveIntensity = THREE.MathUtils.damp(
      innerMaterial.emissiveIntensity,
      1.2 + dataEnergy * 1.7 + Math.max(0, pulseEnergyRef.current),
      5,
      delta,
    )
    ringMaterialRefs.current.forEach((material, index) => {
      if (material === null) return
      material.color.lerp(index === 1 ? targetAccent : targetPrimary, 1 - Math.exp(-delta * 2))
      material.opacity = THREE.MathUtils.damp(
        material.opacity,
        0.2 + dataEnergy * 0.28 + Math.max(0, pulseEnergyRef.current) * 0.22,
        5,
        delta,
      )
    })
  })

  const shellDetail = tier === 'safe' ? 2 : tier === 'balanced' ? 3 : 5
  const useTransmission = tier === 'ultra' || tier === 'cinematic'

  return (
    <group ref={groupRef} position={[0, 0, -0.3]}>
      <mesh>
        <icosahedronGeometry args={[1.13, shellDetail]} />
        <meshPhysicalMaterial
          ref={shellMaterialRef}
          color={palette.primary}
          emissive={palette.secondary}
          emissiveIntensity={0.5}
          roughness={0.12}
          metalness={0.18}
          transmission={useTransmission ? 0.42 : 0}
          thickness={useTransmission ? 1.1 : 0}
          ior={1.35}
          iridescence={useTransmission ? 0.75 : 0.18}
          iridescenceIOR={1.5}
          transparent
          opacity={useTransmission ? 0.72 : 0.86}
        />
      </mesh>
      <mesh scale={0.69}>
        <icosahedronGeometry args={[1, tier === 'safe' ? 1 : 2]} />
        <meshStandardMaterial
          ref={innerMaterialRef}
          color={palette.secondary}
          emissive={palette.accent}
          emissiveIntensity={1.4}
          roughness={0.28}
          metalness={0.35}
        />
      </mesh>
      <group ref={orbitRef}>
        {[
          { radius: 1.58, tube: 0.008, rotation: [0.9, 0.1, 0.4] as const },
          { radius: 1.87, tube: 0.012, rotation: [0.25, 1.05, 0.2] as const },
          { radius: 2.15, tube: 0.006, rotation: [1.25, 0.4, 0.75] as const },
        ].map((ring, index) => (
          <mesh key={ring.radius} rotation={ring.rotation}>
            <torusGeometry args={[ring.radius, ring.tube, 8, 180]} />
            <meshBasicMaterial
              ref={(material) => {
                ringMaterialRefs.current[index] = material
              }}
              color={index === 1 ? palette.accent : palette.primary}
              transparent
              opacity={0.28}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function CursorLight({
  pointerRef,
  snapshot,
  tier,
  activityScale,
  reducedMotion,
}: AnimatedLayerProps) {
  const lightRef = useRef<THREE.PointLight>(null)
  const palette = getScenePalette(snapshot.mode)
  const targetColor = useMemo(() => new THREE.Color(palette.accent), [palette.accent])

  useFrame((_state, delta) => {
    const light = lightRef.current
    if (light === null) return
    const pointer = pointerRef.current
    const targetX = reducedMotion ? 2.2 : pointer.x * 4.8
    const targetY = reducedMotion ? 1.6 : pointer.y * 3.1
    light.position.x = THREE.MathUtils.damp(light.position.x, targetX, 9, delta)
    light.position.y = THREE.MathUtils.damp(light.position.y, targetY, 9, delta)
    if (reducedMotion || tier === 'safe') light.color.copy(targetColor)
    else light.color.lerp(targetColor, 1 - Math.exp(-delta * 3))
    light.intensity = THREE.MathUtils.damp(
      light.intensity,
      14 * (reducedMotion ? 0.55 : 0.65 + activityScale * 0.35),
      5,
      delta,
    )
  })

  return <pointLight ref={lightRef} position={[2.2, 1.6, 4]} intensity={12} distance={16} />
}

function ModeAccents({
  snapshot,
  tier,
  activityScale,
  reducedMotion,
}: Omit<AnimatedLayerProps, 'pointerRef'>) {
  const ieltsGroupRef = useRef<THREE.Group>(null)
  const insightsGroupRef = useRef<THREE.Group>(null)
  const palette = getScenePalette(snapshot.mode)

  useFrame(({ clock }, delta) => {
    const ieltsGroup = ieltsGroupRef.current
    const insightsGroup = insightsGroupRef.current
    if (ieltsGroup === null || insightsGroup === null) return
    const ieltsScale = snapshot.mode === 'ielts' ? 1 : 0.001
    const insightsScale = snapshot.mode === 'insights' ? 1 : 0.001
    const staticScene = reducedMotion || tier === 'safe'
    ieltsGroup.scale.setScalar(staticScene ? ieltsScale : THREE.MathUtils.damp(ieltsGroup.scale.x, ieltsScale, 5, delta))
    insightsGroup.scale.setScalar(staticScene ? insightsScale : THREE.MathUtils.damp(insightsGroup.scale.x, insightsScale, 5, delta))
    if (!reducedMotion) {
      ieltsGroup.children.forEach((child, index) => {
        child.position.y = -1.5 + Math.sin(clock.elapsedTime * 0.55 + index) * 0.16 * activityScale
        child.rotation.y += delta * (0.08 + index * 0.015) * activityScale
      })
      insightsGroup.rotation.y = Math.sin(clock.elapsedTime * 0.1) * 0.08 * activityScale
    }
  })

  const insightColumns = tier === 'safe' ? 9 : tier === 'balanced' ? 15 : 23

  return (
    <>
      <group ref={ieltsGroupRef} position={[0, 0, -1]} scale={snapshot.mode === 'ielts' ? 1 : 0.001}>
        {[-2.7, -0.9, 0.9, 2.7].map((x, index) => (
          <mesh key={x} position={[x, -1.5, index % 2 === 0 ? -0.2 : -0.8]}>
            <octahedronGeometry args={[0.42 + index * 0.035, tier === 'ultra' ? 2 : 0]} />
            <meshPhysicalMaterial
              color={index % 2 === 0 ? palette.primary : palette.secondary}
              emissive={palette.accent}
              emissiveIntensity={0.72}
              transmission={tier === 'ultra' ? 0.58 : 0}
              roughness={0.16}
              metalness={0.16}
              transparent
              opacity={0.82}
            />
          </mesh>
        ))}
      </group>
      <group ref={insightsGroupRef} position={[0, -2.45, -2]} scale={snapshot.mode === 'insights' ? 1 : 0.001}>
        {Array.from({ length: insightColumns }, (_, index) => {
          const centeredIndex = index - (insightColumns - 1) / 2
          const height = 0.2 + (Math.sin(index * 1.83) * 0.5 + 0.5) * 1.2
          return (
            <mesh key={index} position={[centeredIndex * 0.38, height * 0.5, Math.sin(index) * 0.32]}>
              <boxGeometry args={[0.25, height, 0.25]} />
              <meshStandardMaterial
                color={index % 3 === 0 ? palette.accent : palette.primary}
                emissive={palette.secondary}
                emissiveIntensity={0.45}
                roughness={0.3}
                metalness={0.35}
              />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

export function SceneWorld({ pointerRef, reducedMotion, visible }: SceneWorldProps) {
  const runtime = useSceneRuntimeState()
  const { snapshot, runtimeTier, isInteracting, pulse, preferences } = runtime
  const activityScale = reducedMotion ? 0 : isInteracting ? 0.28 : 1
  const commonProps: AnimatedLayerProps = {
    pointerRef,
    snapshot,
    tier: runtimeTier,
    activityScale,
    reducedMotion,
  }

  return (
    <>
      <PerformanceGovernor />
      <FrameBudgetSampler enabled={visible && !reducedMotion && preferences.quality === 'auto'} />
      <CameraRig {...commonProps} />
      <ambientLight intensity={0.27} />
      <directionalLight position={[-4, 6, 5]} intensity={1.2} color="#a8c8ff" />
      <CursorLight {...commonProps} />
      <AuroraBackdrop {...commonProps} />
      <FlowParticles {...commonProps} />
      <LifeCore
        snapshot={snapshot}
        tier={runtimeTier}
        activityScale={activityScale}
        reducedMotion={reducedMotion}
        pulse={pulse}
      />
      <ModeAccents
        snapshot={snapshot}
        tier={runtimeTier}
        activityScale={activityScale}
        reducedMotion={reducedMotion}
      />
    </>
  )
}
