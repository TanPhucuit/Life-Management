import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitClockRef } from './types';

// Two stars around an invisible barycentre. During a topic change their orbit
// decays, a tidal bridge of plasma stretches between them, they merge into one
// over-compressed sphere and release a shockwave — all of it in the same scene,
// with no cut.
const STAR_GEOMETRY = new THREE.SphereGeometry(1, 64, 48);

const PLASMA_VERTEX = `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Granulation + limb darkening + a hot rim. Turbulence rises with uStress so a
// star visibly becomes unstable before it merges.
const PLASMA_FRAGMENT = `
  uniform float uTime;
  uniform float uStress;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float near = mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), u.x),
                     mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
    float far = mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), u.x),
                    mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
    return mix(near, far, u.z);
  }
  float fbm(vec3 p) {
    float value = 0.0; float amplitude = 0.5;
    for (int index = 0; index < 5; index += 1) { value += amplitude * noise(p); p *= 2.05; amplitude *= 0.5; }
    return value;
  }

  void main() {
    float churn = 0.35 + uStress * 2.6;
    float cells = fbm(vLocal * (3.4 + uStress * 2.0) + vec3(uTime * churn * 0.12, uTime * churn * 0.07, 0.0));
    float fine = fbm(vLocal * 9.0 - vec3(0.0, uTime * churn * 0.2, 0.0));
    vec3 surface = mix(uEdge, uCore, smoothstep(0.32, 0.72, cells));
    surface = mix(surface, uCore * 1.6, smoothstep(0.6, 0.9, fine) * 0.5);

    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    // Limb darkening, then a hot rim on top of it.
    float limb = pow(max(dot(normal, viewDir), 0.0), 0.45);
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6);
    vec3 lit = surface * (0.55 + limb * 1.1) + uCore * rim * (0.9 + uStress * 2.2);

    gl_FragColor = vec4(lit * (1.0 + uStress * 0.9), 1.0);
    #include <colorspace_fragment>
  }
`;

// The shockwave is a thin expanding shell: bright only where we look through
// its edge, which is what makes it read as a wave rather than a bubble.
const SHOCK_FRAGMENT = `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float edge = pow(1.0 - abs(dot(normal, viewDir)), 3.4);
    float alpha = edge * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor * (1.0 + edge * 2.2), alpha);
    #include <colorspace_fragment>
  }
