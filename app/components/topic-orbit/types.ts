import type { MutableRefObject } from 'react';

export type OrbitPlanetStatus = 'not_completed' | 'in_progress' | 'completed';

export type OrbitPlanetInput = {
  id: string;
  title: string;
  status: OrbitPlanetStatus;
  importance: number; // 0..1, drives body size
  childCount: number;
  accent: string; // category colour, from the shared topic palette
  completion: number; // 0..1, leaf completion of the whole branch
  // Needs attention now: the deadline is today or already past, and the work
  // is unfinished. Overrides the status colour everywhere in the scene — it is
  // the one thing worth spotting first.
  urgent: boolean;
};

// A task orbiting inside the accretion disk. There are no per-task rings any
// more: every body rides the SAME disk, only radius/speed/tilt differ.
export type DiskBody = OrbitPlanetInput & {
  radius: number;
  angularSpeed: number;
  height: number; // small vertical offset, the "slight inclination"
  startAngle: number;
  size: number;
  revealAt: number; // ms on the simulation clock
};

// How hard the scene is allowed to push. 'ultra' is chosen deliberately by the
// user in Settings and is never reduced automatically.
export type SceneQuality = 'ultra' | 'high' | 'low';

export type DiskGeometry = {
  innerRadius: number;
  outerRadius: number;
  horizonRadius: number;
};

// One simulation clock shared by everything that moves. It lives in a ref
// (never React state) so the disk, the bodies and the camera rig all read the
// SAME time without re-rendering React 60 times a second.
export type OrbitClock = { ms: number; speed: number };
export type OrbitClockRef = MutableRefObject<OrbitClock>;

// ---- Knowledge tree (grown in-scene, next to a body) -----------------------

export type TreeTaskInput = {
  id: string;
  parentId: string | null;
  title: string;
  done: boolean;
  isLeaf: boolean;
  // Same rule as OrbitPlanetInput.urgent, applied at every depth of the tree.
  urgent: boolean;
};

export type TreeLayoutNode = TreeTaskInput & {
  depth: number;
  position: [number, number, number];
  // Timeline, in ms from the moment the tree starts growing.
  growAt: number;
  completeAt: number;
};

// An edge carries no timing of its own: it always belongs to exactly one child,
// so it is drawn from that child's reveal time. That is what lets a subtree be
// collapsed and re-grown later without recomputing the layout.
export type TreeLayoutEdge = {
  id: string;
  fromId: string;
  toId: string;
  from: [number, number, number];
  to: [number, number, number];
};

export type TreeLayout = {
  nodes: TreeLayoutNode[];
  edges: TreeLayoutEdge[];
  growthEndsAt: number;
  completionEndsAt: number;
  reach: number; // furthest node distance, used to frame the camera
};
