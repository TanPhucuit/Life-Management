import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef } from './types';
import { bodyPositionAt } from './diskLayout';
import { INFLOW_EXP, type TidalStream, makeTidalStream, streamPhiForRadius } from './tidalStream';
import { liveUniforms } from './liveUniforms';

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
  // Shared tidal-stream parameters — identical to the TidalStream the bodies
  // use, so both agree on where the material is at every instant.
  uniform float uOuter;
  uniform float uK;
  uniform float uEntryAngle;
  uniform float uPhiSpan;
  uniform float uShearPhi;
  uniform float uInflowExp;
  uniform float uVHorizon;
  uniform float uVDrain;
  attribute float aStart;
  attribute float aRadius;
  attribute float aAngle;
  attribute float aY;
  attribute float aSpin;
  attribute float aTrail;
  attribute float aSize;
  attribute float aLife;
  attribute float aShear;
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

  // The SAME logarithmic arm the bodies ride, advancing at the SAME rigid
  // pattern speed — see tidalStream.ts. Debris and the ribbon it was torn from
  // therefore stay locked together on one continuous stream.
  //
  // aShear is the fragment's specific-energy offset. This is the effect that
  // makes a real tidal stream a STREAM: material stripped with slightly more
  // or less binding energy runs slightly ahead of or behind the parent, so the
  // debris shears along the orbit and the separate clumps stretch out until
  // they overlap into one unbroken filament. Without it the debris stays
  // bunched around each parent and the arm reads as beads, not as a stream.
  vec3 spiralAt(float l, float radius0, float angleJitter, float y0, float shear) {
    float t = clamp(l, 0.0, 1.0);
    float phi0 = max(0.0, log(uOuter / max(radius0, 0.0001)) / uK);
    float radius;
    float phi;
    if (uReverse > 0.5) {
      // Condensing: material only gathers from the stretch of disk just
      // inside the new planet's own orbit. Sending it out from the horizon
      // instead would put a hard bright ring around the hole that no
      // accretion disk has.
      phi = phi0 + t * uPhiSpan;
      radius = max(uInner, uOuter * exp(-uK * phi));
    } else {
      // Falling in: v = (r/r_out)^p drops linearly, so the parcel speeds up
      // as it closes in and actually reaches the horizon. See tidalStream.ts.
      float v0 = pow(clamp(radius0 / uOuter, 0.0001, 1.0), uInflowExp);
      float v = max(uVHorizon, v0 - uVDrain * t);
      radius = uOuter * pow(v, 1.0 / uInflowExp);
      phi = log(uOuter / max(radius, 0.0001)) / uK;
    }
    // The shear grows with time — the stream keeps lengthening as it falls.
    phi += shear * uShearPhi * smoothstep(0.0, 0.3, t);
    radius = max(uInner * 0.92, uOuter * exp(-uK * phi));
    float angle = uEntryAngle + phi + angleJitter;
    return vec3(cos(angle) * radius, y0 * (1.0 - t * 0.8), sin(angle) * radius);
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
    // In 'in'/'out' mode aAngle carries a small angular JITTER around the
    // shared stream (the stream supplies the angle itself); in 'burst' mode it
    // is the fragment's absolute launch angle.
    vec3 world = uBurst > 0.5
      ? burstAt(l, aRadius, aAngle, aY, aSpin)
      : spiralAt(l, aRadius, aAngle, aY, aShear);
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
    // The stream stays lit the whole way in and only winks out AT the horizon,
    // where the hole takes it. The fade band is deliberately narrow — the
    // material has to be seen going right up to the edge and disappearing
    // there, not thinning away somewhere in mid-flight.
    float swallowed = uBurst > 0.5
      ? 1.0
      : smoothstep(uInner * 0.98, uInner * 1.18, length(world.xz));
    vAlpha = appear * vanish * swallowed * (0.35 + pow(life, 1.6) * 1.6) * (1.0 - aTrail * 0.7);
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
  stream,
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
  // The shared tidal stream for 'in'/'out'. Must be the very same object the
  // bodies ride, or debris and ribbon separate.
  stream: TidalStream | null;
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
    const shears = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const here = new THREE.Vector3();
    const color = new THREE.Color();

    let cursor = 0;
    bodies.forEach((body) => {
      // Where the body actually is when it comes apart: at the topic change
      // for an infall, at the moment the wave reaches IT for a burst, and at
      // its own formation spot when condensing outward.
      const originAt = mode === 'in'
        ? startMs
        : mode === 'burst' && arrivalOf
          ? arrivalOf(body)
          : body.revealAt;
      bodyPositionAt(body, originAt, here);
      const baseAngle = Math.atan2(here.z, here.x);
      color.set(body.accent);
      for (let index = 0; index < perBody; index += 1) {
        // A shell of fragments around the body, not a point source.
        //
        // On the stream ('in'/'out') the shader derives the angle from the
        // stream itself, so aAngle carries only a small JITTER: the debris
        // then rides the same spiral as the ribbon it was torn from, spread
        // across its width rather than scattered off it. In 'burst' mode the
        // fragment has no stream to follow, so aAngle is absolute.
        //
        // The radial spread is what gives the stream a real energy spread: a
        // fragment stripped slightly further out falls back slightly later,
        // which is precisely the ΔE ordering that stretches a real tidal
        // stream into a filament.
        const spreadRadius = body.radius + (Math.random() - 0.5) * body.size * 3.2;
        const spreadAngle = mode === 'burst'
          ? baseAngle + (Math.random() - 0.5) * (body.size * 2.4) / Math.max(0.5, body.radius)
          : (Math.random() - 0.5) * (body.size * 3.0) / Math.max(0.5, body.radius);
        const spreadHeight = body.height + (Math.random() - 0.5) * body.size * 2.6;
        // Fragments do not all leave at once: the body crumbles.
        const base = mode === 'out'
          ? body.revealAt
          : mode === 'burst' && arrivalOf
            ? arrivalOf(body)
            : startMs;
        // A burst shatters a body almost at once; an infall crumbles it
        // slowly. Either way the last fragment must still complete its life
        // inside durationMs, so the stagger is a small fraction of it.
        const start = base + Math.random() * durationMs * (mode === 'burst' ? 0.05 : 0.18);
        const spin = 0.75 + Math.random() * 0.9;
        // Bigger chunks survive longer and read as rock; the small ones are
        // dust that vaporises early (spec: "Large fragments survive longer.
        // Small fragments vaporize faster.").
        const chunkSize = 1.1 + Math.random() * 2.6;
        // ~0.4 for dust, up to 1.0 for the largest chunks — capped at 1 so no
        // fragment outlives the destruction beat it belongs to.
        const lifespan = 0.4 + (chunkSize / 3.7) * 0.6;
        // Specific-energy offset. Uniform rather than bell-shaped on purpose:
        // a real stream has a broad, flat dM/dE across the disrupted body, so
        // the material spreads EVENLY along the orbit instead of staying piled
        // up at the parent's own position.
        const shear = Math.random() * 2 - 1;
        for (let vertex = 0; vertex < TRAIL_POINTS; vertex += 1) {
          starts[cursor] = start;
          radii[cursor] = spreadRadius;
          angles[cursor] = spreadAngle;
          heights[cursor] = spreadHeight;
          spins[cursor] = spin;
          trails[cursor] = vertex / (TRAIL_POINTS - 1); // 0 = head, 1 = tail
          sizes[cursor] = chunkSize;
          lives[cursor] = lifespan;
          shears[cursor] = shear;
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
    buffer.setAttribute('aShear', new THREE.BufferAttribute(shears, 1));
    buffer.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    buffer.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    return buffer;
  }, [arrivalOf, bodies, durationMs, mode, perBody, startMs]);

  const uniforms = useMemo(() => {
    // 'out' (a new system condensing) has no disruption stream of its own, so
    // it runs the same geometry built from the bodies it is about to form.
    const track = stream || makeTidalStream(
      bodies.reduce((maximum, body) => Math.max(maximum, body.radius), innerRadius * 2),
      innerRadius,
      0,
      3.5,
    );
    // How far the stream shears. Sized against the widest azimuth gap between
    // neighbouring bodies on the arm: once the debris has spread by a full
    // gap, the separate clumps overlap and the arm is genuinely continuous.
    const phis = bodies
      .map((body) => streamPhiForRadius(track, body.radius))
      .sort((a, b) => a - b);
    const widestGap = phis.reduce(
      (widest, phi, index) => (index === 0 ? widest : Math.max(widest, phi - phis[index - 1])),
      0.6,
    );
    return {
      uNow: { value: 0 },
      uDuration: { value: durationMs },
      uInner: { value: innerRadius },
      uReverse: { value: mode === 'out' ? 1 : 0 },
      uBurst: { value: mode === 'burst' ? 1 : 0 },
      uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio) },
      uOuter: { value: track.outerRadius },
      uK: { value: track.k },
      uEntryAngle: { value: track.entryAngle },
      // Condensing material only gathers from the disk just inside its own
      // orbit; infalling debris rides the whole arm to the horizon.
      uPhiSpan: { value: mode === 'out' ? track.phiTotal * 0.26 : track.phiTotal },
      uShearPhi: { value: widestGap * (mode === 'out' ? 0.3 : 0.62) },
      uInflowExp: { value: INFLOW_EXP },
      uVHorizon: { value: track.vHorizon },
      uVDrain: { value: track.vDrain },
    };
  }, [bodies, durationMs, innerRadius, mode, stream]);

  const pointsRef = useRef<THREE.Points>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // The material owns a clone of the uniform map — see liveUniforms.ts.
  useFrame(() => { liveUniforms(pointsRef.current, uniforms).uNow.value = clockRef.current.ms; });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
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
