import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitClockRef } from './types';
import { labelDissolveDelayMs } from './themes';
import { liveUniforms } from './liveUniforms';

// ---------------------------------------------------------------------------
// PULSAR — a rapidly rotating, highly magnetised neutron star.
//
// This is deliberately NOT a sun: no fireball, no orange flame, no cartoon
// plasma. It is a tiny, extremely dense object continuously radiating
// electromagnetic energy, and it is built as the seven separate layers the
// spec calls for, because each one carries a different physical idea:
//
//   1 Core sphere        pure white, saturated, soft blue edge, no terrain
//   2 Surface plasma     high-frequency flow trapped BENEATH the surface
//   3 Outer glow         blue-white HDR halo, breathing with the rotation
//   4 Electric corona    thin arcs, 100-300ms, random, never synchronised
//   5 Magnetic ribbons   dipole field lines pole-to-pole — the key element
//   6 Polar jets         long, thin, highly emissive, running off-scene
//   7 Pulsar beam        two WIDE soft cones sweeping like a lighthouse
//
// The star's radius is ~1 unit against orbits of 15-40, which is what makes
// it read as something impossibly dense rather than as a small sun.
// ---------------------------------------------------------------------------

const CORE_GEOMETRY = new THREE.SphereGeometry(1, 64, 48);

// Spec phase boundaries, in milliseconds from the start of a topic change.
// These are absolute rather than fractions of the beat: the spec specifies
// 800ms and 1200ms, and those durations are what make the build-up read.
const P1_INSTABILITY_MS = 800;
const P2_ACCUMULATION_MS = 2000; // 800 + 1200
const P3_RECONNECTION_MS = 2500;

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

const NOISE3 = `
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
`;

// LAYERS 1 + 2. A saturated white sphere with a soft blue limb, and plasma
// that is visibly moving UNDER it rather than burning on top of it: the flow
// is dimmed toward the limb and its direction keeps changing, so it reads as
// something trapped beneath a degenerate crust. No terrain, no flame shapes.
const CORE_FRAGMENT = `
  uniform float uTime;
  uniform float uCharge;
  uniform float uHotspot;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  ${NOISE3}
  void main() {
    // Flow direction wanders continuously — never a single scrolling axis.
    vec3 drift = vec3(
      sin(uTime * 0.7),
      cos(uTime * 0.53),
      sin(uTime * 0.31 + 1.7)
    ) * (2.4 + uCharge * 7.0);
    float speed = 1.0 + uCharge * 2.0;
    float plasma = fbm(vLocal * 7.5 + drift * speed);
    float fine = fbm(vLocal * 17.0 - drift * speed * 1.6);

    // PHASE 2 — hotspots: bright cells that expand, merge and separate.
    float spots = fbm(vLocal * 3.1 + vec3(uTime * 0.6, uTime * 0.35, 0.0));
    float hot = smoothstep(0.62 - uHotspot * 0.25, 0.78, spots) * uHotspot;

    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float facing = max(dot(normal, viewDir), 0.0);

    // Subsurface: strongest face-on, suppressed at the limb, so the movement
    // sits inside the sphere instead of on its silhouette.
    float sub = pow(facing, 1.6) * (plasma * 0.55 + fine * 0.25);

    // Base is saturated white; the limb cools to blue.
    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 blue = vec3(0.55, 0.74, 1.0);
    vec3 color = mix(blue, white, pow(facing, 0.6));
    color += blue * sub * (0.5 + uCharge * 1.2);
    color += white * hot * 1.6;

    float brightness = 1.15 + uCharge * 0.6 + hot * 1.2;
    gl_FragColor = vec4(color * brightness, 1.0);
    #include <colorspace_fragment>
  }
`;

