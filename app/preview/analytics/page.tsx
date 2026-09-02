'use client';

// Dev-only harness cho biểu đồ Analytics: mock session để xem biểu đồ
// "Timer sessions" mà không cần dữ liệu thật trên Supabase. Có sẵn một phiên
// kéo dài nhiều ngày (đúng tình huống 100 giờ từ ngày 2 đến ngày 6) để kiểm
// tra nó vẽ ra đoạn NẰM NGANG chứ không phải cột dựng đứng.
import { useEffect } from 'react';
import { api, ApiDate, ApiSession } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import Analytics from '@/app/components/Analytics';

const USER_ID = 'preview-user';
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (day: number, hour: number, minute = 0) =>
  `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;

const mockSessions: ApiSession[] = [
  // Phiên dài 100 giờ, từ ngày 2 tới ngày 6.
  { id: 's1', user_id: USER_ID, task_id: null, start_time: stamp(2, 8), end_time: stamp(6, 12), session_date: `${year}-${pad(month)}-02`, in_time_status: 'in_time', focused_minutes: 100 * 60 },
  { id: 's2', user_id: USER_ID, task_id: null, start_time: stamp(8, 9), end_time: stamp(8, 11, 30), session_date: `${year}-${pad(month)}-08`, in_time_status: 'in_time', focused_minutes: 150 },
  { id: 's3', user_id: USER_ID, task_id: 'task-a', start_time: stamp(12, 14), end_time: stamp(13, 2), session_date: `${year}-${pad(month)}-12`, in_time_status: 'in_time', focused_minutes: 12 * 60 },
  { id: 's4', user_id: USER_ID, task_id: null, start_time: stamp(15, 20), end_time: stamp(15, 20, 45), session_date: `${year}-${pad(month)}-15`, in_time_status: 'in_time', focused_minutes: 45 },
];

const mockDates: ApiDate[] = [];

export default function AnalyticsPreviewPage() {
  useEffect(() => {
    useAppStore.setState({
      user: { id: USER_ID, username: 'preview' },
      sessionReady: true,
      sessionError: null,
      currentMonth: month,
      currentYear: year,
    });

    const original = { getSessions: api.getSessions, getDates: api.getDates, getCycleTicks: api.getCycleTicks };
    api.getSessions = async () => mockSessions;
    api.getDates = async () => mockDates;
    api.getCycleTicks = async () => [];
    return () => { Object.assign(api, original); };
  }, []);

  return <Analytics />;
}
