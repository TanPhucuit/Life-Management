import * as THREE from 'three';

// UI-grade greens and reds read as neon against a starfield. Everything the
// scene draws goes through here so the whole view stays in one deep-space key:
// aurora green, ember red, ice blue.
export const COSMIC = {
  aurora: '#3fe0a8', // completed
  auroraDeep: '#0f9c74',
  ember: '#e2603f', // overdue / attention
  ice: '#8fb4ff', // neutral node
  signal: '#3f8dff', // tree connector, "energy" blue
  spark: '#dff0ff', // travelling pulse head
};

const auroraColor = new THREE.Color(COSMIC.aurora);
const signalColor = new THREE.Color(COSMIC.signal);

export const AURORA = auroraColor;
export const SIGNAL = signalColor;

// Rocky/gassy body tones: the topic palette keeps its identity (hue) but loses
// the poster-paint saturation, which is what made the bodies look like UI dots.
export function planetTones(accent: string) {
  const base = new THREE.Color(accent);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const low = new THREE.Color().setHSL(hsl.h, Math.min(0.42, hsl.s * 0.62), 0.16);
  const high = new THREE.Color().setHSL((hsl.h + 0.03) % 1, Math.min(0.5, hsl.s * 0.7), 0.46);
  return { low, high };
}
