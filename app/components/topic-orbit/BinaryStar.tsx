import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitClockRef } from './types';
import { labelDissolveDelayMs } from './themes';
import { liveUniforms } from './liveUniforms';

// Two stars around an invisible barycentre. During a topic change their orbit
// decays, a tidal bridge of plasma stretches between them, they merge into one
// over-compressed sphere and release a shockwave — all of it in the same scene,
// with no cut.
const STAR_GEOMETRY = new THREE.SphereGeometry(1, 64, 48);

// A star being torn apart by its companion does not turn into a stretched
// ellipsoid — it is sheared ALONG its orbit, so the material wraps around the
// barycentre. Mapping the "along" axis onto the orbit circle is what turns the
// pair into two molten streams winding through each other instead of two
// rigid capsules pointing at one another.
//
// uArcRadius = 0 means "plain sphere", and the model matrix places it.
const PLASMA_VERTEX = `
  uniform vec3 uScale;
  uniform float uArcRadius;
  uniform float uArcPhi;
  uniform float uMelt;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    // Left on the undeformed sphere so the granulation stays painted on the
    // material as it flows rather than smearing with it.
    vLocal = position;

    // Cross-section. Simply scaling a sphere along one axis gives a lens that
    // tapers to sharp points at both ends — stretched far enough and wrapped
    // around the orbit, that reads as a dented crescent rather than as a rope
    // of plasma. So the profile is morphed from the sphere's own
    // sqrt(1 - z^2) toward a near-constant radius with softly rounded ends:
    // at full melt the star really is a tube of even thickness.
    float zz = clamp(position.z, -1.0, 1.0);
    float ring = sqrt(max(0.0, 1.0 - zz * zz));
    vec2 dir = ring > 0.0001 ? position.xy / ring : vec2(1.0, 0.0);
    float tube = pow(max(0.0, 1.0 - zz * zz), 0.13);
    float profile = mix(ring, tube, uMelt);
    vec3 shaped = vec3(dir * profile, zz);

    vec3 p = shaped * uScale;
    // A tube's normal is radial in its own cross-section; a sphere's is not.
    vec3 n = normalize(mix(normal, vec3(dir, 0.0), uMelt));
    vec3 placed;
    if (uArcRadius > 0.0) {
      float c0 = cos(uArcPhi);
      float s0 = sin(uArcPhi);
      // Flat placement: the body sits on the tangent plane at its point on the
      // orbit. An intact star must use this and nothing else — wrapping a
      // sphere around the orbit at rest bows it into a banana, which is why it
      // never looked properly round.
      // ('flat' is a reserved interpolation qualifier in GLSL — do not name a
      // variable that.)
      vec3 tangentPlane = vec3(c0, 0.0, s0) * (uArcRadius + p.x)
                        + vec3(0.0, p.y, 0.0)
                        + vec3(-s0, 0.0, c0) * p.z;
      // Wrapped placement: the material follows the orbit itself. Only the
      // sheared, molten star needs this.
      float dphi = p.z / uArcRadius;
      float phi = uArcPhi + dphi;
      float r = uArcRadius + p.x;
      float c = cos(phi);
      float s = sin(phi);
      vec3 bent = vec3(c * r, p.y, s * r);
      placed = mix(tangentPlane, bent, uMelt);
      n = normalize(mix(
        vec3(n.x * c0 - n.z * s0, n.y, n.x * s0 + n.z * c0),
        vec3(n.x * c - n.z * s, n.y, n.x * s + n.z * c),
        uMelt
      ));
    } else {
      placed = p;
    }
    vNormalW = normalize(mat3(modelMatrix) * n);
    vec4 world = modelMatrix * vec4(placed, 1.0);
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

// The shockwave is a thin expanding shell of energy. Limb brightening makes it
// read as a wave rather than a bubble, but the whole surface has to carry some
// light or the front is invisible against a bright merger. A little noise
// breaks the perfect sphere so it looks like driven plasma, not a UI ring.
const SHOCK_FRAGMENT = `
  uniform float uOpacity;
  uniform vec3 uColor;
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
  void main() {
    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float limb = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
    float grain = 0.75 + noise(normalize(vLocal) * 5.0) * 0.5;
    float energy = (0.28 + limb * 1.5) * grain;
    float alpha = energy * uOpacity;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(uColor * (0.8 + energy * 2.4), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// The burning tail. A close binary sheds material off the outer face of each
// star, and because that material carries more angular momentum than the star
// it is left behind and outside the orbit — the tidal tails seen in every
// interacting-pair simulation. Position is computed on the GPU from the live
// orbit, so the tails genuinely follow the stars in as the orbit decays and
// wind up tighter as the pair spins up.
const TAIL_VERTEX = `
  uniform float uAngle;
  uniform float uRadius;
  uniform float uStress;
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aLag;
  attribute float aSide;
  attribute float aSpread;
  attribute float aSize;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    // Trailing arc: further back along the tail means further behind in
    // azimuth and a little further out, since shed material rises.
    float lag = aLag * (0.9 + uStress * 2.6);
    float angle = uAngle - lag + aSide;
    float radius = uRadius * (1.0 + aLag * 0.55) + aSpread;
    float height = aSpread * 0.35 * sin(uTime * 0.8 + aLag * 9.0);
    vec3 world = vec3(cos(angle) * radius, height, sin(angle) * radius);
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio * (22.0 / max(1.0, -mvPosition.z));
    // Nothing at rest; it lights up as the pair is torn apart.
    vAlpha = pow(uStress, 1.4) * (1.0 - aLag) * 0.9;
    vHeat = 1.0 - aLag;
  }
`;

const TAIL_FRAGMENT = `
  varying float vAlpha;
  varying float vHeat;
  void main() {
    if (vAlpha < 0.01) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    // White-hot where it leaves the star, cooling to orange down the tail.
    vec3 color = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.95, 0.85), pow(vHeat, 0.7));
    gl_FragColor = vec4(color * 1.6, vAlpha * smoothstep(0.5, 0.0, d));
    #include <colorspace_fragment>
  }
`;

export type BinaryPhase = {
  // 0 = calm, 1 = fully merged.
  collapse: number;
  // 0 until the stars touch, then 0..1 as they shear into two molten streams.
  melt: number;
  // Orbital rate as a fraction of maximum.
  spin: number;
  // 0 while nothing has been released, then the shockwave radius in world units.
  shockRadius: number;
  shockOpacity: number;
  // 1 while the stars exist, 0 in the gap between the detonation and the
  // rebirth. The pair really is annihilated: nothing survives the merger.
  presence: number;
  // 0..1 as the new pair condenses out of nothing.
  reborn: number;
};

const MERGE_AT = 0.58;
const MELT_FROM = 0.34;
// Peak orbital rate, in radians per second, reached exactly at contact. A real
// inspiral ends as an unresolvable blur; this is as fast as the frame rate can
// still show the pair turning rather than strobing.
const MAX_ORBIT_RATE = 26;

export function computeBinaryPhase(progress: number | null): BinaryPhase {
  if (progress === null) {
    return { collapse: 0, melt: 0, spin: 0, shockRadius: 0, shockOpacity: 0, presence: 1, reborn: 1 };
  }
  // The whole first 58% of the beat is the inspiral, because that is the part
  // worth watching: the pair turns slowly at first and only runs away at the
  // end. The exponent is what makes it read that way — an inspiral sheds
  // angular momentum ever faster as the orbit tightens, so almost all of the
  // winding happens in the last moments before contact.
  const inward = Math.min(1, progress / MERGE_AT);
  const collapse = Math.pow(inward, 2.4);
  // Contact. From here the two stars are touching and shearing: they stop
  // being spheres and are drawn out into two molten streams that wind around
  // the barycentre and through each other. Smoothstep so the deformation
  // flows on rather than switching on.
  const meltRaw = Math.min(1, Math.max(0, (progress - MELT_FROM) / (MERGE_AT - MELT_FROM)));
  const melt = meltRaw * meltRaw * (3 - 2 * meltRaw);
  // Only once they are fully wound together does anything detonate.
  const shock = progress > MERGE_AT ? Math.min(1, (progress - MERGE_AT) / 0.16) : 0;
  const destroyed = progress > MERGE_AT ? Math.min(1, (progress - MERGE_AT) / 0.05) : 0;
  // Rebirth is the destruction run backwards: the blast debris re-gathers as
  // two streams which then shorten and round up into two stars, on an orbit
  // that widens back out to its resting separation. Nothing pops into being.
  const reborn = progress > 0.78 ? Math.min(1, (progress - 0.78) / 0.22) : 0;

  // Rotation rate as a fraction of maximum: rest to 60% while the pair is
  // still spherical, 60% to 100% while it shears into streams.
  //
  // Both legs are LINEAR in their own phase, and they are matched at the
  // handover, so the rate climbs at a steady rate throughout with no step and
  // no flat spot. (Using the eased `melt` for the second leg would stall the
  // rate the instant the stars touch, and an accelerating curve for the first
  // leg would leave a visible jump at the join — which is exactly what the
  // previous version did.)
  const contact = Math.min(1, Math.max(0, (progress - MELT_FROM) / (MERGE_AT - MELT_FROM)));
  let spin: number;
  if (reborn > 0) {
    // Winding back down as the new orbit widens.
    spin = 0.6 * (1 - reborn);
  } else if (progress < MELT_FROM) {
    spin = 0.6 * (progress / MELT_FROM);
  } else {
    spin = 0.6 + 0.4 * contact;
  }

  return {
    collapse,
    // The rebirth reverses the shear, so the streams gather back into spheres.
    melt: reborn > 0 ? Math.max(0, 1 - reborn * 1.35) : melt,
    spin,
    shockRadius: shock,
    // Bright the moment it leaves, thinning as it expands — never a slow
    // fade-in, which would read as a UI overlay rather than a blast front.
    shockOpacity: shock > 0 && shock < 1 ? Math.pow(1 - shock, 0.7) * 0.95 : 0,
    // Material re-appears quickly as thin streams, then takes its time
    // condensing — so the eye sees it gather rather than switch on.
    presence: Math.max(1 - destroyed, Math.min(1, reborn * 4)),
    reborn,
  };
}

export function BinaryStar({
  title,
  accent,
  separation,
  settled,
  dimmed,
  clockRef,
  dissolveStartMs,
  destroyMs,
  reach,
}: {
  title: string;
  accent: string;
  separation: number;
  settled: boolean;
  dimmed: boolean;
  clockRef: OrbitClockRef;
  // Non-null while a topic change is running. Progress is derived from the
  // clock INSIDE useFrame — React does not re-render during the event, so a
  // progress prop computed at render time would freeze the whole merger.
  dissolveStartMs: number | null;
  destroyMs: number;
  reach: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const primaryRef = useRef<THREE.Mesh>(null);
  const secondaryRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const tailRef = useRef<THREE.Points>(null);
  const scaleRef = useRef(0);
  const angleRef = useRef(0);

  // Two tails, one shed from each star, so they sit half a turn apart.
  const tailGeometry = useMemo(() => {
    const perTail = 900;
    const total = perTail * 2;
    const positions = new Float32Array(total * 3);
    const lags = new Float32Array(total);
    const sides = new Float32Array(total);
    const spreads = new Float32Array(total);
    const sizes = new Float32Array(total);
    for (let index = 0; index < total; index += 1) {
      // Denser near the star, thinning down the tail.
      lags[index] = Math.pow(Math.random(), 1.7);
      sides[index] = index < perTail ? 0 : Math.PI;
      spreads[index] = (Math.random() - 0.5) * separation * 0.1;
      sizes[index] = 1.2 + Math.random() * 2.4;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aLag', new THREE.BufferAttribute(lags, 1));
    buffer.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    buffer.setAttribute('aSpread', new THREE.BufferAttribute(spreads, 1));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    buffer.boundingSphere = new THREE.Sphere(new THREE.Vector3(), separation * 4);
    return buffer;
  }, [separation]);

  useEffect(() => () => tailGeometry.dispose(), [tailGeometry]);

  const tailUniforms = useMemo(() => ({
    uAngle: { value: 0 },
    uRadius: { value: 0 },
    uStress: { value: 0 },
    uTime: { value: 0 },
    uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio) },
  }), []);

  // A real pair is two different spectral classes: a warm yellow primary and a
  // hotter blue-white secondary. The topic accent only tints the secondary
  // slightly — pushing the raw accent onto a star surface made it read as a
  // coloured ball rather than as burning plasma.
  const palette = useMemo(() => {
    const tint = new THREE.Color(accent);
    return {
      primaryCore: new THREE.Color('#fff0c2'),
      primaryEdge: new THREE.Color('#ff8a3d'),
      secondaryCore: new THREE.Color('#eaf4ff'),
      secondaryEdge: new THREE.Color('#7ea8ff').lerp(tint, 0.18),
    };
  }, [accent]);

  const primaryUniforms = useMemo(() => ({
    uTime: { value: 0 }, uStress: { value: 0 },
    uCore: { value: palette.primaryCore }, uEdge: { value: palette.primaryEdge },
    uScale: { value: new THREE.Vector3(1, 1, 1) },
    uArcRadius: { value: 0 }, uArcPhi: { value: 0 }, uMelt: { value: 0 },
  }), [palette]);
  const secondaryUniforms = useMemo(() => ({
    uTime: { value: 0 }, uStress: { value: 0 },
    uCore: { value: palette.secondaryCore }, uEdge: { value: palette.secondaryEdge },
    uScale: { value: new THREE.Vector3(1, 1, 1) },
    uArcRadius: { value: 0 }, uArcPhi: { value: 0 }, uMelt: { value: 0 },
  }), [palette]);
  // The blast shell shares the vertex shader, so it has to carry the same
  // uniforms — a missing uScale would default to zero and collapse it.
  const shockUniforms = useMemo(() => ({
    uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#cfe6ff') },
    uScale: { value: new THREE.Vector3(1, 1, 1) },
    uArcRadius: { value: 0 }, uArcPhi: { value: 0 }, uMelt: { value: 0 },
  }), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const primary = primaryRef.current;
    const secondary = secondaryRef.current;
    if (!group || !primary || !secondary) return;

    const progress = dissolveStartMs === null
      ? null
      : Math.min(1, Math.max(0, (clockRef.current.ms - dissolveStartMs) / destroyMs));
    const phase = computeBinaryPhase(progress);
    const seconds = clockRef.current.ms / 1000;
    // Materials own clones of the uniform maps — see liveUniforms.ts.
    const livePrimary = liveUniforms(primary, primaryUniforms);
    const liveSecondary = liveUniforms(secondary, secondaryUniforms);
    const liveShock = liveUniforms(shockRef.current, shockUniforms);
    livePrimary.uTime.value = seconds;
    liveSecondary.uTime.value = seconds;
    // Turbulence tracks the shear, so the surface visibly boils harder the
    // more the star is being pulled apart.
    const stress = Math.min(1, phase.collapse * 0.45 + phase.melt * 0.85);
    livePrimary.uStress.value += (stress - livePrimary.uStress.value) * Math.min(1, delta * 3);
    liveSecondary.uStress.value = livePrimary.uStress.value;

    scaleRef.current += ((settled ? 1 : 0.001) - scaleRef.current) * Math.min(1, delta * 2);
    group.scale.setScalar(Math.max(0.0001, scaleRef.current));

    // Orbit decay. The rebuilt pair does NOT appear at its resting separation
    // — it gathers on the tight orbit the blast left behind and spirals back
    // out, which is the destruction played in reverse.
    const gap = phase.reborn > 0
      ? separation * (0.3 + 0.7 * phase.reborn * phase.reborn)
      : separation * (1 - phase.collapse * 0.72);
    // Driven by the phase's own rate fraction rather than derived from the
    // separation, so the wind-up follows the intended curve exactly: rest to
    // 70% of maximum while the stars are still spherical, and only the last
    // 30% during the phase where they shear into streams.
    angleRef.current += delta * MAX_ORBIT_RATE * phase.spin * clockRef.current.speed;
    const angle = angleRef.current;
    // EQUAL masses sit at EQUAL distances from the barycentre — that is what
    // the barycentre is. Two stars of the same size must therefore share one
    // orbit radius, not two different ones.
    const orbitRadius = Math.max(0.05, gap * 0.5);
    // The shader places the material around the orbit itself, so the meshes
    // carry no transform of their own.
    primary.position.set(0, 0, 0);
    secondary.position.set(0, 0, 0);
    primary.scale.setScalar(1);
    secondary.scale.setScalar(1);

    // Identical twins, sized to dominate the planets orbiting them the way a
    // real star dominates its system, without swallowing the frame. presence
    // carries both the annihilation and the rebirth: the pair is destroyed
    // outright by the merger and later condenses back out of nothing.
    const starRadius = separation * 0.188 * phase.presence;

    // Tidal shear. As the two touch, each is drawn out ALONG its orbit and
    // squeezed across it, hardest of all vertically — Roche-lobe overflow.
    // Wrapped around the barycentre by the vertex shader, the two arcs sweep
    // past and through each other, which is what makes the contact read as
    // molten material flowing together rather than two solids colliding.
    const along = starRadius * (1 + phase.melt * phase.melt * 4.2);
    // Cross-section stays roughly round: this is a rope of plasma being drawn
    // out, not a blade. A flat ribbon would read as a modelling artefact.
    const across = Math.max(0.0001, starRadius * (1 - phase.melt * 0.6));
    const vertical = Math.max(0.0001, starRadius * (1 - phase.melt * 0.56));
    // Each stream is allowed to wrap about three quarters of a turn, so the
    // two of them overlap heavily and genuinely wind through one another
    // rather than meeting end to end as two separate arcs.
    const alongScale = Math.max(0.0001, Math.min(along, orbitRadius * 4.6));

    (livePrimary.uScale.value as THREE.Vector3).set(across, vertical, alongScale);
    (liveSecondary.uScale.value as THREE.Vector3).set(across, vertical, alongScale);
    livePrimary.uArcRadius.value = orbitRadius;
    liveSecondary.uArcRadius.value = orbitRadius;
    livePrimary.uArcPhi.value = angle;
    liveSecondary.uArcPhi.value = angle + Math.PI;
    livePrimary.uMelt.value = phase.melt;
    liveSecondary.uMelt.value = phase.melt;

    // The burning tail that follows the pair in.
    const tail = liveUniforms(tailRef.current, tailUniforms);
    tail.uAngle.value = angle;
    tail.uRadius.value = orbitRadius;
    // The tail is shed by the shear, so it lights up with the melt rather than
    // with the slow early part of the inspiral.
    tail.uStress.value = Math.min(1, phase.collapse * 0.35 + phase.melt) * phase.presence;
    tail.uTime.value = seconds;

    // No separate "tidal bridge" prop. The stars themselves now shear around
    // the barycentre and overlap, so the material genuinely does flow between
    // them — a stand-in capsule bolted across the gap would only sit on top of
    // that and give the join a hard, manufactured edge.

    const shock = shockRef.current;
    if (shock) {
      shock.scale.setScalar(Math.max(0.0001, phase.shockRadius * reach * 1.25));
      liveShock.uOpacity.value = phase.shockOpacity;
    }

    // The system's light IS the stars: it climbs through the inspiral, spikes
    // hard at the merger flash, and settles back once the new pair is stable.
    const light = lightRef.current;
    if (light) {
      const base = dimmed ? 18 : 52;
      // With the pair annihilated the only light left is the blast itself.
      light.intensity = base * (phase.presence * (1 + phase.collapse * 1.6) + phase.shockOpacity * 3.2);
    }
  });

  return (
    <group ref={groupRef}>
      <pointLight ref={lightRef} color={palette.primaryCore} intensity={dimmed ? 18 : 52} distance={reach * 4} decay={1.7} />
      <mesh ref={primaryRef} geometry={STAR_GEOMETRY}>
        <shaderMaterial uniforms={primaryUniforms} vertexShader={PLASMA_VERTEX} fragmentShader={PLASMA_FRAGMENT} />
      </mesh>
      <mesh ref={secondaryRef} geometry={STAR_GEOMETRY}>
        <shaderMaterial uniforms={secondaryUniforms} vertexShader={PLASMA_VERTEX} fragmentShader={PLASMA_FRAGMENT} />
      </mesh>
      <points ref={tailRef} geometry={tailGeometry} frustumCulled={false}>
        <shaderMaterial
          uniforms={tailUniforms}
          vertexShader={TAIL_VERTEX}
          fragmentShader={TAIL_FRAGMENT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <mesh ref={shockRef}>
        <sphereGeometry args={[1, 48, 32]} />
        <shaderMaterial uniforms={shockUniforms} vertexShader={PLASMA_VERTEX} fragmentShader={SHOCK_FRAGMENT} transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
      {settled && (
        <Html distanceFactor={18} position={[0, separation * 0.55 + 1.4, 0]} center style={{ pointerEvents: 'none', opacity: dimmed ? 0.3 : 1 }}>
          {/* PHASE 8 — identity shift: the old name dissolves into the event;
              the new one condenses only after the silence, when this remounts
              with the new title. */}
          <div
            key={title}
            className={`topic-orbit-topic-label ${dissolveStartMs !== null ? 'is-dissolving' : 'is-renaming'}`}
            style={dissolveStartMs !== null ? { animationDelay: `${labelDissolveDelayMs(destroyMs)}ms` } : undefined}
          >{title}</div>
        </Html>
      )}
    </group>
  );
}
