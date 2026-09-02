'use client';

// Dev-only harness for the big focus-timer landing screen (the real / route),
// mocking auth + tasks + the timer API so the animation work can be checked
// without a Supabase session.
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
  { id: 'task-a', user_id: USER_ID, topic_id: 't1', title: 'Viết báo cáo tuần', status: 'not_completed' },
  { id: 'task-b', user_id: USER_ID, topic_id: 't1', title: 'Ôn tập IELTS Writing', status: 'not_completed' },
  { id: 'task-c', user_id: USER_ID, topic_id: 't2', title: 'Chạy bộ 5km', status: 'not_completed' },
  { id: 'task-d', user_id: USER_ID, topic_id: 't2', title: 'Đọc sách 30 phút', status: 'completed' },
];

export default function LandingPreviewPage() {
  useEffect(() => {
    useAppStore.setState({ user: { id: USER_ID, username: 'preview' }, sessionReady: true, sessionError: null });

    const original = { getActiveTimer: api.getActiveTimer, startTimer: api.startTimer, stopTimer: api.stopTimer, createSession: api.createSession, getTasks: api.getTasks };
    api.getTasks = async () => mockTasks;
    api.getActiveTimer = async () => readMockRow();
    api.startTimer = async (_userId, taskId) => {
      const task = mockTasks.find((t) => t.id === taskId);
      const row: MockRow = { id: 'mock', user_id: USER_ID, task_id: taskId, started_at: new Date().toISOString(), tasks: { title: task?.title || 'Task', topic_id: 't1' } };
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

  return <FocusTimerLanding />;
}
