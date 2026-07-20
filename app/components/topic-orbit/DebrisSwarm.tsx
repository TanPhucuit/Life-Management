import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef } from './types';
import { bodyPositionAt, collapsedOrbitAt } from './diskLayout';

// Debris torn off the bodies and dragged down a spiral into the hole — and the
// same thing played outward when a new system condenses.
//
// Each fragment is a short CHAIN of points whose members lag progressively in
// life, so the fragment draws itself as a streak that stretches the closer it
// gets to the hole. (Chains of points, not LineSegments: GL lines do not draw
// at all in this scene.) All of it is one draw call and zero CPU work.
const TRAIL_POINTS = 7;

const DEBRIS_VERTEX = `
  uniform float uNow;
  uniform float uDuration;
  uniform float uInner;
  uniform float uReverse;
  uniform float uBurst;
  uniform float uPixelRatio;
  attribute float aStart;
  attribute float aRadius;
  attribute float aAngle;
  attribute float aY;
  attribute float aSpin;
  attribute float aTrail;
  attribute float aSize;
  attribute float aLife;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  // An explosion rather than an infall: fragments leave on ballistic paths and
  // keep whatever orbital angle they had.
  vec3 burstAt(float l, float radius0, float angle0, float y0, float spin) {
    float radius = radius0 + l * spin * 7.0;
    float angle = angle0 + l * (spin - 1.25) * 0.9;
    return vec3(cos(angle) * radius, y0 + (spin - 1.25) * l * 4.0, sin(angle) * radius);
  }

  vec3 spiralAt(float l, float radius0, float angle0, float y0, float spin) {
    // Radius collapses while the angle keeps winding: a spiral, not a circle.
    float eased = pow(clamp(l, 0.0, 1.0), 1.55);
    float radius = mix(radius0, uInner * 0.9, eased);
    float angle = angle0 + l * spin * 6.6;
    return vec3(cos(angle) * radius, y0 * (1.0 - eased), sin(angle) * radius);
  }

  void main() {
    // Mass matters: a boulder coasts for a long time, dust vaporises almost at
    // once, so each fragment runs its own clock.
    float raw = clamp((uNow - aStart) / (uDuration * aLife), 0.0, 1.0);
    float life = uReverse > 0.5 ? 1.0 - raw : raw;
    // Streaks lengthen as the material speeds up near the horizon: rock at the
    // start, a long glowing filament by the time it reaches the disk.
    float trail = mix(0.006, 0.075, pow(life, 1.5)) * aTrail;
    float l = clamp(uReverse > 0.5 ? life + trail : life - trail, 0.0, 1.0);
    vec3 world = uBurst > 0.5
      ? burstAt(l, aRadius, aAngle, aY, aSpin)
      : spiralAt(l, aRadius, aAngle, aY, aSpin);
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio * (1.0 - aTrail * 0.55) * (26.0 / max(1.0, -mvPosition.z));

    if (uBurst > 0.5) {
      // Blown outward: incandescent at the front, cooling to cold rock.
      vColor = mix(vec3(1.0, 0.92, 0.78), aColor * 0.7, pow(life, 0.8));
    } else {
      // PHASE 6 — matter changes phase as it falls: rock, dust, ionised dust,
      // plasma, accretion stream, pure light. Grey to red to orange to yellow
      // to white to blue-white, and then it is simply gone.
      vec3 c = mix(aColor * 0.55, vec3(0.42, 0.39, 0.36), 0.55);
      c = mix(c, vec3(0.88, 0.18, 0.05), smoothstep(0.05, 0.30, life));
      c = mix(c, vec3(1.00, 0.46, 0.07), smoothstep(0.30, 0.50, life));
      c = mix(c, vec3(1.00, 0.86, 0.26), smoothstep(0.50, 0.68, life));
      c = mix(c, vec3(1.00, 0.99, 0.94), smoothstep(0.68, 0.86, life));
      c = mix(c, vec3(0.74, 0.88, 1.00), smoothstep(0.86, 1.00, life));
      vColor = c;
    }
    float appear = smoothstep(0.0, 0.06, raw);
    float vanish = uReverse > 0.5
      // Condensing: hands over to the body itself.
      ? 1.0 - smoothstep(0.72, 1.0, raw)
      // Falling in: swallowed at the horizon.
      : 1.0 - smoothstep(uBurst > 0.5 ? 0.55 : 0.88, 1.0, raw);
    vAlpha = appear * vanish * (0.35 + pow(life, 1.6) * 1.6) * (1.0 - aTrail * 0.7);
  }
`;

