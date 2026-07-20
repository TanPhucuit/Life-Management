import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export function TopicSun({ title, settled }: { title: string; settled: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 0.06;
    const target = settled ? 1.6 : 0;
    scaleRef.current += (target - scaleRef.current) * Math.min(1, delta * 2.4);
    mesh.scale.setScalar(Math.max(0.0001, scaleRef.current));
  });

  return (
    <group>
      <pointLight color="#fef3c7" intensity={8} distance={40} decay={2} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.1} roughness={0.3} metalness={0.1} />
      </mesh>
      {settled && (
        <Html distanceFactor={10} position={[0, 2.3, 0]} center occlude style={{ pointerEvents: 'none' }}>
          <div className="topic-orbit-topic-label">{title}</div>
        </Html>
      )}
    </group>
  );
}
