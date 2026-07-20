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

const BASE_RADIUS = 4.2;
const RADIUS_STEP = 1.65;
const REVEAL_STAGGER_MS = 620;
const SUN_SETTLE_MS = 900;

export function layoutPlanets(inputs: OrbitPlanetInput[]): OrbitPlanet[] {
  return inputs.map((input, index) => {
    const radiusJitter = hash01(input.id, 1) * 0.9;
    const speedJitter = 0.55 + hash01(input.id, 2) * 0.7;
    const inclination = (hash01(input.id, 3) - 0.5) * 0.5;
    const startAngle = hash01(input.id, 4) * Math.PI * 2;
    const size = 0.34 + Math.min(1, Math.max(0, input.importance)) * 0.3 + Math.min(0.18, input.childCount * 0.02);
    return {
      ...input,
      orbitRadius: BASE_RADIUS + index * RADIUS_STEP + radiusJitter,
      orbitSpeed: (0.12 * speedJitter) / (1 + index * 0.18),
      orbitInclination: inclination,
      startAngle,
      size,
      revealAt: SUN_SETTLE_MS + index * REVEAL_STAGGER_MS,
    };
  });
}
