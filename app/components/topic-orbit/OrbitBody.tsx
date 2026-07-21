import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef } from './types';
import { FORM_MS, bodyPositionAt } from './diskLayout';
import { type TidalStream, streamStateAt } from './tidalStream';
import { liveUniforms } from './liveUniforms';
import { COSMIC, planetTones } from './cosmicPalette';

// One geometry for every body in the disk — a hundred tasks must not mean a
// hundred buffer uploads.
//
// It is built as TWO SEPARATE HEMISPHERES plus a flat cap closing each one,
// carrying an aHalf attribute of ±1. An equatorial burst cuts a planet along
// its orbital plane, and driving the halves apart needs the mesh to already
// be two pieces: displacing the top and bottom of an ordinary sphere instead
// leaves the band of triangles that straddles the equator stretched between
// them, so the planet turns into a barrel with domed ends rather than opening
// into two clean halves. The caps give the cut a real surface to glow from
// instead of showing hollow shell from the inside.
function buildBodyGeometry() {
  const halves: { geometry: THREE.BufferGeometry; half: number }[] = [];

  const top = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const bottom = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  // Cut faces, laid in the equatorial plane and turned to face outward from
  // their own half.
  const topCap = new THREE.CircleGeometry(1, 48);
  topCap.rotateX(Math.PI / 2);
  const bottomCap = new THREE.CircleGeometry(1, 48);
  bottomCap.rotateX(-Math.PI / 2);

  halves.push({ geometry: top, half: 1 });
  halves.push({ geometry: topCap, half: 1 });
  halves.push({ geometry: bottom, half: -1 });
  halves.push({ geometry: bottomCap, half: -1 });

  const positions: number[] = [];
  const normals: number[] = [];
  const sides: number[] = [];
  // 1 on the flat cut faces, so they can be collapsed away while the planet
  // is still whole.
  const caps: number[] = [];
  halves.forEach(({ geometry, half }, index) => {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = source.getAttribute('position');
    const nor = source.getAttribute('normal');
    const isCap = index === 1 || index === 3 ? 1 : 0;
    for (let vertex = 0; vertex < pos.count; vertex += 1) {
      positions.push(pos.getX(vertex), pos.getY(vertex), pos.getZ(vertex));
      normals.push(nor.getX(vertex), nor.getY(vertex), nor.getZ(vertex));
      sides.push(half);
      caps.push(isCap);
    }
    if (source !== geometry) source.dispose();
    geometry.dispose();
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('aHalf', new THREE.Float32BufferAttribute(sides, 1));
  merged.setAttribute('aCap', new THREE.Float32BufferAttribute(caps, 1));
  merged.computeBoundingSphere();
  return merged;
}

const BODY_GEOMETRY = buildBodyGeometry();
// The halo is a plain sphere: it never splits.
const HALO_GEOMETRY = new THREE.SphereGeometry(1, 32, 24);

// A disrupted body is not a stretched sphere sitting on a curve — it IS a
// piece of the curve. Its "along" axis is mapped straight onto the shared
// logarithmic spiral of tidalStream.ts, so the radius falls off exponentially
// from one end of the ribbon to the other exactly as the stream's does.
//
// This is the whole difference between a stream and a row of beads. Bending
// each body around a CIRCLE of its own radius instead (the obvious cheap
// approximation) gives every planet a concentric arc at its own radius, and
// concentric arcs at different radii can never join — the result is a set of
// disconnected C shapes. Sharing the spiral means body i's trailing end and
// body i+1's leading end land on the same curve at the same radius, and the
// queue welds into one unbroken filament winding inward.
//
// When uArcRadius is 0 the body is intact and the model matrix does the work
// as usual; when it is set, the model matrix is identity and this computes the
// absolute world position.
const PLANET_VERTEX = `
  uniform vec3 uScale;
  uniform float uArcRadius;
  uniform float uArcPhi;
  uniform float uArcK;
  uniform float uSplit;
  attribute float aHalf;
  attribute float aCap;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying float vCap;
  void main() {
    // Kept on the undeformed unit sphere so the surface pattern stays painted
    // on the body instead of smearing as it is pulled out.
    vLocal = position;
    vCap = aCap;
    // While the planet is whole the cut faces are collapsed to a point, so
    // they cost nothing and cannot show through the crust.
    vec3 base = aCap > 0.5 && uSplit <= 0.0 ? vec3(0.0) : position;
    // World-space offsets: x across the stream (radial), y vertical,
    // z along it (arc length).
    vec3 p = base * uScale;
    // An equatorial burst arrives edge-on and cuts the planet along the plane
    // it orbits in. Each half is a separate piece of the mesh, so they come
    // apart cleanly instead of dragging a stretched band between them.
    if (uSplit > 0.0) {
      p.y += aHalf * uSplit * uScale.y;
    }
    vec3 n = normal;
    vec3 placed;
    if (uArcRadius > 0.0) {
      float dphi = p.z / uArcRadius;
      float phi = uArcPhi + dphi;
      // r(φ) = R·e^{−kΔφ}: the ribbon heads INWARD along its own length.
      float r = uArcRadius * exp(-uArcK * dphi) + p.x;
      float c = cos(phi);
      float s = sin(phi);
      placed = vec3(c * r, p.y, s * r);
      // Local x is radial, z is tangential, so carry the normal into the
      // cylindrical frame the body now lives in.
      n = normalize(vec3(n.x * c - n.z * s, n.y, n.x * s + n.z * c));
    } else {
      placed = p;
    }
    vNormalW = normalize(mat3(modelMatrix) * n);
    vec4 world = modelMatrix * vec4(placed, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// The only light in this universe is the accretion disk at the origin, so the
// bodies are lit from the hole: a real terminator, a warm lit face and a cold
// rim. That single rule is most of what makes them read as planets.
const PLANET_FRAGMENT = `
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uRim;
  uniform float uRimStrength;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uMelt;
  uniform float uForge;
  uniform float uSplit;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying float vCap;

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
    for (int index = 0; index < 5; index += 1) { value += amplitude * noise(p); p *= 2.04; amplitude *= 0.5; }
    return value;
  }

  void main() {
    vec3 normal = normalize(vNormalW);
    vec3 toLight = normalize(-vWorld);
    // Wrapped lambert: a hard terminator looks like plastic, this looks like
    // atmosphere scattering around the limb.
    float lambert = pow(max(dot(normal, toLight), 0.0) * 0.55 + 0.45, 1.9);

    // Continents / cloud bands, plus a touch of drift so gas giants live.
    float terrain = fbm(vLocal * 2.6 + vec3(0.0, uTime * 0.008, 0.0));
    float detail = fbm(vLocal * 7.4);
    vec3 surface = mix(uLow, uHigh, smoothstep(0.34, 0.68, terrain));
    surface = mix(surface, uHigh * 1.18, smoothstep(0.55, 0.85, detail) * 0.25);
    // Pale caps at the poles.
    surface = mix(surface, uHigh * 1.5 + vec3(0.06), smoothstep(0.78, 0.98, abs(vLocal.y)) * 0.55);

    vec3 lit = surface * (0.05 + lambert * 1.5);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.2);
    // Atmosphere: strongest where the disk light grazes the limb.
    lit += uRim * fresnel * uRimStrength * (0.35 + lambert * 0.9);

    // Freshly accreted rock is still molten: it glows from within along the
    // same fault pattern and cools into a crust from the outside in.
    if (uForge > 0.0) {
      float seam = fbm(vLocal * 4.2);
      float glow = 1.0 - smoothstep(0.0, 0.18 + uForge * 0.3, abs(seam - 0.5));
      lit = mix(lit, vec3(2.8, 1.0, 0.28), clamp(uForge * (0.35 + glow * 1.4), 0.0, 1.0));
    }

    // The exposed cut face. Molten right through, hottest at the centre where
    // the core was — this is what makes the two pieces read as one planet
    // sliced open rather than two objects that happen to be near each other.
    if (vCap > 0.5) {
      float toCentre = 1.0 - clamp(length(vLocal.xz), 0.0, 1.0);
      vec3 magma = mix(vec3(2.2, 0.7, 0.15), vec3(3.4, 3.8, 4.6), pow(toCentre, 1.6));
      lit = magma * (0.5 + toCentre * 1.3);
    }

    // Tidal disruption. The body does not explode: it is pulled apart. First
    // the crust cracks along fault lines and glows from inside, and only once
    // it is well stretched does the crust actually let go.
    if (uMelt > 0.0) {
      float fault = fbm(vLocal * 3.4 + vec3(uTime * 0.02));
      float crack = 1.0 - smoothstep(0.0, 0.06 + uMelt * 0.14, abs(fault - 0.5));
      vec3 magma = mix(vec3(2.2, 0.55, 0.12), vec3(3.0, 1.9, 0.9), uMelt);
      lit = mix(lit, magma, clamp(crack * (0.35 + uMelt * 1.5), 0.0, 1.0));
      lit *= 1.0 + uMelt * 0.6;
      if (fault < (uMelt - 0.55) * 2.3) discard;
    }

    gl_FragColor = vec4(lit, uOpacity);
    #include <colorspace_fragment>
  }
