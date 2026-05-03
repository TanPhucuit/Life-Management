'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { calendarUtils } from '@/app/lib/calendar';
import { api, ApiDate, ApiSession, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DayCard from './DayCard';
import { BentoCard } from './BentoCard';

interface CalendarViewProps {
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
  onSelectDay?: (day: number, month: number, year: number) => void;
}

interface DateData {
  id?: string;
  day: number;
  month: number;
  year: number;
  focused_minutes: number;
  key_of_success: number;
}

export interface CalendarSessionItem {
  id: string;
  sessionName: string;
  startTime: string;
  endTime: string;
}

export default function CalendarView({ month, year, onMonthChange, onSelectDay }: CalendarViewProps) {
  const { user } = useAppStore();
  const [dateData, setDateData] = useState<Map<string, DateData>>(new Map());
  const [sessionsByDate, setSessionsByDate] = useState<Map<string, CalendarSessionItem[]>>(new Map());
  const [deadlineTasksByDate, setDeadlineTasksByDate] = useState<Map<string, ApiTask[]>>(new Map());

  const calendar_data = calendarUtils.getMonthCalendar(year, month);

  useEffect(() => {
    if (!user?.id) return;

    void loadDatesData(user.id);
  }, [month, year, user?.id]);

  const getDateKeyFromDateString = (value: string | null | undefined) => {
    if (!value) return null;

    const [datePart] = value.split('T');
    const [dateYear, dateMonth, dateDay] = datePart.split('-').map(Number);
    if (!dateDay || !dateMonth || !dateYear) return null;

    return `${dateDay}-${dateMonth}-${dateYear}`;
  };

  const loadDatesData = async (userId: string) => {
    try {
      const [filteredData, sessions, tasks] = await Promise.all([
        api.getDates(userId, month, year),
        api.getSessions(userId, { month, year }),
        api.getTasks(userId),
      ]);

      const dataMap = new Map<string, DateData>();
      filteredData.forEach((item: ApiDate) => {
        const key = `${item.day}-${item.month}-${item.year}`;
        dataMap.set(key, {
          id: item.id,
          day: item.day,
          month: item.month,
          year: item.year,
          focused_minutes: item.focused_minutes || 0,
          key_of_success: item.key_of_success || 0,
        });
      });
      setDateData(dataMap);

      const sessionItems = new Map<string, CalendarSessionItem[]>();

      sessions.forEach((session: ApiSession) => {
        const key = getDateKeyFromDateString(session.session_date);
        if (!key) return;

        sessionItems.set(key, [
          ...(sessionItems.get(key) || []),
          {
            id: session.id,
            sessionName: session.session_name || 'Untitled session',
            startTime: session.start_time,
            endTime: session.end_time,
          },
        ]);
      });
      setSessionsByDate(sessionItems);

      const deadlineTasks = new Map<string, ApiTask[]>();
      tasks.forEach((task: ApiTask) => {
        const key = getDateKeyFromDateString(task.deadline);
        if (!key) return;

        deadlineTasks.set(key, [...(deadlineTasks.get(key) || []), task]);
      });
      setDeadlineTasksByDate(deadlineTasks);
    } catch (error) {
      console.error('Error loading dates:', error);
    }
  };

  const handlePrevMonth = () => {
    if (month === 1) {
      onMonthChange(12, year - 1);
    } else {
      onMonthChange(month - 1, year);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onMonthChange(1, year + 1);
    } else {
      onMonthChange(month + 1, year);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <BentoCard className="h-full flex flex-col rounded-[24px] p-4 sm:p-6 lg:rounded-[32px] lg:p-8" hover={false}>
      {/* Month Header */}
      <div className="mb-5 flex items-center justify-between sm:mb-8">
        <button
          onClick={handlePrevMonth}
          className="rounded-lg p-2 text-white/60 transition-all duration-300 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <div className="text-center flex-1">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {monthNames[month - 1]} {year}
          </h2>
        </div>

        <button
          onClick={handleNextMonth}
          className="rounded-lg p-2 text-white/60 transition-all duration-300 hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="mb-6 hidden grid-cols-7 gap-4 xl:grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-white/70 font-medium py-3 text-sm">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:gap-4 xl:grid-cols-7">
        {calendar_data.allDates.map((dateInfo, index) => {
          const key = `${dateInfo.day}-${dateInfo.month}-${dateInfo.year}`;
          const data = dateData.get(key);
          const daySessions = sessionsByDate.get(key) || [];

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02 }}
              className={!dateInfo.isCurrentMonth ? 'hidden xl:block' : undefined}
            >
              <DayCard
                date={dateInfo}
                data={data}
                sessionCount={daySessions.length}
                sessions={daySessions}
                deadlineTasks={deadlineTasksByDate.get(key) || []}
                onSelectDay={() => onSelectDay?.(dateInfo.day, dateInfo.month, dateInfo.year)}
              />
            </motion.div>
          );
        })}
      </div>
    </BentoCard>
  );
}
