'use client';

// Dev-only harness for FocusTimerLanding: reproduces the exact page reported
// as broken ("nút Chạy không nhấn được") without depending on /api/auth or a
// real Supabase session, by mocking the same calls the preview timer harness
// already mocks, plus getTasks.
import { useEffect } from 'react';
import { api, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import FocusTimerLanding from '@/app/components/FocusTimerLanding';

const USER_ID = 'preview-user';
const MOCK_DB_KEY = 'lm.preview.mockActiveTimerRow';
type MockRow = { id: string; user_id: string; task_id: string | null; started_at: string; tasks: { title: string; topic_id: string } };
const readMockRow = (): MockRow | null => {
  try { return JSON.parse(window.localStorage.getItem(MOCK_DB_KEY) || 'null'); } catch { return null; }
};
const writeMockRow = (row: MockRow | null) => {
  if (row) window.localStorage.setItem(MOCK_DB_KEY, JSON.stringify(row));
  else window.localStorage.removeItem(MOCK_DB_KEY);
};

const mockTasks: ApiTask[] = [
  { id: 't1', title: '1 task everyday', status: 'in_progress', effective_status: 'in_progress' } as ApiTask,
  { id: 't2', title: '12 tool', status: 'in_progress', effective_status: 'in_progress' } as ApiTask,
  { id: 't3', title: '15 days practice', status: 'in_progress', effective_status: 'in_progress' } as ApiTask,
];

export default function TimerLandingPreviewPage() {
  useEffect(() => {
    useAppStore.setState({ user: { id: USER_ID, username: 'preview' }, sessionReady: true, sessionError: null });

    const original = { getActiveTimer: api.getActiveTimer, startTimer: api.startTimer, stopTimer: api.stopTimer, createSession: api.createSession, getTasks: api.getTasks };
    api.getActiveTimer = async () => readMockRow();
    api.startTimer = async (_userId, taskId) => {
      const row: MockRow = { id: 'mock', user_id: USER_ID, task_id: taskId, started_at: new Date().toISOString(), tasks: { title: 'Mock task', topic_id: 't1' } };
      writeMockRow(row);
      return row;
    };
    api.stopTimer = async () => { writeMockRow(null); return { success: true }; };
    api.createSession = async (input) => {
      console.log('createSession called with', input);
      return { id: 'session-mock', user_id: USER_ID, task_id: input.taskId, start_time: input.startTime, end_time: input.endTime, session_date: input.sessionDate, in_time_status: 'in_time', focused_minutes: input.focusedMinutes };
    };
    api.getTasks = async () => mockTasks;

    return () => { Object.assign(api, original); };
  }, []);

  return <FocusTimerLanding />;
}
