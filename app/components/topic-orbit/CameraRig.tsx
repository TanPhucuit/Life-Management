import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { OrbitPlanet } from './types';

// Smoothly flies the camera toward a selected planet's CURRENT (live-orbiting)
// position and back out to the overview on deselect. Runs every frame rather
// than a one-shot tween because the planet keeps moving while we approach it.
export function CameraRig({
  planets,
  selectedId,
  controlsRef,
  elapsedMsRef,
}: {
  planets: OrbitPlanet[];
  selectedId: string | null;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  elapsedMsRef: React.MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const overviewPosition = useRef(new THREE.Vector3(0, 6, 16));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const desiredCamera = useRef(new THREE.Vector3(0, 6, 16));

  useEffect(() => {
    overviewPosition.current.copy(camera.position);
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const selected = selectedId ? planets.find((planet) => planet.id === selectedId) : null;

    if (selected) {
      const elapsed = elapsedMsRef.current;
      const timeSinceReveal = (elapsed - selected.revealAt) / 1000;
      const angle = selected.startAngle + timeSinceReveal * selected.orbitSpeed;
      const px = Math.cos(angle) * selected.orbitRadius;
      const pz = Math.sin(angle) * selected.orbitRadius;
      const py = Math.sin(angle) * selected.orbitRadius * selected.orbitInclination;
      desiredTarget.current.set(px, py, pz);
      const dirAway = new THREE.Vector3(px, py, pz).normalize().multiplyScalar(selected.size + 3.2);
      desiredCamera.current.set(px + dirAway.x, py + dirAway.y + 0.6, pz + dirAway.z);
    } else {
      desiredTarget.current.set(0, 0, 0);
      desiredCamera.current.copy(overviewPosition.current);
    }

    const followSpeed = Math.min(1, delta * 2.2);
    controls.target.lerp(desiredTarget.current, followSpeed);
    camera.position.lerp(desiredCamera.current, followSpeed);
    controls.update();
  });

  return null;
}
