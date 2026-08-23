'use client';

import { create } from 'zustand';
import { api, ApiActiveTimer } from '@/app/lib/api';

// A running focus timer, anchored to a real instant (startedAtMs, straight off
// the server's timestamptz). Elapsed time is ALWAYS `Date.now() - startedAtMs`
// — never accumulated tick by tick — so it is exactly right the instant the
// page loads, whether that's one second or three days after Start was pressed,
// and however long the browser was closed in between.
export type FocusTimer = {
  id: string;
  taskId: string;
  taskTitle: string;
  startedAtMs: number;
};

interface TimerStore {
  timer: FocusTimer | null;
  ready: boolean;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  start: (userId: string, taskId: string, taskTitle: string) => Promise<void>;
  stop: (userId: string) => Promise<void>;
}

const cacheKey = (userId: string) => `lm.focusTimer.${userId}`;

const readCache = (userId: string): FocusTimer | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.startedAtMs === 'number' && parsed.taskId ? parsed : null;
  } catch {
    return null;
  }
};
const writeCache = (userId: string, timer: FocusTimer | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (timer) window.localStorage.setItem(cacheKey(userId), JSON.stringify(timer));
    else window.localStorage.removeItem(cacheKey(userId));
  } catch {
    /* storage full or blocked — the server row stays the source of truth */
  }
};

const fromApi = (row: ApiActiveTimer): FocusTimer => ({
  id: row.id,
  taskId: row.task_id,
  taskTitle: row.tasks?.title || 'Task',
  startedAtMs: new Date(row.started_at).getTime(),
});

// Naive local "YYYY-MM-DDTHH:MM:SS", matching the convention every other
// timestamp in this app already uses for tasks/sessions (no timezone math —
// just whatever the wall clock in front of the user says).
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
const toLocalDate = (date: Date) => toLocalStamp(date).slice(0, 10);

export const useFocusTimerStore = create<TimerStore>((set, get) => ({
  timer: null,
  ready: false,
  error: null,

  // Paints instantly from the local cache (so reopening the tab shows the
  // counter before the network round-trip lands), then reconciles against the
  // server — the real source of truth, since another tab or device may have
  // started or stopped it since this cache was written.
  hydrate: async (userId) => {
    const cached = readCache(userId);
    if (cached) set({ timer: cached });
    try {
      const row = await api.getActiveTimer(userId);
      const timer = row ? fromApi(row) : null;
      set({ timer, ready: true, error: null });
      writeCache(userId, timer);
    } catch (error) {
      set({ ready: true, error: error instanceof Error ? error.message : 'Could not reach the timer.' });
    }
  },

  start: async (userId, taskId, taskTitle) => {
    const current = get().timer;
    if (current?.taskId === taskId) return; // already counting this task
    if (current) await get().stop(userId);
    const row = await api.startTimer(userId, taskId);
    const timer = fromApi(row);
    // Prefer the caller's title — it just clicked Start from a component that
    // already holds the live task object, so this avoids a stale-title flash.
    timer.taskTitle = taskTitle || timer.taskTitle;
    set({ timer, error: null });
    writeCache(userId, timer);
  },

  // Clears the running state immediately (the user pressed Stop, so as far as
  // the UI is concerned it IS stopped), then writes the session and clears the
  // server row in the background. The session write happens before the row is
  // deleted so a failed delete can never lose the time that was just counted.
  stop: async (userId) => {
    const current = get().timer;
    if (!current) return;
    const now = new Date();
    const elapsedMs = now.getTime() - current.startedAtMs;
    set({ timer: null });
    writeCache(userId, null);
    try {
      const startDate = new Date(current.startedAtMs);
      await api.createSession({
        userId,
        taskId: current.taskId,
        startTime: toLocalStamp(startDate),
        endTime: toLocalStamp(now),
        sessionDate: toLocalDate(startDate),
        focusedMinutes: Math.max(1, Math.round(elapsedMs / 60000)),
      });
      await api.stopTimer(userId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not save the focus session.' });
    }
  },
}));

export function formatStopwatch(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
