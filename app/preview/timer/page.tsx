'use client';

// Dev-only harness for the focus timer: exercises start/stop and the "still
// counting after reload" behaviour without a Supabase session, by mocking the
// three /api/timer + createSession calls the store makes.
import { useEffect } from 'react';
import { api } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { FocusTaskControl } from '@/app/components/FocusTaskControl';

const USER_ID = 'preview-user';
// Backed by localStorage (a different key than the app's own cache) so this
// stand-in for the database survives an actual page reload — the same thing
// that makes the real /api/timer row durable across "closing the browser".
const MOCK_DB_KEY = 'lm.preview.mockActiveTimerRow';
type MockRow = { id: string; user_id: string; task_id: string | null; started_at: string; tasks: { title: string; topic_id: string } };
const readMockRow = (): MockRow | null => {
  try { return JSON.parse(window.localStorage.getItem(MOCK_DB_KEY) || 'null'); } catch { return null; }
};
const writeMockRow = (row: MockRow | null) => {
  if (row) window.localStorage.setItem(MOCK_DB_KEY, JSON.stringify(row));
  else window.localStorage.removeItem(MOCK_DB_KEY);
};

export default function TimerPreviewPage() {
  useEffect(() => {
    useAppStore.setState({ user: { id: USER_ID, username: 'preview' }, sessionReady: true });

    const original = { getActiveTimer: api.getActiveTimer, startTimer: api.startTimer, stopTimer: api.stopTimer, createSession: api.createSession };
    api.getActiveTimer = async () => readMockRow();
    api.startTimer = async (_userId, taskId) => {
      const row: MockRow = { id: 'mock', user_id: USER_ID, task_id: taskId, started_at: new Date().toISOString(), tasks: { title: taskId === 'task-a' ? 'Viết báo cáo' : 'Ôn tập IELTS', topic_id: 't1' } };
      writeMockRow(row);
      return row;
    };
    api.stopTimer = async () => { writeMockRow(null); return { success: true }; };
    api.createSession = async (input) => {
      console.log('createSession called with', input);
      return { id: 'session-mock', user_id: USER_ID, task_id: input.taskId, start_time: input.startTime, end_time: input.endTime, session_date: input.sessionDate, in_time_status: 'in_time', focused_minutes: input.focusedMinutes };
    };

    return () => { Object.assign(api, original); };
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Focus timer preview</h1>
      <p>Task A</p>
      <FocusTaskControl userId={USER_ID} taskId="task-a" taskTitle="Viết báo cáo" />
      <p style={{ marginTop: 16 }}>Task B</p>
      <FocusTaskControl userId={USER_ID} taskId="task-b" taskTitle="Ôn tập IELTS" />
      <p style={{ marginTop: 16, color: '#64748b' }}>The floating stopwatch (bottom-right) comes from the global widget mounted in app/layout.tsx.</p>
    </div>
  );
}
