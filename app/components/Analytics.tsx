'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { api, ApiDate, ApiSession } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { useFocusTimerStore } from '@/app/lib/timerStore';

type AnalyticsView = 'month_overview' | 'week_daily' | 'weekly_progress' | 'key_of_success' | 'cycle_ticks';
type ChartPoint = { name: string; value: number | null };

/**
 * Một mốc của biểu đồ "Cumulative study time".
 *
 * Hai chuỗi thay vì một, để phân biệt bằng mắt hai chuyện khác hẳn nhau:
 *   - `value`  — ngày CÓ dữ liệu, vẽ nét liền.
 *   - `gap`    — quãng ngày trống nằm giữa hai ngày có dữ liệu, vẽ nét đứt.
 * Ngày trống ở cuối (hôm nay chưa học, hoặc ngày trong tương lai) không thuộc
 * chuỗi nào nên đường dừng hẳn lại — chứ không kéo một vệt phẳng tới đó.
 */
type WeeklyProgressPoint = ChartPoint & { gap?: number | null };

/**
 * Dựng chuỗi mốc cho các biểu đồ cộng dồn giờ học ("Cumulative study time" của
 * tuần và của cả tháng). Cả hai vẽ y hệt nhau, chỉ khác phạm vi ngày, nên dùng
 * chung một hàm — tách đôi thì sớm muộn hai biểu đồ cũng lệch nhau.
 *
 * `anchorLabel` là mốc 0 giờ đứng trước ngày đầu tiên. Thiếu nó thì ngày đầu
 * kỳ đã nằm sẵn ở tổng của chính nó và đường mất luôn đoạn dốc đầu tiên.
 */
function buildCumulativeSeries(
  anchorLabel: string,
  days: { name: string; hours: number; future: boolean }[],
): WeeklyProgressPoint[] {
  // Mốc gốc luôn được coi là "có dữ liệu": nó là điểm neo 0 giờ, và nếu ngày
  // đầu tiên trống thì nét đứt phải bắt đầu từ đây.
  const rows: { name: string; cumulative: number; hasData: boolean; future: boolean }[] = [
    { name: anchorLabel, cumulative: 0, hasData: true, future: false },
  ];
  let cumulativeSum = 0;

  days.forEach((day) => {
    cumulativeSum += day.hours;
    rows.push({
      name: day.name,
      cumulative: roundOneDecimal(cumulativeSum),
      hasData: day.hours > 0,
      future: day.future,
    });
  });

  // Ngày có dữ liệu cuối cùng: mọi thứ sau nó là quãng trống chưa khép lại
  // (hôm nay chưa học, hoặc ngày chưa tới) nên không vẽ gì — vẽ tới đó thì
  // đúng về mặt cộng dồn nhưng trông như đã có tiến độ ở ngày chưa hề học.
  const lastWithData = rows.reduce((last, row, index) => (row.hasData && !row.future ? index : last), 0);

  return rows.map((row, index) => {
    if (index > lastWithData) return { name: row.name, value: null, gap: null };
    // Ngày trống nằm giữa hai ngày có dữ liệu không mang mốc nào cả. Chuỗi nét
    // đứt chỉ gồm hai đầu mút và được nối thẳng qua (connectNulls), nên đoạn
    // đứt là MỘT đường thẳng từ tổng cộng dồn của ngày có dữ liệu trước tới
    // ngày có dữ liệu sau — không phải đoạn phẳng rồi vọt lên ở cuối.
    if (!row.hasData && index > 0) return { name: row.name, value: null, gap: null };

    const value = row.cumulative;
    // Ngày có dữ liệu đứng ngay cạnh một quãng trống chính là đầu mút của đoạn
    // đứt; thiếu nó thì đoạn đứt lơ lửng không dính vào đâu cả.
    const touchesGap =
      (index > 0 && !rows[index - 1].hasData) ||
      (index + 1 <= lastWithData && !rows[index + 1].hasData);
    return { name: row.name, value, gap: touchesGap ? value : null };
  });
}

/**
 * Một điểm trên biểu đồ "Timer sessions": trục x là mốc thời gian thật, trục y
 * là số thứ tự phiên (mỗi phiên là một bậc thang).
 *
 * Hai chuỗi giá trị TÁCH RIÊNG, và đây là điểm mấu chốt của biểu đồ này:
 *
 * - `active`: chỉ có giá trị TRONG lúc một phiên đang chạy. Bề ngang của đoạn
 *   này bằng ĐÚNG thời lượng thật của phiên.
 * - `idle`: chỉ có giá trị trong khoảng NGHỈ giữa hai phiên, vẽ nét đứt mờ.
 *
 * Trước đây cả hai dùng chung một chuỗi nên đoạn nghỉ trông y hệt đoạn phiên:
 * một phiên 19.9h kết thúc lúc 17:01 ngày 2 nhưng đường vẫn nằm ngang tới tận
 * 14:16 ngày 3 (lúc phiên sau bắt đầu), thành ra nhãn "19.9h" nằm trên một
 * vạch dài hơn 30 tiếng — đọc thế nào cũng thấy sai.
 *
 * `live: true` chỉ gắn vào điểm CUỐI của phiên đang chạy để vẽ chấm đỏ.
 */
type SessionPoint = {
  t: number;
  active?: number | null;
  idle?: number | null;
  label?: string;
  live?: boolean;
};

/**
 * Chấm cuối một phiên: trong suốt cho mọi điểm bình thường, đỏ (kèm vòng
 * quầng mờ) cho điểm cuối của phiên ĐANG CHẠY — dấu hiệu duy nhất phân biệt
 * "chưa kết thúc" với một phiên đã lưu.
 */
