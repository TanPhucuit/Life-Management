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
  arrivalOf,
  deathMs,
}: {
  bodies: DiskBody[];
  clockRef: OrbitClockRef;
  accent: string;
  dimmed: boolean;
  dissolveStartMs: number | null;
  destroyMs: number;
  // Do the rings themselves spiral inward (tidal infall) or just fade (burst)?
  collapses: boolean;
  // Burst only: when the destructive front reaches a given body, so its ring
  // can fade in step with the planet it belongs to rather than all together.
  arrivalOf: (body: DiskBody) => number;
  // How long a body takes to come apart once the front reaches it. The ring
  // fades over this same span, so orbit and planet leave the scene together.
  deathMs: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const ringColor = useMemo(() => new THREE.Color(), []);
  const color = useMemo(() => new THREE.Color(accent), [accent]);
  const faded = useMemo(() => new THREE.Color(accent).multiplyScalar(0.35), [accent]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
  }, [bodies.length]);

  // Base colour only tracks completion, which changes with the data, not sixty
  // times a second. The per-frame fade during a dissolve scales THIS down, and
  // the base is restored once the dissolve is over, so the steady state uploads
  // no colour at all.
  const baseColors = useMemo(
    () => bodies.map((body) => (body.status === 'completed' ? color : faded)),
    [bodies, color, faded],
  );
  const writeBaseColors = () => {
    const mesh = meshRef.current;
    if (!mesh) return;
    baseColors.forEach((c, index) => mesh.setColorAt(index, c));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  useEffect(writeBaseColors, [baseColors]);
  // True while the per-frame fade owns the colour buffer, so it can be handed
  // back to the base colours exactly once when the dissolve ends.
  const overriddenRef = useRef(false);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = clockRef.current.ms;
    const dissolving = dissolveStartMs !== null;

    bodies.forEach((body, index) => {
      let radius = body.radius;
      let height = body.height;
      // How much this ring's own planet has been destroyed, 0..1. Additive
      // blending means a colour scaled toward black simply disappears, so the
      // orbit dims out exactly as the planet on it comes apart — instead of
      // every ring surviving intact until the whole system is swapped, which
      // is what read as a hard cut.
      let dead = 0;
      if (dissolving) {
        if (collapses) {
          const at = collapsedOrbitAt(body, dissolveStartMs as number, now, destroyMs, scratch);
          radius = at.radius;
          height = body.height * (1 - at.progress * 0.6);
          dead = at.progress;
        } else {
          const arrival = arrivalOf(body);
          dead = Math.min(1, Math.max(0, (now - arrival) / Math.max(1, deathMs)));
        }
      }
      // Hidden until the body it belongs to has actually formed.
      const born = Math.min(1, Math.max(0, (now - body.revealAt) / 900));
      const scale = Math.max(0.0001, radius * born);
      matrix.makeRotationX(Math.PI / 2);
      matrix.scale(scratch.set(scale, scale, scale));
      matrix.setPosition(0, height, 0);
      mesh.setMatrixAt(index, matrix);

      if (dissolving) {
        // A ring is BRIGHTER than at rest during the collapse — the system
        // lighting up as it destabilises — then fades to nothing with its
        // planet.
        const fade = 1 - dead * dead;
        ringColor.copy(baseColors[index]).multiplyScalar(1.9 * fade);
        mesh.setColorAt(index, ringColor);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;

    // Colour buffer is only touched while dissolving, and restored once on the
    // frame the dissolve ends — never uploaded in steady state.
    if (dissolving) {
      overriddenRef.current = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    } else if (overriddenRef.current) {
      overriddenRef.current = false;
      writeBaseColors();
    }

    const material = mesh.material as THREE.MeshBasicMaterial;
    const target = dimmed ? 0.08 : 0.26;
    material.opacity += (target - material.opacity) * Math.min(1, delta * 3);
  });

  if (!bodies.length) return null;

  return (
    <instancedMesh ref={meshRef} args={[RING_GEOMETRY, undefined, bodies.length]} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.26} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  );
}
