import * as THREE from 'three';
import { DiskBody, DiskGeometry, OrbitPlanetInput } from './types';

// Same deterministic hash used elsewhere in the network code, so re-renders
// never reshuffle a body's own place in the disk.
const hash01 = (id: string, salt: number) => {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Final avalanche. Without it, ids that differ only in their last character
  // (task-1, task-2 …) hash to almost the same value and every body ends up
  // parked at the same angle of the disk.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
};

export const HORIZON_RADIUS = 1.55;
export const PHOTON_RING_RADIUS = HORIZON_RADIUS * 1.32;
const DISK_INNER = HORIZON_RADIUS * 1.68;
// The band sits inside the bright part of the disk: tasks must look like they
// are made of the same material, not like marbles floating past it.
const BODY_BAND_START = 3.9;
const BODY_BAND_MIN_SPAN = 4.6;
const BODY_BAND_MAX_SPAN = 17;

// How long a body takes to condense out of the disk material.
export const FORM_MS = 1600;
// How long the old system takes to melt and fall in when the topic changes.
export const DISSOLVE_MS = 4200;
// The beat of silence after the last debris is swallowed, before the hole
// takes on its new identity. The viewer needs a moment to register that a whole
// system just went in.
export const SILENCE_MS = 520;
const REVEAL_START_MS = 1500;
const REVEAL_STAGGER_MS = 260;
const MAX_REVEAL_SPAN_MS = 5200;

// Every task rides one accretion disk — no per-task orbit rings. Radius spread
// is even across the band so a 6-task topic and a 100-task topic both read as
// a disk rather than as a row of textbook orbits.
export function layoutDisk(
  inputs: OrbitPlanetInput[],
  instant = false,
  // Everything is timed against the shared simulation clock, so a system that
  // forms after a topic switch has to be rebased onto "now" instead of onto
  // the moment the scene was mounted.
  baseMs = 0,
  // Where the task band starts. A black hole lets tasks ride the hot disk; a
  // star needs them kept well clear of its surface.
  bandStart = BODY_BAND_START,
): { bodies: DiskBody[]; disk: DiskGeometry } {
  const count = inputs.length;
  const span = Math.min(BODY_BAND_MAX_SPAN, Math.max(BODY_BAND_MIN_SPAN, count * 0.62));
  const stagger = count > 1 ? Math.min(REVEAL_STAGGER_MS, MAX_REVEAL_SPAN_MS / (count - 1)) : REVEAL_STAGGER_MS;

  const bodies = inputs.map((input, index) => {
    const spread = count > 1 ? index / (count - 1) : 0.35;
    // A little radial jitter keeps neighbouring tasks from lining up in a
    // perfect spiral arm, which is what made the old layout look mechanical.
    const radius = bandStart + spread * span + (hash01(input.id, 1) - 0.5) * (span / Math.max(4, count)) * 1.6;
    const size = 0.2 + Math.min(1, Math.max(0, input.importance)) * 0.24 + Math.min(0.12, input.childCount * 0.014);
    return {
      ...input,
      radius,
      // Keplerian falloff: inner tasks whip around, outer ones drift.
      angularSpeed: (0.62 / Math.pow(radius, 1.35)) * (0.75 + hash01(input.id, 2) * 0.55),
      height: (hash01(input.id, 3) - 0.5) * 0.42,
      startAngle: hash01(input.id, 4) * Math.PI * 2,
      size,
      revealAt: instant ? baseMs : baseMs + REVEAL_START_MS + index * stagger,
    };
  });

  const outermost = bodies.reduce((maximum, body) => Math.max(maximum, body.radius), bandStart);
  return {
    bodies,
    disk: {
      innerRadius: DISK_INNER,
      // The disk always reaches past the furthest task, so every body really
      // does sit inside the glowing material rather than outside it.
      outerRadius: outermost * 1.32 + 1.6,
      horizonRadius: HORIZON_RADIUS,
    },
  };
}

// Single source of truth for "where is this body right now" — used by the
// bodies, the camera rig and the knowledge tree anchor alike.
export function bodyPositionAt(body: DiskBody, simMs: number, out: THREE.Vector3) {
  const seconds = Math.max(0, simMs - body.revealAt) / 1000;
  const angle = body.startAngle + seconds * body.angularSpeed;
  return out.set(Math.cos(angle) * body.radius, body.height, Math.sin(angle) * body.radius);
}

// PHASE 3 — orbital collapse. The bodies are never frozen and never fade: their
// ORBITS decay. The radius falls while angular speed rises (angular momentum has
// to go somewhere), so a circle is continuously drawn out into a spiral. Shared
// by the bodies and by the debris they shed, so both agree on where a body was
// at any instant.
export function collapsedOrbitAt(
  body: DiskBody,
  dissolveStartMs: number,
  nowMs: number,
  destroyMs: number,
  out: THREE.Vector3,
) {
  const elapsed = Math.max(0, nowMs - dissolveStartMs);
  const p = Math.min(1, elapsed / (destroyMs * 0.62));
  const radius = body.radius * (1 - 0.82 * Math.pow(p, 1.7));
  // Where it had got to on its stable orbit when the topic changed.
  const entryAngle = body.startAngle
    + (Math.max(0, dissolveStartMs - body.revealAt) / 1000) * body.angularSpeed;
  const angle = entryAngle + (elapsed / 1000) * body.angularSpeed * (1 + 4 * p * p);
  out.set(Math.cos(angle) * radius, body.height * (1 - p * 0.6), Math.sin(angle) * radius);
  return { radius, angle, progress: p };
}

// The heading a knowledge tree grows along: outward from the hole and tilted
// up. Shared by the tree itself and the camera that has to frame it.
export function treeGrowthDirection(bodyPosition: THREE.Vector3, out: THREE.Vector3) {
  out.set(bodyPosition.x, 0, bodyPosition.z);
  if (out.lengthSq() < 0.0001) out.set(1, 0, 0);
  return out.normalize().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.8, 0)).normalize();
}

export function overviewDistance(disk: DiskGeometry) {
  return Math.min(140, disk.outerRadius * 1.12 + 4.5);
}
