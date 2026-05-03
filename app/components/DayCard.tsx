'use client';

import { DateInfo } from '@/app/lib/calendar';
import { ApiTask } from '@/app/lib/api';
import type { CalendarSessionItem } from './CalendarView';
import { BentoCard3D } from './BentoCard';
import { Calendar, Clock, Sparkles } from 'lucide-react';

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
  sessions?: CalendarSessionItem[];
  deadlineTasks?: ApiTask[];
}

export default function DayCard({ date, data, onSelectDay, sessionCount = 0, sessions = [], deadlineTasks = [] }: DayCardProps) {
  const focusedMinutes = data?.focused_minutes || 0;
  const visibleDeadlineTasks = deadlineTasks.slice(0, 2);
  const visibleSessions = sessions.slice(0, 2);
  const extraDeadlineCount = Math.max(deadlineTasks.length - visibleDeadlineTasks.length, 0);
  const extraSessionCount = Math.max(sessions.length - visibleSessions.length, 0);
  const hasDeadline = deadlineTasks.length > 0;
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

  const formatTime = (timeStr: string) => {
    const time = new Date(timeStr);
    return time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

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
      style={hasDeadline ? {
        border: '1px solid rgba(248, 113, 113, 0.38)',
        background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.34) 0%, rgba(69, 10, 10, 0.24) 55%, rgba(10, 10, 10, 0.96) 100%)',
        boxShadow: '0 0 28px rgba(239, 68, 68, 0.18), inset 0 1px 0 rgba(254, 202, 202, 0.12)',
      } : undefined}
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

          {sessions.length > 0 ? (
            <div className="space-y-1.5">
              {visibleSessions.map((session) => (
                <div key={session.id} className="rounded-md border border-yellow-400/35 bg-yellow-950/70 px-2 py-1 text-yellow-200 shadow-sm shadow-yellow-950/40">
                  <span className="block min-w-0 truncate text-xs font-semibold uppercase">
                    {session.taskTitle}
                  </span>
                  <span className="block text-[10px] font-medium text-yellow-100/70">
                    {formatTime(session.startTime)} - {formatTime(session.endTime)}
                  </span>
                </div>
              ))}
              {extraSessionCount > 0 && (
                <div className="rounded-md border border-yellow-400/25 bg-yellow-950/50 px-2 py-1 text-xs font-semibold text-yellow-200/90">
                  +{extraSessionCount} more session
                </div>
              )}
            </div>
          ) : deadlineTasks.length > 0 && (
            <div className="space-y-1.5">
              {visibleDeadlineTasks.map((task) => (
                <div key={task.id} className="rounded-md border border-red-500/30 bg-red-950/70 px-2 py-1 text-red-200 shadow-sm shadow-red-950/40">
                  <span className="min-w-0 truncate text-xs font-semibold uppercase">
                    {task.title}
                  </span>
                </div>
              ))}
              {extraDeadlineCount > 0 && (
                <div className="rounded-md border border-red-500/25 bg-red-950/50 px-2 py-1 text-xs font-semibold text-red-200/90">
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
