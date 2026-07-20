import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitPlanet } from './types';

const STATUS_COLOR: Record<OrbitPlanet['status'], string> = {
  completed: '#34d399',
  in_progress: '#60a5fa',
  not_completed: '#94a3b8',
};

function OrbitRingLine({ radius, inclination, opacity }: { radius: number; inclination: number; opacity: number }) {
  const points = useMemo(() => {
    const segments = 96;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius * inclination, Math.sin(angle) * radius]);
    }
    return pts;
  }, [radius, inclination]);
  return <Line points={points} color="#3b82f6" transparent opacity={opacity * 0.35} lineWidth={1} />;
}

export function Planet({
  planet,
  elapsedMs,
  selected,
  dimmed,
  onSelect,
}: {
  planet: OrbitPlanet;
  elapsedMs: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const revealProgress = useRef(0);

  const revealed = elapsedMs >= planet.revealAt;
  const color = STATUS_COLOR[planet.status];

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    // Appear: pop in from a point, then spin up. Reveal timing is driven by
    // elapsedMs (React state, deterministic across re-renders) so it stays
    // exactly in sync with the ring reveal and the orbit-order sequencing.
    const targetReveal = revealed ? 1 : 0;
    revealProgress.current += (targetReveal - revealProgress.current) * Math.min(1, delta * 4.2);
    const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, revealProgress.current)), 3);
    const scale = planet.size * eased;
    mesh.scale.setScalar(Math.max(0.0001, scale));

    if (!revealed) return;

    // Slow self-rotation ("activity") + orbit motion around the sun.
    mesh.rotation.y += delta * (0.25 + planet.orbitSpeed * 2);
    const timeSinceReveal = (elapsedMs - planet.revealAt) / 1000;
    const angle = planet.startAngle + timeSinceReveal * planet.orbitSpeed;
    const x = Math.cos(angle) * planet.orbitRadius;
    const z = Math.sin(angle) * planet.orbitRadius;
    const y = Math.sin(angle) * planet.orbitRadius * planet.orbitInclination;
    group.position.set(x, y, z);

    const targetOpacity = dimmed ? 0.35 : 1;
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.opacity += (targetOpacity - material.opacity) * Math.min(1, delta * 5);
  });

  return (
    <>
      <OrbitRingLine radius={planet.orbitRadius} inclination={planet.orbitInclination} opacity={revealed ? 1 : 0} />
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onClick={(event) => { event.stopPropagation(); onSelect(planet.id); }}
          onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={planet.status === 'completed' ? 0.85 : planet.status === 'in_progress' ? 0.45 : 0.12}
            roughness={0.45}
            metalness={0.15}
            transparent
            opacity={1}
          />
        </mesh>
        {revealed && (
          <Html distanceFactor={10} position={[0, planet.size + 0.5, 0]} center occlude style={{ pointerEvents: 'none', opacity: selected ? 1 : dimmed ? 0.35 : 0.9 }}>
            <div className="topic-orbit-planet-label">{planet.title}</div>
          </Html>
        )}
      </group>
    </>
  );
}
