import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef } from './types';
import { FORM_MS, bodyPositionAt, collapsedOrbitAt } from './diskLayout';
import { COSMIC, planetTones } from './cosmicPalette';

// One geometry for every body in the disk — a hundred tasks must not mean a
// hundred buffer uploads.
const BODY_GEOMETRY = new THREE.SphereGeometry(1, 48, 32);

const PLANET_VERTEX = `
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
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const position = useMemo(() => new THREE.Vector3(), []);
  const [labelVisible, setLabelVisible] = useState(false);
  const [forming, setForming] = useState(true);

  const tones = useMemo(() => planetTones(body.accent), [body.accent]);
  const rimColor = useMemo(
    () => new THREE.Color(body.status === 'completed' ? COSMIC.aurora : body.status === 'in_progress' ? COSMIC.ice : '#7d8aa8'),
    [body.status],
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
  }), [rimColor, tones.high, tones.low]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;
    const now = clockRef.current.ms;

    // Condensing out of the disk: the ribbon of material sweeps out to the
    // body's orbit first, and the body swells behind its leading edge.
    const formProgress = Math.min(1, Math.max(0, (now - body.revealAt) / FORM_MS));
    if (forming && formProgress >= 1) setForming(false);
    if (!labelVisible && formProgress > 0.72) setLabelVisible(true);
    if (labelVisible && formProgress < 0.72) setLabelVisible(false);
    // The body only starts to appear once the ribbon has reached its orbit.
    const born = Math.min(1, Math.max(0, (formProgress - 0.55) / 0.45));
    const eased = born <= 0 ? 0 : 1 - Math.pow(1 - born, 3);

    // Melting away: the crust burns off, then the body is gone and only the
    // stream falling into the hole is left.
    let melt = 0;
    if (dissolveStartMs !== null) {
      const dissolve = Math.min(1, Math.max(0, (now - dissolveStartMs) / destroyMs));
      // Slow enough that the stretch and the fault lines are readable before
      // the body comes apart.
      // A shockwave shatters a planet far faster than tides pull it apart.
      melt = Math.min(1, dissolve / (dissolveKind === 'burst' ? 0.16 : 0.55));
    }
    uniforms.uMelt.value = melt;
    // Cools over the second half of its formation.
    uniforms.uForge.value = Math.max(0, 1 - Math.max(0, (formProgress - 0.45)) / 0.5);

    // Selection reads on the body itself: it swells slightly and its
    // atmosphere lights up, instead of the UI cutting to a panel.
    const baseScale = Math.max(0.0001, body.size * eased * (selected ? 1.05 : 1));
    if (melt > 0 && dissolveKind === 'tidal') {
      // Spaghettification: the near side falls faster than the far side, so the
      // sphere is drawn out into an ellipsoid pointing straight at the hole.
      group.lookAt(0, group.position.y, 0);
      mesh.scale.set(baseScale * (1 - melt * 0.42), baseScale * (1 - melt * 0.42), baseScale * (1 + melt * 2.6));
    } else if (melt > 0) {
      // Pressure build-up: it swells slightly, then goes.
      mesh.scale.setScalar(baseScale * (1 + melt * 0.16));
    } else {
      mesh.scale.setScalar(baseScale);
    }
    if (eased < 0.01) return;

    mesh.rotation.y += delta * (0.08 + body.angularSpeed * 1.6) * (selected ? 2.4 : 1) * clockRef.current.speed;
    // A body being pulled in keeps travelling — down a decaying spiral, not a
    // circle, and not frozen in place. A body caught by a shockwave instead
    // holds the orbit it was on when the wave hit it.
    if (dissolveStartMs !== null && dissolveKind === 'tidal') {
      collapsedOrbitAt(body, dissolveStartMs, now, destroyMs, position);
      group.position.copy(position);
    } else {
      group.position.copy(bodyPositionAt(body, dissolveStartMs !== null ? dissolveStartMs : now, position));
    }

    // Resonance: while the star is overloading, every body shakes on its own
    // axis and frequency. Nothing has broken yet — it is being driven.
    if (dissolveStartMs !== null && dissolveKind === 'burst') {
      const lead = destroyMs * waveAt;
      const ramp = Math.min(1, Math.max(0, (now - (dissolveStartMs - lead)) / Math.max(1, lead)));
      if (ramp > 0 && melt <= 0) {
        const shake = ramp * ramp * body.size * 0.42;
        group.position.x += Math.sin(now * 0.031 + body.startAngle * 9) * shake;
        group.position.y += Math.sin(now * 0.043 + body.startAngle * 5) * shake;
        group.position.z += Math.cos(now * 0.037 + body.startAngle * 7) * shake;
      }
    }

    uniforms.uTime.value = now / 1000;
    uniforms.uOpacity.value += ((dimmed ? 0.45 : 1) - uniforms.uOpacity.value) * Math.min(1, delta * 4);
    const pulse = body.status === 'in_progress' ? 0.2 + 0.2 * Math.sin(now / 850) : 0;
    const rimTarget = (selected ? 2.4 : 0.55 + pulse + (body.status === 'completed' ? 0.7 : 0)) * (dimmed ? 0.35 : 1);
    uniforms.uRimStrength.value += (rimTarget - uniforms.uRimStrength.value) * Math.min(1, delta * 4);

    const halo = haloRef.current;
    if (halo) {
      const haloMaterial = halo.material as THREE.MeshBasicMaterial;
      const haloTarget = melt > 0 ? 0 : selected ? 0.22 : dimmed ? 0 : body.status === 'completed' ? 0.1 : 0.04;
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
        <mesh ref={haloRef} geometry={BODY_GEOMETRY}>
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
            <div className="topic-orbit-planet-label" data-status={body.status}>{body.title}</div>
          </Html>
        )}
      </group>
    </>
  );
}
