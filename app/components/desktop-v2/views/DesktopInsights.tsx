'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiCycleTick, ApiDate, ApiIeltsHours, ApiTask, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { useMotionDirector } from '@/app/components/desktop-v2/core/MotionDirector';

type InsightView = 'momentum' | 'consistency' | 'landscape';

export type InsightsScenePulse =
  | { type: 'insight-view'; view: InsightView }
  | { type: 'insight-month'; month: number; year: number };

export interface DesktopInsightsProps {
  onScenePulse?: (pulse: InsightsScenePulse) => void;
  onSnapshotChange?: (snapshot: {
    completion: number;
    overdue: number;
    activeSpaces: number;
    focusedMinutes: number;
    cycleCount: number;
  }) => void;
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const chartColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
const insightSpring = { type: 'spring' as const, stiffness: 380, damping: 34 };

function isDone(task: ApiTask) {
  return task.status === 'completed' || task.effective_status === 'completed';
}

function isLeaf(task: ApiTask) {
  return (task.child_count || 0) === 0;
}

function emptyIelts(userId: string): ApiIeltsHours {
  return { id: null, user_id: userId, reading_hours: 0, listening_hours: 0, writing_hours: 0, speaking_hours: 0 };
}

export default function DesktopInsights({ onScenePulse, onSnapshotChange }: DesktopInsightsProps) {
  const { reducedMotion: reduceMotion, pulseActivity } = useMotionDirector();
  const { user, currentMonth, currentYear, setCurrentMonth } = useAppStore();
  const [view, setView] = useState<InsightView>('momentum');
  const [dates, setDates] = useState<ApiDate[]>([]);
  const [ticks, setTicks] = useState<ApiCycleTick[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [ielts, setIelts] = useState<ApiIeltsHours>(() => emptyIelts(user?.id || ''));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      api.getDates(user.id),
      api.getCycleTicks(user.id, currentMonth, currentYear),
      api.getTasks(user.id, { view: 'tree' }),
      api.getTopics(user.id),
      api.getIeltsHours(user.id),
    ]);
    const [dateResult, tickResult, taskResult, topicResult, ieltsResult] = results;
    if (dateResult.status === 'fulfilled') setDates(dateResult.value);
    if (tickResult.status === 'fulfilled') setTicks(tickResult.value);
    if (taskResult.status === 'fulfilled') setTasks(taskResult.value);
    if (topicResult.status === 'fulfilled') setTopics(topicResult.value);
    if (ieltsResult.status === 'fulfilled') setIelts(ieltsResult.value);
    if (results.some((result) => result.status === 'rejected')) setError('Some signals are missing. The available insights are still shown below.');
    setLoading(false);
  }, [currentMonth, currentYear, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const monthDates = dates.filter((date) => date.month === currentMonth && date.year === currentYear);
    const datesByDay = new Map(monthDates.map((date) => [date.day, date]));
    const ticksByDay = new Map<number, number>();
    ticks.forEach((tick) => { if (tick.is_checked) ticksByDay.set(tick.day, (ticksByDay.get(tick.day) || 0) + 1); });
    let focusCumulative = 0;
    let cycleCumulative = 0;
    const daily = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const focus = Math.round(((Number(datesByDay.get(day)?.focused_minutes) || 0) / 60) * 10) / 10;
      const cycles = ticksByDay.get(day) || 0;
      focusCumulative += focus;
      cycleCumulative += cycles;
      return { day: String(day), focus, cycles, focusCumulative: Math.round(focusCumulative * 10) / 10, cycleCumulative };
    });
    const leaves = tasks.filter(isLeaf);
    const completed = leaves.filter(isDone).length;
    const openTopicIds = new Set(leaves.filter((task) => !isDone(task)).map((task) => task.topic_id));
    const overdue = leaves.filter((task) => !isDone(task) && task.deadline && new Date(task.deadline).getTime() < Date.now()).length;
    const taskLandscape = topics.map((topic, index) => {
      const topicTasks = leaves.filter((task) => task.topic_id === topic.id);
      const done = topicTasks.filter(isDone).length;
      return { name: topic.name, total: topicTasks.length, completed: done, open: topicTasks.length - done, color: topic.topic_color || chartColors[index % chartColors.length] };
    }).filter((topic) => topic.total > 0).sort((a, b) => b.total - a.total).slice(0, 8);
    const ieltsData = [
      { name: 'Reading', value: Number(ielts.reading_hours) || 0 },
      { name: 'Listening', value: Number(ielts.listening_hours) || 0 },
      { name: 'Writing', value: Number(ielts.writing_hours) || 0 },
      { name: 'Speaking', value: Number(ielts.speaking_hours) || 0 },
    ];
    const focusHours = Math.round(daily.reduce((sum, point) => sum + point.focus, 0) * 10) / 10;
    const cycleCount = ticks.filter((tick) => tick.is_checked).length;
    const successKeys = monthDates.reduce((sum, date) => sum + (Number(date.key_of_success) || 0), 0);
    return { daily, leaves, completed, overdue, activeSpaces: topics.filter((topic) => openTopicIds.has(topic.id)).length, taskLandscape, ieltsData, focusHours, cycleCount, successKeys, trackedDays: monthDates.length };
  }, [currentMonth, currentYear, dates, ielts, tasks, ticks, topics]);

  useEffect(() => {
    if (loading) return;
    onSnapshotChange?.({
      completion: data.leaves.length ? data.completed / data.leaves.length : 0,
      overdue: data.overdue,
      activeSpaces: data.activeSpaces,
      focusedMinutes: Math.round(data.focusHours * 60),
      cycleCount: data.cycleCount,
    });
  }, [data.activeSpaces, data.completed, data.cycleCount, data.focusHours, data.leaves.length, data.overdue, loading, onSnapshotChange]);

  const moveMonth = (direction: -1 | 1) => {
    const date = new Date(currentYear, currentMonth - 1 + direction, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    setCurrentMonth(month, year);
    pulseActivity('transition', 720);
    onScenePulse?.({ type: 'insight-month', month, year });
  };

  const selectView = (next: InsightView) => {
    pulseActivity('transition', 560);
    setView(next);
    onScenePulse?.({ type: 'insight-view', view: next });
  };

  if (loading) return <InsightsSkeleton />;

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden px-2 pb-8 text-[var(--foreground)]">
      <motion.div aria-hidden className="pointer-events-none absolute right-[10%] top-[8%] h-[480px] w-[480px] rounded-full bg-[var(--primary)] opacity-[.07] blur-[120px]" animate={reduceMotion ? undefined : { x: [0, -100, 15, 0], y: [0, 70, -15, 0], scale: [1, 1.18, .95, 1] }} transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }} />
      <header className="relative z-10 mb-6 flex items-end justify-between gap-6">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.28em] text-[var(--primary)]">Insights · living data terrain</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">See the shape of momentum.</h1><p className="mt-2 text-sm text-[var(--foreground-muted)]">Focus, consistency, tasks, and practice recomposed into one signal.</p></div>
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-1.5 shadow-[var(--shadow-sm)] backdrop-blur-xl">
          <motion.button type="button" onClick={() => moveMonth(-1)} whileTap={{ scale: .88, rotate: -8 }} className="grid h-10 w-10 place-items-center rounded-xl text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)]" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></motion.button>
          <AnimatePresence mode="wait"><motion.div key={`${currentYear}-${currentMonth}`} initial={{ opacity: 0, y: 8, filter: 'blur(5px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(5px)' }} className="min-w-[170px] text-center text-sm font-semibold">{months[currentMonth - 1]} {currentYear}</motion.div></AnimatePresence>
          <motion.button type="button" onClick={() => moveMonth(1)} whileTap={{ scale: .88, rotate: 8 }} className="grid h-10 w-10 place-items-center rounded-xl text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)]" aria-label="Next month"><ChevronRight className="h-4 w-4" /></motion.button>
        </div>
      </header>

      {error && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} role="alert" className="relative z-20 mb-4 flex items-center justify-between rounded-2xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span><button type="button" onClick={() => void load()} className="flex min-h-9 items-center gap-2 rounded-xl px-3 font-semibold hover:bg-black/5"><RefreshCw className="h-4 w-4" />Refresh</button></motion.div>}

      <section className="relative z-10 mb-5 grid grid-cols-4 gap-4">
        <MetricCard index={0} label="Focused energy" value={`${data.focusHours}h`} detail={`${data.trackedDays} tracked days`} icon={<Clock3 className="h-4 w-4" />} color="var(--primary)" />
        <MetricCard index={1} label="Cycle pulses" value={String(data.cycleCount)} detail="of 240 monthly target" icon={<Zap className="h-4 w-4" />} color="var(--warning)" />
        <MetricCard index={2} label="Task completion" value={`${data.leaves.length ? Math.round(data.completed / data.leaves.length * 100) : 0}%`} detail={`${data.completed} of ${data.leaves.length} leaf tasks`} icon={<CheckCircle2 className="h-4 w-4" />} color="var(--accent)" />
        <MetricCard index={3} label="Success keys" value={String(data.successKeys)} detail={`${data.overdue} overdue signal${data.overdue === 1 ? '' : 's'}`} icon={<Target className="h-4 w-4" />} color="var(--secondary)" />
      </section>

      <main className="relative z-10 grid min-h-[540px] grid-cols-[minmax(0,1.45fr)_minmax(330px,.72fr)] gap-5">
        <section className="relative overflow-hidden rounded-[36px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-md)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--foreground-subtle)]">Primary signal</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">{view === 'momentum' ? 'Focus momentum' : view === 'consistency' ? 'Cycle consistency' : 'Task landscape'}</h2></div>
            <div className="relative grid grid-cols-3 rounded-2xl bg-[var(--surface-soft)] p-1">
              {([
                { key: 'momentum' as const, label: 'Momentum', icon: Activity },
                { key: 'consistency' as const, label: 'Cycles', icon: Zap },
                { key: 'landscape' as const, label: 'Tasks', icon: Layers3 },
              ]).map((item) => <button key={item.key} type="button" onClick={() => selectView(item.key)} className="relative z-10 flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[var(--foreground-muted)]">{view === item.key && <motion.span layoutId="insights-view-pill" className="absolute inset-0 -z-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm" transition={insightSpring} />}<item.icon className="h-3.5 w-3.5" /><span className={view === item.key ? 'text-[var(--foreground)]' : ''}>{item.label}</span></button>)}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={`${view}-${currentMonth}-${currentYear}`} initial={{ opacity: 0, y: 18, scale: .985, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -12, scale: .99, filter: 'blur(6px)' }} transition={{ duration: .35 }} className="mt-6 h-[420px] w-full">
              {view === 'momentum' && (
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.daily} margin={{ top: 16, right: 14, left: -12, bottom: 0 }}><defs><linearGradient id="desktopFocusTerrain" x1="0" y1="0" x2="0" y2="1"><stop offset="4%" stopColor="var(--chart-1)" stopOpacity={.5} /><stop offset="95%" stopColor="var(--chart-2)" stopOpacity={.02} /></linearGradient></defs><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 7" vertical={false} /><XAxis dataKey="day" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} minTickGap={16} /><YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} unit="h" /><Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--primary)', strokeOpacity: .35 }} /><Area type="monotone" dataKey="focus" stroke="var(--chart-1)" strokeWidth={3} fill="url(#desktopFocusTerrain)" activeDot={{ r: 6, strokeWidth: 3 }} animationDuration={850} /></AreaChart></ResponsiveContainer>
              )}
              {view === 'consistency' && (
                <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.daily} margin={{ top: 16, right: 14, left: -12, bottom: 0 }}><defs><linearGradient id="desktopCycleTerrain" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-4)" stopOpacity={.32} /><stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 7" vertical={false} /><XAxis dataKey="day" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} minTickGap={16} /><YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="cycles" fill="var(--chart-4)" radius={[7, 7, 2, 2]} maxBarSize={22} animationDuration={700} /><Area type="monotone" dataKey="cycleCumulative" stroke="var(--chart-2)" strokeWidth={2.5} fill="url(#desktopCycleTerrain)" dot={false} animationDuration={900} /></ComposedChart></ResponsiveContainer>
              )}
              {view === 'landscape' && (
                data.taskLandscape.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.taskLandscape} layout="vertical" margin={{ top: 8, right: 20, left: 18, bottom: 4 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 7" horizontal={false} /><XAxis type="number" stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={100} stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="completed" stackId="tasks" fill="var(--chart-3)" radius={[7, 0, 0, 7]} animationDuration={700} /><Bar dataKey="open" stackId="tasks" fill="var(--chart-2)" radius={[0, 7, 7, 0]} animationDuration={900} /></BarChart></ResponsiveContainer> : <EmptyChart />
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        <aside className="grid min-h-0 grid-rows-[1.08fr_.92fr] gap-5">
          <section className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--surface)]/74 p-5 shadow-[var(--shadow-sm)]">
            <motion.div aria-hidden className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[var(--secondary)] opacity-[.1] blur-3xl" animate={reduceMotion ? undefined : { scale: [1, 1.24, 1], x: [0, -22, 0] }} transition={{ duration: 8, repeat: Infinity }} />
            <div className="relative flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--secondary)]">Practice spectrum</p><h3 className="mt-1 text-xl font-semibold tracking-[-.035em]">IELTS balance</h3></div><Sparkles className="h-5 w-5 text-[var(--secondary)]" /></div>
            <div className="relative mt-2 h-[190px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.ieltsData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={4} cornerRadius={6} animationDuration={900}>{data.ieltsData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-2xl font-semibold tabular-nums">{Math.round(data.ieltsData.reduce((sum, item) => sum + item.value, 0) * 10) / 10}</p><p className="text-[9px] uppercase tracking-[.18em] text-[var(--foreground-subtle)]">hours</p></div></div></div>
            <div className="relative grid grid-cols-2 gap-2">{data.ieltsData.map((skill, index) => <div key={skill.name} className="flex items-center justify-between rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[11px]"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: chartColors[index] }} />{skill.name}</span><strong>{skill.value}h</strong></div>)}</div>
          </section>

          <section className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--accent)]"><BarChart3 className="h-4 w-4" />Terrain pulse</div>
            <div className="mt-5 flex h-24 items-end gap-1.5">{data.daily.slice(-18).map((point, index) => { const max = Math.max(1, ...data.daily.map((entry) => entry.focus)); return <motion.div key={point.day} className="min-w-0 flex-1 rounded-full bg-[linear-gradient(to_top,var(--primary),var(--accent))]" initial={{ height: 3 }} animate={{ height: `${8 + point.focus / max * 92}%`, opacity: .35 + point.focus / max * .65 }} transition={{ ...insightSpring, delay: index * .018 }} />; })}</div>
            <p className="mt-4 text-xs leading-5 text-[var(--foreground-muted)]">The terrain reacts to the same date records used by Focus. No synthetic activity is added.</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

