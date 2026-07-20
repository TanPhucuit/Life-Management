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
  // Fraction of destroyMs at which the destructive wave is released. Camera
  // shake and planet break-up both key off this.
  waveAt: number;
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
    waveAt: 0,
    dolly: 'back',
    craneDegrees: 20,
    hint: 'Tasks ride one accretion disk; a topic change is a tidal disruption event.',
  },
  binary_star: {
    id: 'binary_star',
    label: 'Binary star',
    destruction: 'shockwave',
    destroyMs: 4600,
    disk: false,
    rings: true,
    bandStart: 9.5,
    waveAt: 0.55,
    dolly: 'back',
    craneDegrees: 26,
    hint: 'Two stars around a barycentre; a topic change is a stellar merger.',
  },
  neutron_star: {
    id: 'neutron_star',
    label: 'Neutron star',
    destruction: 'magnetar_burst',
    destroyMs: 4000,
    disk: false,
    rings: true,
    bandStart: 8.0,
    waveAt: 0.4,
    dolly: 'in',
    craneDegrees: 10,
    hint: 'A magnetar with polar jets; a topic change is an electromagnetic burst.',
  },
};

export const THEME_LIST = Object.values(THEMES);
