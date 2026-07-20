import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitClockRef, OrbitPlanet } from './types';
import { RING_DRAW_MS, planetPositionAt } from './orbitLayout';

// One geometry for every planet in the system — a hundred spheres must not mean
// a hundred buffer uploads. Materials stay per-planet (each carries its own
// category colour and its own animated opacity).
const PLANET_GEOMETRY = new THREE.SphereGeometry(1, 32, 24);
const RING_SEGMENTS = 128;
const COMPLETED_GLOW = new THREE.Color('#34d399');

function OrbitRing({ planet, clockRef }: { planet: OrbitPlanet; clockRef: OrbitClockRef }) {
  // Plain THREE.Line (not drei's <Line>) because the "ring is being drawn into
  // existence" effect is just an animated draw range, which meshline cannot do.
  const line = useMemo(() => {
    const positions = new Float32Array((RING_SEGMENTS + 1) * 3);
    for (let index = 0; index <= RING_SEGMENTS; index += 1) {
      const angle = (index / RING_SEGMENTS) * Math.PI * 2;
      positions[index * 3] = Math.cos(angle) * planet.orbitRadius;
      positions[index * 3 + 1] = Math.sin(angle) * planet.orbitRadius * planet.orbitInclination;
      positions[index * 3 + 2] = Math.sin(angle) * planet.orbitRadius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({ color: planet.accent, transparent: true, opacity: 0 });
    return new THREE.Line(geometry, material);
  }, [planet.accent, planet.orbitInclination, planet.orbitRadius]);

  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);

  useFrame((_, delta) => {
    const drawStartedAt = Math.max(0, planet.revealAt - RING_DRAW_MS);
    const progress = Math.min(1, Math.max(0, (clockRef.current.ms - drawStartedAt) / RING_DRAW_MS));
    line.geometry.setDrawRange(0, Math.ceil(progress * (RING_SEGMENTS + 1)));
    const material = line.material as THREE.LineBasicMaterial;
    const target = progress > 0 ? 0.28 : 0;
    material.opacity += (target - material.opacity) * Math.min(1, delta * 3.4);
  });

  return <primitive object={line} />;
}

export function Planet({
  planet,
  clockRef,
  revealed,
  selected,
  dimmed,
  showLabel,
  onSelect,
}: {
  planet: OrbitPlanet;
  clockRef: OrbitClockRef;
  revealed: boolean;
  selected: boolean;
  dimmed: boolean;
  showLabel: boolean;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const revealProgress = useRef(0);
  const position = useMemo(() => new THREE.Vector3(), []);

  const baseColor = planet.status === 'completed' ? '#4ade80' : planet.accent;
  const baseEmissive = planet.status === 'completed' ? 0.7 : planet.status === 'in_progress' ? 0.34 : 0.08;

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    // Born as a point of light, grows into a full sphere, then spins up.
    revealProgress.current += ((revealed ? 1 : 0) - revealProgress.current) * Math.min(1, delta * 4.2);
    const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, revealProgress.current)), 3);
    mesh.scale.setScalar(Math.max(0.0001, planet.size * eased));
    if (revealProgress.current < 0.01) return;

    // Self-rotation encodes activity; the orbit itself is driven by the shared
    // simulation clock so every planet stays in lockstep with the camera rig.
    mesh.rotation.y += delta * (0.25 + planet.orbitSpeed * 2) * clockRef.current.speed;
    group.position.copy(planetPositionAt(planet, clockRef.current.ms, position));

    const material = mesh.material as THREE.MeshStandardMaterial;
    const targetOpacity = dimmed ? 0.24 : 1;
    material.opacity += (targetOpacity - material.opacity) * Math.min(1, delta * 4);
    // Completed branches breathe a soft green; in-progress ones pulse slowly.
    const pulse = planet.status === 'in_progress' ? 0.12 + 0.12 * Math.sin(clockRef.current.ms / 900) : 0;
    const targetEmissive = (selected ? baseEmissive + 0.45 : baseEmissive + pulse) * (dimmed ? 0.4 : 1);
    material.emissiveIntensity += (targetEmissive - material.emissiveIntensity) * Math.min(1, delta * 4);
  });

  return (
    <>
      <OrbitRing planet={planet} clockRef={clockRef} />
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onClick={(event) => { event.stopPropagation(); onSelect(planet.id); }}
          onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          geometry={PLANET_GEOMETRY}
        >
          <meshStandardMaterial
            color={baseColor}
            emissive={planet.status === 'completed' ? COMPLETED_GLOW : baseColor}
            emissiveIntensity={baseEmissive}
            roughness={0.42}
            metalness={0.18}
            transparent
            opacity={1}
          />
        </mesh>
        {planet.completion > 0.999 && (
          // A quiet halo ring for finished branches — readable from any angle.
          <mesh rotation={[Math.PI / 2.3, 0, 0]} scale={planet.size}>
            <torusGeometry args={[1.7, 0.045, 8, 48]} />
            <meshBasicMaterial color="#34d399" transparent opacity={dimmed ? 0.12 : 0.4} />
          </mesh>
        )}
        {revealed && showLabel && (
          <Html
            distanceFactor={14}
            position={[0, planet.size + 0.55, 0]}
            center
            style={{ pointerEvents: 'none', opacity: selected ? 1 : dimmed ? 0.22 : 0.88 }}
          >
            <div className="topic-orbit-planet-label" data-status={planet.status}>{planet.title}</div>
          </Html>
        )}
      </group>
    </>
  );
}
