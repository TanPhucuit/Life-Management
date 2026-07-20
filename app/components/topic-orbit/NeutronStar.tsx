import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitClockRef } from './types';

// A magnetar: tiny, blindingly bright, spinning fast, with visible magnetic
// field lines and polar jets. A topic change is an electromagnetic catastrophe
// — the field overloads and a pulse sweeps outward through the system.
const CORE_GEOMETRY = new THREE.SphereGeometry(1, 64, 48);

const CORE_VERTEX = `
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

const CORE_FRAGMENT = `
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uCore;
  uniform vec3 uHot;
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
    for (int index = 0; index < 4; index += 1) { value += amplitude * noise(p); p *= 2.1; amplitude *= 0.5; }
    return value;
  }

  void main() {
    // High-frequency surface: a neutron star's crust churns far faster than a
    // normal star's.
    float storm = fbm(vLocal * 6.0 + vec3(uTime * (1.4 + uCharge * 4.0), 0.0, uTime * 0.8));
    // Magnetic poles stay hotter than the equator.
    float polar = pow(abs(vLocal.y), 3.0);
    vec3 surface = mix(uCore, uHot, smoothstep(0.35, 0.8, storm) * 0.7 + polar * 0.6);

    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.2);
    vec3 lit = surface * (1.4 + uCharge * 2.6) + uHot * rim * (1.2 + uCharge * 3.0);
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

// Field lines: torus loops through both poles, brightening and swelling as the
// field overloads.
const FIELD_FRAGMENT = `
  uniform float uCharge;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vLocal;
  void main() {
    float band = 0.5 + 0.5 * sin(atan(vLocal.y, vLocal.x) * 3.0 - uTime * (2.0 + uCharge * 8.0));
    float energy = (0.25 + uCharge * 0.9) * (0.35 + band * 0.9);
    gl_FragColor = vec4(uColor * (1.0 + energy * 2.0), energy);
    #include <colorspace_fragment>
  }
`;

const PULSE_FRAGMENT = `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float edge = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
    float alpha = edge * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor * (1.0 + edge * 2.6), alpha);
    #include <colorspace_fragment>
  }
`;

export function computeNeutronPhase(progress: number | null) {
  if (progress === null) return { charge: 0, pulseRadius: 0, pulseOpacity: 0 };
  // The field winds up for the first 40%, then lets go.
  const charge = progress < 0.4 ? progress / 0.4 : Math.max(0, 1 - (progress - 0.4) / 0.35);
  const pulse = progress > 0.4 ? (progress - 0.4) / 0.6 : 0;
  return {
    charge,
    pulseRadius: pulse,
    pulseOpacity: pulse > 0 ? Math.sin(Math.PI * Math.min(1, pulse)) : 0,
  };
}

export function NeutronStar({
  title,
  accent,
  coreRadius,
  settled,
  dimmed,
  clockRef,
  progress,
  reach,
}: {
  title: string;
  accent: string;
  coreRadius: number;
  settled: boolean;
  dimmed: boolean;
  clockRef: OrbitClockRef;
  progress: number | null;
  reach: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const fieldRef = useRef<THREE.Group>(null);
  const jetsRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);

  const palette = useMemo(() => ({
    core: new THREE.Color('#bcd8ff'),
    hot: new THREE.Color('#ffffff'),
    field: new THREE.Color(accent).lerp(new THREE.Color('#7bb8ff'), 0.55),
  }), [accent]);

  const coreUniforms = useMemo(() => ({
    uTime: { value: 0 }, uCharge: { value: 0 },
    uCore: { value: palette.core }, uHot: { value: palette.hot },
  }), [palette]);
  const fieldUniforms = useMemo(() => ({
    uTime: { value: 0 }, uCharge: { value: 0 }, uColor: { value: palette.field },
  }), [palette]);
  const pulseUniforms = useMemo(() => ({
    uOpacity: { value: 0 }, uColor: { value: palette.field },
  }), [palette]);

  // Field loops: three tori tilted around the spin axis, all threading the poles.
  const loops = useMemo(() => [0, 1, 2].map((index) => ({
    tilt: (index / 3) * Math.PI,
    scale: 1 + index * 0.28,
  })), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const core = coreRef.current;
    if (!group || !core) return;
    const phase = computeNeutronPhase(progress);
    const seconds = clockRef.current.ms / 1000;

    coreUniforms.uTime.value = seconds;
    fieldUniforms.uTime.value = seconds;
    coreUniforms.uCharge.value += (phase.charge - coreUniforms.uCharge.value) * Math.min(1, delta * 4);
    fieldUniforms.uCharge.value = coreUniforms.uCharge.value;

    scaleRef.current += ((settled ? 1 : 0.001) - scaleRef.current) * Math.min(1, delta * 2.2);
    group.scale.setScalar(Math.max(0.0001, scaleRef.current));

    // Millisecond pulsar: fast even at rest, frantic while charging.
    core.rotation.y += delta * (7 + phase.charge * 26) * clockRef.current.speed;
    if (fieldRef.current) {
      fieldRef.current.rotation.y -= delta * (1.4 + phase.charge * 7) * clockRef.current.speed;
      fieldRef.current.scale.setScalar(1 + phase.charge * 0.55);
    }
    if (jetsRef.current) {
      const reachScale = 1 + phase.charge * 1.6;
      jetsRef.current.scale.set(1 + phase.charge * 0.8, reachScale, 1 + phase.charge * 0.8);
    }
    const pulse = pulseRef.current;
    if (pulse) {
      pulse.scale.setScalar(Math.max(0.0001, phase.pulseRadius * reach * 1.3));
      pulseUniforms.uOpacity.value = phase.pulseOpacity * 0.85;
    }
  });

  const jetLength = coreRadius * 9;

  return (
    <group ref={groupRef}>
      <pointLight color={palette.core} intensity={dimmed ? 20 : 60} distance={reach * 4} decay={1.6} />
      <mesh ref={coreRef} geometry={CORE_GEOMETRY} scale={coreRadius}>
        <shaderMaterial uniforms={coreUniforms} vertexShader={CORE_VERTEX} fragmentShader={CORE_FRAGMENT} />
      </mesh>

      <group ref={fieldRef}>
        {loops.map((loop, index) => (
          <mesh key={index} rotation={[0, loop.tilt, 0]} scale={coreRadius * 2.6 * loop.scale}>
            <torusGeometry args={[1, 0.012, 8, 96]} />
            <shaderMaterial
              uniforms={fieldUniforms}
              vertexShader={CORE_VERTEX}
              fragmentShader={FIELD_FRAGMENT}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>

      {/* Polar jets, one up one down. */}
      <group ref={jetsRef}>
        {[1, -1].map((direction) => (
          <mesh key={direction} position={[0, direction * jetLength * 0.5, 0]} rotation={[direction > 0 ? 0 : Math.PI, 0, 0]}>
            <coneGeometry args={[coreRadius * 0.85, jetLength, 20, 1, true]} />
            <meshBasicMaterial
              color={palette.field}
              transparent
              opacity={0.16}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>

      <mesh ref={pulseRef}>
        <sphereGeometry args={[1, 48, 32]} />
        <shaderMaterial
          uniforms={pulseUniforms}
          vertexShader={CORE_VERTEX}
          fragmentShader={PULSE_FRAGMENT}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {settled && (
        <Html distanceFactor={18} position={[0, jetLength * 0.62, 0]} center style={{ pointerEvents: 'none', opacity: dimmed ? 0.3 : 1 }}>
          <div key={title} className="topic-orbit-topic-label is-renaming">{title}</div>
        </Html>
      )}
    </group>
  );
}
