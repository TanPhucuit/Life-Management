'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiCycleTick, ApiDate } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';

type AnalyticsView = 'month_overview' | 'week_daily' | 'weekly_progress' | 'key_of_success' | 'cycle_ticks';
type ChartPoint = { name: string; value: number | null };
type CycleChartPoint = { name: string; count: number | null; cumulative: number | null };

export type AnalyticsVariant = 'legacy' | 'desktop-cinematic';

interface AnalyticsProps {
  variant?: AnalyticsVariant;
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const cycleTarget = 240;

export default function Analytics({ variant = 'legacy' }: AnalyticsProps) {
  const { selectedMonth, selectedYear, currentMonth: storeMonth, currentYear: storeYear, user } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || storeMonth || new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(selectedYear || storeYear || new Date().getFullYear());
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>('month_overview');
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [allDates, setAllDates] = useState<ApiDate[]>([]);
  const [cycleTicks, setCycleTicks] = useState<ApiCycleTick[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user?.id) return;

    const loadDates = async () => {
      try {
        setErrorMessage('');
        const dates = await api.getDates(user.id);
        setAllDates(dates);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load analytics data.');
      }
    };

    void loadDates();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const loadCycleTicks = async () => {
      try {
        setErrorMessage('');
        const rows = await api.getCycleTicks(user.id, currentMonth, currentYear);
        setCycleTicks(rows);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load cycle data.');
      }
    };

    void loadCycleTicks();
  }, [currentMonth, currentYear, user?.id]);

  const studyHoursByDate = useMemo(() => {
    const hoursByDate: Record<string, number> = {};
    allDates.forEach((date) => {
      const dateKey = formatDateKey(date.year, date.month, date.day);
      const minutes = Number(date.focused_minutes) || 0;
      hoursByDate[dateKey] = (hoursByDate[dateKey] || 0) + minutes / 60;
    });
    return hoursByDate;
  }, [allDates]);

  const weeksCount = getWeeksInMonth(currentMonth, currentYear);

  useEffect(() => {
    if (selectedWeek > weeksCount) setSelectedWeek(1);
  }, [selectedWeek, weeksCount]);

  const weeklyData = useMemo(() => {
    return Array.from({ length: weeksCount }, (_, index) => {
      const week = index + 1;
      const days = getDaysInWeek(currentMonth, currentYear, week);
      const hours = days.reduce((sum, day) => sum + (studyHoursByDate[day.date] || 0), 0);
      return { name: `Week ${week}`, hours: roundOneDecimal(hours) };
    });
  }, [currentMonth, currentYear, studyHoursByDate, weeksCount]);

  const dailyData = useMemo(() => {
    return getDaysInWeek(currentMonth, currentYear, selectedWeek).map((day) => {
      const dayOfWeek = new Date(day.year, day.month - 1, day.day).getDay();
      return {
        name: `${dayNames[dayOfWeek]} ${day.day}`,
        hours: roundOneDecimal(studyHoursByDate[day.date] || 0),
      };
    });
  }, [currentMonth, currentYear, selectedWeek, studyHoursByDate]);

  const kosDistribution = useMemo(() => {
    const monthData = allDates.filter((date) => date.year === currentYear && date.month === currentMonth);
    const successDays = monthData.filter((date) => Number(date.key_of_success) > 0).length;
    const noSuccessDays = monthData.filter((date) => Number(date.key_of_success) === 0).length;

    return [
      { name: 'With Key of Success', value: successDays, color: 'var(--chart-1)' },
      { name: 'Without Key of Success', value: noSuccessDays, color: 'var(--chart-4)' },
    ];
  }, [allDates, currentMonth, currentYear]);

  const weeklyProgressData = useMemo(() => {
    const days = getDaysInWeek(currentMonth, currentYear, selectedWeek);
    let cumulativeSum = 0;

    return days.map((day) => {
      cumulativeSum += studyHoursByDate[day.date] || 0;
      const dayOfWeek = new Date(day.year, day.month - 1, day.day).getDay();
      const shouldShowValue = allDates.some((date) => date.year === day.year && date.month === day.month && date.day === day.day) && !isFutureDate(day.day, day.month, day.year);

      return {
        name: `${dayNames[dayOfWeek]} ${day.day}`,
        value: shouldShowValue ? roundOneDecimal(cumulativeSum) : null,
      };
    });
  }, [allDates, currentMonth, currentYear, selectedWeek, studyHoursByDate]);

  const kosTrend = useMemo(() => {
    const monthData = allDates.filter((date) => date.year === currentYear && date.month === currentMonth);
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const trendData: ChartPoint[] = [];
    let cumulativeSum = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayData = monthData.find((date) => date.day === day);
      if (dayData) cumulativeSum += Number(dayData.key_of_success) || 0;

      trendData.push({
        name: `${day}`,
        value: dayData && !isFutureDate(day, currentMonth, currentYear) ? cumulativeSum : null,
      });
    }

    return trendData;
  }, [allDates, currentMonth, currentYear]);

  const cycleMonthlyData = useMemo<CycleChartPoint[]>(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const countByDay = new Map<number, number>();

    cycleTicks.forEach((tick) => {
      if (!tick.is_checked) return;
      countByDay.set(tick.day, (countByDay.get(tick.day) || 0) + 1);
    });

    let cumulative = 0;
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const count = countByDay.get(day) || 0;
      cumulative += count;
      const shouldShowValue = !isFutureDate(day, currentMonth, currentYear);
      return {
        name: String(day),
        count: shouldShowValue ? count : null,
        cumulative: shouldShowValue ? cumulative : null,
      };
    });
  }, [cycleTicks, currentMonth, currentYear]);

  const monthlyTotalHours = weeklyData.reduce((sum, week) => sum + week.hours, 0);
  const monthlyCycleCount = cycleTicks.filter((tick) => tick.is_checked).length;
  const monthlyRecordCount = allDates.filter((date) => date.year === currentYear && date.month === currentMonth).length;
  const monthlyKosTotal = allDates
    .filter((date) => date.year === currentYear && date.month === currentMonth)
    .reduce((sum, date) => sum + (Number(date.key_of_success) || 0), 0);
  const weeklyProgressMax = Math.max(0, ...weeklyProgressData.map((point) => point.value || 0));
  const weeklyProgressDomain: [number, number] = weeklyProgressMax > 50 ? [0, 90] : [0, 45];
  const cycleDomainMax = Math.max(cycleTarget + 20, monthlyCycleCount + 20);

  const moveMonth = (direction: -1 | 1) => {
    setCurrentMonth((month) => {
      if (direction === -1 && month === 1) {
        setCurrentYear((year) => year - 1);
        return 12;
      }
      if (direction === 1 && month === 12) {
        setCurrentYear((year) => year + 1);
        return 1;
      }
      return month + direction;
    });
    setSelectedWeek(1);
  };

  if (variant === 'desktop-cinematic') {
    return (
      <DesktopCinematicAnalytics
        analyticsView={analyticsView}
        currentMonth={currentMonth}
        currentYear={currentYear}
        cycleDomainMax={cycleDomainMax}
        cycleMonthlyData={cycleMonthlyData}
        dailyData={dailyData}
        errorMessage={errorMessage}
        kosDistribution={kosDistribution}
        kosTrend={kosTrend}
        monthlyCycleCount={monthlyCycleCount}
        monthlyKosTotal={monthlyKosTotal}
        monthlyRecordCount={monthlyRecordCount}
        monthlyTotalHours={monthlyTotalHours}
        moveMonth={moveMonth}
        selectedWeek={selectedWeek}
        setAnalyticsView={setAnalyticsView}
        setSelectedWeek={setSelectedWeek}
        weeklyData={weeklyData}
        weeklyProgressData={weeklyProgressData}
        weeklyProgressDomain={weeklyProgressDomain}
        weeklyProgressMax={weeklyProgressMax}
        weeksCount={weeksCount}
      />
    );
  }

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      <section className="premium-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Progress analytics</h2>
            <p className="mt-1 text-sm text-slate-500">Study time, weekly momentum, success keys, and cycle consistency.</p>
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
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Study hours" value={`${roundOneDecimal(monthlyTotalHours)}h`} />
        <MetricCard label="Tracked days" value={monthlyRecordCount} />
        <MetricCard label="Success keys" value={monthlyKosTotal} />
        <MetricCard label="Cycle blocks" value={monthlyCycleCount} />
      </section>

      <section className="glass-panel rounded-2xl p-2">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <ViewButton active={analyticsView === 'month_overview'} onClick={() => setAnalyticsView('month_overview')}>
            Month overview
          </ViewButton>
          <ViewButton active={analyticsView === 'week_daily'} onClick={() => setAnalyticsView('week_daily')}>
            Week details
          </ViewButton>
          <ViewButton active={analyticsView === 'weekly_progress'} onClick={() => setAnalyticsView('weekly_progress')}>
            Weekly progress
          </ViewButton>
          <ViewButton active={analyticsView === 'key_of_success'} onClick={() => setAnalyticsView('key_of_success')}>
            Key of Success
          </ViewButton>
          <ViewButton active={analyticsView === 'cycle_ticks'} onClick={() => setAnalyticsView('cycle_ticks')}>
            Cycles
          </ViewButton>
        </div>
      </section>

      {analyticsView === 'month_overview' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartPanel title={`Study hours by week — ${monthNames[currentMonth - 1]}`}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData} barCategoryGap="22%" accessibilityLayer>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip formatter={(value) => [`${value}h`, 'Study time']} />
                <Bar dataKey="hours" fill="var(--chart-1)" maxBarSize={52} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title="Key of Success distribution">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart accessibilityLayer>
                <Pie data={kosDistribution} dataKey="value" nameKey="name" outerRadius={92} labelLine={false}>
                  {kosDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {kosDistribution.map((entry) => (
                <div key={entry.name} className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}: <span className="font-semibold text-slate-900">{entry.value}</span>
                </div>
              ))}
            </div>
          </ChartPanel>
        </div>
      )}

      {analyticsView === 'week_daily' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <WeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week" />
          <ChartPanel title={`Daily study hours — Week ${selectedWeek}`}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dailyData} barCategoryGap="22%" accessibilityLayer>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#64748b" angle={-35} textAnchor="end" height={70} />
                <YAxis stroke="#64748b" />
                <Tooltip formatter={(value) => [`${value}h`, 'Study time']} />
                <Bar dataKey="hours" fill="var(--chart-2)" maxBarSize={46} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </motion.div>
      )}

      {analyticsView === 'weekly_progress' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <WeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week to view progress" />
          <ChartPanel title={`Cumulative study time — Week ${selectedWeek}`}>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={weeklyProgressData} accessibilityLayer>
                <defs>
                  <linearGradient id="weeklyProgressGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#64748b" angle={-35} textAnchor="end" height={70} />
                <YAxis stroke="#64748b" domain={weeklyProgressDomain} allowDataOverflow={false} />
                <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Cumulative'])} />
                <ReferenceLine y={40} label={{ value: '40h', fill: '#d97706', fontSize: 12 }} stroke="#d97706" strokeDasharray="4 4" />
                {weeklyProgressMax > 50 && (
                  <ReferenceLine y={80} label={{ value: '80h', fill: '#dc2626', fontSize: 12 }} stroke="#dc2626" strokeDasharray="4 4" />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fill="url(#weeklyProgressGradient)"
                  dot={{ fill: '#2563eb', r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </motion.div>
      )}

      {analyticsView === 'key_of_success' && (
        <ChartPanel title={`Key of Success progress — ${monthNames[currentMonth - 1]} ${currentYear}`}>
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={kosTrend} accessibilityLayer>
              <defs>
                <linearGradient id="kosGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" domain={[0, 'dataMax + 5']} />
              <Tooltip formatter={(value) => (value == null ? [] : [value, 'Key of Success'])} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f97316"
                strokeWidth={3}
                fill="url(#kosGradient)"
                dot={{ fill: '#f97316', r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {analyticsView === 'cycle_ticks' && (
        <ChartPanel title={`Checked cycle blocks — ${monthNames[currentMonth - 1]} ${currentYear}`}>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={cycleMonthlyData} accessibilityLayer>
              <defs>
                <linearGradient id="cycleGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" domain={[0, cycleDomainMax]} />
              <Tooltip
                formatter={(value, name) => [
                  value,
                  name === 'cumulative' ? 'Cumulative' : 'Daily',
                ]}
              />
              <ReferenceLine y={cycleTarget} label={{ value: '240', fill: '#dc2626', fontSize: 12 }} stroke="#dc2626" strokeWidth={2} />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#ca8a04"
                strokeWidth={3}
                fill="url(#cycleGradient)"
                dot={{ fill: '#ca8a04', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Bar dataKey="count" fill="#facc15" maxBarSize={24} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}
    </div>
  );
}

interface DesktopCinematicAnalyticsProps {
  analyticsView: AnalyticsView;
  currentMonth: number;
  currentYear: number;
  cycleDomainMax: number;
  cycleMonthlyData: CycleChartPoint[];
  dailyData: Array<{ name: string; hours: number }>;
  errorMessage: string;
  kosDistribution: Array<{ name: string; value: number; color: string }>;
  kosTrend: ChartPoint[];
  monthlyCycleCount: number;
  monthlyKosTotal: number;
  monthlyRecordCount: number;
  monthlyTotalHours: number;
  moveMonth: (direction: -1 | 1) => void;
  selectedWeek: number;
  setAnalyticsView: (view: AnalyticsView) => void;
  setSelectedWeek: (week: number) => void;
  weeklyData: Array<{ name: string; hours: number }>;
  weeklyProgressData: ChartPoint[];
  weeklyProgressDomain: [number, number];
  weeklyProgressMax: number;
  weeksCount: number;
}

const cinematicTooltipStyle = {
  background: 'var(--glass-strong)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-md)',
  color: 'var(--foreground)',
};

const cinematicViewItems: Array<{ id: AnalyticsView; label: string; hint: string }> = [
  { id: 'month_overview', label: 'Month', hint: 'Weekly totals' },
  { id: 'week_daily', label: 'Week details', hint: 'Daily hours' },
  { id: 'weekly_progress', label: 'Progress', hint: 'Cumulative week' },
  { id: 'key_of_success', label: 'Success keys', hint: 'Monthly trend' },
  { id: 'cycle_ticks', label: 'Cycles', hint: '240-block target' },
];

function DesktopCinematicAnalytics({
  analyticsView,
  currentMonth,
  currentYear,
  cycleDomainMax,
  cycleMonthlyData,
  dailyData,
  errorMessage,
  kosDistribution,
  kosTrend,
  monthlyCycleCount,
  monthlyKosTotal,
  monthlyRecordCount,
  monthlyTotalHours,
  moveMonth,
  selectedWeek,
  setAnalyticsView,
  setSelectedWeek,
  weeklyData,
  weeklyProgressData,
  weeklyProgressDomain,
  weeklyProgressMax,
  weeksCount,
}: DesktopCinematicAnalyticsProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const barDuration = reducedMotion ? 0 : 720;
  const lineDuration = reducedMotion ? 0 : 880;
  const chartKey = `${analyticsView}-${currentYear}-${currentMonth}-${
    analyticsView === 'week_daily' || analyticsView === 'weekly_progress' ? selectedWeek : 'month'
  }`;

  return (
    <div className="desktop-cinematic-analytics relative space-y-5 pb-10 text-[var(--foreground)]">
      <header className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-md)] backdrop-blur-xl">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[var(--primary)] opacity-[.08] blur-3xl" />
        <div className="relative flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[var(--primary)]">Progress analytics</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Your progress, without the noise.</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
              The original study-time, success-key, and cycle calculations in a clearer desktop workspace.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/75 p-1.5 shadow-[var(--shadow-sm)]">
            <motion.button
              type="button"
              onClick={() => moveMonth(-1)}
              whileTap={reducedMotion ? undefined : { scale: .9, x: -2 }}
              className="grid h-10 w-10 place-items-center rounded-xl text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.button>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${currentYear}-${currentMonth}`}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: .22 }}
                className="min-w-[164px] text-center text-sm font-semibold tabular-nums"
              >
                {monthNames[currentMonth - 1]} {currentYear}
              </motion.div>
            </AnimatePresence>
            <motion.button
              type="button"
              onClick={() => moveMonth(1)}
              whileTap={reducedMotion ? undefined : { scale: .9, x: 2 }}
              className="grid h-10 w-10 place-items-center rounded-xl text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
        {errorMessage && (
          <div role="alert" className="relative mt-4 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {errorMessage}
          </div>
        )}
      </header>

      <section className="grid grid-cols-4 gap-4" aria-label="Monthly summary">
        <CinematicMetric index={0} label="Study hours" value={`${roundOneDecimal(monthlyTotalHours)}h`} reducedMotion={reducedMotion} />
        <CinematicMetric index={1} label="Tracked days" value={String(monthlyRecordCount)} reducedMotion={reducedMotion} />
        <CinematicMetric index={2} label="Success keys" value={String(monthlyKosTotal)} reducedMotion={reducedMotion} />
        <CinematicMetric index={3} label="Cycle blocks" value={String(monthlyCycleCount)} reducedMotion={reducedMotion} />
      </section>

      <nav className="grid grid-cols-5 gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--glass)] p-2 shadow-[var(--shadow-sm)] backdrop-blur-xl" aria-label="Analytics views" role="tablist">
        {cinematicViewItems.map((item) => {
          const active = analyticsView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAnalyticsView(item.id)}
              role="tab"
              aria-selected={active}
              className="relative min-h-[58px] rounded-2xl px-4 text-left"
            >
              {active && (
                <motion.span
                  layoutId="desktop-analytics-active-view"
                  className="absolute inset-0 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
                  transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative block text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
              <span className="relative mt-0.5 block text-[10px] text-[var(--foreground-subtle)]">{item.hint}</span>
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={chartKey}
          initial={reducedMotion ? false : { opacity: 0, y: 14, scale: .992 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -10, scale: .995 }}
          transition={{ duration: reducedMotion ? 0 : .28, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {analyticsView === 'month_overview' && (
            <div className="grid grid-cols-2 gap-5">
              <CinematicChartPanel title={`Study hours by week — ${monthNames[currentMonth - 1]}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={weeklyData} barCategoryGap="22%" margin={{ top: 10, right: 10, left: -8, bottom: 0 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${value}h`, 'Study time']} contentStyle={cinematicTooltipStyle} cursor={{ fill: 'var(--surface-soft)' }} />
                    <Bar dataKey="hours" fill="var(--chart-1)" maxBarSize={52} radius={[10, 10, 3, 3]} isAnimationActive={!reducedMotion} animationDuration={barDuration} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </CinematicChartPanel>

              <CinematicChartPanel title="Key of Success distribution" reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart accessibilityLayer>
                    <Pie
                      data={kosDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={96}
                      paddingAngle={3}
                      cornerRadius={7}
                      labelLine={false}
                      isAnimationActive={!reducedMotion}
                      animationDuration={lineDuration}
                      animationEasing="ease-out"
                    >
                      {kosDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={cinematicTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {kosDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between rounded-xl bg-[var(--surface-soft)] px-3 py-2.5">
                      <span className="flex items-center gap-2 text-[var(--foreground-muted)]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
                      <strong className="tabular-nums">{entry.value}</strong>
                    </div>
                  ))}
                </div>
              </CinematicChartPanel>
            </div>
          )}

          {analyticsView === 'week_daily' && (
            <>
              <CinematicWeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week" reducedMotion={reducedMotion} />
              <CinematicChartPanel title={`Daily study hours — Week ${selectedWeek}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={dailyData} barCategoryGap="22%" margin={{ top: 12, right: 14, left: -8, bottom: 8 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${value}h`, 'Study time']} contentStyle={cinematicTooltipStyle} cursor={{ fill: 'var(--surface-soft)' }} />
                    <Bar dataKey="hours" fill="var(--chart-2)" maxBarSize={52} radius={[10, 10, 3, 3]} isAnimationActive={!reducedMotion} animationDuration={barDuration} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </CinematicChartPanel>
            </>
          )}

          {analyticsView === 'weekly_progress' && (
            <>
              <CinematicWeekSelector weeksCount={weeksCount} selectedWeek={selectedWeek} onSelect={setSelectedWeek} label="Choose a week to view progress" reducedMotion={reducedMotion} />
              <CinematicChartPanel title={`Cumulative study time — Week ${selectedWeek}`} reducedMotion={reducedMotion}>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={weeklyProgressData} margin={{ top: 14, right: 22, left: -4, bottom: 8 }} accessibilityLayer>
                    <defs>
                      <linearGradient id="cinematicWeeklyProgressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={.32} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} domain={weeklyProgressDomain} allowDataOverflow={false} />
                    <Tooltip formatter={(value) => (value == null ? [] : [`${value}h`, 'Cumulative'])} contentStyle={cinematicTooltipStyle} />
                    <ReferenceLine y={40} label={{ value: '40h', fill: '#d97706', fontSize: 12 }} stroke="#d97706" strokeDasharray="4 4" />
                    {weeklyProgressMax > 50 && <ReferenceLine y={80} label={{ value: '80h', fill: '#dc2626', fontSize: 12 }} stroke="#dc2626" strokeDasharray="4 4" />}
                    <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={3} fill="url(#cinematicWeeklyProgressGradient)" dot={{ fill: 'var(--chart-1)', r: 4 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                  </AreaChart>
                </ResponsiveContainer>
              </CinematicChartPanel>
            </>
          )}

          {analyticsView === 'key_of_success' && (
            <CinematicChartPanel title={`Key of Success progress — ${monthNames[currentMonth - 1]} ${currentYear}`} reducedMotion={reducedMotion}>
              <ResponsiveContainer width="100%" height={420}>
                <AreaChart data={kosTrend} margin={{ top: 14, right: 22, left: -4, bottom: 8 }} accessibilityLayer>
                  <defs>
                    <linearGradient id="cinematicKosGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={.32} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} domain={[0, 'dataMax + 5']} />
                  <Tooltip formatter={(value) => (value == null ? [] : [value, 'Key of Success'])} contentStyle={cinematicTooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} fill="url(#cinematicKosGradient)" dot={{ fill: '#f97316', r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            </CinematicChartPanel>
          )}

          {analyticsView === 'cycle_ticks' && (
            <CinematicChartPanel title={`Checked cycle blocks — ${monthNames[currentMonth - 1]} ${currentYear}`} reducedMotion={reducedMotion}>
              <ResponsiveContainer width="100%" height={430}>
                <ComposedChart data={cycleMonthlyData} margin={{ top: 14, right: 22, left: -4, bottom: 8 }} accessibilityLayer>
                  <defs>
                    <linearGradient id="cinematicCycleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#eab308" stopOpacity={.3} />
                      <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} domain={[0, cycleDomainMax]} />
                  <Tooltip formatter={(value, name) => [value, name === 'cumulative' ? 'Cumulative' : 'Daily']} contentStyle={cinematicTooltipStyle} />
                  <ReferenceLine y={cycleTarget} label={{ value: '240', fill: '#dc2626', fontSize: 12 }} stroke="#dc2626" strokeWidth={2} />
                  <Area type="monotone" dataKey="cumulative" stroke="#ca8a04" strokeWidth={3} fill="url(#cinematicCycleGradient)" dot={{ fill: '#ca8a04', r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={lineDuration} animationEasing="ease-out" />
                  <Bar dataKey="count" fill="#facc15" maxBarSize={24} radius={[5, 5, 1, 1]} isAnimationActive={!reducedMotion} animationDuration={barDuration} animationEasing="ease-out" />
                </ComposedChart>
              </ResponsiveContainer>
            </CinematicChartPanel>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CinematicMetric({ index, label, value, reducedMotion }: { index: number; label: string; value: string; reducedMotion: boolean }) {
  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 32, delay: index * .045 }}
      className="rounded-[24px] border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-sm)] backdrop-blur-xl"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[var(--foreground-subtle)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-.045em] tabular-nums">{value}</p>
    </motion.article>
  );
}

function CinematicWeekSelector({ weeksCount, selectedWeek, onSelect, label, reducedMotion }: { weeksCount: number; selectedWeek: number; onSelect: (week: number) => void; label: string; reducedMotion: boolean }) {
  return (
    <section className="flex items-center justify-between gap-4 rounded-[22px] border border-[var(--border)] bg-[var(--glass)] p-3 shadow-[var(--shadow-sm)]">
      <p className="pl-2 text-sm text-[var(--foreground-muted)]">{label}</p>
      <div className="flex flex-wrap justify-end gap-2">
        {Array.from({ length: weeksCount }, (_, index) => index + 1).map((week) => (
          <button key={week} type="button" onClick={() => onSelect(week)} aria-pressed={selectedWeek === week} className="relative min-h-10 min-w-[76px] rounded-xl px-3 text-sm font-semibold">
            {selectedWeek === week && <motion.span layoutId="desktop-analytics-week" className="absolute inset-0 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)]" transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 36 }} />}
            <span className={`relative ${selectedWeek === week ? 'text-[var(--primary)]' : 'text-[var(--foreground-muted)]'}`}>Week {week}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CinematicChartPanel({ title, children, reducedMotion }: { title: string; children: React.ReactNode; reducedMotion: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-md)] backdrop-blur-xl">
      {!reducedMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent"
          initial={{ x: '-120%', opacity: 0 }}
          animate={{ x: '420%', opacity: [0, .9, 0] }}
          transition={{ duration: .9, ease: 'easeOut' }}
        />
      )}
      <h2 className="mb-4 text-base font-semibold tracking-[-.015em]">{title}</h2>
      {children}
    </section>
  );
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function isFutureDate(day: number, month: number, year: number) {
  const today = new Date();
  const date = new Date(year, month - 1, day);
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date > currentDate;
}

function getWeeksInMonth(month: number, year: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const adjustedFirstDay = (firstDay.getDay() + 6) % 7;
  return Math.ceil((lastDay.getDate() + adjustedFirstDay) / 7);
}

function getDaysInWeek(month: number, year: number, weekNumber: number) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const adjustedFirstDay = (firstDay.getDay() + 6) % 7;
  const dayCounter = 1 - adjustedFirstDay;
  let currentWeek = 1;
  const weekDays: Array<{ day: number; date: string; month: number; year: number }> = [];

  for (let index = 0; index < 42; index++) {
    const day = dayCounter + index;
    if (day >= 1 && day <= daysInMonth && currentWeek === weekNumber) {
      weekDays.push({ day, date: formatDateKey(year, month, day), month, year });
    }
    if ((index + 1) % 7 === 0) currentWeek++;
  }

  return weekDays;
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </motion.div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      {children}
    </button>
  );
}

function WeekSelector({
  weeksCount,
  selectedWeek,
  onSelect,
  label,
}: {
  weeksCount: number;
  selectedWeek: number;
  onSelect: (week: number) => void;
  label: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: weeksCount }, (_, index) => index + 1).map((week) => (
          <button
            key={week}
            type="button"
            onClick={() => onSelect(week)}
            className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
              selectedWeek === week
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'
            }`}
          >
            Week {week}
          </button>
        ))}
      </div>
    </section>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-4 sm:p-5">
      <h3 className="mb-4 text-base font-semibold text-slate-950">{title}</h3>
      {children}
    </motion.section>
  );
}