`;

export function OrbitBody({
  body,
  clockRef,
  selected,
  dimmed,
  showLabel,
  dissolveStartMs,
  dissolveKind,
  destroyMs,
  waveAt,
  stream,
  streamGapPhi,
  burstSplits,
  onSelect,
}: {
  body: DiskBody;
  clockRef: OrbitClockRef;
  selected: boolean;
  dimmed: boolean;
  showLabel: boolean;
  // Set when the topic is changing: this body is being torn apart.
  dissolveStartMs: number | null;
  // 'tidal': stretched into the hole. 'burst': cracked open by a passing wave.
  dissolveKind: 'tidal' | 'burst';
  destroyMs: number;
  // Fraction of destroyMs at which the destructive wave arrives. Before it, the
  // body only resonates; after it, it comes apart.
  waveAt: number;
  // Black hole only: the shared debris stream every disrupted body joins, and
  // the azimuth gap to the next body down the queue — the stretch is sized to
  // close that gap, which is what turns the queue into one continuous ribbon.
  stream: TidalStream | null;
  streamGapPhi: number;
  // Equatorial burst: the front arrives edge-on and cuts the body in half
  // along its orbit before anything breaks up.
  burstSplits: boolean;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const position = useMemo(() => new THREE.Vector3(), []);
  const [labelVisible, setLabelVisible] = useState(false);
  const [forming, setForming] = useState(true);

  const tones = useMemo(() => planetTones(body.accent), [body.accent]);
  // Due today outranks the status colour: across a whole system the one thing
  // that has to be findable at a glance is what is due now.
  const rimColor = useMemo(
    () => new THREE.Color(
      body.dueToday
        ? COSMIC.today
        : body.status === 'completed'
          ? COSMIC.aurora
          : body.status === 'in_progress'
            ? COSMIC.ice
            : '#7d8aa8',
    ),
    [body.dueToday, body.status],
  );

  const uniforms = useMemo(() => ({
    uLow: { value: tones.low },
    uHigh: { value: tones.high },
    uRim: { value: rimColor },
    uRimStrength: { value: 0.6 },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
    uMelt: { value: 0 },
    uForge: { value: 1 },
    uScale: { value: new THREE.Vector3(1, 1, 1) },
    uArcRadius: { value: 0 },
    uArcPhi: { value: 0 },
    uArcK: { value: 0 },
    uSplit: { value: 0 },
  }), [rimColor, tones.high, tones.low]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;
    const now = clockRef.current.ms;
    // The material owns a clone of the uniform map — write to that, not to the
    // object this component built. See liveUniforms.ts.
    const live = liveUniforms(mesh, uniforms);

    // Condensing out of the disk: the ribbon of material sweeps out to the
    // body's orbit first, and the body swells behind its leading edge.
    const formProgress = Math.min(1, Math.max(0, (now - body.revealAt) / FORM_MS));
    if (forming && formProgress >= 1) setForming(false);
    if (!labelVisible && formProgress > 0.72) setLabelVisible(true);
    if (labelVisible && formProgress < 0.72) setLabelVisible(false);
    // The body only starts to appear once the ribbon has reached its orbit.
    const born = Math.min(1, Math.max(0, (formProgress - 0.55) / 0.45));
    const eased = born <= 0 ? 0 : 1 - Math.pow(1 - born, 3);

    const tidal = dissolveKind === 'tidal' && dissolveStartMs !== null && stream !== null;

    // Melting away: the crust burns off, then the body is gone and only the
    // stream falling into the hole is left.
    let melt = 0;
    // 0 while the body still holds its original orbit, 1 at the horizon.
    let fall = 0;
    // How far the two halves of a cut planet have been driven apart.
    let split = 0;
    if (dissolveStartMs !== null && dissolveKind === 'burst') {
      const dissolve = Math.min(1, Math.max(0, (now - dissolveStartMs) / destroyMs));
      if (burstSplits) {
        // An equatorial front cuts the planet in two along its orbit first.
        // Only once the halves have visibly come apart do they start to crack
        // and break up — the cut has to read on its own before the debris
        // takes over, or the whole thing is just one shattering event. Given
        // room: roughly two thirds of a second to open, then a second and a
        // half to fall apart and disperse.
        split = Math.min(1, dissolve / 0.1);
        melt = Math.min(1, Math.max(0, (dissolve - 0.1) / 0.24));
      } else {
        // A spherical shockwave engulfs it from every side at once.
        melt = Math.min(1, dissolve / 0.12);
      }
    } else if (tidal) {
      // Kepler fallback on the shared stream. Disruption is governed by the
      // Roche limit, i.e. by DISTANCE — the body is intact until it is well
      // inside, and it comes apart as it keeps falling. Because u falls
      // linearly for every body from its own starting u, the inner planets
      // reach the hole first and the outer ones trail, all on one track.
      const progress = Math.min(1, Math.max(0, (now - (dissolveStartMs as number)) / destroyMs));
      const state = streamStateAt(stream as TidalStream, body.radius, progress);
      fall = state.fall;
      // The Roche crossing happens almost immediately once the arm forms: real
      // debris begins shearing long before it is anywhere near the hole, and
      // the shear has to be well established while the arm is still wide
      // enough to see it happen.
      melt = Math.min(1, Math.max(0, (fall - 0.02) / 0.2));
    }
    live.uMelt.value = melt;
    // In body radii, so the model matrix's own scale carries it to world. Far
    // enough that the two halves stand clearly apart with the cut faces both
    // visible between them.
    live.uSplit.value = split * 1.35;
    // Cools over the second half of its formation.
    live.uForge.value = Math.max(0, 1 - Math.max(0, (formProgress - 0.45)) / 0.5);

    // Selection reads on the body itself: it swells slightly and its
    // atmosphere lights up, instead of the UI cutting to a panel.
    const baseScale = Math.max(0.0001, body.size * eased * (selected ? 1.05 : 1));
    const scale = live.uScale.value as THREE.Vector3;

    if (tidal) {
      const track = stream as TidalStream;
      const progress = Math.min(1, Math.max(0, (now - (dissolveStartMs as number)) / destroyMs));
      const state = streamStateAt(track, body.radius, progress);

      // The shader places the ribbon in absolute world coordinates along the
      // shared spiral, so the object transform carries nothing but the body's
      // own height above the plane — anything else would be applied twice.
      group.position.set(0, body.height * (1 - fall * 0.8), 0);
      group.quaternion.identity();
      mesh.scale.setScalar(1);

      // Before the Roche crossing the body is still on its own orbit, so it is
      // eased onto the stream rather than snapped to it: no teleport, and the
      // early part of the event still reads as "my orbit is destabilising".
      const join = Math.min(1, Math.max(0, fall / 0.22));
      bodyPositionAt(body, dissolveStartMs as number, position);
      const ownAngle = Math.atan2(position.z, position.x);
      // Unwrap so the blend takes the short way round rather than sweeping
      // most of a turn backwards.
      let toStream = (state.angle - ownAngle) % (Math.PI * 2);
      if (toStream > Math.PI) toStream -= Math.PI * 2;
      if (toStream < -Math.PI) toStream += Math.PI * 2;

      // --- shape: tidal pancaking, in WORLD units --------------------------
      // Stretched ALONG the stream, squeezed across it and hardest of all
      // vertically. The half-length has to cover a whole azimuth gap for the
      // ribbon to meet its neighbour end to end; because the arm turns rigidly
      // that gap is constant, so once the joins close they stay closed.
      const gapArc = streamGapPhi * state.radius;
      // Perspective: material deep in the well also reads visibly smaller.
      const thin = 1 - 0.45 * Math.pow(fall, 1.5);
      scale.set(
        baseScale * (1 - melt * 0.72) * thin,
        baseScale * (1 - melt * 0.9) * thin,
        Math.max(baseScale, gapArc * 0.62 * melt),
      );
      live.uArcRadius.value = state.radius;
      live.uArcPhi.value = ownAngle + toStream * join;
      live.uArcK.value = track.k;
    } else {
      mesh.scale.setScalar(baseScale);
      // Pressure build-up before a shockwave breaks it: it swells slightly.
      const swell = melt > 0 ? 1 + melt * 0.16 : 1;
      scale.set(swell, swell, swell);
      live.uArcRadius.value = 0;
      // Burst: the body keeps ORBITING right up until the wave reaches it —
      // freezing it at the click would be a visible teleport. Once hit, it
      // holds the spot the wave caught it at while it comes apart.
      group.position.copy(bodyPositionAt(body, dissolveStartMs !== null ? Math.min(now, dissolveStartMs) : now, position));
    }
    if (eased < 0.01) return;

    if (!tidal) {
      mesh.rotation.y += delta * (0.08 + body.angularSpeed * 1.6) * (selected ? 2.4 : 1) * clockRef.current.speed;
    }

    // Resonance (spec phase "Planet Resonance" / "Orbital Instability"): while
    // the star overloads, each body is DRIVEN — its orbit stops being a clean
    // circle and it shudders on its own axis and frequency. Nothing has broken
    // yet. The amplitude is a fraction of the body's own orbital radius, not of
    // its size: a 0.3-unit tremor is invisible across a 30-unit system.
    if (dissolveStartMs !== null && dissolveKind === 'burst') {
      const lead = destroyMs * waveAt;
      const ramp = Math.min(1, Math.max(0, (now - (dissolveStartMs - lead)) / Math.max(1, lead)));
      if (ramp > 0 && melt <= 0) {
        const driven = ramp * ramp;
        // Orbit destabilises: the radius breathes and the plane starts to tilt.
        const wobble = driven * body.radius * 0.05 * Math.sin(now * 0.006 + body.startAngle * 3);
        group.position.multiplyScalar(1 + wobble / Math.max(0.001, body.radius));
        // High-frequency shudder on top of it.
        const shake = driven * (body.size * 1.4 + body.radius * 0.012);
        group.position.x += Math.sin(now * 0.031 + body.startAngle * 9) * shake;
        group.position.y += Math.sin(now * 0.043 + body.startAngle * 5) * shake;
        group.position.z += Math.cos(now * 0.037 + body.startAngle * 7) * shake;
      }
    }

    live.uTime.value = now / 1000;
    // The ribbon stays lit for its whole run around the arm and only goes out
    // right at the horizon, where the hole takes it.
    const handover = tidal ? Math.min(1, Math.max(0, (fall - 0.94) / 0.06)) : 0;
    const opacityTarget = (dimmed ? 0.45 : 1) * (1 - handover);
    live.uOpacity.value += (opacityTarget - live.uOpacity.value) * Math.min(1, delta * 4);
    // Due today breathes: a slow, deliberate pulse that catches the eye while
    // the system turns, without the strobing an alert colour alone would need
    // in order to be noticed.
    const pulse = body.dueToday
      ? 0.85 + 0.55 * Math.sin(now / 620)
      : body.status === 'in_progress'
        ? 0.2 + 0.2 * Math.sin(now / 850)
        : 0;
    const rimTarget = (selected ? 2.4 : 0.55 + pulse + (body.status === 'completed' ? 0.7 : 0)) * (dimmed ? 0.35 : 1);
    live.uRimStrength.value += (rimTarget - live.uRimStrength.value) * Math.min(1, delta * 4);

    const halo = haloRef.current;
    if (halo) {
      const haloMaterial = halo.material as THREE.MeshBasicMaterial;
      // A disrupted body's group sits at the origin (the shader places the
      // ribbon itself), so the halo has to be off or it would sit on the hole.
      const haloTarget = tidal || melt > 0
        ? 0
        : selected ? 0.22
          : dimmed ? 0
            : body.dueToday ? 0.26
              : body.status === 'completed' ? 0.1
                : 0.04;
      haloMaterial.opacity += (haloTarget - haloMaterial.opacity) * Math.min(1, delta * 4);
      halo.scale.setScalar(Math.max(0.0001, body.size * eased * (selected ? 1.7 : 1.4)));
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          geometry={BODY_GEOMETRY}
          onClick={(event) => { event.stopPropagation(); onSelect(body.id); }}
          onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={PLANET_VERTEX}
            fragmentShader={PLANET_FRAGMENT}
            transparent
          />
        </mesh>
        <mesh ref={haloRef} geometry={HALO_GEOMETRY}>
          <meshBasicMaterial
            color={rimColor}
            transparent
            opacity={0}
            side={THREE.BackSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {labelVisible && showLabel && dissolveStartMs === null && (
          <Html
            distanceFactor={16}
            position={[0, body.size + 0.5, 0]}
            center
            style={{ pointerEvents: 'none', opacity: selected ? 1 : dimmed ? 0.18 : 0.85 }}
          >
            <div
              className="topic-orbit-planet-label"
              data-status={body.status}
              data-due-today={body.dueToday ? 'true' : 'false'}
            >{body.title}</div>
          </Html>
        )}
      </group>
    </>
  );
}
