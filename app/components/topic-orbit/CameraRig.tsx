import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { OrbitClockRef, OrbitPlanet } from './types';
import { planetPositionAt } from './orbitLayout';

// Flies the camera toward a selected planet's CURRENT (still orbiting) position
// and back out to wherever the user was looking from before. It runs every
// frame instead of a one-shot tween precisely because the target keeps moving.
//
// Once the approach settles, the rig stops steering and instead *carries* the
// camera along with the planet: the user keeps full orbit/zoom control around
// it, and the planet never slides out of frame while they work.
export function CameraRig({
  planets,
  selectedId,
  controlsRef,
  clockRef,
  overviewDistance,
  onArrive,
}: {
  planets: OrbitPlanet[];
  selectedId: string | null;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  clockRef: OrbitClockRef;
  overviewDistance: number;
  onArrive?: () => void;
}) {
  const { camera } = useThree();
  // Where the user was before diving into a planet, restored on close so
  // returning never feels like a scene reset.
  const overviewPose = useRef({
    position: new THREE.Vector3(0, overviewDistance * 0.42, overviewDistance),
    target: new THREE.Vector3(),
  });
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const planetPosition = useMemo(() => new THREE.Vector3(), []);
  const previousPlanetPosition = useMemo(() => new THREE.Vector3(), []);
  const carry = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const phase = useRef<'idle' | 'flying' | 'anchored'>('idle');

  useEffect(() => {
    const controls = controlsRef.current;
    if (selectedId && phase.current === 'idle') {
      overviewPose.current.position.copy(camera.position);
      if (controls) overviewPose.current.target.copy(controls.target);
    }
    phase.current = 'flying';
    if (controls) controls.enabled = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || phase.current === 'idle') return;
    const selected = selectedId ? planets.find((planet) => planet.id === selectedId) : null;

    if (selected) planetPositionAt(selected, clockRef.current.ms, planetPosition);

    if (phase.current === 'anchored') {
      if (!selected) return;
      // Translate camera + target by exactly how far the planet moved, so the
      // user's own framing is preserved frame to frame.
      carry.copy(planetPosition).sub(previousPlanetPosition);
      previousPlanetPosition.copy(planetPosition);
      controls.target.add(carry);
      camera.position.add(carry);
      controls.update();
      return;
    }

    if (selected) {
      desiredTarget.copy(planetPosition);
      // Stand off along the planet's own radius so the Topic stays in frame
      // behind it — the approach reads as coming in from deep space.
      offset.copy(planetPosition).normalize().multiplyScalar(selected.size * 3.4 + 3.4);
      desiredCamera.copy(planetPosition).add(offset);
      desiredCamera.y += selected.size * 1.6 + 0.9;
    } else {
      desiredTarget.copy(overviewPose.current.target);
      desiredCamera.copy(overviewPose.current.position);
    }

    const followSpeed = Math.min(1, delta * 2.1);
    controls.target.lerp(desiredTarget, followSpeed);
    camera.position.lerp(desiredCamera, followSpeed);
    controls.update();

    const settleDistance = selected ? selected.size * 0.7 + 0.4 : 0.6;
    if (camera.position.distanceTo(desiredCamera) < settleDistance) {
      controls.enabled = true;
      if (selected) {
        previousPlanetPosition.copy(planetPosition);
        phase.current = 'anchored';
      } else {
        phase.current = 'idle';
      }
      onArrive?.();
    }
  });

  return null;
}
