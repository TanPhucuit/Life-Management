'use client';

// Dev-only harness riêng cho việc kiểm chứng khung "phóng đại tối đa" của
// biểu đồ Timer sessions: 20 ngày LIÊN TIẾP đều có phiên, kết thúc ở ngày 20.
// Đây đúng là tình huống bug cũ — càng nhiều ngày liên tiếp có dữ liệu, quy
// tắc "phải chứa trọn phiên liền trước" càng kéo khung zoom rộng ra, tới mức
// phóng đại không khác gì xem cả tháng. Khung cố định 5 ngày phải luôn hẹp
// đúng 5 ngày bất kể có bao nhiêu ngày phía sau nó cũng có dữ liệu.
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

// Một phiên 1 tiếng mỗi ngày, từ ngày 1 tới ngày 20 — không có phiên nào đang
// chạy, nên "mép phải" của khung zoom bám theo phiên cuối cùng (ngày 20), y
// hệt trường hợp xem lại một tháng đã học đều đặn rồi dừng.
const mockSessions: ApiSession[] = Array.from({ length: 20 }, (_, index) => {
  const day = index + 1;
  return {
    id: `d${day}`,
    user_id: USER_ID,
    task_id: null,
    start_time: stamp(day, 9),
    end_time: stamp(day, 10),
    session_date: `${year}-${pad(month)}-${pad(day)}`,
    in_time_status: 'in_time',
    focused_minutes: 60,
  } satisfies ApiSession;
});

const mockDates: ApiDate[] = Array.from({ length: 20 }, (_, index) => ({
  id: `date${index + 1}`,
  user_id: USER_ID,
  month_id: 'm',
  day: index + 1,
  month,
  year,
  focused_minutes: 60,
  holy_mind_minutes: 0,
  key_of_success: 1,
})) as ApiDate[];

export default function AnalyticsZoomPreviewPage() {
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
