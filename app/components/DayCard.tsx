'use client';

import { DateInfo } from '@/app/lib/calendar';
import { ApiTask } from '@/app/lib/api';
import { BentoCard3D } from './BentoCard';
import { Calendar, Sparkles } from 'lucide-react';

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
  deadlineTasks?: ApiTask[];
}

export default function DayCard({ date, data, onSelectDay, deadlineTasks = [] }: DayCardProps) {
  const focusedMinutes = data?.focused_minutes || 0;
  const visibleDeadlineTasks = deadlineTasks.slice(0, 6);
  const extraDeadlineCount = Math.max(deadlineTasks.length - visibleDeadlineTasks.length, 0);
  const hasDeadline = deadlineTasks.length > 0;
  const deadlineGridClass = deadlineTasks.length <= 2 ? 'grid-cols-1' : 'grid-cols-2';
  const deadlineItemClass = deadlineTasks.length <= 2
    ? 'px-2 py-1.5'
    : 'px-1.5 py-1';
  const deadlineNameClass = deadlineTasks.length <= 2
    ? 'text-[11px] sm:text-xs leading-snug whitespace-normal break-words'
    : 'truncate text-[10px] leading-tight';
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
    return <Sparkles size={20} className="text-white/40" />;
  };

  return (
    <BentoCard3D
      className={`flex h-[220px] min-h-[220px] flex-col rounded-[24px] p-3 sm:h-[236px] sm:min-h-[236px] sm:p-4 xl:h-[250px] xl:min-h-[250px] ${!date.isCurrentMonth ? 'opacity-40' : ''}`}
      glowing={isToday()}
      hover={false}
      onClick={handleClick}
      icon={getIcon()}
      title={cardTitle}
      description={deadlineTasks.length > 0 ? `${deadlineTasks.length} deadline` : 'No deadlines'}
      style={hasDeadline ? {
        border: '1px solid rgba(248, 113, 113, 0.38)',
        background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.34) 0%, rgba(69, 10, 10, 0.24) 55%, rgba(10, 10, 10, 0.96) 100%)',
        boxShadow: '0 0 28px rgba(239, 68, 68, 0.18), inset 0 1px 0 rgba(254, 202, 202, 0.12)',
      } : undefined}
    >
      {date.isCurrentMonth && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Hours Display */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Focus Time</span>
            <span className={`text-lg font-bold ${isToday() ? 'text-yellow-300' : 'text-cyan-400'}`}>
              {focusedHours}h
            </span>
          </div>

          {deadlineTasks.length > 0 && (
            <div className={`grid min-h-0 ${deadlineGridClass} gap-1.5 overflow-hidden`}>
              {visibleDeadlineTasks.map((task) => (
                <div key={task.id} className={`min-w-0 rounded border border-red-500/30 bg-red-950/70 ${deadlineItemClass} text-red-200 shadow-sm shadow-red-950/40`}>
                  <span className={`block min-w-0 font-semibold normal-case ${deadlineNameClass}`}>
                    {task.title}
                  </span>
                </div>
              ))}
              {extraDeadlineCount > 0 && (
                <div className="min-w-0 rounded border border-red-500/25 bg-red-950/50 px-1.5 py-1 text-[10px] font-semibold leading-tight text-red-200/90">
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