const tooltipStyle = { background: 'var(--glass-strong)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--foreground)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)' };

function MetricCard({ index, label, value, detail, icon, color }: { index: number; label: string; value: string; detail: string; icon: React.ReactNode; color: string }) {
  return <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...insightSpring, delay: index * .05 }} whileHover={{ y: -5, rotateX: 1.2 }} className="relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-sm)] backdrop-blur-xl"><motion.span aria-hidden className="absolute -bottom-10 -right-8 h-24 w-24 rounded-full opacity-[.11] blur-2xl" style={{ background: color }} animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 6 + index, repeat: Infinity }} /><div className="relative flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--foreground-subtle)]">{label}</p><span style={{ color }}>{icon}</span></div><p className="relative mt-3 text-3xl font-semibold tracking-[-.05em] tabular-nums">{value}</p><p className="relative mt-1 text-[11px] text-[var(--foreground-muted)]">{detail}</p></motion.article>;
}

function EmptyChart() {
  return <div className="grid h-full place-items-center rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/40 text-center"><div><Layers3 className="mx-auto h-7 w-7 text-[var(--foreground-subtle)]" /><p className="mt-3 text-sm font-semibold">No task terrain yet</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Create leaf tasks to reveal the landscape.</p></div></div>;
}

function InsightsSkeleton() {
  return <div className="space-y-5 animate-pulse"><div className="grid h-28 grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-[26px] bg-[var(--surface-soft)]" />)}</div><div className="grid min-h-[540px] grid-cols-[1.45fr_.72fr] gap-5"><div className="rounded-[36px] bg-[var(--surface-soft)]" /><div className="rounded-[30px] bg-[var(--surface-soft)]" /></div></div>;
}
