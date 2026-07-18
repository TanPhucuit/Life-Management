'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Orbit,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { api, ApiCycleTick, ApiDate, ApiTask, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { useMotionDirector } from '@/app/components/desktop-v2/core/MotionDirector';

export type TodayScenePulse =
  | { type: 'task-completed'; taskId: string; completion: number }
  | { type: 'task-reopened'; taskId: string; completion: number }
  | { type: 'focus-selected'; taskId: string };

export interface DesktopTodayProps {
  onScenePulse?: (pulse: TodayScenePulse) => void;
  onStartFocus?: (task: ApiTask) => void;
  onSnapshotChange?: (snapshot: {
    completion: number;
    overdue: number;
    activeSpaces: number;
    focusedMinutes: number;
    cycleCount: number;
  }) => void;
}

type StackKey = 'today' | 'next' | 'completed';

const spring = { type: 'spring' as const, stiffness: 380, damping: 34 };

function dateKey(value?: string | null) {
  if (!value) return '';
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isDone(task: ApiTask) {
  return task.status === 'completed' || task.effective_status === 'completed';
}

function isLeaf(task: ApiTask) {
  return (task.child_count || 0) === 0;
}

function isOverdue(task: ApiTask) {
  if (!task.deadline || isDone(task)) return false;
  return new Date(task.deadline).getTime() < Date.now();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DesktopToday({ onScenePulse, onStartFocus, onSnapshotChange }: DesktopTodayProps) {
  const router = useRouter();
  const { reducedMotion: reduceMotion, pulseActivity } = useMotionDirector();
  const { user } = useAppStore();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [todayDate, setTodayDate] = useState<ApiDate | null>(null);
  const [cycleTicks, setCycleTicks] = useState<ApiCycleTick[]>([]);
  const [activeStack, setActiveStack] = useState<StackKey>('today');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    const now = new Date();
    const results = await Promise.allSettled([
      api.getTasks(user.id, { view: 'tree' }),
      api.getTopics(user.id),
      api.getDates(user.id, now.getMonth() + 1, now.getFullYear()),
      api.getCycleTicks(user.id, now.getMonth() + 1, now.getFullYear()),
    ]);
    const [taskResult, topicResult, dateResult, cycleResult] = results;
    if (taskResult.status === 'fulfilled') setTasks(taskResult.value);
    if (topicResult.status === 'fulfilled') setTopics(topicResult.value);
    if (dateResult.status === 'fulfilled') {
      setTodayDate(dateResult.value.find((date) => date.day === now.getDate()) || null);
    }
    if (cycleResult.status === 'fulfilled') {
      setCycleTicks(cycleResult.value.filter((tick) => tick.day === now.getDate()));
    }
    if (results.some((result) => result.status === 'rejected')) {
      setError('Some live signals could not be loaded. Your tasks remain safe.');
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dashboard = useMemo(() => {
    const leaves = tasks.filter(isLeaf);
    const completed = leaves.filter(isDone);
    const open = leaves.filter((task) => !isDone(task));
    const today = open.filter((task) => dateKey(task.start_date) === currentDateKey());
    const next = open
      .filter((task) => dateKey(task.start_date) !== currentDateKey())
      .sort((a, b) => {
        const overdueDelta = Number(isOverdue(b)) - Number(isOverdue(a));
        if (overdueDelta) return overdueDelta;
        return new Date(a.deadline || '2999-12-31').getTime() - new Date(b.deadline || '2999-12-31').getTime();
      });
    const recentCompleted = [...completed]
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    const activeTopicIds = new Set(open.map((task) => task.topic_id));
    const completion = leaves.length ? Math.round((completed.length / leaves.length) * 100) : 0;
    return {
      leaves,
      today,
      next,
      completed: recentCompleted,
      completion,
      overdue: open.filter(isOverdue).length,
      activeSpaces: topics.filter((topic) => activeTopicIds.has(topic.id)).length,
    };
  }, [tasks, topics]);

  const stackTasks = dashboard[activeStack].slice(0, 7);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || stackTasks[0] || null;
  const cycleCount = cycleTicks.filter((tick) => tick.is_checked).length;
  const focusedMinutes = Number(todayDate?.focused_minutes) || 0;
  const keyOfSuccess = Number(todayDate?.key_of_success) || 0;

  useEffect(() => {
    if (loading) return;
    onSnapshotChange?.({
      completion: dashboard.completion,
      overdue: dashboard.overdue,
      activeSpaces: dashboard.activeSpaces,
      focusedMinutes,
      cycleCount,
    });
  }, [cycleCount, dashboard.activeSpaces, dashboard.completion, dashboard.overdue, focusedMinutes, loading, onSnapshotChange]);

  const toggleTask = async (task: ApiTask) => {
    if (savingTaskIds.has(task.id)) return;
    pulseActivity('interaction', 720);
    const wasDone = isDone(task);
    const nextStatus = wasDone ? 'not_completed' : 'completed';
    setSavingTaskIds((current) => new Set(current).add(task.id));
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus, effective_status: nextStatus } : item));
    try {
      const saved = await api.updateTask({ id: task.id, status: nextStatus });
      const completedLeafCount = dashboard.leaves.filter((leaf) => leaf.id === task.id ? !wasDone : isDone(leaf)).length;
      const completion = dashboard.leaves.length ? Math.round((completedLeafCount / dashboard.leaves.length) * 100) : 0;
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...saved } : item));
      onScenePulse?.({ type: wasDone ? 'task-reopened' : 'task-completed', taskId: task.id, completion });
    } catch (reason) {
      setTasks((current) => current.map((item) => item.id === task.id ? task : item));
      setError(reason instanceof Error ? reason.message : 'The task could not be updated.');
    } finally {
      setSavingTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const beginFocus = (task: ApiTask) => {
    pulseActivity('transition', 760);
    onScenePulse?.({ type: 'focus-selected', taskId: task.id });
    if (onStartFocus) onStartFocus(task);
    else router.push(`/cycles?task=${encodeURIComponent(task.id)}`);
  };

  if (loading) return <TodaySkeleton />;

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden px-2 pb-10 text-[var(--foreground)]">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-[18%] top-4 h-72 w-72 rounded-full bg-[var(--primary)] opacity-[.08] blur-[100px]"
        animate={reduceMotion ? undefined : { x: [0, 90, -20, 0], y: [0, 35, 80, 0], scale: [1, 1.18, .92, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-[5%] top-[30%] h-80 w-80 rounded-full bg-[var(--secondary)] opacity-[.07] blur-[110px]"
        animate={reduceMotion ? undefined : { x: [0, -70, 20, 0], y: [0, 65, -20, 0], scale: [1, .9, 1.2, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      <header className="relative z-10 mb-7 flex items-end justify-between gap-6">
        <div>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] font-semibold uppercase tracking-[.28em] text-[var(--primary)]">
            Today cockpit · {new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-2 text-4xl font-semibold tracking-[-.055em] 2xl:text-5xl">
            {greeting()}, {user?.username || 'Explorer'}.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .18 }} className="mt-2 text-sm text-[var(--foreground-muted)]">
            Your system is alive. Shape the day with one deliberate move.
          </motion.p>
        </div>
        <Link href="/tasks" className="group flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--glass)] px-5 text-sm font-semibold shadow-[var(--shadow-sm)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]">
          Open plan <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      {error && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} role="alert" className="relative z-20 mb-5 flex items-center justify-between rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
          <button type="button" onClick={() => void load()} className="flex min-h-10 items-center gap-2 rounded-xl px-3 font-semibold hover:bg-black/5"><RotateCcw className="h-4 w-4" />Retry</button>
        </motion.div>
      )}

      <main className="relative z-10 grid min-h-[690px] grid-cols-[minmax(300px,.88fr)_minmax(410px,1.15fr)_minmax(310px,.9fr)] gap-5">
        <section className="flex min-h-0 flex-col rounded-[32px] border border-[var(--border)] bg-[color:var(--glass)] p-4 shadow-[var(--shadow-md)] backdrop-blur-2xl">
          <div className="relative grid grid-cols-3 rounded-2xl bg-[var(--surface-soft)] p-1">
            {(['today', 'next', 'completed'] as const).map((key) => (
              <button key={key} type="button" onClick={() => setActiveStack(key)} className="relative z-10 min-h-10 rounded-xl px-2 text-xs font-semibold capitalize text-[var(--foreground-muted)] transition-colors" aria-pressed={activeStack === key}>
                {activeStack === key && <motion.span layoutId="today-stack-pill" className="absolute inset-0 -z-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm" transition={spring} />}
                <span className={activeStack === key ? 'text-[var(--foreground)]' : ''}>{key}</span>
                <span className="ml-1.5 tabular-nums opacity-60">{dashboard[key].length}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--foreground-subtle)]">Daily stack</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">{activeStack === 'today' ? 'In your orbit' : activeStack === 'next' ? 'Approaching next' : 'Energy captured'}</h2>
            </div>
            <Sparkles className="h-4 w-4 text-[var(--secondary)]" />
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            <AnimatePresence mode="popLayout" initial={false}>
              {stackTasks.length ? stackTasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  topic={topics.find((topic) => topic.id === task.topic_id)}
                  index={index}
                  selected={selectedTask?.id === task.id}
                  saving={savingTaskIds.has(task.id)}
                  onSelect={() => setSelectedTaskId(task.id)}
                  onToggle={() => void toggleTask(task)}
                />
              )) : (
                <motion.div key="empty" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/40 p-8 text-center">
                  <div><CheckCircle2 className="mx-auto h-8 w-8 text-[var(--accent)]" /><p className="mt-3 font-semibold">Nothing here right now</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Your next intentional move will appear here.</p></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <section className="relative isolate flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-[38px] border border-[var(--border)] bg-[radial-gradient(circle_at_50%_42%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_45%),linear-gradient(145deg,color-mix(in_srgb,var(--surface)_72%,transparent),color-mix(in_srgb,var(--surface-soft)_82%,transparent))] shadow-[var(--shadow-lg)]">
          <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px)', backgroundSize: '42px 42px', maskImage: 'radial-gradient(circle, black 20%, transparent 72%)' }} />
          <LifeCore completion={dashboard.completion} focusedMinutes={focusedMinutes} reduceMotion={Boolean(reduceMotion)} />
          <div className="relative z-10 mt-8 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[.28em] text-[var(--foreground-subtle)]">Life core resonance</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-.06em] tabular-nums">{dashboard.completion}<span className="ml-1 text-xl text-[var(--foreground-muted)]">%</span></p>
            <p className="mt-2 text-xs text-[var(--foreground-muted)]">{dashboard.leaves.length} leaf tasks · {focusedMinutes} focus minutes</p>
          </div>
          {selectedTask && !isDone(selectedTask) && (
            <motion.button
              layout
              type="button"
              onClick={() => beginFocus(selectedTask)}
              whileHover={{ y: -3, scale: 1.015 }}
              whileTap={{ scale: .97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              className="relative z-10 mt-7 flex min-h-12 max-w-[75%] items-center gap-3 overflow-hidden rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] shadow-[0_14px_35px_color-mix(in_srgb,var(--primary)_24%,transparent)]"
            >
              <motion.span aria-hidden className="absolute inset-y-0 -left-20 w-16 skew-x-[-18deg] bg-white/30" animate={reduceMotion ? undefined : { x: [0, 380] }} transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2 }} />
              <Play className="h-4 w-4 fill-current" /><span className="truncate">Focus on {selectedTask.title}</span>
            </motion.button>
          )}
        </section>

        <section className="grid min-h-0 grid-rows-[1fr_1fr_auto] gap-4">
          <SatelliteCard icon={<AlertTriangle className="h-4 w-4" />} eyebrow="Attention field" title={`${dashboard.overdue} overdue signal${dashboard.overdue === 1 ? '' : 's'}`} tone="danger">
            <p>{dashboard.overdue ? 'Clear the oldest friction first. Your priority stack is already sorted.' : 'No urgent drag on your system. Keep the current rhythm.'}</p>
          </SatelliteCard>
          <SatelliteCard icon={<Orbit className="h-4 w-4" />} eyebrow="Active constellation" title={`${dashboard.activeSpaces} live space${dashboard.activeSpaces === 1 ? '' : 's'}`} tone="secondary">
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.slice(0, 5).map((topic, index) => <motion.span key={topic.id} initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .25 + index * .05 }} className="rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-1 text-[11px] font-medium">{topic.name}</motion.span>)}
            </div>
          </SatelliteCard>
          <div className="grid grid-cols-2 gap-3">
            <PulseMetric icon={<Zap className="h-4 w-4" />} label="Cycles" value={`${cycleCount}/14`} color="var(--warning)" />
            <PulseMetric icon={<Target className="h-4 w-4" />} label="Success key" value={`${keyOfSuccess}/3`} color="var(--accent)" />
          </div>
        </section>
      </main>
    </div>
  );
}