// LAYER 5. Aurora, not lasers: charge runs along each dipole field line, the
// tube fades softly across its own width, and the whole line oscillates.
// aSeed is constant per ribbon so one shared material can drive all of them.
const RIBBON_VERTEX = `
  uniform float uTime;
  uniform float uCharge;
  uniform float uChaos;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    // Field lines are never still; instability swells the oscillation, and
    // PHASE 3 twists them out of shape entirely before they reconnect.
    float wave = sin(uTime * (1.1 + aSeed * 0.7) + uv.x * 9.0 + aSeed * 6.28);
    float twist = sin(uTime * 3.1 + uv.x * 21.0 + aSeed * 2.4) * uChaos;
    float amp = (0.03 + uCharge * 0.16 + uChaos * 0.22);
    vec3 p = position * (1.0 + wave * amp + twist * 0.18);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const RIBBON_FRAGMENT = `
  uniform float uTime;
  uniform float uCharge;
  uniform float uChaos;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    // Charge travelling pole to pole along the line.
    float flow = noise(vec2(vUv.x * 11.0 - uTime * (1.2 + uCharge * 3.4) - vSeed * 3.0, vSeed * 7.0));
    // Soft across the tube: a glowing sheet, not a wire.
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float energy = pow(across, 1.6) * (0.16 + flow * 0.7) * (0.32 + uCharge * 1.5 + uChaos * 1.2);
    if (energy < 0.01) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), uChaos * 0.5) * (0.9 + energy * 2.2), clamp(energy, 0.0, 0.62));
    #include <colorspace_fragment>
  }
