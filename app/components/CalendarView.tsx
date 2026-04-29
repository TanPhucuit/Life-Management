'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { calendarUtils } from '@/app/lib/calendar';
import { api, ApiDate, ApiSession } from '@/app/lib/api';
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

export default function CalendarView({ month, year, onMonthChange, onSelectDay }: CalendarViewProps) {
  const { user } = useAppStore();
  const [dateData, setDateData] = useState<Map<string, DateData>>(new Map());
  const [sessionCountByDate, setSessionCountByDate] = useState<Map<string, number>>(new Map());

  const calendar_data = calendarUtils.getMonthCalendar(year, month);

  useEffect(() => {
    if (!user?.id) return;

    void loadDatesData(user.id);
  }, [month, year]);

  const loadDatesData = async (userId: string) => {
    try {
      const [filteredData, sessions] = await Promise.all([
        api.getDates(userId, month, year),
        api.getSessions(userId, { month, year }),
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

      const counts = new Map<string, number>();
      sessions.forEach((session: ApiSession) => {
        const [sessionYear, sessionMonth, sessionDay] = session.session_date.split('-').map(Number);
        const key = `${sessionDay}-${sessionMonth}-${sessionYear}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      setSessionCountByDate(counts);
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
    <BentoCard className="h-full flex flex-col p-8" hover={false}>
      {/* Month Header */}
      <div className="flex justify-between items-center mb-8">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all duration-300"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="text-center flex-1">
          <h2 className="text-3xl font-bold text-white">
            {monthNames[month - 1]} {year}
          </h2>
        </div>

        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all duration-300"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-8 mb-6">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-white/70 font-medium py-3 text-sm">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-8 flex-1 auto-rows-fr">
        {calendar_data.allDates.map((dateInfo, index) => {
          const key = `${dateInfo.day}-${dateInfo.month}-${dateInfo.year}`;
          const data = dateData.get(key);

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02 }}
            >
              <DayCard
                date={dateInfo}
                data={data}
                sessionCount={sessionCountByDate.get(key) || 0}
                onSelectDay={() => onSelectDay?.(dateInfo.day, dateInfo.month, dateInfo.year)}
              />
            </motion.div>
          );
        })}
      </div>
    </BentoCard>
  );
}
