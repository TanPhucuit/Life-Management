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

const prevMonth = month === 1 ? 12 : month - 1;
const prevYear = month === 1 ? year - 1 : year;

const mockSessions: ApiSession[] = [
  // Phiên của THÁNG TRƯỚC: không được xuất hiện trên biểu đồ tháng này.
  { id: 's0', user_id: USER_ID, task_id: null, start_time: `${prevYear}-${pad(prevMonth)}-28T08:00:00`, end_time: `${prevYear}-${pad(prevMonth)}-30T08:00:00`, session_date: `${prevYear}-${pad(prevMonth)}-28`, in_time_status: 'in_time', focused_minutes: 48 * 60 },
  // Phiên dài 100 giờ, từ ngày 2 tới ngày 6.
  { id: 's1', user_id: USER_ID, task_id: null, start_time: stamp(2, 8), end_time: stamp(6, 12), session_date: `${year}-${pad(month)}-02`, in_time_status: 'in_time', focused_minutes: 100 * 60 },
  { id: 's2', user_id: USER_ID, task_id: null, start_time: stamp(8, 9), end_time: stamp(8, 11, 30), session_date: `${year}-${pad(month)}-08`, in_time_status: 'in_time', focused_minutes: 150 },
  { id: 's3', user_id: USER_ID, task_id: 'task-a', start_time: stamp(12, 14), end_time: stamp(13, 2), session_date: `${year}-${pad(month)}-12`, in_time_status: 'in_time', focused_minutes: 12 * 60 },
  { id: 's4', user_id: USER_ID, task_id: null, start_time: stamp(15, 20), end_time: stamp(15, 20, 45), session_date: `${year}-${pad(month)}-15`, in_time_status: 'in_time', focused_minutes: 45 },
  // Bản ghi TRÙNG của phiên s1 (lỗi bấm hai lần cũ để lại): cùng giây bắt đầu,
  // lệch vài giây ở lúc kết thúc. Chỉ được vẽ MỘT đường, và không được cộng đôi.
  { id: 's1b', user_id: USER_ID, task_id: null, start_time: stamp(2, 8), end_time: stamp(6, 12), session_date: `${year}-${pad(month)}-02`, in_time_status: 'in_time', focused_minutes: 100 * 60 - 1 },
];

// Giờ học theo ngày cho biểu đồ "Cumulative study time". Dựng sẵn hai tình
// huống mà biểu đồ phải xử lý khác nhau:
//   - Ngày 3 trống, NẰM GIỮA ngày 2 và ngày 4 đều có dữ liệu → nối bằng một
//     đoạn nét đứt thẳng từ tổng của ngày 2 tới tổng của ngày 4.
//   - Ngày 5 (hôm nay, nếu tháng đang xem là tháng này) không có dữ liệu và
//     không còn ngày có dữ liệu nào phía sau → đường phải DỪNG ở ngày 4, không
//     kéo một vệt phẳng tới hôm nay.
const mockDates: ApiDate[] = [
  { id: 'd1', user_id: USER_ID, month_id: 'm', day: 1, month, year, focused_minutes: 120, holy_mind_minutes: 0, key_of_success: 1 },
  // Ngày 2 chỉ có 30 phút focus, nhưng cũng là ngày một phiên timer 100 giờ bắt
  // đầu. Cột "Daily study hours" của ngày này phải là 0.5h, không phải 100.5h.
  { id: 'd2', user_id: USER_ID, month_id: 'm', day: 2, month, year, focused_minutes: 30, holy_mind_minutes: 0, key_of_success: 0 },
  { id: 'd4', user_id: USER_ID, month_id: 'm', day: 4, month, year, focused_minutes: 180, holy_mind_minutes: 0, key_of_success: 0 },
] as ApiDate[];

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
