import { startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, format } from 'date-fns';

export interface DateInfo {
  date: Date;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
}

export interface WeekInfo {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  dates: DateInfo[];
}

export interface MonthCalendar {
  month: number;
  year: number;
  weeks: WeekInfo[];
  allDates: DateInfo[];
}

export const calendarUtils = {
  getMonthCalendar(year: number, month: number): MonthCalendar {
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(monthStart);
    // Chủ Nhật là đầu tuần, khớp với hàng tiêu đề Sun..Sat của CalendarView và
    // với Date.getDay() (0 = Chủ Nhật) mà chính file đó dùng ở chỗ khác.
    // Trước đây lưới dựng theo thứ Hai đầu tuần trong khi tiêu đề ghi Sun
    // trước, nên mọi ngày bị đẩy lệch đúng một cột: 2/9/2026 là thứ Tư nhưng
    // rơi vào cột TUE.
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const allDays = eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    });

    const dates: DateInfo[] = allDays.map((date) => ({
      date,
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    }));

    // Group dates into weeks
    const weeks: WeekInfo[] = [];
    let currentWeek: DateInfo[] = [];

    for (const dateInfo of dates) {
      currentWeek.push(dateInfo);

      // Tuần kết thúc vào thứ Bảy (6) vì tuần bắt đầu từ Chủ Nhật.
      if (dateInfo.date.getDay() === 6 || dateInfo === dates[dates.length - 1]) {
        const weekStart = currentWeek[0].date;
        const weekEnd = currentWeek[currentWeek.length - 1].date;
        weeks.push({
          weekNumber: weeks.length + 1,
          startDate: weekStart,
          endDate: weekEnd,
          dates: [...currentWeek],
        });
        currentWeek = [];
      }
    }

    return {
      month,
      year,
      weeks,
      allDates: dates,
    };
  },

  getDateRange(startDate: Date, endDate: Date) {
    const months: { year: number; month: number }[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      months.push({
        year: current.getFullYear(),
        month: current.getMonth() + 1,
      });
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  },

  formatDate(date: Date, formatStr: string = 'dd/MM/yyyy'): string {
    return format(date, formatStr);
  },

  getStartOfWeek(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 0 });
  },

  getEndOfWeek(date: Date): Date {
    return endOfWeek(date, { weekStartsOn: 0 });
  },
};
