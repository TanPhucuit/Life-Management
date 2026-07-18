import type { SceneMode } from './types'

export interface ScenePalette {
  primary: string
  secondary: string
  accent: string
  atmosphere: string
}
const PALETTES: Record<SceneMode, ScenePalette> = {
  login: {
    primary: '#65d9ff',
    secondary: '#7b61ff',
    accent: '#e2f7ff',
    atmosphere: '#071426',
  },
  today: {
    primary: '#65e5ff',
    secondary: '#8567ff',
    accent: '#67f5bd',
    atmosphere: '#071422',
  },
  plan: {
    primary: '#68c7ff',
    secondary: '#7367ff',
    accent: '#c885ff',
    atmosphere: '#081327',
  },
  spaces: {
    primary: '#b67cff',
    secondary: '#5b7dff',
    accent: '#58efd2',
    atmosphere: '#100d2a',
  },
  focus: {
    primary: '#5cf4ca',
    secondary: '#36a7ff',
    accent: '#d8ff82',
    atmosphere: '#051b21',
  },
  ielts: {
    primary: '#ee7cff',
    secondary: '#6a7cff',
    accent: '#64e4ff',
    atmosphere: '#160d2b',
  },
  insights: {
    primary: '#ffbd6d',
    secondary: '#986dff',
    accent: '#5de8ff',
    atmosphere: '#171023',
  },
  settings: {
    primary: '#7fdaff',
    secondary: '#7890b7',
    accent: '#a6ffe5',
    atmosphere: '#0b1622',
  },
}

export function getScenePalette(mode: SceneMode): ScenePalette {
  return PALETTES[mode]
}

export function sceneModeIndex(mode: SceneMode): number {
  const modes: readonly SceneMode[] = [
    'login',
    'today',
    'plan',
    'spaces',
    'focus',
    'ielts',
    'insights',
    'settings',
  ]
  return modes.indexOf(mode)
}
