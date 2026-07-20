import * as THREE from 'three';
import { OrbitPlanet, OrbitPlanetInput } from './types';

// Same small deterministic-hash trick used elsewhere in the network code, so
// re-renders never reshuffle a planet's own orbit characteristics.
const hash01 = (id: string, salt: number) => {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const BASE_RADIUS = 4.6;
// sqrt spacing, not linear: 100 first-level tasks still fit in a system the
// camera can frame, while the first handful stay comfortably far apart.
const RADIUS_STEP = 2.35;
const SUN_SETTLE_MS = 900;
const REVEAL_STAGGER_MS = 620;
// The whole construction sequence is capped, otherwise 100 planets would take
// a full minute to finish appearing.
const MAX_REVEAL_SPAN_MS = 7200;

export const RING_DRAW_MS = 620;

export function layoutPlanets(inputs: OrbitPlanetInput[], instant = false): OrbitPlanet[] {
  const stagger = inputs.length > 1
    ? Math.min(REVEAL_STAGGER_MS, MAX_REVEAL_SPAN_MS / (inputs.length - 1))
    : REVEAL_STAGGER_MS;

  return inputs.map((input, index) => {
    const radiusJitter = hash01(input.id, 1) * 0.9;
    const speedJitter = 0.55 + hash01(input.id, 2) * 0.7;
    const inclination = (hash01(input.id, 3) - 0.5) * 0.5;
    const startAngle = hash01(input.id, 4) * Math.PI * 2;
    const size = 0.34 + Math.min(1, Math.max(0, input.importance)) * 0.32 + Math.min(0.18, input.childCount * 0.02);
    const radius = BASE_RADIUS + Math.sqrt(index) * RADIUS_STEP + radiusJitter;
    return {
      ...input,
      orbitRadius: radius,
      // Kepler-ish: the further out, the slower. Deliberately very slow.
      orbitSpeed: (0.16 * speedJitter) / (1 + Math.sqrt(index) * 0.42),
      orbitInclination: inclination,
      startAngle,
      size,
      revealAt: instant ? 0 : SUN_SETTLE_MS + RING_DRAW_MS + index * stagger,
    };
  });
}

// The single source of truth for "where is this planet right now" — used both
// by the planet mesh and by the camera rig, so the camera can chase a target
// that is still moving instead of tweening to a stale position.
export function planetPositionAt(planet: OrbitPlanet, simMs: number, out: THREE.Vector3) {
  const seconds = Math.max(0, simMs - planet.revealAt) / 1000;
  const angle = planet.startAngle + seconds * planet.orbitSpeed;
  return out.set(
    Math.cos(angle) * planet.orbitRadius,
    Math.sin(angle) * planet.orbitRadius * planet.orbitInclination,
    Math.sin(angle) * planet.orbitRadius,
  );
}

export function overviewDistance(planets: OrbitPlanet[]) {
  const outermost = planets.reduce((maximum, planet) => Math.max(maximum, planet.orbitRadius), BASE_RADIUS);
  return Math.min(120, outermost * 1.9 + 6);
}
