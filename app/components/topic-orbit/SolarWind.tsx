import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitClockRef } from './types';
import { liveUniforms } from './liveUniforms';

// Charged particles streaming off the star and out through the system — the
// solar-storm picture: a continuous wind at rest, and a flood during a storm.
// Each particle is a chain of points so it draws as a curved streak, and the
// whole field is one draw call computed entirely on the GPU.
const CHAIN = 6;

const WIND_VERTEX = `
  uniform float uNow;
  uniform float uInner;
  uniform float uOuter;
  uniform float uIntensity;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aTrail;
  attribute float aLat;
  attribute float aLon;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    // Every particle runs its own loop, offset by its seed, so the stream never
    // pulses in lockstep.
    float life = fract(aSeed + uNow * 0.00006 * aSpeed * (0.6 + uIntensity * 1.8)) ;
    float t = clamp(life - aTrail * 0.045, 0.0, 1.0);
    float radius = mix(uInner, uOuter, pow(t, 0.85));

    // Particles leave along field lines: they climb away from the equator and
    // are swept back by rotation as they go, which is what curves the stream.
    float lat = aLat * (1.0 - t * 0.45);
    float lon = aLon + t * (1.4 + aSpeed * 0.6);
    vec3 world = vec3(
      cos(lat) * cos(lon) * radius,
      sin(lat) * radius,
      cos(lat) * sin(lon) * radius
    );

    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Wind is fine and thready: fat points read as dirt on the lens, not as
    // charged particles streaming off a star.
    // Clamped for the same reason as the accretion particles: unbounded
    // 1/distance growth turns a dense sprite cloud into a fill-rate wall as
    // soon as any of it comes near the camera.
    gl_PointSize = min(
      (0.7 + aSeed * 1.0) * uPixelRatio * (1.0 - aTrail * 0.5) * (16.0 / max(1.0, -mvPosition.z)),
      7.0 * uPixelRatio
    );
    // Bright as it leaves the surface, spent well before it reaches the edge —
    // at rest it is barely a shimmer, and only a storm fills the system.
    vAlpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.42, 0.8, t)) * (0.05 + uIntensity * 0.9) * (1.0 - aTrail * 0.55);
    vHeat = 1.0 - t;
  }
`;

const WIND_FRAGMENT = `
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    if (vAlpha < 0.01) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    vec3 color = mix(uCool, uHot, pow(vHeat, 1.4));
    gl_FragColor = vec4(color * (1.0 + vAlpha), clamp(vAlpha * smoothstep(0.5, 0.0, d), 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function SolarWind({
  clockRef,
  innerRadius,
  outerRadius,
  accent,
  intensity,
  count = 5200,
}: {
  clockRef: OrbitClockRef;
  innerRadius: number;
  outerRadius: number;
  accent: string;
  // 0..1 — the calm wind sits near 0.12, a storm goes to 1.
  intensity: number;
  count?: number;
}) {
  const geometry = useMemo(() => {
    const total = count * CHAIN;
    const positions = new Float32Array(total * 3);
    const seeds = new Float32Array(total);
    const speeds = new Float32Array(total);
    const trails = new Float32Array(total);
    const lats = new Float32Array(total);
    const lons = new Float32Array(total);
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      const seed = Math.random();
      const speed = 0.6 + Math.random() * 1.5;
      // Denser near the equator, exactly like a real stellar wind.
      const lat = (Math.random() - 0.5) * Math.PI * 0.55;
      const lon = Math.random() * Math.PI * 2;
      for (let link = 0; link < CHAIN; link += 1) {
        seeds[cursor] = seed;
        speeds[cursor] = speed;
        trails[cursor] = link / (CHAIN - 1);
        lats[cursor] = lat;
        lons[cursor] = lon;
        cursor += 1;
      }
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    buffer.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    buffer.setAttribute('aTrail', new THREE.BufferAttribute(trails, 1));
    buffer.setAttribute('aLat', new THREE.BufferAttribute(lats, 1));
    buffer.setAttribute('aLon', new THREE.BufferAttribute(lons, 1));
    buffer.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    return buffer;
  }, [count]);

  const uniforms = useMemo(() => ({
    uNow: { value: 0 },
    uInner: { value: innerRadius },
    uOuter: { value: outerRadius },
    uIntensity: { value: 0.12 },
    uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio) },
    uHot: { value: new THREE.Color('#fff3d0') },
    uCool: { value: new THREE.Color(accent) },
  }), [accent, innerRadius, outerRadius]);

  const pointsRef = useRef<THREE.Points>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    // The material owns a clone of the uniform map — see liveUniforms.ts.
    const live = liveUniforms(pointsRef.current, uniforms);
    live.uNow.value = clockRef.current.ms;
    live.uIntensity.value += (intensity - live.uIntensity.value) * Math.min(1, delta * 2.4);
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={WIND_VERTEX}
        fragmentShader={WIND_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
