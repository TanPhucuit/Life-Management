import type { MutableRefObject } from 'react';

export type OrbitPlanetStatus = 'not_completed' | 'in_progress' | 'completed';

export type OrbitPlanetInput = {
  id: string;
  title: string;
  status: OrbitPlanetStatus;
  importance: number; // 0..1, drives planet size
  childCount: number;
  accent: string; // category colour, taken from the shared topic palette
  completion: number; // 0..1, leaf completion of the whole branch
};

export type OrbitPlanet = OrbitPlanetInput & {
  orbitRadius: number;
  orbitSpeed: number;
  orbitInclination: number;
  startAngle: number;
  size: number;
  revealAt: number; // ms on the simulation clock, relative to scene mount
};

// One simulation clock shared by every moving object in the scene. It lives in
// a ref (never React state) so orbit motion, ring reveal and the camera rig all
// read the SAME time without re-rendering React 60 times a second.
export type OrbitClock = { ms: number; speed: number };
export type OrbitClockRef = MutableRefObject<OrbitClock>;
