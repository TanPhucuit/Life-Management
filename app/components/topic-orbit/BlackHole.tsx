import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DiskGeometry, OrbitClockRef, SceneQuality } from './types';
import { labelDissolveDelayMs } from './themes';
import { liveUniforms } from './liveUniforms';

// Cheap value noise — three octaves is plenty for the turbulence bands and
// keeps the disk affordable on integrated GPUs.
const NOISE_GLSL = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float value = 0.0; float amplitude = 0.5;
    for (int index = 0; index < 4; index += 1) { value += amplitude * noise(p); p *= 2.02; amplitude *= 0.5; }
    return value;
  }
`;

const DISK_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Doppler beaming (one side of the disk races toward the camera and burns
// brighter) plus differential rotation is what sells "black hole" rather than
// "glowing frisbee".
const DISK_FRAGMENT = `
  uniform float uSwirl;
  uniform float uInner;
  uniform float uOuter;
  uniform float uIntensity;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCool;
  varying vec3 vLocal;
  ${NOISE_GLSL}
  void main() {
    float radius = length(vLocal.xy);
    float t = clamp((radius - uInner) / max(0.0001, uOuter - uInner), 0.0, 1.0);
    float angle = atan(vLocal.y, vLocal.x);

    // Inner material orbits far faster than outer material.
    float swirl = angle + uSwirl * 1.35 / pow(max(radius, 0.35), 1.5);
    float bands = fbm(vec2(swirl * 2.4, radius * 0.72 - uSwirl * 0.06));
    bands = mix(bands, fbm(vec2(swirl * 5.1, radius * 1.9 + uSwirl * 0.1)), 0.45);

    // Gentle falloff: the material has to stay visible all the way out to the
    // task band, otherwise the bodies look like they are orbiting nothing.
    float falloff = mix(pow(1.0 - t, 1.35), 0.22, smoothstep(0.1, 0.55, t));
    float innerEdge = smoothstep(0.0, 0.05, t);
    float outerEdge = 1.0 - smoothstep(0.72, 1.0, t);
    float doppler = 0.55 + 0.85 * pow(max(0.0, sin(angle)), 1.6);

    vec3 color = mix(uHot, uMid, smoothstep(0.0, 0.32, t));
    color = mix(color, uCool, smoothstep(0.3, 1.0, t));
    float energy = (0.32 + bands * 1.15) * falloff * innerEdge * outerEdge * doppler * uIntensity;

    gl_FragColor = vec4(color * energy * 2.1, clamp(energy * 1.35, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// Light from the far side of the disk is bent over and under the hole. A second
// disk standing on edge is the cheap, well-known approximation of that lensed
// halo — a true lensing pass would cost a full-screen ray march.
const LENS_FRAGMENT = `
  uniform float uSwirl;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uHot;
  uniform vec3 uMid;
  varying vec3 vLocal;
  ${NOISE_GLSL}
  void main() {
    float radius = length(vLocal.xy);
    float t = clamp((radius - uInner) / max(0.0001, uOuter - uInner), 0.0, 1.0);
    float angle = atan(vLocal.y, vLocal.x);
    // Only the arcs above and below the hole survive; the sides would collide
    // with the real disk.
    float arc = pow(abs(sin(angle)), 5.0);
    float bands = fbm(vec2(angle * 3.2 + uSwirl * 0.4, radius * 1.4));
    float energy = arc * pow(1.0 - t, 3.4) * (0.4 + bands * 0.9) * smoothstep(0.0, 0.05, t);
    vec3 color = mix(uHot, uMid, t);
    gl_FragColor = vec4(color * energy * 1.8, clamp(energy, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// Matter spiralling in: position is computed entirely on the GPU from a seed,
// so a few thousand particles cost nothing on the CPU.
const PARTICLE_VERTEX = `
  uniform float uSwirl;
  uniform float uInner;
  uniform float uOuter;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aSize;
  varying float vFade;
  void main() {
    float life = fract(aSeed + uSwirl * aSpeed * 0.06);
    // life 0 -> spawned at the rim, life 1 -> swallowed at the horizon.
    float radius = mix(uOuter, uInner, pow(life, 1.7));
    float angle = aSeed * 62.83 + uSwirl * (0.9 / pow(max(radius, 0.4), 1.35));
    float height = (aSeed - 0.5) * 0.55 * (1.0 - life);
    vec3 world = vec3(cos(angle) * radius, height, sin(angle) * radius);
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Bright as it falls in, gone the instant it crosses the horizon.
    vFade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.86, 1.0, life));
    gl_PointSize = aSize * uPixelRatio * (18.0 / max(1.0, -mvPosition.z));
  }
`;

const PARTICLE_FRAGMENT = `
  varying float vFade;
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vFade;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

function AccretionParticles({ disk, swirlRef, count }: { disk: DiskGeometry; swirlRef: React.MutableRefObject<number>; count: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3); // unused, but three needs it
    const seeds = new Float32Array(count);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      seeds[index] = Math.random();
      speeds[index] = 0.55 + Math.random() * 1.2;
      sizes[index] = 0.6 + Math.random() * 1.8;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    buffer.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    buffer.boundingSphere = new THREE.Sphere(new THREE.Vector3(), disk.outerRadius * 1.2);
    return buffer;
  }, [count, disk.outerRadius]);

  const uniforms = useMemo(() => ({
    uSwirl: { value: 0 },
    uInner: { value: disk.horizonRadius * 1.02 },
    uOuter: { value: disk.outerRadius * 0.86 },
    uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio) },
    uColor: { value: new THREE.Color('#ffd9a0') },
  }), [disk.horizonRadius, disk.outerRadius]);

  const pointsRef = useRef<THREE.Points>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // The material owns a clone of the uniform map — see liveUniforms.ts.
  useFrame(() => { liveUniforms(pointsRef.current, uniforms).uSwirl.value = swirlRef.current; });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={PARTICLE_VERTEX}
        fragmentShader={PARTICLE_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function BlackHole({
  title,
  accent,
  disk,
  settled,
  dimmed,
  clockRef,
  quality,
  spin,
  transitioning,
  destroyMs,
}: {
  title: string;
  accent: string;
  disk: DiskGeometry;
  settled: boolean;
  dimmed: boolean;
  clockRef: OrbitClockRef;
  quality: SceneQuality;
  // 1 while the system is stable, higher while a topic change is tearing the
  // old system apart.
  spin: number;
  // True for the length of the topic-change event: the old name dissolves into
  // the horizon, and only the commit remounts the label with the new title.
  transitioning: boolean;
  // Length of the destruction beat — the name dissolve is delayed to its very
  // end (phase 8): the hole keeps its old identity while it feeds.
  destroyMs: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const scaleRef = useRef(0);
  // The disk's rotation is integrated rather than read straight off the clock,
  // so the hole can be spun up and eased back down without the whole pattern
  // jumping to a different phase.
  const diskRef = useRef<THREE.Mesh>(null);
  const lensRef = useRef<THREE.Mesh>(null);
  const swirlRef = useRef(0);
  const spinRef = useRef(1);

  const palette = useMemo(() => {
    const cool = new THREE.Color(accent).lerp(new THREE.Color('#f97316'), 0.35);
    return {
      hot: new THREE.Color('#fff6e0'),
      mid: new THREE.Color('#ffb457'),
      cool,
    };
  }, [accent]);

  const diskUniforms = useMemo(() => ({
    uSwirl: { value: 0 },
    uInner: { value: disk.innerRadius },
    uOuter: { value: disk.outerRadius },
    uIntensity: { value: 1 },
    uHot: { value: palette.hot },
    uMid: { value: palette.mid },
    uCool: { value: palette.cool },
  }), [disk.innerRadius, disk.outerRadius, palette]);

  const lensUniforms = useMemo(() => ({
    uSwirl: { value: 0 },
    uInner: { value: disk.innerRadius },
    uOuter: { value: disk.outerRadius * 0.42 },
    uHot: { value: palette.hot },
    uMid: { value: palette.mid },
  }), [disk.innerRadius, disk.outerRadius, palette]);

  useFrame((_, delta) => {
    spinRef.current += (spin - spinRef.current) * Math.min(1, delta * (spin > spinRef.current ? 4.5 : 1.4));
    swirlRef.current += Math.min(delta, 0.05) * spinRef.current * clockRef.current.speed;
    // Materials own clones of the uniform maps — see liveUniforms.ts.
    const liveDisk = liveUniforms(diskRef.current, diskUniforms);
    const liveLens = liveUniforms(lensRef.current, lensUniforms);
    liveDisk.uSwirl.value = swirlRef.current;
    liveLens.uSwirl.value = swirlRef.current;
    // A hole eating a whole system burns brighter while it does it — but only
    // enough to read as "awake". Past this the disk blows out to flat white and
    // the event horizon, the streams and the silence all stop being legible.
    const targetIntensity = (dimmed ? 0.55 : 1) * (1 + (spinRef.current - 1) * 0.1);
    liveDisk.uIntensity.value += (targetIntensity - liveDisk.uIntensity.value) * Math.min(1, delta * 2.4);

    const group = groupRef.current;
    if (!group) return;
    scaleRef.current += ((settled ? 1 : 0.001) - scaleRef.current) * Math.min(1, delta * 1.9);
    group.scale.setScalar(Math.max(0.0001, scaleRef.current));
  });

  return (
    <group ref={groupRef}>
      {/* Event horizon: pure black, and it must write depth so the disk behind
          it is genuinely occluded rather than blended over. */}
      <mesh renderOrder={2}>
        <sphereGeometry args={[disk.horizonRadius, 64, 48]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>

      {/* No photon-ring torus. A perfectly even, constant-width bright circle
          is exactly what a real photon ring is NOT: the light around a hole is
          Doppler-beamed, so it is far brighter on the approaching side and it
          has no hard edge at all. Drawn as a flat torus it reads as a UI ring
          laid over the scene. The lensed halo below carries the same physics
          honestly, with the beaming and the falloff included. */}

      {/* The accretion disk itself — the plane every task orbits on. */}
      <mesh ref={diskRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <ringGeometry args={[
          disk.innerRadius,
          disk.outerRadius,
          quality === 'ultra' ? 512 : 256,
          quality === 'ultra' ? 192 : quality === 'high' ? 96 : 32,
        ]} />
        <shaderMaterial
          uniforms={diskUniforms}
          vertexShader={DISK_VERTEX}
          fragmentShader={DISK_FRAGMENT}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Lensed halo standing on edge. */}
      <mesh ref={lensRef} renderOrder={4}>
        <ringGeometry args={[disk.innerRadius, disk.outerRadius * 0.42, 180, 24]} />
        <shaderMaterial
          uniforms={lensUniforms}
          vertexShader={DISK_VERTEX}
          fragmentShader={LENS_FRAGMENT}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {quality !== 'low' && (
        <AccretionParticles disk={disk} swirlRef={swirlRef} count={quality === 'ultra' ? 9000 : 2600} />
      )}

      <pointLight color={palette.mid} intensity={dimmed ? 12 : 42} distance={disk.outerRadius * 4} decay={1.7} />

      {settled && (
        <Html
          distanceFactor={18}
          position={[0, disk.horizonRadius + 1.5, 0]}
          center
          style={{ pointerEvents: 'none', opacity: dimmed ? 0.3 : 1 }}
        >
          <div
            key={title}
            className={`topic-orbit-topic-label ${transitioning ? 'is-dissolving' : 'is-renaming'}`}
            style={transitioning ? { animationDelay: `${labelDissolveDelayMs(destroyMs)}ms` } : undefined}
          >{title}</div>
        </Html>
      )}
    </group>
  );
}
