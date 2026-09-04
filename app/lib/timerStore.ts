'use client';

import { create } from 'zustand';
import { api, ApiActiveTimer } from '@/app/lib/api';

// A running focus timer, anchored to a real instant (startedAtMs, straight off
// the server's timestamptz). Elapsed time is ALWAYS `Date.now() - startedAtMs`
// — never accumulated tick by tick — so it is exactly right the instant the
// page loads, whether that's one second or three days after Start was pressed,
// and however long the browser was closed in between.
//
// `taskId` is null for time that simply is not part of any task. Forcing every
// session to name one made people attach unrelated hours to whichever task
// happened to be selected, which is worse than recording no task at all.
export type FocusTimer = {
  id: string;
  taskId: string | null;
  taskTitle: string;
  startedAtMs: number;
};

interface TimerStore {
  timer: FocusTimer | null;
  ready: boolean;
  /** True while a start/stop is in flight, so the button can't fire twice. */
  busy: boolean;
  /**
   * Tăng lên MỖI KHI một phiên vừa được ghi thành công xuống database.
   *
   * Màn hình nào đang vẽ danh sách phiên (biểu đồ Timer sessions) thì lấy số
   * này làm phụ thuộc để nạp lại. Không thể chỉ dựa vào `timer` chuyển sang
   * null: stop() xoá timer NGAY rồi mới gọi createSession, nên nạp lại theo
   * mốc đó sẽ chạy trước lúc dòng dữ liệu kịp được ghi và đọc về đúng bản cũ
   * — phiên vừa kết thúc biến mất khỏi biểu đồ cho tới khi tải lại trang.
   */
  savedSessions: number;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  start: (userId: string, taskId: string | null, taskTitle: string) => Promise<void>;
  stop: (userId: string) => Promise<void>;
}

const cacheKey = (userId: string) => `lm.focusTimer.${userId}`;

const readCache = (userId: string): FocusTimer | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.startedAtMs === 'number' ? parsed : null;
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

const UNASSIGNED_LABEL = 'Không thuộc task nào';

const fromApi = (row: ApiActiveTimer): FocusTimer => ({
  id: row.id,
  taskId: row.task_id ?? null,
  taskTitle: row.tasks?.title || (row.task_id ? 'Task' : UNASSIGNED_LABEL),
  startedAtMs: new Date(row.started_at).getTime(),
});

// Naive local "YYYY-MM-DDTHH:MM:SS", matching the convention every other
// timestamp in this app already uses for tasks/sessions (no timezone math —
// just whatever the wall clock in front of the user says).
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
const toLocalDate = (date: Date) => toLocalStamp(date).slice(0, 10);

// Bumped by every start/stop. `hydrate` captures it before its network call and
// throws its own result away if the number moved while it was waiting.
//
// Without this, pressing Stop appeared to do nothing and needed a second press:
// stop() clears the timer locally and only then deletes the server row, so a
// hydrate racing it (the widget re-hydrates on window focus and on
// visibilitychange, and both the landing page and the widget hydrate on mount)
// would read the row that still existed and put the running timer straight
// back. The same race in reverse swallowed Start. Worse, the second press then
// wrote a DUPLICATE session for time already saved.
let mutationSeq = 0;

export const useFocusTimerStore = create<TimerStore>((set, get) => ({
  timer: null,
  ready: false,
  busy: false,
  savedSessions: 0,
  error: null,

  // Paints instantly from the local cache (so reopening the tab shows the
  // counter before the network round-trip lands), then reconciles against the
  // server — the real source of truth, since another tab or device may have
  // started or stopped it since this cache was written.
  hydrate: async (userId) => {
    if (get().busy) return;
    const seq = mutationSeq;
    const cached = readCache(userId);
    if (cached) set({ timer: cached });
    try {
      const row = await api.getActiveTimer(userId);
      if (seq !== mutationSeq) return; // a start/stop won the race; it is newer
      const timer = row ? fromApi(row) : null;
      set({ timer, ready: true, error: null });
      writeCache(userId, timer);
    } catch (error) {
      if (seq !== mutationSeq) return;
      set({ ready: true, error: error instanceof Error ? error.message : 'Could not reach the timer.' });
    }
  },

  start: async (userId, taskId, taskTitle) => {
    if (get().busy) return;
    mutationSeq += 1;
    set({ busy: true, error: null });
    try {
      const current = get().timer;
      if (current && current.taskId === taskId) return; // already counting this
      if (current) await get().stop(userId);
      const row = await api.startTimer(userId, taskId);
      mutationSeq += 1;
      const timer = fromApi(row);
      // Prefer the caller's title — it just clicked Start from a component that
      // already holds the live task object, so this avoids a stale-title flash.
      timer.taskTitle = taskTitle || timer.taskTitle;
      set({ timer, ready: true, error: null });
      writeCache(userId, timer);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không bắt đầu được bộ đếm.' });
    } finally {
      set({ busy: false });
    }
  },

  // Clears the running state immediately (the user pressed Stop, so as far as
  // the UI is concerned it IS stopped), then writes the session and clears the
  // server row in the background. The session write happens before the row is
  // deleted so a failed delete can never lose the time that was just counted.
  stop: async (userId) => {
    const alreadyBusy = get().busy;
    const current = get().timer;
    if (!current) return;
    mutationSeq += 1;
    if (!alreadyBusy) set({ busy: true });
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
      // Chỉ tăng SAU khi dòng phiên đã ghi xong: đây chính là tín hiệu để các
      // màn hình đang hiển thị danh sách phiên nạp lại và thấy phiên vừa xong.
      set({ savedSessions: get().savedSessions + 1 });
      await api.stopTimer(userId);
      mutationSeq += 1;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không lưu được phiên tập trung.' });
    } finally {
      if (!alreadyBusy) set({ busy: false });
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
