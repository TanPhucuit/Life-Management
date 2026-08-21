// The Google Calendar event palette. Stored on a task as a hex string in
// task_color (VARCHAR(20) — a #RRGGBB fits), so a task keeps its own colour
// independent of its topic. A completed task is always shown green regardless.
export type CalendarColor = { name: string; label: string; hex: string };

export const CALENDAR_COLORS: CalendarColor[] = [
  { name: 'tomato', label: 'Cà chua', hex: '#d50000' },
  { name: 'flamingo', label: 'Hồng đất', hex: '#e67c73' },
  { name: 'tangerine', label: 'Cam', hex: '#f4511e' },
  { name: 'banana', label: 'Vàng', hex: '#f6bf26' },
  { name: 'sage', label: 'Xanh rêu', hex: '#33b679' },
  { name: 'basil', label: 'Húng quế', hex: '#0b8043' },
  { name: 'peacock', label: 'Công', hex: '#039be5' },
  { name: 'blueberry', label: 'Việt quất', hex: '#3f51b5' },
  { name: 'lavender', label: 'Oải hương', hex: '#7986cb' },
  { name: 'grape', label: 'Nho', hex: '#8e24aa' },
  { name: 'graphite', label: 'Than chì', hex: '#616161' },
];

// The one non-negotiable colour: a done task turns Google green.
export const CALENDAR_DONE_HEX = '#34a853';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function resolveCalendarColor(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (HEX.test(raw)) return raw;
  const named = CALENDAR_COLORS.find((color) => color.name === raw);
  return named ? named.hex : fallback;
}

// A readable text colour for a filled chip of the given background.
export function contrastText(hex: string): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1f2937' : '#ffffff';
}
