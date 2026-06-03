'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarUtils } from '@/app/lib/calendar';
import { api, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';

interface CalendarViewProps {
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
  onSelectDay?: (day: number, month: number, year: number) => void;
}

const monthNames = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const weekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const getDateKeyFromDateString = (value: string | null | undefined) => {
  if (!value) return null;
  const [datePart] = value.split('T');
  const [dateYear, dateMonth, dateDay] = datePart.split('-').map(Number);
  if (!dateDay || !dateMonth || !dateYear) return null;
  return `${dateDay}-${dateMonth}-${dateYear}`;
};

export default function CalendarView({ month, year, onMonthChange, onSelectDay }: CalendarViewProps) {
  const { user } = useAppStore();
  const [startTasksByDate, setStartTasksByDate] = useState<Map<string, ApiTask[]>>(new Map());
  const [deadlineTasksByDate, setDeadlineTasksByDate] = useState<Map<string, ApiTask[]>>(new Map());
  const calendarData = calendarUtils.getMonthCalendar(year, month);

  useEffect(() => {
    if (!user?.id) return;

    const loadCalendar = async () => {
      try {
        const tasks = await api.getTasks(user.id, { view: 'tree' });

        const starts = new Map<string, ApiTask[]>();
        const deadlines = new Map<string, ApiTask[]>();
        tasks.forEach((task) => {
          const startKey = getDateKeyFromDateString(task.start_date);
          if (startKey) starts.set(startKey, [...(starts.get(startKey) || []), task]);

          const deadlineKey = getDateKeyFromDateString(task.deadline);
          if (deadlineKey) deadlines.set(deadlineKey, [...(deadlines.get(deadlineKey) || []), task]);
        });
        setStartTasksByDate(starts);
        setDeadlineTasksByDate(deadlines);
      } catch (error) {
        console.error('Error loading calendar:', error);
      }
    };

    void loadCalendar();
  }, [month, user?.id, year]);

  const handlePrevMonth = () => {
    onMonthChange(month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year);
  };

  const handleNextMonth = () => {
    onMonthChange(month === 12 ? 1 : month + 1, month === 12 ? year + 1 : year);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white pb-16 shadow-sm lg:pb-0">
      <header className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{monthNames[month - 1]} {year}</h2>
          <p className="text-sm text-slate-500">Ngày thực hiện màu xanh dương, deadline màu đỏ.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrevMonth} className="rounded-md border border-slate-200 p-2 hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => onMonthChange(new Date().getMonth() + 1, new Date().getFullYear())} className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
            Hôm nay
          </button>
          <button onClick={handleNextMonth} className="rounded-md border border-slate-200 p-2 hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekdayNames.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-slate-500">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
        {calendarData.allDates.map((dateInfo, index) => {
          const key = `${dateInfo.day}-${dateInfo.month}-${dateInfo.year}`;
          const startTasks = startTasksByDate.get(key) || [];
          const deadlines = deadlineTasksByDate.get(key) || [];
          const isToday = dateInfo.day === new Date().getDate() && dateInfo.month === new Date().getMonth() + 1 && dateInfo.year === new Date().getFullYear();
          const totalItems = startTasks.length + deadlines.length;

          return (
            <button
              key={`${key}-${index}`}
              onClick={() => dateInfo.isCurrentMonth && onSelectDay?.(dateInfo.day, dateInfo.month, dateInfo.year)}
              className={`min-h-[150px] border-b border-r border-slate-200 p-2 text-left transition hover:bg-blue-50/40 ${dateInfo.isCurrentMonth ? 'bg-white' : 'hidden bg-slate-50 text-slate-300 xl:block'} ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>
                  {dateInfo.day}
                </span>
                {totalItems > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{totalItems}</span>}
              </div>

              <div className="space-y-1">
                {startTasks.slice(0, 3).map((task) => (
                  <div key={`start-${task.id}`} className="truncate rounded border border-blue-200 bg-blue-50 px-1.5 py-1 text-[11px] font-medium text-blue-700">
                    Bắt đầu: {task.title}
                  </div>
                ))}
                {deadlines.slice(0, Math.max(0, 5 - Math.min(startTasks.length, 3))).map((task) => (
                  <div key={`deadline-${task.id}`} className="truncate rounded border border-red-200 bg-red-50 px-1.5 py-1 text-[11px] font-medium text-red-700">
                    Hạn: {task.title}
                  </div>
                ))}
                {totalItems > 5 && (
                  <div className="text-[11px] text-slate-500">+{totalItems - 5} mục khác</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
