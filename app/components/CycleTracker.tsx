'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck2, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { api, ApiCycleTick } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';

const cycleHours = Array.from({ length: 14 }, (_, index) => index + 8);
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { day, month, year };
}

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function getDayLabel(year: number, month: number, day: number) {
  const dayIndex = new Date(year, month - 1, day).getDay();
  return weekdayNames[(dayIndex + 6) % 7];
}

export default function CycleTracker() {
  const { user, currentMonth, currentYear, setCurrentMonth } = useAppStore();
  const today = new Date();
  const initialDay =
    today.getMonth() + 1 === currentMonth && today.getFullYear() === currentYear
      ? today.getDate()
      : 1;
  const [selectedDate, setSelectedDate] = useState(formatDateKey(currentYear, currentMonth, initialDay));
  const [ticks, setTicks] = useState<ApiCycleTick[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');

  const selected = parseDateKey(selectedDate);
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);

  useEffect(() => {
    const safeDay = Math.min(selected.day || 1, getDaysInMonth(currentMonth, currentYear));
    setSelectedDate(formatDateKey(currentYear, currentMonth, safeDay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, currentYear]);

  useEffect(() => {
    if (!user?.id) return;

    const loadTicks = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const rows = await api.getCycleTicks(user.id, currentMonth, currentYear);
        setTicks(rows);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load cycle data.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadTicks();
  }, [currentMonth, currentYear, user?.id]);

  const checkedKeys = useMemo(() => {
    const keys = new Set<string>();
    ticks.forEach((tick) => {
      if (tick.is_checked) keys.add(`${formatDateKey(tick.year, tick.month, tick.day)}:${tick.hour}`);
    });
    return keys;
  }, [ticks]);

  const selectedDayCount = cycleHours.filter((hour) => checkedKeys.has(`${selectedDate}:${hour}`)).length;
  const monthlyCount = checkedKeys.size;

  const dailyCounts = useMemo(() => {
    const counts = new Map<number, number>();
    ticks.forEach((tick) => {
      if (tick.is_checked) counts.set(tick.day, (counts.get(tick.day) || 0) + 1);
    });
    return counts;
  }, [ticks]);

  const moveMonth = (direction: -1 | 1) => {
    if (direction === -1 && currentMonth === 1) {
      setCurrentMonth(12, currentYear - 1);
      return;
    }
    if (direction === 1 && currentMonth === 12) {
      setCurrentMonth(1, currentYear + 1);
      return;
    }
    setCurrentMonth(currentMonth + direction, currentYear);
  };

  const toggleHour = async (hour: number) => {
    if (!user?.id) return;
    const key = `${selectedDate}:${hour}`;
    const nextChecked = !checkedKeys.has(key);

    setSavingKeys((current) => new Set(current).add(key));
    setErrorMessage('');
    setTicks((current) => {
      const existing = current.find(
        (tick) =>
          tick.day === selected.day &&
          tick.month === selected.month &&
          tick.year === selected.year &&
          tick.hour === hour
      );
      if (existing) {
        return current.map((tick) => (tick.id === existing.id ? { ...tick, is_checked: nextChecked } : tick));
      }
      return [
        ...current,
        {
          id: `optimistic-${key}`,
          user_id: user.id,
          day: selected.day,
          month: selected.month,
          year: selected.year,
          hour,
          is_checked: nextChecked,
        },
      ];
    });

    try {
      const saved = await api.setCycleTick({
        userId: user.id,
        day: selected.day,
        month: selected.month,
        year: selected.year,
        hour,
        checked: nextChecked,
      });
      setTicks((current) => {
        const withoutCurrent = current.filter(
          (tick) =>
            !(
              tick.day === selected.day &&
              tick.month === selected.month &&
              tick.year === selected.year &&
              tick.hour === hour
            )
        );
        return [...withoutCurrent, saved];
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save this cycle block.');
      const rows = await api.getCycleTicks(user.id, currentMonth, currentYear).catch(() => null);
      if (rows) setTicks(rows);
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      <section className="premium-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-yellow-50 text-yellow-700">
              <CalendarCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Cycles</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selected.day} {monthNames[selected.month - 1]} {selected.year}
              </p>
            </div>
          </div>

          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-950"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[140px] text-center text-sm font-semibold text-slate-900">
              {monthNames[currentMonth - 1]} {currentYear}
            </div>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-950"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="Selected day" value={`${selectedDayCount}/14`} />
        <MetricCard label="Monthly total" value={monthlyCount} />
        <MetricCard label="Monthly target" value="240" />
      </section>

      <main className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="premium-card p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-950">Choose a day</h3>
              <p className="text-sm text-slate-500">{monthNames[currentMonth - 1]} {currentYear}</p>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                const next = parseDateKey(event.target.value);
                if (!next.day || !next.month || !next.year) return;
                setCurrentMonth(next.month, next.year);
                setSelectedDate(event.target.value);
              }}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
              const dateKey = formatDateKey(currentYear, currentMonth, day);
              const active = selectedDate === dateKey;
              const dayCount = dailyCounts.get(day) || 0;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                  className={`min-h-[64px] rounded-md border p-1.5 text-left transition ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/50'
                  }`}
                >
                  <span className="block text-[11px] font-medium text-slate-400">{getDayLabel(currentYear, currentMonth, day)}</span>
                  <span className="mt-0.5 block text-sm font-semibold">{day}</span>
                  {dayCount > 0 && (
                    <span className="mt-1 inline-flex rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800">
                      {dayCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="premium-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-950">Focus blocks</h3>
              <p className="text-sm text-slate-500">{selectedDayCount} blocks checked</p>
            </div>
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
            {cycleHours.map((hour) => {
              const key = `${selectedDate}:${hour}`;
              const checked = checkedKeys.has(key);
              const saving = savingKeys.has(key);
              return (
                <button
                  key={hour}
                  type="button"
                  onClick={() => void toggleHour(hour)}
                  disabled={saving}
                  className={`group flex h-16 items-center justify-between rounded-md border px-3 text-left transition ${
                    checked
                      ? 'border-yellow-300 bg-yellow-300 text-slate-950 shadow-sm shadow-yellow-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-yellow-300 hover:bg-yellow-50'
                  } disabled:cursor-wait disabled:opacity-80`}
                >
                  <span className="text-base font-semibold">{hour}:00</span>
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border transition ${
                      checked
                        ? 'border-yellow-500 bg-white/80 text-yellow-700'
                        : 'border-slate-200 bg-slate-50 text-transparent group-hover:text-yellow-500'
                    }`}
                  >
                    {checked && (
                      <motion.span
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                      >
                        <Check className="h-4 w-4 stroke-[3]" />
                      </motion.span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </motion.div>
  );
}