function LifeCore({ completion, focusedMinutes, reduceMotion }: { completion: number; focusedMinutes: number; reduceMotion: boolean }) {
  const speed = Math.max(7, 18 - Math.min(focusedMinutes / 20, 9));
  return (
    <div className="relative z-10 grid h-[330px] w-[330px] place-items-center 2xl:h-[390px] 2xl:w-[390px]">
      {[0, 1, 2].map((ring) => (
        <motion.div
          key={ring}
          aria-hidden
          className="absolute rounded-full border"
          style={{ inset: 18 + ring * 30, borderColor: `color-mix(in srgb, ${ring === 1 ? 'var(--secondary)' : 'var(--primary)'} ${28 - ring * 5}%, transparent)` }}
          animate={reduceMotion ? undefined : { rotate: ring % 2 ? -360 : 360, scale: [1, 1 + ring * .008, 1] }}
          transition={{ rotate: { duration: speed + ring * 5, repeat: Infinity, ease: 'linear' }, scale: { duration: 4 + ring, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary)] shadow-[0_0_18px_var(--primary)]" />
          {ring === 1 && <span className="absolute bottom-[12%] right-[8%] h-2 w-2 rounded-full bg-[var(--secondary)] shadow-[0_0_16px_var(--secondary)]" />}
        </motion.div>
      ))}
      <motion.div
        aria-hidden
        className="absolute h-[58%] w-[58%] rounded-full p-[1px]"
        style={{ background: `conic-gradient(var(--primary) ${completion * 3.6}deg, color-mix(in srgb, var(--border) 70%, transparent) 0deg)` }}
        animate={reduceMotion ? undefined : { rotate: [0, 4, -3, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="h-full w-full rounded-full bg-[var(--surface)]" />
      </motion.div>
      <motion.div
        className="relative h-[47%] w-[47%] rounded-full border border-white/20 bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,.95),color-mix(in_srgb,var(--primary)_78%,var(--secondary))_23%,color-mix(in_srgb,var(--secondary)_75%,#090917)_62%,#060611_100%)] shadow-[0_0_40px_color-mix(in_srgb,var(--primary)_35%,transparent),inset_-18px_-22px_40px_rgba(0,0,0,.42)]"
        animate={reduceMotion ? undefined : { y: [-4, 6, -4], rotate: [0, 5, 0], scale: [1, 1.035, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.span aria-hidden className="absolute inset-[15%] rounded-full border border-white/20" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} />
        <span className="absolute left-[28%] top-[19%] h-[18%] w-[13%] rotate-[-28deg] rounded-full bg-white/50 blur-[5px]" />
      </motion.div>
    </div>
  );
}

function TaskCard({ task, topic, index, selected, saving, onSelect, onToggle }: { task: ApiTask; topic?: ApiTopic; index: number; selected: boolean; saving: boolean; onSelect: () => void; onToggle: () => void }) {
  const done = isDone(task);
  const overdue = isOverdue(task);
  return (
    <motion.article
      layout
      layoutId={`desktop-task-${task.id}`}
      initial={{ opacity: 0, x: -14, scale: .98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: .96, transition: { duration: .2 } }}
      transition={{ ...spring, delay: index * .035 }}
      whileHover={{ x: 4, scale: 1.008 }}
      onClick={onSelect}
      className={`group relative flex min-h-[74px] cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border p-3 transition-colors ${selected ? 'border-[color:var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--border)] bg-[var(--surface)]/70 hover:border-[var(--border-strong)]'}`}
    >
      {overdue && <motion.span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--danger)]" animate={{ opacity: [.45, 1, .45] }} transition={{ duration: 2.8, repeat: Infinity }} />}
      <button type="button" onClick={(event) => { event.stopPropagation(); onToggle(); }} disabled={saving} aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${done ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-strong)] bg-[var(--surface-raised)] text-transparent hover:border-[var(--accent)] hover:text-[var(--accent)]'}`}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-[var(--foreground-muted)]" /> : <motion.span key={String(done)} initial={{ scale: .25, rotate: -22 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 24 }}><Check className="h-4 w-4 stroke-[3]" /></motion.span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${done ? 'text-[var(--foreground-muted)] line-through' : ''}`}>{task.title}</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-[var(--foreground-muted)]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: topic?.topic_color || 'var(--primary)' }} />{topic?.name || 'Unsorted'}{task.deadline ? ` · ${formatShortDate(task.deadline)}` : ''}</p>
      </div>
      {!done && <Clock3 className={`h-4 w-4 shrink-0 ${overdue ? 'text-[var(--danger)]' : 'text-[var(--foreground-subtle)]'}`} />}
    </motion.article>
  );
}

function SatelliteCard({ icon, eyebrow, title, tone, children }: { icon: React.ReactNode; eyebrow: string; title: string; tone: 'danger' | 'secondary'; children: React.ReactNode }) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--secondary)';
  return (
    <motion.article whileHover={{ y: -5, rotateX: 1.2, rotateY: -1.2 }} transition={spring} className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl">
      <motion.div aria-hidden className="absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-[.12] blur-3xl" style={{ background: color }} animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />
      <div className="relative flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color }}>{icon}{eyebrow}</div>
      <h3 className="relative mt-4 text-2xl font-semibold tracking-[-.04em]">{title}</h3>
      <div className="relative mt-2 text-xs leading-5 text-[var(--foreground-muted)]">{children}</div>
    </motion.article>
  );
}

function PulseMetric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <motion.div whileHover={{ y: -4, scale: 1.015 }} transition={spring} className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/70 p-4 shadow-[var(--shadow-sm)]">
      <motion.span aria-hidden className="absolute -bottom-8 -right-8 h-20 w-20 rounded-full opacity-[.12] blur-xl" style={{ background: color }} animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 5, repeat: Infinity }} />
      <div style={{ color }}>{icon}</div><p className="mt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--foreground-subtle)]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </motion.div>
  );
}

function TodaySkeleton() {
  return <div className="grid min-h-[690px] animate-pulse grid-cols-[.88fr_1.15fr_.9fr] gap-5"><div className="rounded-[32px] bg-[var(--surface-soft)]" /><div className="rounded-[38px] bg-[var(--surface-soft)]" /><div className="rounded-[32px] bg-[var(--surface-soft)]" /></div>;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}
