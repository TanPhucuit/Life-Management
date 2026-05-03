'use client';

import { DateInfo } from '@/app/lib/calendar';
import { ApiTask } from '@/app/lib/api';
import { BentoCard3D } from './BentoCard';
import { AlertCircle, Calendar, Clock, Sparkles } from 'lucide-react';

interface DateData {
  id?: string;
  day: number;
  month: number;
  year: number;
  focused_minutes: number;
  key_of_success: number;
}

interface DayCardProps {
  date: DateInfo;
  data?: DateData;
  onSelectDay?: () => void;
  sessionCount?: number;
  deadlineTasks?: ApiTask[];
}

export default function DayCard({ date, data, onSelectDay, sessionCount = 0, deadlineTasks = [] }: DayCardProps) {
  const focusedMinutes = data?.focused_minutes || 0;
  const visibleDeadlineTasks = deadlineTasks.slice(0, 2);
  const extraDeadlineCount = Math.max(deadlineTasks.length - visibleDeadlineTasks.length, 0);
  const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const cardTitle = `${weekdayLabels[date.date.getDay()]} ${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`;

  const isToday = (): boolean => {
    const today = new Date();
    return (
      date.day === today.getDate() &&
      date.month === today.getMonth() + 1 &&
      date.year === today.getFullYear()
    );
  };

  const focusedHours = (focusedMinutes / 60).toFixed(1);

  const handleClick = () => {
    if (date.isCurrentMonth && onSelectDay) {
      onSelectDay();
    }
  };

  const getIcon = () => {
    if (isToday()) return <Calendar size={20} className="text-yellow-400" />;
    if (sessionCount > 0) return <Clock size={20} className="text-blue-400" />;
    return <Sparkles size={20} className="text-white/40" />;
  };

  return (
    <BentoCard3D
      className={`p-4 h-full min-h-32 flex flex-col ${!date.isCurrentMonth ? 'opacity-40' : ''}`}
      glowing={isToday()}
      onClick={handleClick}
      icon={getIcon()}
      title={cardTitle}
      description={sessionCount > 0 ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''}` : 'No sessions'}
    >
      {date.isCurrentMonth && (
        <div className="space-y-4">
          {/* Hours Display */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Focus Time</span>
            <span className={`text-lg font-bold ${isToday() ? 'text-yellow-300' : 'text-cyan-400'}`}>
              {focusedHours}h
            </span>
          </div>

          {deadlineTasks.length > 0 && (
            <div className="space-y-1.5">
              {visibleDeadlineTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-1.5 text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="min-w-0 truncate text-xs font-semibold uppercase">
                    {task.title}
                  </span>
                </div>
              ))}
              {extraDeadlineCount > 0 && (
                <div className="text-xs font-semibold text-red-300/80">
                  +{extraDeadlineCount} more deadline
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </BentoCard3D>
  );
}
