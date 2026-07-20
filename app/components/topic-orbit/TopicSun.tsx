import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitClockRef } from './types';

// The selected Topic itself: the one object on screen during the first beat of
// the intro, before any orbit is drawn.
export function TopicSun({
  title,
  accent,
  settled,
  dimmed,
  clockRef,
}: {
  title: string;
  accent: string;
  settled: boolean;
  dimmed: boolean;
  clockRef: OrbitClockRef;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 0.06 * clockRef.current.speed;
    scaleRef.current += ((settled ? 1.7 : 0) - scaleRef.current) * Math.min(1, delta * 2.4);
    mesh.scale.setScalar(Math.max(0.0001, scaleRef.current));
    const material = mesh.material as THREE.MeshStandardMaterial;
    const breathe = 1.05 + 0.08 * Math.sin(clockRef.current.ms / 1400);
    material.emissiveIntensity += ((dimmed ? 0.5 : breathe) - material.emissiveIntensity) * Math.min(1, delta * 3);
    const halo = haloRef.current;
    if (halo) {
      halo.scale.setScalar(Math.max(0.0001, scaleRef.current * (1.35 + 0.03 * Math.sin(clockRef.current.ms / 1100))));
      (halo.material as THREE.MeshBasicMaterial).opacity += ((dimmed ? 0.04 : 0.14) - (halo.material as THREE.MeshBasicMaterial).opacity) * Math.min(1, delta * 3);
    }
  });

  return (
    <group>
      <pointLight color="#fff5d6" intensity={26} distance={220} decay={1.6} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.05} roughness={0.32} metalness={0.08} />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color={accent} transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {settled && (
        <Html distanceFactor={14} position={[0, 2.6, 0]} center style={{ pointerEvents: 'none', opacity: dimmed ? 0.35 : 1 }}>
          <div className="topic-orbit-topic-label">{title}</div>
        </Html>
      )}
    </group>
  );
}
