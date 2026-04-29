'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { calendarUtils } from '@/app/lib/calendar';
import { mockDates } from '@/app/lib/mockData';
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
  const [dateData, setDateData] = useState<Map<string, DateData>>(new Map());

  const calendar_data = calendarUtils.getMonthCalendar(year, month);

  useEffect(() => {
    loadDatesData();
  }, [month, year]);

  const loadDatesData = async () => {
    try {
      // Mock data loading - filter by month and year
      const filteredData = mockDates.filter(d => d.month === month && d.year === year);

      const dataMap = new Map<string, DateData>();
      filteredData.forEach((item: any) => {
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

  const handleDateUpdate = async (day: number, updates: Partial<DateData>) => {
    try {
      const key = `${day}-${month}-${year}`;
      const existingData = dateData.get(key);

      const newData: DateData = {
        day,
        month,
        year,
        focused_minutes: updates.focused_minutes ?? existingData?.focused_minutes ?? 0,
        key_of_success: updates.key_of_success ?? existingData?.key_of_success ?? 0,
        id: existingData?.id ?? Math.random().toString(),
      };

      setDateData((prev) => new Map(prev).set(key, newData));
      console.log('Date updated (mock):', newData);
    } catch (error) {
      console.error('Error updating date:', error);
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
                onUpdate={(updates) => handleDateUpdate(dateInfo.day, updates)}
                onSelectDay={() => onSelectDay?.(dateInfo.day, dateInfo.month, dateInfo.year)}
              />
            </motion.div>
          );
        })}
      </div>
    </BentoCard>
  );
}
