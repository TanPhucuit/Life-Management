export type OrbitPlanetStatus = 'not_completed' | 'in_progress' | 'completed';

export type OrbitPlanetInput = {
  id: string;
  title: string;
  status: OrbitPlanetStatus;
  importance: number; // 0..1, drives planet size
  childCount: number;
};

export type OrbitPlanet = OrbitPlanetInput & {
  orbitRadius: number;
  orbitSpeed: number;
  orbitInclination: number;
  startAngle: number;
  size: number;
  revealAt: number; // ms, relative to scene mount
};
