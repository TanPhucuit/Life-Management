import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef } from './types';
import { collapsedOrbitAt } from './diskLayout';

// One faint ring per task, so a star system reads as a system and not as a
// scatter of dots. Every ring is an instance of the same torus — a hundred
// tasks cost one draw call — and each ring shrinks with its own orbit while the
// system is collapsing, which is what makes the decay legible.
const RING_GEOMETRY = new THREE.TorusGeometry(1, 0.0022, 4, 128);

export function OrbitRings({
  bodies,
  clockRef,
  accent,
  dimmed,
  dissolveStartMs,
  destroyMs,
  collapses,
}: {
  bodies: DiskBody[];
  clockRef: OrbitClockRef;
  accent: string;
  dimmed: boolean;
  dissolveStartMs: number | null;
  destroyMs: number;
  // Do the rings themselves spiral inward (tidal infall) or just fade (burst)?
  collapses: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const color = useMemo(() => new THREE.Color(accent), [accent]);
  const faded = useMemo(() => new THREE.Color(accent).multiplyScalar(0.35), [accent]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
  }, [bodies.length]);

  // Ring colour only tracks completion, which changes when the data changes —
  // not sixty times a second. Writing it every frame meant re-uploading the
  // whole instance colour buffer to the GPU on every single frame for a value
  // that was almost always identical to the one already there.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    bodies.forEach((body, index) => {
      mesh.setColorAt(index, body.status === 'completed' ? color : faded);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bodies, color, faded]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = clockRef.current.ms;

    bodies.forEach((body, index) => {
      let radius = body.radius;
      let height = body.height;
      if (dissolveStartMs !== null && collapses) {
        const at = collapsedOrbitAt(body, dissolveStartMs, now, destroyMs, scratch);
        radius = at.radius;
        height = body.height * (1 - at.progress * 0.6);
      }
      // Hidden until the body it belongs to has actually formed.
      const born = Math.min(1, Math.max(0, (now - body.revealAt) / 900));
      const scale = Math.max(0.0001, radius * born);
      matrix.makeRotationX(Math.PI / 2);
      matrix.scale(scratch.set(scale, scale, scale));
      matrix.setPosition(0, height, 0);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;

    const material = mesh.material as THREE.MeshBasicMaterial;
    const target = dimmed ? 0.08 : dissolveStartMs !== null ? 0.5 : 0.26;
    material.opacity += (target - material.opacity) * Math.min(1, delta * 3);
  });

  if (!bodies.length) return null;

  return (
    <instancedMesh ref={meshRef} args={[RING_GEOMETRY, undefined, bodies.length]} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.26} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  );
}
