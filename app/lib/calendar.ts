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
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

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

      if (dateInfo.date.getDay() === 0 || dateInfo === dates[dates.length - 1]) {
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
      allDates: dates.filter((d) => d.isCurrentMonth),
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
    return startOfWeek(date);
  },

  getEndOfWeek(date: Date): Date {
    return endOfWeek(date);
  },
};