function renderSessionDot(props: { key?: string; cx?: number; cy?: number; payload?: SessionPoint }) {
  // Recharts đặt phần tử trả về thẳng vào một mảng con — không tự bọc key
  // như với phần tử JSX tĩnh — nên phải tự gắn lại props.key vào gốc, nếu
  // không React sẽ cảnh báo "unique key prop" mỗi lần biểu đồ vẽ lại.
  const { key, cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload?.live) {
    return <circle key={key} cx={cx ?? 0} cy={cy ?? 0} r={0} fill="none" />;
  }
  return (
    <g key={key}>
      <circle cx={cx} cy={cy} r={8} fill="#ef4444" fillOpacity={0.25}>
        <animate attributeName="r" values="6;10;6" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="fill-opacity" values="0.35;0.05;0.35" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4.5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}

/** Cách ghi nhãn trục x, chọn theo độ rộng cửa sổ đang hiển thị. */
type SessionTickMode = 'date' | 'time' | 'datetime';

/**
 * Nhãn trục x:
 * - 'date' (xem cả tháng): ngày/tháng.
 * - 'time' (phóng đại trong vòng một ngày): giờ:phút — ngày/tháng lúc này
 *   không đổi suốt biểu đồ nên ghi ra chỉ tổ thừa.
 * - 'datetime' (phóng đại nhưng cửa sổ vắt qua nhiều ngày): cần cả hai, nếu
 *   không thì 02:00 của ngày này và 02:00 của ngày kia trông y hệt nhau.
 */
function formatSessionTick(value: number, mode: SessionTickMode = 'date'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const dm = `${date.getDate()}/${date.getMonth() + 1}`;
  if (mode === 'time') return hhmm;
  if (mode === 'datetime') return `${dm} ${hhmm}`;
  return dm;
}

// Tooltip hiển thị đúng thứ người xem cần: đây là phiên thứ mấy, dài bao lâu,
// và đang ở trong phiên hay đang ở quãng nghỉ giữa hai phiên.
const sessionTooltipProps = {
  labelFormatter: (value: number) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  formatter: (value: number, name: string, entry: { payload?: SessionPoint }) => {
    if (value == null) return [];
    if (name === 'idle') return [`Nghỉ sau phiên ${value}`, 'Giữa hai phiên'];
    const label = entry?.payload?.label;
    return [label ? `Phiên ${value} · ${label}` : `Phiên ${value}`, 'Focus timer'];
  },
} as const;

export type AnalyticsVariant = 'legacy' | 'desktop-cinematic';

interface AnalyticsProps {
  variant?: AnalyticsVariant;
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const legacyTooltipStyle = {
  background: 'rgba(255, 255, 255, .96)',
  border: '1px solid rgb(226 232 240)',
  borderRadius: 12,
  boxShadow: '0 18px 45px rgba(15, 23, 42, .12)',
  color: '#0f172a',
};

export default function Analytics({ variant = 'legacy' }: AnalyticsProps) {
  const { selectedMonth, selectedYear, currentMonth: storeMonth, currentYear: storeYear, user } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || storeMonth || new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(selectedYear || storeYear || new Date().getFullYear());
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>('month_overview');
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [allDates, setAllDates] = useState<ApiDate[]>([]);
  const [focusSessions, setFocusSessions] = useState<ApiSession[]>([]);
  const [selectedTotal, setSelectedTotal] = useState<'timer' | 'holy'>('timer');
  const [errorMessage, setErrorMessage] = useState('');
  const { timer: liveTimer, savedSessions } = useFocusTimerStore();
  // Ép focusTimerSessionData tính lại mỗi vài giây trong khi có phiên đang
  // chạy: bản thân `liveTimer` không đổi giữa các tick (cùng startedAtMs),
  // nên nếu không có biến đếm này useMemo sẽ không bao giờ chạy lại và đầu
  // mút của đường biểu đồ sẽ đứng yên thay vì đuổi theo Date.now().
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (!liveTimer) return;
    const id = window.setInterval(() => setLiveTick((tick) => tick + 1), 5000);
    return () => window.clearInterval(id);
  }, [liveTimer]);

  useEffect(() => {
    if (!user?.id) return;

    const loadDates = async () => {
      try {
        setErrorMessage('');
        const dates = await api.getDates(user.id);
        setAllDates(dates);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load analytics data.');
      }
    };

    void loadDates();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const loadFocusSessions = async () => {
      try {
        setErrorMessage('');
        const rows = await api.getSessions(user.id);
        setFocusSessions(dedupeSessions(rows));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load focus sessions.');
      }
    };

    void loadFocusSessions();
    // savedSessions: bấm Dừng xong là nạp lại NGAY, nếu không phiên vừa kết
    // thúc sẽ biến mất khỏi biểu đồ (đoạn "đang chạy" bị gỡ cùng lúc timer bị
    // xoá, còn dòng phiên mới thì chỉ được đọc lại ở lần mount sau).
  }, [user?.id, savedSessions]);

  // Giờ học mỗi ngày = ĐÚNG focused_minutes của ngày đó, không cộng thêm các
  // phiên timer.
  //
  // Trước đây có cộng, và kết quả sai đến mức vô lý: ngày 1/9 ghi 30 phút
  // focus nhưng biểu đồ vẽ 42.7h. Lý do là mọi phiên timer đều được tính trọn
  // vẹn vào NGÀY BẮT ĐẦU của nó, nên một phiên chạy từ 21:06 ngày 1 tới 17:01
  // ngày 2 (1195 phút) dồn hết 20 tiếng vào ngày 1 — cộng thêm một phiên trùng
  // do lỗi bấm hai lần trước đây, thành gần 43 giờ trong một ngày 24 tiếng.
  //
  // Phiên timer đã có biểu đồ riêng ("Timer sessions"). Trộn hai đại lượng
  // khác nhau vào cùng một cột chỉ làm cả hai cùng sai.
  const studyHoursByDate = useMemo(() => {
    const hoursByDate: Record<string, number> = {};
    allDates.forEach((date) => {
      if (date.year !== currentYear || date.month !== currentMonth) return;
      const dateKey = formatDateKey(date.year, date.month, date.day);
      const minutes = Number(date.focused_minutes) || 0;
      hoursByDate[dateKey] = (hoursByDate[dateKey] || 0) + minutes / 60;
    });
    return hoursByDate;
  }, [allDates, currentMonth, currentYear]);

  const focusSessionDays = useMemo(() => {
    return new Set(
      focusSessions
        .map((session) => normalizeSessionDate(session.session_date))
        .filter((dateKey) => dateKey && isDateKeyInMonth(dateKey, currentMonth, currentYear)),
    );
  }, [currentMonth, currentYear, focusSessions]);

  const weeksCount = getWeeksInMonth(currentMonth, currentYear);

  useEffect(() => {
    if (selectedWeek > weeksCount) setSelectedWeek(1);
  }, [selectedWeek, weeksCount]);

  const weeklyData = useMemo(() => {
    return Array.from({ length: weeksCount }, (_, index) => {
      const week = index + 1;
      const days = getDaysInWeek(currentMonth, currentYear, week);
      const hours = days.reduce((sum, day) => sum + (studyHoursByDate[day.date] || 0), 0);
      return { name: `Week ${week}`, hours: roundOneDecimal(hours) };
    });
  }, [currentMonth, currentYear, studyHoursByDate, weeksCount]);

  const dailyData = useMemo(() => {
    return getDaysInWeek(currentMonth, currentYear, selectedWeek).map((day) => {
      const dayOfWeek = new Date(day.year, day.month - 1, day.day).getDay();
      return {
        name: `${dayNames[dayOfWeek]} ${day.day}`,
        hours: roundOneDecimal(studyHoursByDate[day.date] || 0),
      };
    });
  }, [currentMonth, currentYear, selectedWeek, studyHoursByDate]);


  // Đường thẳng, không phải đường cong: đoạn "không có dữ liệu" phải phẳng
  // tuyệt đối để đọc ra là "không tăng". Đường monotone bo tròn qua các mốc
  // nên đoạn đáng lẽ nằm ngang lại hơi vồng lên, trông như vẫn có tiến độ.
  const weeklyProgressData = useMemo(() => {
    const days = getDaysInWeek(currentMonth, currentYear, selectedWeek);
    return buildCumulativeSeries(
      'Đầu tuần',
      days.map((day) => ({
        name: `${dayNames[new Date(day.year, day.month - 1, day.day).getDay()]} ${day.day}`,
        hours: studyHoursByDate[day.date] || 0,
        future: isFutureDate(day.day, day.month, day.year),
      })),
    );
  }, [currentMonth, currentYear, selectedWeek, studyHoursByDate]);

  // Cùng cách vẽ với biểu đồ tuần, chỉ khác phạm vi: cộng dồn CHẠY SUỐT từ
  // ngày 1 tới cuối tháng, không trả về 0 ở đầu mỗi tuần. Nhãn trục X chỉ là
  // số ngày — 28 tới 31 mốc thì thứ trong tuần chen vào là không đọc nổi.
  const monthProgressData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    // Nhãn neo để trống: cạnh một dãy nhãn toàn số ngày, một chữ dài như "Đầu
    // tháng" chiếm chỗ tới mức trục X nuốt mất nhãn của ngày 1.
    return buildCumulativeSeries(
      '',
      Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        return {
          name: String(day),
          hours: studyHoursByDate[formatDateKey(currentYear, currentMonth, day)] || 0,
          future: isFutureDate(day, currentMonth, currentYear),
        };
      }),
    );
  }, [currentMonth, currentYear, studyHoursByDate]);

  const monthRange = useMemo(() => {
    const from = new Date(currentYear, currentMonth - 1, 1).getTime();
    const to = new Date(currentYear, currentMonth, 1).getTime() - 1;
    return [from, to] as [number, number];
  }, [currentMonth, currentYear]);

  /**
   * Khoảng thời gian THẬT của từng phiên trong tháng đang xem, kể cả phiên
   * đang chạy. Tách riêng ra đây vì cả việc dựng điểm biểu đồ lẫn việc tính
   * cửa sổ phóng đại đều cần đúng tập phiên này — trước đây mỗi chỗ tự lọc
   * lấy một kiểu nên cửa sổ phóng đại có thể trỏ vào quãng chẳng có phiên nào.
   */
  const sessionSpans = useMemo(() => {
    const [monthStart, monthEnd] = monthRange;

    const spans: { startMs: number; endMs: number; live?: boolean }[] = focusSessions
      .map((session) => {
        const startMs = new Date(session.start_time).getTime();
        const endMsRaw = new Date(session.end_time).getTime();
        if (!Number.isFinite(startMs)) return null;
        // Phiên chưa có giờ kết thúc hợp lệ thì suy ra từ focused_minutes.
        const endMs = Number.isFinite(endMsRaw) && endMsRaw > startMs
          ? endMsRaw
          : startMs + getSessionFocusedMinutes(session) * 60000;
        return { startMs, endMs };
      })
      .filter((span): span is { startMs: number; endMs: number } => span !== null)
      // Chỉ những phiên BẮT ĐẦU trong tháng đang xem. Trước đây mọi phiên chạm
      // vào tháng đều được vẽ, nên biểu đồ "September" lại mở từ 30/8 và đếm cả
      // phiên của tháng trước.
      .filter((span) => span.startMs >= monthStart && span.startMs <= monthEnd);

    // Phiên đang chạy chưa có dòng session nào trong `focusSessions` — nó chỉ
    // được ghi khi bấm Dừng. Ghép nó vào đây như một "phiên ảo" có endMs luôn
    // đuổi theo Date.now(), để đường biểu đồ dài ra đúng nhịp với đồng hồ thật
    // thay vì chỉ xuất hiện sau khi timer kết thúc.
    if (liveTimer && liveTimer.startedAtMs >= monthStart && liveTimer.startedAtMs <= monthEnd) {
      spans.push({ startMs: liveTimer.startedAtMs, endMs: Date.now(), live: true });
    }

    spans.sort((a, b) => a.startMs - b.startMs);
    return spans;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liveTick là bộ
    // kích hoạt tính lại thuần tuý, giá trị của nó không bao giờ được đọc.
  }, [focusSessions, liveTimer, monthRange, liveTick]);

  const focusTimerSessionData = useMemo(() => {
    const [, monthEnd] = monthRange;
    const spans = sessionSpans;

    const points: SessionPoint[] = [];
    spans.forEach((span, order) => {
      const level = order + 1;
      const endMs = Math.min(span.endMs, monthEnd);
      const hours = (span.endMs - span.startMs) / 3600000;
      const label = hours >= 1 ? `${roundOneDecimal(hours)}h` : `${Math.max(1, Math.round(hours * 60))}m`;
      const nextStartMs = spans[order + 1]?.startMs;

      // Bậc dựng THẲNG ĐỨNG ngay tại thời điểm bắt đầu: hai điểm cùng mốc t.
      //
      // Bản trước dựng chéo trong một khoảng `rise` cố định bằng 1.2% cả tháng
      // (~8.6 tiếng!). Đoạn chéo đó ăn thẳng vào thời lượng thật của phiên:
      // một phiên 19.9h mất 8.6h cho phần dốc, và mọi phiên ngắn hơn 8.6h bị
      // vẽ thành một đường chéo suốt từ đầu đến cuối, đỉnh dốc rơi đúng vào
      // lúc phiên đã kết thúc. Không có cách nào đọc ra thời lượng thật từ
      // hình dạng đó. Dựng đứng thì bề ngang đoạn nằm ngang = đúng thời lượng.
      points.push({ t: span.startMs, active: level - 1, idle: order === 0 ? null : level - 1 });
      points.push({ t: span.startMs, active: level });
      points.push({ t: (span.startMs + endMs) / 2, active: level, label: span.live ? `${label} · đang chạy` : label });
      // Điểm kết thúc phiên: vừa đóng đoạn đặc, vừa mở đoạn nghỉ nét đứt.
      // `live` chỉ gắn ở đây — đầu mút hiện tại của phiên chưa kết thúc — để
      // renderSessionDot vẽ đúng một chấm đỏ. Phiên đang chạy thì chưa có
      // quãng nghỉ nào phía sau nên không mở `idle`.
      points.push({
        t: Math.max(endMs, span.startMs + 1),
        active: level,
        // Chỉ mở đoạn nghỉ khi thực sự CÓ phiên kế tiếp để nối tới: phiên cuối
        // cùng (hoặc phiên đang chạy) mà vẫn mở thì để lại một điểm lẻ không
        // vẽ ra được đoạn nào.
        idle: span.live || nextStartMs === undefined ? null : level,
        live: span.live,
      });
      // Ngắt chuỗi `active` giữa quãng nghỉ. Không có điểm null ở đây thì
      // Recharts nối thẳng đoạn đặc của phiên này sang phiên sau, và quãng
      // nghỉ lại trông y hệt một phiên đang chạy dài.
      if (!span.live && nextStartMs !== undefined && nextStartMs > endMs) {
        points.push({ t: (endMs + nextStartMs) / 2, active: null, idle: level });
      }
    });

    return points;
  }, [monthRange, sessionSpans]);

  // "Phóng đại tối đa": thu trục x từ cả tháng xuống đúng khoảng chứa VÀI
  // PHIÊN GẦN NHẤT, để vừa thấy tiến trình trước đó vừa đủ hẹp mà quan sát
  // phiên đang chạy nhích lên.
  //
  // Cửa sổ neo vào DỮ LIỆU chứ không neo vào đồng hồ. Bản trước lấy "N giờ
  // gần đây tính đến bây giờ", nên khi phiên cuối đã kết thúc từ hôm trước
  // thì phóng đại ra một khung hoàn toàn TRỐNG — chẳng còn gì để xem. Chỉ khi
  // đang có phiên chạy thì mép phải mới bám theo Date.now(), vì lúc đó "bây
  // giờ" chính là đầu mút đang dài ra.
  const [sessionZoom, setSessionZoom] = useState(false);
  const RECENT_SESSIONS_IN_ZOOM = 4;

  const sessionXDomain = useMemo<[number, number]>(() => {
    if (!sessionZoom) return monthRange;
    const [monthStart, monthEnd] = monthRange;
    if (sessionSpans.length === 0) return monthRange;

    const recent = sessionSpans.slice(-RECENT_SESSIONS_IN_ZOOM);
    const hasLive = sessionSpans.some((span) => span.live);
    const to = hasLive ? Date.now() : Math.max(...recent.map((span) => span.endMs));

    // Ba mốc, lấy theo thứ tự ưu tiên dưới đây:
    // - preferredFrom: gom đủ vài phiên gần nhất (nhiều ngữ cảnh nhất).
    // - cappedFrom: trần 3 ngày, để phóng đại vẫn ra dáng phóng đại chứ không
    //   thành "xem cả tháng" khi các phiên nằm rải rác.
    // - mustFrom: phiên LIỀN TRƯỚC, luôn phải nằm trong khung. Đây là ràng
    //   buộc mạnh hơn cả trần thời gian: yêu cầu là phóng to mà vẫn thấy được
    //   tiến trình trước đó, nên thà nới khung rộng hơn 3 ngày còn hơn để lại
    //   mỗi một đoạn trơ trọi không có gì so sánh.
    const preferredFrom = recent[0].startMs;
    const cappedFrom = to - 3 * 24 * 60 * 60 * 1000;
    const previous = sessionSpans[sessionSpans.length - 2];
    const mustFrom = previous ? previous.startMs : sessionSpans[sessionSpans.length - 1].startMs;
    const from = Math.max(preferredFrom, Math.min(mustFrom, cappedFrom));

    // Sàn 15 phút để một phiên vừa bấm Chạy được vài giây không bị phóng tới
    // mức trục chẳng còn mốc nào.
    const minSpanMs = 15 * 60 * 1000;
    const rawSpan = Math.max(to - from, minSpanMs);
    const paddingMs = Math.max(rawSpan * 0.05, 60 * 1000);
    const center = (from + to) / 2;
    const start = Math.min(from, center - rawSpan / 2) - paddingMs;
    const end = Math.max(to, center + rawSpan / 2) + paddingMs;
    return [Math.max(monthStart, start), Math.min(monthEnd, end)];
  }, [sessionZoom, sessionSpans, monthRange]);

  // Trên một cửa sổ hẹp, thuật toán chọn mốc "đẹp" mặc định của Recharts (nghĩ
  // theo mili-giây kể từ epoch, không phải theo phút) có thể nhả ra rất ít mốc
  // hoặc mốc lệch giờ khó đọc — tự chọn bước mốc theo đúng độ rộng cửa sổ hiện
  // tại: cửa sổ càng rộng thì bước mốc càng thưa.
  //
  // Mốc được đếm từ NỬA ĐÊM ĐỊA PHƯƠNG chứ không từ epoch: mọi bước ở đây đều
  // chia hết cho một ngày, nên cách này cho ra các mốc tròn trịa (00:00, 06:00,
  // 12:00...) theo đúng giờ người dùng đang nhìn, thay vì lệch đúng bằng phần
  // chênh múi giờ như khi lấy bội số của epoch.
  const sessionXTicks = useMemo<number[] | undefined>(() => {
    if (!sessionZoom) return undefined;
    const [start, end] = sessionXDomain;
    const spanMs = end - start;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const stepMs = spanMs <= 30 * minute ? 5 * minute
      : spanMs <= 90 * minute ? 10 * minute
      : spanMs <= 4 * hour ? 30 * minute
      : spanMs <= 12 * hour ? hour
      : spanMs <= 2 * day ? 3 * hour
      : spanMs <= 5 * day ? 6 * hour
      : 12 * hour;

    const midnight = new Date(start);
    midnight.setHours(0, 0, 0, 0);
    const ticks: number[] = [];
    for (let t = midnight.getTime(); t <= end; t += stepMs) {
      if (t >= start) ticks.push(t);
    }
    return ticks;
  }, [sessionZoom, sessionXDomain]);

  // Cửa sổ phóng đại có thể vắt qua nhiều ngày (khi vài phiên gần nhất nằm
  // rải rác), lúc đó nhãn chỉ có giờ:phút sẽ mơ hồ.
  const sessionTickMode: SessionTickMode = !sessionZoom
    ? 'date'
    : sessionXDomain[1] - sessionXDomain[0] > 24 * 60 * 60 * 1000
      ? 'datetime'
      : 'time';

  // Ở chế độ phóng đại, trục y cũng nên chỉ trải theo (các) phiên đang lọt vào
  // khung nhìn hẹp đó — nếu vẫn dùng domain "0 tới phiên thứ N trong tháng"
  // như lúc xem cả tháng, đường duy nhất còn thấy được sẽ bị dồn xuống một
  // dải mỏng phía dưới, phí mất phần lớn chiều cao biểu đồ.
  const sessionYDomain = useMemo<[number, number] | undefined>(() => {
    if (!sessionZoom) return undefined;
    const [start, end] = sessionXDomain;
    const visibleIndices = focusTimerSessionData
      .filter((point) => point.t >= start && point.t <= end)
      .map((point) => point.active ?? point.idle)
      .filter((value): value is number => typeof value === 'number');
    if (visibleIndices.length === 0) return undefined;
    return [Math.max(0, Math.min(...visibleIndices) - 0.5), Math.max(...visibleIndices) + 0.5];
  }, [sessionZoom, sessionXDomain, focusTimerSessionData]);

  const holyMindCumulativeData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const monthStart = formatDateKey(currentYear, currentMonth, 1);
    const minutesByDay = new Map<number, number>();
    const trendData: ChartPoint[] = [];
    let cumulativeMinutes = 0;

    allDates.forEach((date) => {
      const dateKey = formatDateKey(date.year, date.month, date.day);
      const minutes = Number(date.holy_mind_minutes) || 0;
      if (dateKey < monthStart) {
        cumulativeMinutes += minutes;
        return;
      }
      if (date.year === currentYear && date.month === currentMonth) {
        minutesByDay.set(date.day, (minutesByDay.get(date.day) || 0) + minutes);
      }
    });

    for (let day = 1; day <= daysInMonth; day++) {
      cumulativeMinutes += minutesByDay.get(day) || 0;
      trendData.push({
        name: String(day),
        value: !isFutureDate(day, currentMonth, currentYear) ? roundOneDecimal(cumulativeMinutes / 60) : null,
      });
    }

    return trendData;
  }, [allDates, currentMonth, currentYear]);

  const monthlyTotalHours = weeklyData.reduce((sum, week) => sum + week.hours, 0);
  const monthlyFocusSessions = focusSessions.filter((session) => isDateKeyInMonth(normalizeSessionDate(session.session_date), currentMonth, currentYear));
  const monthlyFocusSessionCount = monthlyFocusSessions.length;
  const monthlyRecordCount = new Set([
    ...allDates.filter((date) => date.year === currentYear && date.month === currentMonth).map((date) => formatDateKey(date.year, date.month, date.day)),
    ...Array.from(focusSessionDays),
  ]).size;
  const monthlyKosTotal = allDates
    .filter((date) => date.year === currentYear && date.month === currentMonth)
    .reduce((sum, date) => sum + (Number(date.key_of_success) || 0), 0);
  const totalFocusTimerMinutes = focusSessions.reduce((sum, session) => sum + getSessionFocusedMinutes(session), 0);
  const totalHolyMindMinutes = allDates.reduce((sum, date) => sum + (Number(date.holy_mind_minutes) || 0), 0);
  const weeklyProgressMax = Math.max(0, ...weeklyProgressData.map((point) => point.value || 0));
  const weeklyProgressDomain: [number, number] = weeklyProgressMax > 50 ? [0, 90] : [0, 45];

  const moveMonth = (direction: -1 | 1) => {
    setCurrentMonth((month) => {
      if (direction === -1 && month === 1) {
        setCurrentYear((year) => year - 1);
        return 12;
      }
      if (direction === 1 && month === 12) {
        setCurrentYear((year) => year + 1);
        return 1;
      }
      return month + direction;
    });
    setSelectedWeek(1);
  };

  if (variant === 'desktop-cinematic') {
    return (
      <DesktopCinematicAnalytics
        analyticsView={analyticsView}
        currentMonth={currentMonth}
        currentYear={currentYear}
        dailyData={dailyData}
        errorMessage={errorMessage}
        focusTimerSessionData={focusTimerSessionData}
        sessionZoom={sessionZoom}
        sessionTickMode={sessionTickMode}
        setSessionZoom={setSessionZoom}
        sessionXDomain={sessionXDomain}
        sessionXTicks={sessionXTicks}
        sessionYDomain={sessionYDomain}
        holyMindCumulativeData={holyMindCumulativeData}
        monthlyFocusSessionCount={monthlyFocusSessionCount}
        monthlyKosTotal={monthlyKosTotal}
        monthlyRecordCount={monthlyRecordCount}
        monthlyTotalHours={monthlyTotalHours}
        moveMonth={moveMonth}
        selectedTotal={selectedTotal}
        setSelectedTotal={setSelectedTotal}
        selectedWeek={selectedWeek}
        setAnalyticsView={setAnalyticsView}
        setSelectedWeek={setSelectedWeek}
        totalFocusTimerMinutes={totalFocusTimerMinutes}
        totalHolyMindMinutes={totalHolyMindMinutes}
        weeklyData={weeklyData}
        weeklyProgressData={weeklyProgressData}
        monthProgressData={monthProgressData}
        weeklyProgressDomain={weeklyProgressDomain}
        weeklyProgressMax={weeklyProgressMax}
        weeksCount={weeksCount}
      />
    );
  }

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      <section className="premium-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Progress analytics</h2>
            <p className="mt-1 text-sm text-slate-500">Study time, weekly momentum, timer totals, and Holly Mind growth.</p>
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-950"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[140px] text-center text-sm font-semibold text-slate-900">
              {monthNames[currentMonth - 1]} {currentYear}
            </div>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-950"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        {errorMessage && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Study hours" value={`${roundOneDecimal(monthlyTotalHours)}h`} />
        <MetricCard label="Focus sessions" value={monthlyFocusSessionCount} />
        <MetricCard label="Tracked days" value={monthlyRecordCount} />
        <MetricCard label="Success keys" value={monthlyKosTotal} />
      </section>

      <CumulativeTotalPanel
        selected={selectedTotal}
        onSelect={setSelectedTotal}
        totalFocusTimerMinutes={totalFocusTimerMinutes}
        totalHolyMindMinutes={totalHolyMindMinutes}
      />

      <section className="glass-panel rounded-2xl p-2">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <ViewButton active={analyticsView === 'month_overview'} onClick={() => setAnalyticsView('month_overview')}>
            Month overview
          </ViewButton>
          <ViewButton active={analyticsView === 'week_daily'} onClick={() => setAnalyticsView('week_daily')}>
            Week details
          </ViewButton>
          <ViewButton active={analyticsView === 'weekly_progress'} onClick={() => setAnalyticsView('weekly_progress')}>
            Weekly progress
          </ViewButton>
          <ViewButton active={analyticsView === 'key_of_success'} onClick={() => setAnalyticsView('key_of_success')}>
            Timer total
          </ViewButton>
          <ViewButton active={analyticsView === 'cycle_ticks'} onClick={() => setAnalyticsView('cycle_ticks')}>
            Holly Mind
          </ViewButton>
        </div>
      </section>

      {analyticsView === 'month_overview' && (
        <div className="grid grid-cols-1 gap-4">
          <ChartPanel title={`Study hours by week - ${monthNames[currentMonth - 1]}`}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData} barCategoryGap="26%" margin={{ top: 8, right: 8, left: -14, bottom: 0 }} accessibilityLayer>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value}h`, 'Study time']} contentStyle={legacyTooltipStyle} cursor={{ fill: 'rgba(37, 99, 235, .06)' }} />
                <Bar dataKey="hours" fill="var(--chart-1)" maxBarSize={52} radius={[10, 10, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={`Month progress - ${monthNames[currentMonth - 1]} ${currentYear}`}>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={monthProgressData} margin={{ top: 10, right: 10, left: -14, bottom: 0 }} accessibilityLayer>
                <defs>
                  <linearGradient id="monthProgressGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
                <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Cumulative'])} contentStyle={legacyTooltipStyle} />
                <Area type="linear" dataKey="gap" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 6" strokeOpacity={0.65} fill="none" dot={false} activeDot={false} connectNulls tooltipType="none" />
                <Area type="linear" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="url(#monthProgressGradient)" dot={{ fill: '#2563eb', r: 3 }} activeDot={{ r: 6 }} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      )}

      {analyticsView === 'week_daily' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <WeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week" />
          <ChartPanel title={`Daily study hours - Week ${selectedWeek}`}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dailyData} barCategoryGap="26%" margin={{ top: 8, right: 8, left: -14, bottom: 0 }} accessibilityLayer>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={70} />
                <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value}h`, 'Study time']} contentStyle={legacyTooltipStyle} cursor={{ fill: 'rgba(20, 184, 166, .06)' }} />
                <Bar dataKey="hours" fill="var(--chart-2)" maxBarSize={46} radius={[10, 10, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </motion.div>
      )}

      {analyticsView === 'weekly_progress' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <WeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week to view progress" />
          <ChartPanel title={`Cumulative study time - Week ${selectedWeek}`}>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={weeklyProgressData} margin={{ top: 10, right: 10, left: -14, bottom: 0 }} accessibilityLayer>
                <defs>
                  <linearGradient id="weeklyProgressGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={70} />
                <YAxis stroke="#64748b" tickLine={false} axisLine={false} domain={weeklyProgressDomain} allowDataOverflow={false} />
                <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Cumulative'])} contentStyle={legacyTooltipStyle} />
                <ReferenceLine y={40} label={{ value: '40h', fill: '#d97706', fontSize: 12 }} stroke="#d97706" strokeDasharray="4 4" />
                {weeklyProgressMax > 50 && (
                  <ReferenceLine y={80} label={{ value: '80h', fill: '#dc2626', fontSize: 12 }} stroke="#dc2626" strokeDasharray="4 4" />
                )}
                {/* Nét đứt vẽ TRƯỚC để nét liền nằm đè lên ở hai điểm neo.
                    tooltipType="none": hai chuỗi trùng giá trị ở điểm neo, để cả
                    hai vào tooltip thì cùng một ngày hiện hai dòng y hệt nhau. */}
                <Area
                  type="linear"
                  dataKey="gap"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  strokeOpacity={0.65}
                  fill="none"
                  dot={false}
                  activeDot={false}
                  connectNulls
                  tooltipType="none"
                />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fill="url(#weeklyProgressGradient)"
                  dot={{ fill: '#2563eb', r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </motion.div>
      )}

      {analyticsView === 'key_of_success' && (
        <ChartPanel
          title={`Timer sessions - ${monthNames[currentMonth - 1]} ${currentYear}`}
          action={<SessionZoomToggle zoomed={sessionZoom} onToggle={() => setSessionZoom((value) => !value)} />}
        >
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={focusTimerSessionData} margin={{ top: 24, right: 18, left: -14, bottom: 0 }} accessibilityLayer>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
              {/* allowDataOverflow: mặc định Recharts TỰ NỚI domain ra để chứa
                  hết mọi điểm dữ liệu, bất kể domain truyền vào — nếu không
                  bật cờ này, cửa sổ "phóng đại tối đa" bị lờ đi hoàn toàn và
                  trục lại giãn về đúng khoảng bao trọn cả 3 phiên như cũ. */}
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={sessionXDomain}
                ticks={sessionXTicks}
                allowDataOverflow
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatSessionTick(value, sessionTickMode)}
              />
              <YAxis stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} allowDataOverflow={sessionZoom} domain={sessionYDomain ?? [0, 'dataMax + 1']} />
              <Tooltip {...sessionTooltipProps} contentStyle={legacyTooltipStyle} />
              {/* Quãng NGHỈ giữa hai phiên: nét đứt mờ, vẽ trước để nằm dưới. */}
              <Line
                type="linear"
                dataKey="idle"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {/* Bản thân PHIÊN: nét đặc, bề ngang đúng bằng thời lượng thật. */}
              <Line
                type="linear"
                dataKey="active"
                stroke="#2563eb"
                strokeWidth={3}
                dot={renderSessionDot}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              >
                <LabelList dataKey="label" position="top" className="fill-[#2563eb] text-[11px] font-semibold" />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {analyticsView === 'cycle_ticks' && (
        <ChartPanel title={`Holly Mind cumulative total - ${monthNames[currentMonth - 1]} ${currentYear}`}>
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={holyMindCumulativeData} margin={{ top: 10, right: 10, left: -14, bottom: 0 }} accessibilityLayer>
              <defs>
                <linearGradient id="holyMindGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" tickLine={false} axisLine={false} domain={[0, 'dataMax + 5']} />
              <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Holly Mind total'])} contentStyle={legacyTooltipStyle} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#059669"
                strokeWidth={3}
                fill="url(#holyMindGradient)"
                dot={{ fill: '#059669', r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}
    </div>
  );
}

interface DesktopCinematicAnalyticsProps {
  analyticsView: AnalyticsView;
  currentMonth: number;
  currentYear: number;
  dailyData: Array<{ name: string; hours: number }>;
  errorMessage: string;
  focusTimerSessionData: SessionPoint[];
  sessionZoom: boolean;
  sessionTickMode: SessionTickMode;
  setSessionZoom: (value: boolean | ((current: boolean) => boolean)) => void;
  sessionXDomain: [number, number];
  sessionXTicks: number[] | undefined;
  sessionYDomain: [number, number] | undefined;
  holyMindCumulativeData: ChartPoint[];
  monthlyFocusSessionCount: number;
  monthlyKosTotal: number;
  monthlyRecordCount: number;
  monthlyTotalHours: number;
  moveMonth: (direction: -1 | 1) => void;
  selectedTotal: 'timer' | 'holy';
  selectedWeek: number;
  setAnalyticsView: (view: AnalyticsView) => void;
  setSelectedTotal: (value: 'timer' | 'holy') => void;
  setSelectedWeek: (week: number) => void;
  totalFocusTimerMinutes: number;
  totalHolyMindMinutes: number;
  weeklyData: Array<{ name: string; hours: number }>;
  weeklyProgressData: WeeklyProgressPoint[];
  monthProgressData: WeeklyProgressPoint[];
  weeklyProgressDomain: [number, number];
  weeklyProgressMax: number;
  weeksCount: number;
}

const cinematicTooltipStyle = {
  background: 'var(--glass-strong)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-md)',
  color: 'var(--foreground)',
};

const cinematicViewItems: Array<{ id: AnalyticsView; label: string; hint: string }> = [
  { id: 'month_overview', label: 'Month', hint: 'Weekly totals' },
  { id: 'week_daily', label: 'Week details', hint: 'Daily hours' },
  { id: 'weekly_progress', label: 'Progress', hint: 'Cumulative week' },
  { id: 'key_of_success', label: 'Timer total', hint: 'All sessions' },
  { id: 'cycle_ticks', label: 'Holly Mind', hint: 'All-time total' },
];

function DesktopCinematicAnalytics({
  analyticsView,
  currentMonth,
  currentYear,
  dailyData,
  errorMessage,
  focusTimerSessionData,
  sessionZoom,
  sessionTickMode,
  setSessionZoom,
  sessionXDomain,
  sessionXTicks,
  sessionYDomain,
  holyMindCumulativeData,
  monthlyFocusSessionCount,
  monthlyKosTotal,
  monthlyRecordCount,
  monthlyTotalHours,
  moveMonth,
  selectedTotal,
  selectedWeek,
  setAnalyticsView,
  setSelectedTotal,
  setSelectedWeek,
  totalFocusTimerMinutes,
  totalHolyMindMinutes,
  weeklyData,
  weeklyProgressData,
  monthProgressData,
  weeklyProgressDomain,
  weeklyProgressMax,
  weeksCount,
}: DesktopCinematicAnalyticsProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const barDuration = reducedMotion ? 0 : 720;
  const lineDuration = reducedMotion ? 0 : 880;
  const chartKey = `${analyticsView}-${currentYear}-${currentMonth}-${
    analyticsView === 'week_daily' || analyticsView === 'weekly_progress' ? selectedWeek : 'month'
  }`;

  return (
    <div className="desktop-cinematic-analytics relative space-y-5 pb-10 text-[var(--foreground)]">
      <header className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-md)] backdrop-blur-xl">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[var(--primary)] opacity-[.08] blur-3xl" />
        <div className="relative flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[var(--primary)]">Progress analytics</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Your progress, without the noise.</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
              Study time, session totals, and Holly Mind growth in a clearer desktop workspace.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/75 p-1.5 shadow-[var(--shadow-sm)]">
            <motion.button
              type="button"
              onClick={() => moveMonth(-1)}
              whileTap={reducedMotion ? undefined : { scale: .9, x: -2 }}
              className="grid h-10 w-10 place-items-center rounded-xl text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.button>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${currentYear}-${currentMonth}`}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: .22 }}
                className="min-w-[164px] text-center text-sm font-semibold tabular-nums"
              >
                {monthNames[currentMonth - 1]} {currentYear}
              </motion.div>
            </AnimatePresence>
            <motion.button
              type="button"
              onClick={() => moveMonth(1)}
              whileTap={reducedMotion ? undefined : { scale: .9, x: 2 }}
              className="grid h-10 w-10 place-items-center rounded-xl text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
        {errorMessage && (
          <div role="alert" className="relative mt-4 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {errorMessage}
          </div>
        )}
      </header>

      <section className="grid grid-cols-4 gap-4" aria-label="Monthly summary">
        <CinematicMetric index={0} label="Study hours" value={`${roundOneDecimal(monthlyTotalHours)}h`} reducedMotion={reducedMotion} />
        <CinematicMetric index={1} label="Focus sessions" value={String(monthlyFocusSessionCount)} reducedMotion={reducedMotion} />
        <CinematicMetric index={2} label="Tracked days" value={String(monthlyRecordCount)} reducedMotion={reducedMotion} />
        <CinematicMetric index={3} label="Success keys" value={String(monthlyKosTotal)} reducedMotion={reducedMotion} />
      </section>

      <CumulativeTotalPanel
        selected={selectedTotal}
        onSelect={setSelectedTotal}
        totalFocusTimerMinutes={totalFocusTimerMinutes}
        totalHolyMindMinutes={totalHolyMindMinutes}
      />

      <nav className="grid grid-cols-5 gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--glass)] p-2 shadow-[var(--shadow-sm)] backdrop-blur-xl" aria-label="Analytics views" role="tablist">
        {cinematicViewItems.map((item) => {
          const active = analyticsView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAnalyticsView(item.id)}
              role="tab"
              aria-selected={active}
              className="relative min-h-[58px] rounded-2xl px-4 text-left"
            >
              {active && (
                <motion.span
                  layoutId="desktop-analytics-active-view"
                  className="absolute inset-0 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
                  transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative block text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
              <span className="relative mt-0.5 block text-[10px] text-[var(--foreground-subtle)]">{item.hint}</span>
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={chartKey}
          initial={reducedMotion ? false : { opacity: 0, y: 14, scale: .992 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -10, scale: .995 }}
          transition={{ duration: reducedMotion ? 0 : .28, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {analyticsView === 'month_overview' && (
            <div className="grid grid-cols-1 gap-5">
              <CinematicChartPanel title={`Study hours by week - ${monthNames[currentMonth - 1]}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={weeklyData} barCategoryGap="22%" margin={{ top: 10, right: 10, left: -8, bottom: 0 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${value}h`, 'Study time']} contentStyle={cinematicTooltipStyle} cursor={{ fill: 'var(--surface-soft)' }} />
                    <Bar dataKey="hours" fill="var(--chart-1)" maxBarSize={52} radius={[10, 10, 3, 3]} isAnimationActive={!reducedMotion} animationDuration={barDuration} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </CinematicChartPanel>

              <CinematicChartPanel title={`Month progress - ${monthNames[currentMonth - 1]} ${currentYear}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={380}>
                  <AreaChart data={monthProgressData} margin={{ top: 14, right: 22, left: -4, bottom: 8 }} accessibilityLayer>
                    <defs>
                      <linearGradient id="cinematicMonthProgressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={.32} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Cumulative'])} contentStyle={cinematicTooltipStyle} />
                    <Area type="linear" dataKey="gap" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 6" strokeOpacity={0.65} fill="none" dot={false} activeDot={false} connectNulls tooltipType="none" isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                    <Area type="linear" dataKey="value" stroke="var(--chart-1)" strokeWidth={3} fill="url(#cinematicMonthProgressGradient)" dot={{ fill: 'var(--chart-1)', r: 3 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                  </AreaChart>
                </ResponsiveContainer>
              </CinematicChartPanel>
            </div>
          )}

          {analyticsView === 'week_daily' && (
            <>
              <CinematicWeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week" reducedMotion={reducedMotion} />
              <CinematicChartPanel title={`Daily study hours - Week ${selectedWeek}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={dailyData} barCategoryGap="22%" margin={{ top: 12, right: 14, left: -8, bottom: 8 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${value}h`, 'Study time']} contentStyle={cinematicTooltipStyle} cursor={{ fill: 'var(--surface-soft)' }} />
                    <Bar dataKey="hours" fill="var(--chart-2)" maxBarSize={52} radius={[10, 10, 3, 3]} isAnimationActive={!reducedMotion} animationDuration={barDuration} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </CinematicChartPanel>
            </>
          )}

          {analyticsView === 'weekly_progress' && (
            <>
              <CinematicWeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week to view progress" reducedMotion={reducedMotion} />
              <CinematicChartPanel title={`Cumulative study time - Week ${selectedWeek}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={weeklyProgressData} margin={{ top: 14, right: 22, left: -4, bottom: 8 }} accessibilityLayer>
                    <defs>
                      <linearGradient id="cinematicWeeklyProgressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={.32} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} domain={weeklyProgressDomain} allowDataOverflow={false} />
                    <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Cumulative'])} contentStyle={cinematicTooltipStyle} />
                    <ReferenceLine y={40} label={{ value: '40h', fill: '#d97706', fontSize: 12 }} stroke="#d97706" strokeDasharray="4 4" />
                    {weeklyProgressMax > 50 && <ReferenceLine y={80} label={{ value: '80h', fill: '#dc2626', fontSize: 12 }} stroke="#dc2626" strokeDasharray="4 4" />}
                    <Area type="linear" dataKey="gap" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 6" strokeOpacity={0.65} fill="none" dot={false} activeDot={false} connectNulls tooltipType="none" isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                    <Area type="linear" dataKey="value" stroke="var(--chart-1)" strokeWidth={3} fill="url(#cinematicWeeklyProgressGradient)" dot={{ fill: 'var(--chart-1)', r: 4 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                  </AreaChart>
                </ResponsiveContainer>
              </CinematicChartPanel>
            </>
          )}

          {analyticsView === 'key_of_success' && (
            <CinematicChartPanel
              title={`Timer sessions - ${monthNames[currentMonth - 1]} ${currentYear}`}
              reducedMotion={reducedMotion}
              action={<SessionZoomToggle zoomed={sessionZoom} onToggle={() => setSessionZoom((value) => !value)} />}
            >
              <ResponsiveContainer width="100%" height={420}>
                <LineChart data={focusTimerSessionData} margin={{ top: 28, right: 24, left: -4, bottom: 8 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="t" type="number" scale="time" domain={sessionXDomain} ticks={sessionXTicks} allowDataOverflow stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} tickFormatter={(value) => formatSessionTick(value, sessionTickMode)} />
                  <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} allowDecimals={false} allowDataOverflow={sessionZoom} domain={sessionYDomain ?? [0, 'dataMax + 1']} />
                  <Tooltip {...sessionTooltipProps} contentStyle={cinematicTooltipStyle} />
                  {/* isAnimationActive cố định false: dữ liệu của biểu đồ này
                      tự làm mới mỗi 5s trong lúc có phiên đang chạy (xem
                      liveTick ở trên), và Recharts ẨN HẲN dot + LabelList
                      trong suốt thời gian một animation "vẽ vào" đang chạy.
                      Bật animation ở đây khiến chấm đỏ và nhãn thời lượng chỉ
                      lóe lên rồi tắt mỗi 5 giây thay vì hiển thị liên tục. */}
                  <Line type="linear" dataKey="idle" stroke="var(--foreground-subtle)" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="active" stroke="#2563eb" strokeWidth={3} dot={renderSessionDot} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false}>
                    <LabelList dataKey="label" position="top" className="fill-[#2563eb] text-[11px] font-semibold" />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </CinematicChartPanel>
          )}

          {analyticsView === 'cycle_ticks' && (
            <CinematicChartPanel title={`Holly Mind cumulative total - ${monthNames[currentMonth - 1]} ${currentYear}`} reducedMotion={reducedMotion}>
              <ResponsiveContainer width="100%" height={430}>
                <AreaChart data={holyMindCumulativeData} margin={{ top: 14, right: 22, left: -4, bottom: 8 }} accessibilityLayer>
                  <defs>
                    <linearGradient id="cinematicHolyMindGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={.32} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} domain={[0, 'dataMax + 5']} />
                  <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Holly Mind total'])} contentStyle={cinematicTooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={3} fill="url(#cinematicHolyMindGradient)" dot={{ fill: '#059669', r: 3 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            </CinematicChartPanel>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CinematicMetric({ index, label, value, reducedMotion }: { index: number; label: string; value: string; reducedMotion: boolean }) {
  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 32, delay: index * .045 }}
      className="rounded-[24px] border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-sm)] backdrop-blur-xl"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[var(--foreground-subtle)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-.045em] tabular-nums">{value}</p>
    </motion.article>
  );
}

function CinematicWeekSelector({ weeksCount, selectedWeek, onSelect, label, reducedMotion }: { weeksCount: number; selectedWeek: number; onSelect: (week: number) => void; label: string; reducedMotion: boolean }) {
  return (
    <section className="flex items-center justify-between gap-4 rounded-[22px] border border-[var(--border)] bg-[var(--glass)] p-3 shadow-[var(--shadow-sm)]">
      <p className="pl-2 text-sm text-[var(--foreground-muted)]">{label}</p>
      <div className="flex flex-wrap justify-end gap-2">
        {Array.from({ length: weeksCount }, (_, index) => index + 1).map((week) => (
          <button key={week} type="button" onClick={() => onSelect(week)} aria-pressed={selectedWeek === week} className="relative min-h-10 min-w-[76px] rounded-xl px-3 text-sm font-semibold">
            {selectedWeek === week && <motion.span layoutId="desktop-analytics-week" className="absolute inset-0 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)]" transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 36 }} />}
            <span className={`relative ${selectedWeek === week ? 'text-[var(--primary)]' : 'text-[var(--foreground-muted)]'}`}>Week {week}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CinematicChartPanel({
  title,
  action,
  children,
  reducedMotion,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  reducedMotion: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-md)] backdrop-blur-xl">
      {!reducedMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent"
          initial={{ x: '-120%', opacity: 0 }}
          animate={{ x: '420%', opacity: [0, .9, 0] }}
          transition={{ duration: .9, ease: 'easeOut' }}
        />
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-sm">
        <h2 className="text-base font-semibold tracking-[-.015em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Bỏ các phiên bị ghi trùng.
//
// Lỗi "phải bấm hai lần mới dừng" trước đây làm lần bấm thứ hai lưu thêm một
// phiên nữa cho đúng cùng một lần ngồi học — dữ liệu thật còn hai bản ghi cùng
// bắt đầu lúc 21:06:31 ngày 1/9, lệch nhau 6 giây ở lúc kết thúc. Hai phiên
// khởi động đúng cùng một giây cho cùng một task không thể là hai lần ngồi học
// khác nhau, nên chỉ giữ lại bản dài nhất.
function dedupeSessions(rows: ApiSession[]) {
  const byStart = new Map<string, ApiSession>();
  rows.forEach((session) => {
    const key = `${session.task_id ?? ''}@${session.start_time ?? session.id}`;
    const kept = byStart.get(key);
    if (!kept || getSessionFocusedMinutes(session) > getSessionFocusedMinutes(kept)) {
      byStart.set(key, session);
    }
  });
  return rows.filter((session) => byStart.get(`${session.task_id ?? ''}@${session.start_time ?? session.id}`) === session);
}

function normalizeSessionDate(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

function isDateKeyInMonth(dateKey: string, month: number, year: number) {
  return dateKey.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
}

function getSessionFocusedMinutes(session: ApiSession) {
  const storedMinutes = Number(session.focused_minutes);
  if (Number.isFinite(storedMinutes) && storedMinutes > 0) return storedMinutes;

  const startMs = new Date(session.start_time).getTime();
  const endMs = new Date(session.end_time).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.max(1, Math.round((endMs - startMs) / 60000));
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function formatHoursFromMinutes(minutes: number) {
  return `${roundOneDecimal(minutes / 60)}h`;
}

function isFutureDate(day: number, month: number, year: number) {
  const today = new Date();
  const date = new Date(year, month - 1, day);
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date > currentDate;
}

function getWeeksInMonth(month: number, year: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const adjustedFirstDay = (firstDay.getDay() + 6) % 7;
  return Math.ceil((lastDay.getDate() + adjustedFirstDay) / 7);
}

function getDaysInWeek(month: number, year: number, weekNumber: number) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const adjustedFirstDay = (firstDay.getDay() + 6) % 7;
  const dayCounter = 1 - adjustedFirstDay;
  let currentWeek = 1;
  const weekDays: Array<{ day: number; date: string; month: number; year: number }> = [];

  for (let index = 0; index < 42; index++) {
    const day = dayCounter + index;
    if (day >= 1 && day <= daysInMonth && currentWeek === weekNumber) {
      weekDays.push({ day, date: formatDateKey(year, month, day), month, year });
    }
    if ((index + 1) % 7 === 0) currentWeek++;
  }

  return weekDays;
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </motion.div>
  );
}

function CumulativeTotalPanel({
  selected,
  onSelect,
  totalFocusTimerMinutes,
  totalHolyMindMinutes,
}: {
  selected: 'timer' | 'holy';
  onSelect: (value: 'timer' | 'holy') => void;
  totalFocusTimerMinutes: number;
  totalHolyMindMinutes: number;
}) {
  const items = [
    {
      id: 'timer' as const,
      label: 'Timer total',
      value: formatHoursFromMinutes(totalFocusTimerMinutes),
      minutes: `${Math.round(totalFocusTimerMinutes)}m`,
      color: 'blue',
    },
    {
      id: 'holy' as const,
      label: 'Holly Mind',
      value: formatHoursFromMinutes(totalHolyMindMinutes),
      minutes: `${Math.round(totalHolyMindMinutes)}m`,
      color: 'emerald',
    },
  ];
  const active = items.find((item) => item.id === selected) || items[0];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Selected cumulative total</p>
          <div className="mt-1 flex items-end gap-3">
            <p className={`text-4xl font-semibold tabular-nums ${active.color === 'emerald' ? 'text-emerald-600' : 'text-blue-600'}`}>{active.value}</p>
            <p className="pb-1 text-sm font-medium text-slate-500">{active.minutes}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {items.map((item) => {
            const isActive = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`rounded-lg px-4 py-3 text-left transition ${
                  isActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="block text-xs font-medium">{item.label}</span>
                <span className="mt-1 block text-lg font-semibold tabular-nums">{item.value}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      {children}
    </button>
  );
}

function WeekSelector({
  weeksCount,
  selectedWeek,
  onSelect,
  label,
}: {
  weeksCount: number;
  selectedWeek: number;
  onSelect: (week: number) => void;
  label: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: weeksCount }, (_, index) => index + 1).map((week) => (
          <button
            key={week}
            type="button"
            onClick={() => onSelect(week)}
            className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
              selectedWeek === week
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'
            }`}
          >
            Week {week}
          </button>
        ))}
      </div>
    </section>
  );
}

function ChartPanel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-sm">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

/**
 * Nút bật/tắt "Phóng đại tối đa" của biểu đồ Timer sessions — dùng chung cho
 * cả bản legacy và desktop-cinematic nên style trung tính, không lệ thuộc
 * theme riêng của bên nào.
 */
function SessionZoomToggle({ zoomed, onToggle }: { zoomed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={zoomed}
      className={`inline-flex items-center gap-xs rounded-full border px-sm py-1 text-xs font-semibold transition ${
        zoomed
          ? 'border-primary bg-primary text-on-primary'
          : 'border-[var(--border,rgb(226_232_240))] text-on-surface-variant hover:border-primary hover:text-primary dark:text-white/65'
      }`}
    >
      {zoomed ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
      {zoomed ? 'Xem cả tháng' : 'Phóng đại tối đa'}
    </button>
  );
}
