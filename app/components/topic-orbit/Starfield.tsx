import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Deep-space backdrop. One Points object, no per-star React nodes.
export function Starfield({ count = 1400, radius = 260 }: { count?: number; radius?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      // Even distribution on a shell, pushed outward so nothing pops through
      // the orbit rings.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const distance = radius * (0.55 + Math.random() * 0.45);
      positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = distance * Math.cos(phi);
      positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [count, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.006;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial size={0.9} sizeAttenuation color="#cbd5f5" transparent opacity={0.75} depthWrite={false} />
    </points>
  );
}