`;

// The jet is drawn as a RIBBON that always turns its face to the camera, not
// as a tube.
//
// A tube is what makes one jet look like two or three. Its surface normal is
// radial, so `dot(normal, view)` peaks on the near wall AND again on the far
// wall, and the silhouette catches light as well — every jet draws a pair of
// bright lines that slide over each other as the star turns, and two jets read
// as four to six rays. A camera-facing ribbon has exactly one bright axis, at
// any angle, so two jets always look like two jets.
//
// The centreline itself is a travelling wave on a string, evaluated in world
// units so the curve is visible at the scale the camera actually looks at.
const JET_VERTEX = `
  uniform float uTime;
  uniform float uCharge;
  uniform float uLength;
  uniform float uWave;
  uniform float uAmp;
  uniform float uWidthBase;
  uniform float uWidthTip;
  varying vec2 vUv;
  varying float vAlong;
  varying vec3 vWorld;

  // Direction the beam is allowed to wander in at a given distance: always
  // perpendicular to both the magnetic axis and the line of sight.
  //
  // This is the fix for the beam reading as a corkscrew. Displacing it inside
  // a plane FIXED TO THE STAR gives a flat S, but that plane turns with the
  // star, so the same S is seen face-on, then edge-on, then face-on again —
  // which the eye reads as the filament rotating around the axis. Keeping the
  // wave in the plane that faces the camera means it is always the same rope
  // seen the same way, from any angle and at any rotation.
  vec3 swayAxis(vec3 base, vec3 axisDir) {
    vec3 toCam = normalize(cameraPosition - base);
    vec3 across = cross(axisDir, toCam);
    float l = length(across);
    return l > 0.0001 ? across / l : vec3(1.0, 0.0, 0.0);
  }

  vec3 centreWorld(float d, vec3 axisOrigin, vec3 axisDir) {
    vec3 base = axisOrigin + axisDir * d;
    // Tighter wave for faster visible spinning
    float ph = d / (uWave * 0.6);
    
    // The sway is purely in the plane facing the camera, avoiding the 3D overlap issue.
    float sway = sin(ph - uTime * 2.5) * 0.8 + sin(ph * 0.4 - uTime * 1.1) * 0.2;
    
    // Quadratic growth to open out into a trumpet/funnel shape.
    float grow = smoothstep(0.0, uWave * 3.0, d);
    float amp = uAmp * 1.8 * grow * grow * (1.0 + uCharge * 0.7);
    
    return base + swayAxis(base, axisDir) * sway * amp;
  }

  void main() {
    vUv = uv;
    float along = clamp(uv.y, 0.0, 1.0);
    vAlong = along;

    // The magnetic axis, in world space. Everything else is built along it,
    // so the beam always starts exactly at the pole.
    vec3 axisOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 axisVec = (modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    float axisScale = length(axisVec);
    vec3 axisDir = axisScale > 0.0001 ? axisVec / axisScale : vec3(0.0, 1.0, 0.0);

    float d = along * uLength * axisScale;
    vec3 here = centreWorld(d, axisOrigin, axisDir);
    // Central differences, unclamped: letting d go slightly negative is safe
    // (the amplitude ramp is zero there) and avoids the lopsided difference
    // at the base that put a visible kink right where the beam leaves the
    // star.
    float h = uLength * axisScale * 0.0025;
    vec3 tangent = normalize(
      centreWorld(d + h, axisOrigin, axisDir) - centreWorld(d - h, axisOrigin, axisDir)
    );

    vec3 toCamera = normalize(cameraPosition - here);
    // Perpendicular to both the beam and the view: the ribbon turns edge-on to
    // nothing and always presents its full width.
    vec3 across = cross(tangent, toCamera);
    float len = length(across);
    across = len > 0.0001 ? across / len : vec3(1.0, 0.0, 0.0);

    // Widening with distance, the way a beam loses collimation.
    float width = mix(uWidthBase, uWidthTip, pow(along, 0.7)) * axisScale;
    vec3 world = here + across * (uv.x - 0.5) * width;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

// LAYER 6. Narrow, long, highly emissive, with knots of plasma flowing
// outward. It stays bright along its whole length because it is meant to run
// off the edge of the scene.
const JET_FRAGMENT = `
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uColor;
  uniform float uLength;
  // e-folding distances, in world units, for the hot filament and for the
  // diffuse sheath around it.
  uniform float uCoreFade;
  uniform float uHazeFade;
  varying vec2 vUv;
  varying float vAlong;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    float along = clamp(vAlong, 0.0, 1.0);
    // 0 on the axis, 1 at the ribbon's edge.
    float across = abs(vUv.x - 0.5) * 2.0;
    float radial = max(0.0, 1.0 - across);

    // Faux-3D helical twisting to make the flat ribbon look like a spinning tornado/funnel.
    float twistX = vUv.x + along * 1.5;
    
    // Knots of plasma streaming outward, following the spiral twist
    float knots = noise(vec2(twistX * 4.0, along * 30.0 - uTime * (8.0 + uCharge * 12.0)));
    float fine = noise(vec2(twistX * 12.0, along * 70.0 - uTime * (14.0 + uCharge * 18.0)));

    // Create a distinct helical band that wraps around the core.
    float twistPhase = (vUv.x - 0.5) * 6.283 + along * 40.0 - uTime * 15.0;
    float band = sin(twistPhase) * 0.5 + 0.5;
    // Fade the band near the edges so it feels like it wraps around a cylinder
    float frontBand = band * radial;

    // The two scales a real jet is photographed at: a hair-thin, near-white filament
    // threading the middle of a swirling, tornadic halo.
    float core = pow(radial, 16.0) * 2.8;
    // The sheath is dominated by the helical bands, giving it that corkscrew funnel look.
    float sheath = pow(radial, 1.2) * (0.15 + frontBand * 0.45);

    // Dissolving into haze toward the tail. This is keyed to ABSOLUTE
    // distance, not to the fraction of the geometry's length, so the beam
    // always fades out at the same place relative to the system no matter how
    // long the strip happens to be.
    //
    // The fade is deliberately early and steep. Far out, the beam's own
    // S-curve is wide and it is being swept around by the star's rotation; a
    // curved tail smeared across a rotation reads as several separate rays
    // fanning out of the pole. Cutting the visible beam back to its near,
    // still-collimated stretch removes that illusion at the root — two jets
    // stay two jets from any angle.
    float d = along * uLength;
    float coreReach = exp(-d / uCoreFade);
    float hazeReach = exp(-d / uHazeFade);
    float flicker = 0.7 + knots * 0.35 + fine * 0.15;
    float energy = (core * coreReach + sheath * hazeReach) * flicker * (1.5 + uCharge * 2.6);
    if (energy < 0.006) discard;
    // The filament is white; the haze around it keeps the field's blue.
    vec3 color = mix(uColor, vec3(1.0), clamp(core * coreReach * 1.5, 0.0, 1.0));
    gl_FragColor = vec4(color * (1.4 + energy * 4.0), clamp(energy, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// PHASE 4. The burst is channelled by the magnetic field into the EQUATORIAL
// plane — the same plane the planets orbit in — so it leaves as a flat
// expanding disc of light rather than a sphere. That is what lets it strike
// each planet edge-on and cut it in half along its own orbit.
//
// Drawn as a ring in the orbital plane: a hard bright leading edge with a
// luminous wake trailing behind it, so the front is unmistakably a front.
const PULSE_VERTEX = `
  varying vec2 vLocalXY;
  void main() {
    vLocalXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PULSE_FRAGMENT = `
  uniform float uOpacity;
  uniform float uInner;
  uniform vec3 uColor;
  varying vec2 vLocalXY;
  void main() {
    // 0 at the trailing inner edge, 1 at the advancing rim.
    float t = clamp((length(vLocalXY) - uInner) / max(0.0001, 1.0 - uInner), 0.0, 1.0);
    // A thin, very bright front with an exponential wake behind it.
    float front = pow(t, 9.0);
    float wake = pow(t, 1.6) * 0.3;
    float energy = front + wake;
    float alpha = energy * uOpacity;
    if (alpha < 0.006) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), front) * (1.0 + energy * 3.4), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export type PulsarPhase = {
  // Phase 1: magnetic instability. Plasma speed 100% -> 300%.
  instability: number;
  // Phase 2: energy accumulation. Hotspots, chaotic ribbons, rising brightness.
  accumulation: number;
  // Phase 3: magnetic reconnection. A snap, not an explosion.
  reconnection: number;
  // Combined drive for the plasma/glow/jets.
  charge: number;
  // Phase 4: the magnetar burst shell.
  pulseRadius: number;
  pulseOpacity: number;
};

export function computePulsarPhase(progress: number | null, destroyMs: number): PulsarPhase {
  if (progress === null) {
    return { instability: 0, accumulation: 0, reconnection: 0, charge: 0, pulseRadius: 0, pulseOpacity: 0 };
  }
  const t = progress * destroyMs;
  const instability = Math.min(1, t / P1_INSTABILITY_MS);
  const accumulation = Math.min(1, Math.max(0, (t - P1_INSTABILITY_MS) / (P2_ACCUMULATION_MS - P1_INSTABILITY_MS)));
  // The reconnection is a snap: it spikes hard and is gone.
  const reconnectSpan = P3_RECONNECTION_MS - P2_ACCUMULATION_MS;
  const reconnectT = (t - P2_ACCUMULATION_MS) / reconnectSpan;
  const reconnection = reconnectT > 0 && reconnectT < 1.4
    ? Math.exp(-Math.pow((reconnectT - 0.75) / 0.32, 2))
    : 0;
  // The pulse leaves at the reconnection and crosses the system extremely
  // fast — themes.neutron_star.waveTravel is matched to this.
  const pulseSpan = destroyMs * 0.1;
  const pulse = t > P3_RECONNECTION_MS ? Math.min(1, (t - P3_RECONNECTION_MS) / pulseSpan) : 0;
  // The field discharges once it has let go.
  const decay = t > P3_RECONNECTION_MS
    ? Math.max(0, 1 - (t - P3_RECONNECTION_MS) / (destroyMs * 0.35))
    : 1;
  return {
    instability,
    accumulation,
    reconnection,
    charge: (instability * 0.32 + accumulation * 0.68 + reconnection * 0.5) * decay,
    pulseRadius: pulse,
    pulseOpacity: pulse > 0 && pulse < 1 ? Math.pow(1 - pulse, 0.6) : 0,
  };
}

// LAYER 5 geometry. Real dipole field lines: r = L·sin²θ, θ measured from the
// magnetic axis. Each line leaves one pole, arcs out to its own maximum radius
// L and returns to the other pole — which is the shape the spec asks for and
// also the shape a magnetic dipole actually has.
const RIBBON_COUNT = 18;

function buildRibbonGeometries(coreRadius: number) {
  const geometries: THREE.BufferGeometry[] = [];
  for (let index = 0; index < RIBBON_COUNT; index += 1) {
    const seed = index / RIBBON_COUNT;
    // Shells of field lines at increasing reach, spread around the star.
    const shell = 1.9 + (index % 6) * 0.62;
    const longitude = seed * Math.PI * 2 * 3.3;
    const L = coreRadius * shell;
    // The line starts and ends where it meets the crust: r = L·sin²θ = R.
    const thetaMin = Math.asin(Math.min(1, Math.sqrt(coreRadius / L)));
    const points: THREE.Vector3[] = [];
    const steps = 42;
    for (let step = 0; step <= steps; step += 1) {
      const theta = thetaMin + (Math.PI - 2 * thetaMin) * (step / steps);
      const r = L * Math.sin(theta) * Math.sin(theta);
      const rho = r * Math.sin(theta);
      points.push(new THREE.Vector3(
        rho * Math.cos(longitude),
        r * Math.cos(theta),
        rho * Math.sin(longitude),
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 48, coreRadius * 0.045, 5, false);
    const count = tube.getAttribute('position').count;
    const seeds = new Float32Array(count).fill(index);
    tube.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometries.push(tube);
  }
  return geometries;
}

// LAYER 4. Thin arcs snapping on and off across the surface. Each keeps its
// own schedule so they never fire together.
const ARC_COUNT = 10;

export function NeutronStar({
  title,
  accent,
  coreRadius,
  settled,
  dimmed,
  clockRef,
  dissolveStartMs,
  destroyMs,
  reach,
}: {
  title: string;
  accent: string;
  coreRadius: number;
  settled: boolean;
  dimmed: boolean;
  clockRef: OrbitClockRef;
  // Non-null while a topic change is running. Progress is derived from the
  // clock INSIDE useFrame — React does not re-render during the event, so a
  // progress prop computed at render time would freeze the whole sequence.
  dissolveStartMs: number | null;
  destroyMs: number;
  reach: number;
}) {
  // The beam radiates away rather than stopping: the core gives out first and
  // the haze around it lingers, so there is never a tip to see. This only has
  // to be long enough for that fade to finish well inside it.
  const jetLength = reach * 3.4;

  const groupRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  // The magnetic axis is tilted off the spin axis, exactly as in a real
  // pulsar — that offset is what makes the beam sweep as the star turns.
  const axisRef = useRef<THREE.Group>(null);
  const jetNorthRef = useRef<THREE.Group>(null);
  const jetSouthRef = useRef<THREE.Group>(null);
  const jetMeshRef = useRef<THREE.Mesh>(null);
  const ribbonMeshRef = useRef<THREE.Mesh>(null);
  const arcRefs = useRef<(THREE.Mesh | null)[]>([]);
  const scaleRef = useRef(0);
  const rotationRef = useRef(0);

  const palette = useMemo(() => ({
    field: new THREE.Color(accent).lerp(new THREE.Color('#7bb8ff'), 0.72),
    white: new THREE.Color('#dbeaff'),
  }), [accent]);

  const ribbonGeometries = useMemo(() => buildRibbonGeometries(coreRadius), [coreRadius]);
  // Each arc gets its own period, phase and place on the crust, so the set
  // never resolves into a rhythm.
  const arcs = useMemo(() => Array.from({ length: ARC_COUNT }, () => ({
    period: 0.9 + Math.random() * 1.6,
    offset: Math.random(),
    // Spec: 100-300ms.
    life: 0.1 + Math.random() * 0.2,
    rotation: [Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI] as [number, number, number],
    arc: 0.5 + Math.random() * 1.1,
  })), []);

  const coreUniforms = useMemo(() => ({
    uTime: { value: 0 }, uCharge: { value: 0 }, uHotspot: { value: 0 },
  }), []);
  const pulseUniforms = useMemo(() => ({
    // uInner must match the ring geometry's inner/outer ratio.
    uOpacity: { value: 0 }, uInner: { value: 0.4 }, uColor: { value: palette.field },
  }), [palette]);
  const jetUniforms = useMemo(() => ({
    uTime: { value: 0 }, uCharge: { value: 0 }, uColor: { value: palette.field },
    uLength: { value: jetLength },
    // The beam only lives for a short stretch, so the wave has to be tight
    // enough to show its undulation inside that stretch — a long wavelength
    // over a short visible beam is just a straight line.
    uWave: { value: reach * 0.1 },
    // A gentle undulation, not a whipping cable, and only out at the tail.
    uAmp: { value: coreRadius * 1.6 },
    // Thin where it leaves the pole, opening out as it decollimates. The
    // ribbon has to be wide enough at the tail to carry the haze the core
    // dissolves into, but the bright root has to stay a thread.
    uWidthBase: { value: coreRadius * 0.7 },
    uWidthTip: { value: coreRadius * 3.2 },
    // Fade out well within the frame at the zoom the scene is normally viewed
    // at, so only the near, still-collimated root of the beam is visible and
    // the swept tail can never smear into phantom rays.
    uCoreFade: { value: reach * 0.22 },
    uHazeFade: { value: reach * 0.4 },
  }), [palette, jetLength, reach, coreRadius]);
  const ribbonUniforms = useMemo(() => ({
    uTime: { value: 0 }, uCharge: { value: 0 }, uChaos: { value: 0 }, uColor: { value: palette.field },
  }), [palette]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const core = coreRef.current;
    if (!group || !core) return;
    const progress = dissolveStartMs === null
      ? null
      : Math.min(1, Math.max(0, (clockRef.current.ms - dissolveStartMs) / destroyMs));
    const phase = computePulsarPhase(progress, destroyMs);
    const seconds = clockRef.current.ms / 1000;
    const step = Math.min(delta, 0.05) * clockRef.current.speed;

    // Materials own clones of the uniform maps — see liveUniforms.ts.
    const liveCore = liveUniforms(core, coreUniforms);
    const livePulse = liveUniforms(pulseRef.current, pulseUniforms);
    const liveJet = liveUniforms(jetMeshRef.current, jetUniforms);
    const liveRibbon = liveUniforms(ribbonMeshRef.current, ribbonUniforms);

    liveCore.uTime.value = seconds;
    liveCore.uCharge.value += (phase.charge - liveCore.uCharge.value) * Math.min(1, delta * 6);
    liveCore.uHotspot.value += (phase.accumulation - liveCore.uHotspot.value) * Math.min(1, delta * 4);

    scaleRef.current += ((settled ? 1 : 0.001) - scaleRef.current) * Math.min(1, delta * 2.2);
    group.scale.setScalar(Math.max(0.0001, scaleRef.current));

    // Rotation. Fast and continuous at rest; the instability spins it up, and
    // the reconnection gives it one last surge before the field lets go.
    // A pulsar turns on a millisecond timescale — fast enough at rest to look
    // dangerous, but held back from the rate at which the sweeping beam starts
    // to smear into an afterimage.
    rotationRef.current += step * (17 + phase.instability * 8 + phase.accumulation * 18 + phase.reconnection * 13);
    if (spinRef.current) spinRef.current.rotation.y = rotationRef.current;
    // The magnetic axis (jets and ribbons) sweeps with the star.
    if (axisRef.current) axisRef.current.rotation.y = rotationRef.current * 0.82;

    // LAYER 4 — arcs snap on and off, each on its own clock.
    arcs.forEach((arcSpec, index) => {
      const mesh = arcRefs.current[index];
      if (!mesh) return;
      const cycle = ((seconds / arcSpec.period) + arcSpec.offset) % 1;
      // Discharge gets far more frequent as the field overloads.
      const window = arcSpec.life * (1 + phase.charge * 2.5);
      const alive = cycle < window ? 1 - cycle / window : 0;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = alive * (0.35 + phase.charge * 0.5 + phase.reconnection * 0.6);
      mesh.visible = alive > 0.01;
    });

    // LAYER 5 — ribbons oscillate always, twist and reconnect in phase 3.
    liveRibbon.uTime.value = seconds;
    liveRibbon.uCharge.value = liveCore.uCharge.value;
    // The field does not settle the instant it lets go: the storm runs on
    // right through the burst and only calms once the pulse has passed.
    const chaosTarget = Math.min(
      1.35,
      phase.accumulation * 0.45 + phase.reconnection + phase.pulseOpacity * 0.9,
    );
    liveRibbon.uChaos.value += (chaosTarget - liveRibbon.uChaos.value) * Math.min(1, delta * 6);

    // LAYER 6 — the jets brighten and widen with the charge. The brightening
    // is done entirely through the shader: scaling the jet GROUPS would apply
    // a non-uniform transform on top of the centreline the vertex stage
    // builds, which skews the billboard's own frame and drags the base of the
    // beam off the pole.
    liveJet.uTime.value = seconds;
    liveJet.uCharge.value = liveCore.uCharge.value;

    // PHASE 4 — the burst shell.
    const pulse = pulseRef.current;
    if (pulse) {
      pulse.scale.setScalar(Math.max(0.0001, phase.pulseRadius * reach * 1.35));
      livePulse.uOpacity.value = phase.pulseOpacity * 0.9;
    }

    // Lighting saturates briefly at the reconnection and the burst.
    const light = lightRef.current;
    if (light) {
      const base = dimmed ? 20 : 60;
      light.intensity = base * (1 + phase.charge * 1.6 + phase.reconnection * 2.5 + phase.pulseOpacity * 4);
    }
  });

  return (
    <group ref={groupRef}>
      <pointLight ref={lightRef} color={palette.white} intensity={dimmed ? 20 : 60} distance={reach * 4} decay={1.6} />

      {/* LAYERS 1 + 2 — the core, on the spin axis. */}
      <group ref={spinRef}>
        <mesh ref={coreRef} geometry={CORE_GEOMETRY} scale={coreRadius}>
          <shaderMaterial uniforms={coreUniforms} vertexShader={CORE_VERTEX} fragmentShader={CORE_FRAGMENT} />
        </mesh>

        {/* LAYER 4 — electric corona, riding the crust as it turns. */}
        {arcs.map((arcSpec, index) => (
          <mesh
            key={index}
            ref={(mesh) => { arcRefs.current[index] = mesh; }}
            rotation={arcSpec.rotation}
            visible={false}
          >
            <torusGeometry args={[coreRadius * 1.06, coreRadius * 0.012, 4, 40, arcSpec.arc]} />
            <meshBasicMaterial
              color="#cfe6ff"
              transparent
              opacity={0}
              toneMapped={false}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>

      {/* LAYERS 5, 6, 7 — everything magnetic rides the tilted magnetic axis,
          so the whole field sweeps together like a lighthouse. */}
      <group ref={axisRef} rotation={[0.34, 0, 0.16]}>
        {/* LAYER 6 — the polar jets, and nothing else along the axis. A jet is
            a collimated beam of relativistic plasma that runs for a distance
            with no relation to the star: it is modelled as a near-cylinder
            many times the size of the whole system, so it always leaves the
            frame rather than tapering to a visible tip, at any zoom. */}
        <group ref={jetNorthRef}>
          <mesh ref={jetMeshRef}>
            {/* A flat strip; the vertex stage bends it onto the centreline and
                turns it to face the camera every frame. The strip's own
                coordinates are unused — the shader builds the beam from uv
                alone, starting at the pole. */}
            <planeGeometry args={[1, 1, 1, 420]} />
            <shaderMaterial
              uniforms={jetUniforms}
              vertexShader={JET_VERTEX}
              fragmentShader={JET_FRAGMENT}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
        <group ref={jetSouthRef} rotation={[Math.PI, 0, 0]}>
          <mesh>
            {/* A flat strip; the vertex stage bends it onto the centreline and
                turns it to face the camera every frame. The strip's own
                coordinates are unused — the shader builds the beam from uv
                alone, starting at the pole. */}
            <planeGeometry args={[1, 1, 1, 420]} />
            <shaderMaterial
              uniforms={jetUniforms}
              vertexShader={JET_VERTEX}
              fragmentShader={JET_FRAGMENT}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>

        {/* LAYER 5 — dozens of dipole field lines, pole to pole. */}
        {ribbonGeometries.map((geometry, index) => (
          <mesh key={index} ref={index === 0 ? ribbonMeshRef : undefined} geometry={geometry}>
            <shaderMaterial
              uniforms={ribbonUniforms}
              vertexShader={RIBBON_VERTEX}
              fragmentShader={RIBBON_FRAGMENT}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>

      {/* No halo shell. A soft sphere of light draped over the star reads as a
          sprite pasted on top of it and flattens the whole object; the core's
          own blue limb and the bloom pass carry the glow instead. */}

      {/* PHASE 4 — magnetar burst, as a flat disc expanding through the
          orbital plane. */}
      <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 1, 192, 1]} />
        <shaderMaterial
          uniforms={pulseUniforms}
          vertexShader={PULSE_VERTEX}
          fragmentShader={PULSE_FRAGMENT}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {settled && (
        <Html distanceFactor={18} position={[0, coreRadius * 4.2, 0]} center style={{ pointerEvents: 'none', opacity: dimmed ? 0.3 : 1 }}>
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
