import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Stars are one Points draw call with a GPU-side twinkle, so the count can go
// into six figures without touching the frame budget.
const STAR_VERTEX = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uLensing;
  attribute float aSize;
  attribute float aSeed;
  varying float vTwinkle;
  varying vec3 vTint;
  void main() {
    // Gravitational lensing, done where it is cheap: light from a star behind
    // the hole reaches us along a bent path, so its apparent direction is
    // pushed AWAY from the mass, and the closer to the hole it appears the
    // more it moves. Deflection falls off with angular distance squared.
    vec3 world = position;
    if (uLensing > 0.0) {
      vec3 toStar = normalize(world - cameraPosition);
      vec3 toHole = normalize(-cameraPosition);
      float cosA = clamp(dot(toStar, toHole), -1.0, 1.0);
      float angle = acos(cosA);
      vec3 away = toStar - toHole * cosA;
      if (length(away) > 0.0001 && angle > 0.001) {
        away = normalize(away);
        float deflection = min(uLensing * 0.0016 / max(angle * angle, 0.0008), angle * 0.85);
        world = cameraPosition + normalize(toStar + away * deflection) * length(world - cameraPosition);
      }
    }
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed) + aSeed * 62.8);
    // Cool blue-white through to a warm dusting, biased by the same seed.
    vTint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.76), aSeed);
    gl_PointSize = aSize * uPixelRatio * (1.0 + 0.35 * vTwinkle);
  }
`;

const STAR_FRAGMENT = `
  varying float vTwinkle;
  varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d) * vTwinkle;
    gl_FragColor = vec4(vTint, alpha);
    #include <colorspace_fragment>
  }
`;

const NEBULA_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vDirection;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i), n100 = hash(i + vec3(1,0,0)), n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1)), n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
    return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
               mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
  }
  float fbm(vec3 p) {
    float value = 0.0; float amplitude = 0.5;
    for (int index = 0; index < 5; index += 1) { value += amplitude * noise(p); p *= 2.03; amplitude *= 0.5; }
    return value;
  }
  void main() {
    vec3 p = vDirection * 2.2;
    float clouds = fbm(p + vec3(0.0, uTime * 0.006, 0.0));
    clouds = pow(smoothstep(0.35, 0.95, clouds), 1.8);
    // Denser toward the galactic plane so the backdrop has an orientation.
    float band = 1.0 - smoothstep(0.0, 0.55, abs(vDirection.y));
    vec3 color = mix(uColorA, uColorB, fbm(p * 1.7));
    gl_FragColor = vec4(color * clouds * (0.35 + band * 0.85), 1.0);
    #include <colorspace_fragment>
  }
`;

export function GalaxyBackground({
  radius,
  starCount,
  accent,
  lensing,
}: {
  radius: number;
  starCount: number;
  accent: string;
  // 0 in the calm state, ramps up while the hole is feeding.
  lensing: number;
}) {
  const starsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const seeds = new Float32Array(starCount);
    for (let index = 0; index < starCount; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      // Squashed toward the galactic plane: a uniform shell reads as noise, a
      // flattened one reads as a galaxy the disk belongs to.
      const y = (Math.random() * 2 - 1);
      const flattened = Math.sign(y) * Math.pow(Math.abs(y), 2.1);
      const phi = Math.acos(Math.max(-1, Math.min(1, flattened)));
      const distance = radius * (0.62 + Math.random() * 0.38);
      positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = distance * Math.cos(phi);
      positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);
      sizes[index] = Math.random() < 0.965 ? 0.9 + Math.random() * 1.1 : 2.4 + Math.random() * 2.2;
      seeds[index] = Math.random();
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    buffer.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return buffer;
  }, [radius, starCount]);

  const starUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio) },
    uLensing: { value: 0 },
  }), []);

  const nebulaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color('#1b2a6b') },
    uColorB: { value: new THREE.Color(accent).multiplyScalar(0.55) },
  }), [accent]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    starUniforms.uTime.value = elapsed;
    // Eased rather than switched: the sky must warp, not snap.
    starUniforms.uLensing.value += (lensing - starUniforms.uLensing.value) * Math.min(1, delta * 2.6);
    nebulaUniforms.uTime.value = elapsed;
    if (starsRef.current) starsRef.current.rotation.y += delta * 0.004;
  });

  return (
    <group>
      <mesh scale={-1}>
        <sphereGeometry args={[radius * 1.35, 48, 32]} />
        <shaderMaterial
          uniforms={nebulaUniforms}
          vertexShader={NEBULA_VERTEX}
          fragmentShader={NEBULA_FRAGMENT}
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
        />
      </mesh>
      <points ref={starsRef} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          uniforms={starUniforms}
          vertexShader={STAR_VERTEX}
          fragmentShader={STAR_FRAGMENT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
