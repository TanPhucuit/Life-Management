'use client';

// Standalone calendar events — the "event, not a task" the user can create from
// the right-click menu. The tasks table has no place for a topic-less entry and
// there is no events table yet, so these live in the browser keyed by user. When
// an `events` table is added later, swap this module's four functions for API
// calls and nothing else in the calendar has to change.
export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive)
  color: string; // hex
  done: boolean;
  note?: string;
};

const keyFor = (userId: string) => `lm.calendar.events.${userId}`;

export function loadEvents(userId: string): CalendarEvent[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveEvents(userId: string, events: CalendarEvent[]) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(events));
  } catch {
    /* storage full or blocked — events are best-effort until a table exists */
  }
}

export function newEventId() {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