`;

export type BinaryPhase = {
  // 0 = calm, 1 = fully merged.
  collapse: number;
  // 0 while nothing has been released, then the shockwave radius in world units.
  shockRadius: number;
  shockOpacity: number;
};

export function computeBinaryPhase(progress: number | null): BinaryPhase {
  if (progress === null) return { collapse: 0, shockRadius: 0, shockOpacity: 0 };
  // Orbit decays over the first half, merge completes at 0.55, the wave leaves
  // immediately after, and the star splits again near the end.
  const inward = Math.min(1, progress / 0.55);
  const split = progress > 0.78 ? (progress - 0.78) / 0.22 : 0;
  const collapse = Math.max(0, inward - split);
  const shock = progress > 0.55 ? (progress - 0.55) / 0.45 : 0;
  return {
    collapse,
    shockRadius: shock,
    shockOpacity: shock > 0 ? Math.sin(Math.PI * Math.min(1, shock)) * 0.9 : 0,
  };
}

export function BinaryStar({
  title,
  accent,
  separation,
  settled,
  dimmed,
  clockRef,
  progress,
  reach,
}: {
  title: string;
  accent: string;
  separation: number;
  settled: boolean;
  dimmed: boolean;
  clockRef: OrbitClockRef;
  // null when calm, else 0..1 through the topic-change event.
  progress: number | null;
  reach: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const primaryRef = useRef<THREE.Mesh>(null);
  const secondaryRef = useRef<THREE.Mesh>(null);
  const bridgeRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);
  const angleRef = useRef(0);

  const palette = useMemo(() => {
    const tint = new THREE.Color(accent);
    return {
      primaryCore: new THREE.Color('#fff0c2'),
      primaryEdge: new THREE.Color('#ff8a3d'),
      secondaryCore: new THREE.Color('#dff0ff'),
      secondaryEdge: tint.clone().lerp(new THREE.Color('#4a86ff'), 0.5),
    };
  }, [accent]);

  const primaryUniforms = useMemo(() => ({
    uTime: { value: 0 }, uStress: { value: 0 },
    uCore: { value: palette.primaryCore }, uEdge: { value: palette.primaryEdge },
  }), [palette]);
  const secondaryUniforms = useMemo(() => ({
    uTime: { value: 0 }, uStress: { value: 0 },
    uCore: { value: palette.secondaryCore }, uEdge: { value: palette.secondaryEdge },
  }), [palette]);
  const shockUniforms = useMemo(() => ({
    uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#cfe6ff') },
  }), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const primary = primaryRef.current;
    const secondary = secondaryRef.current;
    if (!group || !primary || !secondary) return;

    const phase = computeBinaryPhase(progress);
    const seconds = clockRef.current.ms / 1000;
    primaryUniforms.uTime.value = seconds;
    secondaryUniforms.uTime.value = seconds;
    primaryUniforms.uStress.value += (phase.collapse - primaryUniforms.uStress.value) * Math.min(1, delta * 3);
    secondaryUniforms.uStress.value = primaryUniforms.uStress.value;

    scaleRef.current += ((settled ? 1 : 0.001) - scaleRef.current) * Math.min(1, delta * 2);
    group.scale.setScalar(Math.max(0.0001, scaleRef.current));

    // Orbit decay: as the separation shrinks the pair spins up, exactly the way
    // a real inspiral does.
    const gap = separation * (1 - phase.collapse * 0.97);
    const speed = 0.55 + Math.pow(phase.collapse, 2) * 9;
    angleRef.current += delta * speed * clockRef.current.speed;
    const angle = angleRef.current;
    const primaryRadius = gap * 0.42;
    const secondaryRadius = gap * 0.58;
    primary.position.set(Math.cos(angle) * primaryRadius, 0, Math.sin(angle) * primaryRadius);
    secondary.position.set(-Math.cos(angle) * secondaryRadius, 0, -Math.sin(angle) * secondaryRadius);

    // Merged mass is bigger and brighter than either star was.
    const merge = Math.pow(phase.collapse, 1.6);
    primary.scale.setScalar(separation * (0.2 + merge * 0.34));
    secondary.scale.setScalar(separation * (0.16 + merge * 0.3) * (1 - merge * 0.55));

    // Tidal bridge: a stretched capsule spanning the two stars, appearing only
    // once they are close enough to pull material off each other.
    const bridge = bridgeRef.current;
    if (bridge) {
      const visible = Math.max(0, Math.min(1, (phase.collapse - 0.25) / 0.35)) * (1 - merge);
      bridge.position.set(0, 0, 0);
      bridge.lookAt(primary.position);
      // lookAt aims +Z; a cylinder runs along Y, so tip it a quarter turn and
      // then stretch it along its own axis.
      bridge.rotateX(Math.PI / 2);
      bridge.scale.set(separation * 0.07 * visible, gap * 0.9, separation * 0.07 * visible);
      const material = bridge.material as THREE.MeshBasicMaterial;
      material.opacity = visible * 0.75;
    }

    const shock = shockRef.current;
    if (shock) {
      shock.scale.setScalar(Math.max(0.0001, phase.shockRadius * reach * 1.25));
      shockUniforms.uOpacity.value = phase.shockOpacity;
    }
  });

  return (
    <group ref={groupRef}>
      <pointLight color={palette.primaryCore} intensity={dimmed ? 18 : 52} distance={reach * 4} decay={1.7} />
      <mesh ref={primaryRef} geometry={STAR_GEOMETRY}>
        <shaderMaterial uniforms={primaryUniforms} vertexShader={PLASMA_VERTEX} fragmentShader={PLASMA_FRAGMENT} />
      </mesh>
      <mesh ref={secondaryRef} geometry={STAR_GEOMETRY}>
        <shaderMaterial uniforms={secondaryUniforms} vertexShader={PLASMA_VERTEX} fragmentShader={PLASMA_FRAGMENT} />
      </mesh>
      <mesh ref={bridgeRef}>
        <cylinderGeometry args={[1, 1, 1, 12, 1, true]} />
        <meshBasicMaterial color={palette.primaryEdge} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={shockRef}>
        <sphereGeometry args={[1, 48, 32]} />
        <shaderMaterial uniforms={shockUniforms} vertexShader={PLASMA_VERTEX} fragmentShader={SHOCK_FRAGMENT} transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
      {settled && (
        <Html distanceFactor={18} position={[0, separation * 0.9 + 1.4, 0]} center style={{ pointerEvents: 'none', opacity: dimmed ? 0.3 : 1 }}>
          <div key={title} className="topic-orbit-topic-label is-renaming">{title}</div>
        </Html>
      )}
    </group>
  );
}