const DEBRIS_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float falloff = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.9 + vAlpha), clamp(vAlpha * falloff, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function DebrisSwarm({
  bodies,
  clockRef,
  innerRadius,
  mode,
  startMs,
  durationMs,
  arrivalOf,
  perBody = 130,
}: {
  bodies: DiskBody[];
  clockRef: OrbitClockRef;
  innerRadius: number;
  // 'in': dragged down the spiral. 'burst': blown apart by a wave.
  // 'out': a new system condensing back out of the material.
  mode: 'in' | 'out' | 'burst';
  // Only used by 'in' — 'out' takes each body's own reveal time.
  startMs: number;
  durationMs: number;
  // For 'burst': when the wave reaches this body, in clock ms.
  arrivalOf?: (body: DiskBody) => number;
  perBody?: number;
}) {
  const geometry = useMemo(() => {
    const total = bodies.length * perBody * TRAIL_POINTS;
    const positions = new Float32Array(total * 3); // unused, three needs it
    const starts = new Float32Array(total);
    const radii = new Float32Array(total);
    const angles = new Float32Array(total);
    const heights = new Float32Array(total);
    const spins = new Float32Array(total);
    const trails = new Float32Array(total);
    const sizes = new Float32Array(total);
    const lives = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const here = new THREE.Vector3();
    const color = new THREE.Color();

    let cursor = 0;
    bodies.forEach((body) => {
      // Where the body actually is when it comes apart.
      bodyPositionAt(body, mode === 'in' ? startMs : body.revealAt, here);
      const baseAngle = Math.atan2(here.z, here.x);
      color.set(body.accent);
      for (let index = 0; index < perBody; index += 1) {
        // A shell of fragments around the body, not a point source.
        // Each fragment leaves from wherever its body actually is when that
        // fragment is stripped — which, on a decaying orbit, is not where the
        // body started.
        let originRadius = body.radius;
        let originAngle = baseAngle;
        if (mode === 'in') {
          const at = collapsedOrbitAt(body, startMs, startMs + Math.random() * durationMs * 0.3, durationMs, here);
          originRadius = at.radius;
          originAngle = at.angle;
        }
        const spreadAngle = originAngle + (Math.random() - 0.5) * (body.size * 2.4) / Math.max(0.5, originRadius);
        const spreadRadius = originRadius + (Math.random() - 0.5) * body.size * 3.2;
        const spreadHeight = body.height + (Math.random() - 0.5) * body.size * 2.6;
        // Fragments do not all leave at once: the body crumbles.
        const base = mode === 'out'
          ? body.revealAt
          : mode === 'burst' && arrivalOf
            ? arrivalOf(body)
            : startMs;
        // A burst shatters a body almost at once; an infall crumbles it slowly.
        const start = base + Math.random() * durationMs * (mode === 'burst' ? 0.06 : 0.3);
        const spin = 0.75 + Math.random() * 0.9;
        // Bigger chunks survive longer and read as rock; the small ones are dust.
        const chunkSize = 1.1 + Math.random() * 2.6;
        // 0.55 for dust, up to ~1.15 for the largest chunks.
        const lifespan = 0.5 + (chunkSize / 3.7) * 0.7;
        for (let vertex = 0; vertex < TRAIL_POINTS; vertex += 1) {
          starts[cursor] = start;
          radii[cursor] = spreadRadius;
          angles[cursor] = spreadAngle;
          heights[cursor] = spreadHeight;
          spins[cursor] = spin;
          trails[cursor] = vertex / (TRAIL_POINTS - 1); // 0 = head, 1 = tail
          sizes[cursor] = chunkSize;
          lives[cursor] = lifespan;
          colors[cursor * 3] = color.r;
          colors[cursor * 3 + 1] = color.g;
          colors[cursor * 3 + 2] = color.b;
          cursor += 1;
        }
      }
    });

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aStart', new THREE.BufferAttribute(starts, 1));
    buffer.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    buffer.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    buffer.setAttribute('aY', new THREE.BufferAttribute(heights, 1));
    buffer.setAttribute('aSpin', new THREE.BufferAttribute(spins, 1));
    buffer.setAttribute('aTrail', new THREE.BufferAttribute(trails, 1));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    buffer.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    buffer.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    buffer.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    return buffer;
  }, [arrivalOf, bodies, durationMs, mode, perBody, startMs]);

  const uniforms = useMemo(() => ({
    uNow: { value: 0 },
    uDuration: { value: durationMs },
    uInner: { value: innerRadius },
    uReverse: { value: mode === 'out' ? 1 : 0 },
    uBurst: { value: mode === 'burst' ? 1 : 0 },
    uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio) },
  }), [durationMs, innerRadius, mode]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => { uniforms.uNow.value = clockRef.current.ms; });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={DEBRIS_VERTEX}
        fragmentShader={DEBRIS_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
