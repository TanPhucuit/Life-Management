// Each theme is a different astrophysical system, not a colour swap: a
// different central object, a different way the old system is destroyed and a
// different way the new one is born. Everything that differs between them is
// declared here so the scene can stay one scene.
export type OrbitTheme = 'black_hole' | 'binary_star' | 'neutron_star';

export type ThemeConfig = {
  id: OrbitTheme;
  label: string;
  // How the previous system is taken apart when the topic changes.
  destruction: 'spiral_infall' | 'shockwave' | 'magnetar_burst';
  // Total length of the destruction beat.
  destroyMs: number;
  // Does the central object drag a luminous accretion disk with it?
  disk: boolean;
  // Draw a visible orbit ring per task? The disk itself is the "ring" in black
  // hole mode; the other two need real rings or the system reads as a scatter.
  rings: boolean;
  // Inner edge of the band the tasks orbit in, in world units. A star or a
  // magnetar has to be given room — tasks must not skim its surface.
  bandStart: number;
  // How large the task bodies read against that band. The black hole's tasks
  // ride the accretion disk itself and are already sized against it; the two
  // stellar themes push their band much further out to clear the central
  // object, which leaves the same body looking small in all that space.
  bodyScale: number;
  // Fraction of destroyMs at which the destructive wave is released. Camera
  // shake and planet break-up both key off this.
  waveAt: number;
  // Fraction of destroyMs the wave needs to cross the full system reach.
  // MUST match the on-screen speed of the wave shell, or planets shatter
  // before/after the wave visibly reaches them. 0 for tidal themes (no wave).
  waveTravel: number;
  // How the front's arrival time scales with distance. 1 is a constant-speed
  // front; higher values are a DECELERATING one, where time goes as
  // radius^waveDecel. Must be the reciprocal of the exponent the shell's own
  // radius uses, or the two drift apart.
  waveDecel?: number;
  // Binary only: resting distance between the two stars, in units of
  // bandStart. They hold this gap while the universe is stable and only close
  // it during a topic change.
  starSeparation?: number;
  // Does the destructive front arrive edge-on in the orbital plane and cut
  // each planet in half before it breaks up? True for the magnetar, whose
  // burst is channelled into the equatorial plane as a flat disc; false for a
  // spherical shockwave, which simply engulfs a planet from all sides.
  burstSplits?: boolean;
  // The camera's own reaction: a hole pulls you back, a magnetar draws you in.
  dolly: 'back' | 'in';
  craneDegrees: number;
  hint: string;
};

export const THEMES: Record<OrbitTheme, ThemeConfig> = {
  black_hole: {
    id: 'black_hole',
    label: 'Black hole',
    destruction: 'spiral_infall',
    destroyMs: 4200,
    disk: true,
    rings: false,
    bandStart: 3.9,
    bodyScale: 1,
    waveAt: 0,
    waveTravel: 0,
    dolly: 'back',
    craneDegrees: 20,
    hint: 'Tasks ride one accretion disk; a topic change is a tidal disruption event.',
  },
  binary_star: {
    id: 'binary_star',
    label: 'Binary star',
    destruction: 'shockwave',
    // Long, because the inspiral is the story: the pair has to be seen turning
    // slowly, then winding up, then touching and shearing into two molten
    // streams — and only after all of that does anything detonate.
    destroyMs: 9000,
    disk: false,
    rings: true,
    // The pair needs room: the stars are deliberately large against the tasks,
    // and their orbit has to clear the innermost task band by a wide margin.
    bandStart: 12,
    bodyScale: 1.3,
    // 55% of the beat — nearly five seconds — is inspiral and contact before
    // anything detonates. The pair turning around each other IS the sequence;
    // the blast is its punctuation.
    waveAt: 0.55,
    waveTravel: 0.16,
    starSeparation: 1.2,
    dolly: 'back',
    craneDegrees: 26,
    hint: 'Two stars around a barycentre; a topic change is a stellar merger.',
  },
  neutron_star: {
    id: 'neutron_star',
    label: 'Neutron star',
    destruction: 'magnetar_burst',
    // Holds the pulsar's phase durations (see computePulsarPhase): 800ms
    // magnetic instability, 1200ms energy accumulation, then a long
    // reconnection during which the star winds up to its most violent — and
    // after the burst, close to three seconds for each planet to be cut open,
    // come apart and disperse.
    destroyMs: 8600,
    disk: false,
    rings: true,
    // Spec: star radius ~1 unit, planet orbits 15-40. That ratio is what makes
    // the neutron star read as something impossibly dense.
    bandStart: 15,
    bodyScale: 1.95,
    // P3_RECONNECTION_MS / destroyMs — the moment the pulse is released.
    waveAt: 0.4186,
    // Must equal NeutronStar's PULSE_TRAVEL_FRACTION, and waveDecel must be
    // the inverse of its PULSE_RADIUS_EXP, or the visible front and the planet
    // break-ups come apart.
    waveTravel: 0.22,
    // Sedov-Taylor deceleration: the front covers r in t proportional to
    // r^(5/2), so the inner planets are reached almost at once and the outer
    // ones much, much later.
    waveDecel: 2.5,
    burstSplits: true,
    dolly: 'in',
    craneDegrees: 10,
    hint: 'A pulsar with magnetic ribbons and polar jets; a topic change is a magnetar burst.',
  },
};

export const THEME_LIST = Object.values(THEMES);

// Phase 8 — Topic Identity Shift. The central object keeps its OLD name for
// the whole destruction beat; the dissolve only starts at the very end, runs
// through the silence, and the commit then remounts the label with the new
// title condensing in. CSS animations run on wall time, so the dev slow-motion
// scale has to stretch the delay identically to the sim clock.
export function labelDissolveDelayMs(destroyMs: number) {
  const timeScale = typeof window !== 'undefined'
    ? Number((window as Window & { __ORBIT_TIME_SCALE__?: number }).__ORBIT_TIME_SCALE__ ?? 1) || 1
    : 1;
  return (destroyMs * 0.92) / timeScale;
}
