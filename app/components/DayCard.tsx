'use client';

import { DateInfo } from '@/app/lib/calendar';
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
}

export default function DayCard({ date, data, onSelectDay, sessionCount = 0 }: DayCardProps) {
  const focusedMinutes = data?.focused_minutes || 0;
  const keyOfSuccess = data?.key_of_success || 0;

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
      title={`Day ${date.day}`}
      description={sessionCount > 0 ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''}` : 'No sessions'}
    >
      {date.isCurrentMonth && data && (
        <div className="space-y-4">
          {/* Hours Display */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Focus Time</span>
            <span className={`text-lg font-bold ${isToday() ? 'text-yellow-300' : 'text-cyan-400'}`}>
              {focusedHours}h
            </span>
          </div>

          {/* Key of Success Dots */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-white/50">Success</span>
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i < keyOfSuccess
                      ? 'bg-gradient-to-r from-green-400 to-emerald-500 shadow-lg shadow-green-500/50'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </BentoCard3D>
  );
}
