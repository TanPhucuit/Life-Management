import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef } from './types';
import { bodyPositionAt, treeGrowthDirection } from './diskLayout';

const INTRO_MS = 3000;
const UP = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Smoothstep with a zero second derivative at both ends: the crane starts and
// stops without a visible hinge.
const smootherstep = (x: number, edge0: number, edge1: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
// Ease-out-expo: fast entry, long glide. The same curve Bruno-Simon-style
// scenes use to make an arrival feel like it has mass.
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function CameraRig({
  bodies,
  selectedId,
  focusReach,
  nodeFocus,
  controlsRef,
  clockRef,
  overviewDistance,
  introKey,
  transition,
}: {
  bodies: DiskBody[];
  selectedId: string | null;
  focusReach: number;
  // A point inside the knowledge tree's own space, so expanding a branch can
  // pull the camera in to it.
  nodeFocus: { position: [number, number, number]; radius: number; nonce: number } | null;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  clockRef: OrbitClockRef;
  overviewDistance: number;
  introKey: number;
  // Non-null for the length of a topic-change event. The rig never cuts or
  // teleports during one — it only does what a camera operator would do:
  // widen a little, step sideways, and hold.
  transition: {
    startMs: number;
    durationMs: number;
    waveAt: number;
    dolly: 'back' | 'in';
    craneDegrees: number;
  } | null;
}) {
  const { camera } = useThree();
  const overviewPose = useRef({
    position: new THREE.Vector3(overviewDistance * 0.34, overviewDistance * 0.42, overviewDistance * 0.86),
    target: new THREE.Vector3(),
  });
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const bodyPosition = useMemo(() => new THREE.Vector3(), []);
  const previousBodyPosition = useMemo(() => new THREE.Vector3(), []);
  const growth = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  const carry = useMemo(() => new THREE.Vector3(), []);
  const introFrom = useMemo(() => new THREE.Vector3(), []);
  const treeQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const focusPoint = useMemo(() => new THREE.Vector3(), []);
  const phase = useRef<'intro' | 'free' | 'flying' | 'anchored'>('intro');
  const introElapsed = useRef(0);
  // Choreography state. Crane and dolly are applied as per-frame deltas so they
  // compose with whatever the user is doing instead of fighting it.
  const baseFov = useRef(0);
  const cranePrev = useRef(0);
  const dollyPrev = useRef(1);
  const transitionKey = useRef<number | null>(null);
  // Read through a ref: a topic with more tasks makes the system bigger, and
  // that must NEVER be able to retrigger the arrival flight.
  const distanceRef = useRef(overviewDistance);
  distanceRef.current = overviewDistance;

  // Arrival: the camera falls in from deep space toward the hole.
  useEffect(() => {
    const controls = controlsRef.current;
    phase.current = 'intro';
    introElapsed.current = 0;
    introFrom.copy(overviewPose.current.position).normalize().multiplyScalar(distanceRef.current * 5.2);
    introFrom.y = distanceRef.current * 2.4;
    camera.position.copy(introFrom);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.enabled = false;
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey]);

  // Selecting or clearing a body always takes the camera back off the user.
  useEffect(() => {
    if (phase.current === 'intro') return;
    const controls = controlsRef.current;
    if (selectedId && controls) {
      overviewPose.current.position.copy(camera.position);
      overviewPose.current.target.copy(controls.target);
    }
    phase.current = 'flying';
    if (controls) controls.enabled = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Expanding a branch re-aims the camera at that branch.
  useEffect(() => {
    if (phase.current === 'intro' || !nodeFocus) return;
    phase.current = 'flying';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeFocus?.nonce]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const step = Math.min(delta, 0.05);
    const seconds = clockRef.current.ms / 1000;

    // ---- topic-change choreography -------------------------------------
    const perspective = camera as THREE.PerspectiveCamera;
    if (transition) {
      if (transitionKey.current !== transition.startMs) {
        transitionKey.current = transition.startMs;
        baseFov.current = perspective.fov;
        cranePrev.current = 0;
        dollyPrev.current = 1;
      }
      const p = Math.min(1, Math.max(0, (clockRef.current.ms - transition.startMs) / transition.durationMs));

      // Phase 2: the ship feels the event — a wider lens and a shove, both gone
      // again within a second. It lands on the event itself, not on the click.
      const joltAt = Math.max(0.04, transition.waveAt);
      const jolt = Math.exp(-Math.pow((p - joltAt) / 0.07, 2));
      perspective.fov = baseFov.current + 5 * Math.min(1, p / 0.12) * (1 - smootherstep(p, 0.55, 1));
      perspective.updateProjectionMatrix();

      // Phases 4-6: a slow 20° crane around the hole, so the disruption and the
      // disk behind it both stay legible. Never a cut, never a new angle.
      const craneNow = smootherstep(p, 0, 1) * ((transition.craneDegrees * Math.PI) / 180);
      const craneDelta = craneNow - cranePrev.current;
      cranePrev.current = craneNow;
      if (craneDelta !== 0) {
        camera.position.applyAxisAngle(WORLD_UP, craneDelta);
        controls.target.applyAxisAngle(WORLD_UP, craneDelta);
      }

      // A hole opening up shoves you back; a magnetar draws you in. Either way
      // it is 5-6%, and it returns to exactly where it started.
      const dollyAmount = transition.dolly === 'in' ? -0.05 : 0.06;
      const dollyNow = 1 + dollyAmount * Math.sin(Math.PI * Math.min(1, p / 0.85));
      const dollyRatio = dollyNow / dollyPrev.current;
      dollyPrev.current = dollyNow;
      if (dollyRatio !== 1) {
        camera.position.sub(controls.target).multiplyScalar(dollyRatio).add(controls.target);
      }

      controls.update();
      // Applied after controls.update so it never accumulates: a 0.2° tremor,
      // not a game-style camera shake.
      if (jolt > 0.001) {
        camera.rotateX(Math.sin(clockRef.current.ms * 0.043) * 0.0035 * jolt);
        camera.rotateY(Math.cos(clockRef.current.ms * 0.037) * 0.0035 * jolt);
      }
      if (phase.current === 'free') return;
    } else if (transitionKey.current !== null) {
      transitionKey.current = null;
      if (baseFov.current) {
        perspective.fov = baseFov.current;
        perspective.updateProjectionMatrix();
      }
    }
    // A slow, tiny drift on every shot so no frame is ever perfectly dead.
    const breathe = Math.sin(seconds * 0.42) * overviewDistance * 0.004;

    if (phase.current === 'intro') {
      introElapsed.current += step * 1000;
      const t = Math.min(1, introElapsed.current / INTRO_MS);
      const eased = easeOutExpo(t);
      camera.position.lerpVectors(introFrom, overviewPose.current.position, eased);
      camera.position.y += breathe;
      controls.target.set(0, 0, 0);
      controls.update();
      if (t >= 1) {
        phase.current = 'free';
        controls.enabled = true;
      }
      return;
    }

    if (phase.current === 'free') {
      // Hands off — OrbitControls' own damping supplies the inertia.
      controls.update();
      return;
    }

    const selected = selectedId ? bodies.find((body) => body.id === selectedId) : null;
    if (selected) bodyPositionAt(selected, clockRef.current.ms, bodyPosition);

    if (phase.current === 'anchored') {
      if (!selected) return;
      // Anchored, not locked: the camera is carried along by the planet so the
      // tree never drifts out of frame, but the user keeps full orbit control
      // and can look around the branches while they are open.
      carry.copy(bodyPosition).sub(previousBodyPosition);
      previousBodyPosition.copy(bodyPosition);
      controls.target.add(carry);
      camera.position.add(carry);
      controls.update();
      return;
    }

    if (selected) {
      treeGrowthDirection(bodyPosition, growth);
      let framedRadius = focusReach;
      if (nodeFocus) {
        // Aim at one branch: the tree's own space, carried to world space.
        treeQuaternion.setFromUnitVectors(UP, growth);
        focusPoint.fromArray(nodeFocus.position).applyQuaternion(treeQuaternion).add(bodyPosition);
        desiredTarget.copy(focusPoint);
        framedRadius = nodeFocus.radius;
      } else {
        // Aim at the middle of where the tree will stand, not at the body.
        desiredTarget.copy(bodyPosition).addScaledVector(growth, focusReach * 0.42);
      }
      // Stand off to one side of the growth axis so the branches read in depth
      // instead of pointing straight at the lens.
      tangent.set(-bodyPosition.z, 0, bodyPosition.x).normalize();
      const standoff = Math.max(selected.size * 6, framedRadius * 1.35 + 2.2);
      desiredCamera.copy(desiredTarget)
        .addScaledVector(tangent, standoff * 0.78)
        .addScaledVector(growth, standoff * 0.24);
      desiredCamera.y += standoff * 0.16;
    } else {
      desiredTarget.copy(overviewPose.current.target);
      desiredCamera.copy(overviewPose.current.position);
    }

    const followSpeed = Math.min(1, step * 1.9);
    controls.target.lerp(desiredTarget, followSpeed);
    camera.position.lerp(desiredCamera, followSpeed);
    controls.update();

    if (camera.position.distanceTo(desiredCamera) < (selected ? Math.max(0.4, focusReach * 0.06) : 0.8)) {
      controls.enabled = true;
      if (selected) {
        previousBodyPosition.copy(bodyPosition);
        phase.current = 'anchored';
      } else {
        phase.current = 'free';
      }
    }
  });

  return null;
}
