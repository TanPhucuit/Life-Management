'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Flame,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  TimerReset,
  Zap,
} from 'lucide-react';
import { api, ApiCycleTick, ApiDate, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { useMotionDirector } from '@/app/components/desktop-v2/core/MotionDirector';

export type FocusScenePulse =
  | { type: 'focus-started'; taskId: string | null; durationMinutes: number }
  | { type: 'focus-paused'; progress: number }
  | { type: 'focus-saved'; minutes: number; totalFocusedMinutes: number }
  | { type: 'cycle-toggled'; hour: number; checked: boolean }
  | { type: 'success-key'; value: number };

export interface DesktopFocusProps {
  onScenePulse?: (pulse: FocusScenePulse) => void;
  onSnapshotChange?: (snapshot: {
    focusedMinutes: number;
    cycleCount: number;
  }) => void;
}

const cycleHours = Array.from({ length: 14 }, (_, index) => index + 8);
const presets = [25, 50, 90] as const;
const reactorSpring = { type: 'spring' as const, stiffness: 420, damping: 32, mass: .8 };

function isDone(task: ApiTask) {
  return task.effective_status !== undefined
    ? task.effective_status === 'completed'
    : task.status === 'completed';
}

function todayParts() {
  const now = new Date();
  return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
}

export default function DesktopFocus({ onScenePulse, onSnapshotChange }: DesktopFocusProps) {
  const { reducedMotion: reduceMotion, pulseActivity } = useMotionDirector();
  const { user } = useAppStore();
  const today = useMemo(todayParts, []);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [dateRecord, setDateRecord] = useState<ApiDate | null>(null);
  const [ticks, setTicks] = useState<ApiCycleTick[]>([]);
  const [presetMinutes, setPresetMinutes] = useState<number>(50);
  const [remainingSeconds, setRemainingSeconds] = useState(50 * 60);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savingHours, setSavingHours] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestedTaskApplied = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    const [taskResult, dateResult, tickResult] = await Promise.allSettled([
      api.getTasks(user.id, { view: 'tree' }),
      api.getDates(user.id, today.month, today.year),
      api.getCycleTicks(user.id, today.month, today.year),
    ]);
    if (taskResult.status === 'fulfilled') {
      const openLeaves = taskResult.value.filter((task) => (task.child_count || 0) === 0 && !isDone(task));
      setTasks(openLeaves);
      if (!requestedTaskApplied.current) {
        const queryTask = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('task') || '';
        setSelectedTaskId(openLeaves.some((task) => task.id === queryTask) ? queryTask : openLeaves[0]?.id || '');
        requestedTaskApplied.current = true;
      }
    }
    if (dateResult.status === 'fulfilled') {
      setDateRecord(dateResult.value.find((record) => record.day === today.day) || null);
    }
    if (tickResult.status === 'fulfilled') {
      setTicks(tickResult.value.filter((tick) => tick.day === today.day));
    }
    if ([taskResult, dateResult, tickResult].some((result) => result.status === 'rejected')) {
      setError('The reactor could not synchronize every signal. Retry before logging a session.');
    }
    setLoading(false);
  }, [today.day, today.month, today.year, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!endAt) return;
    const update = () => {
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next === 0) {
        setEndAt(null);
        setSessionReady(true);
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [endAt]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const totalSeconds = presetMinutes * 60;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = totalSeconds ? Math.min(1, elapsedSeconds / totalSeconds) : 0;
  const isRunning = endAt !== null;
  const checkedHours = useMemo(() => new Set(ticks.filter((tick) => tick.is_checked).map((tick) => tick.hour)), [ticks]);
  const focusedMinutes = Number(dateRecord?.focused_minutes) || 0;
  const keyOfSuccess = Number(dateRecord?.key_of_success) || 0;

  useEffect(() => {
    if (loading) return;
    onSnapshotChange?.({ focusedMinutes, cycleCount: checkedHours.size });
  }, [checkedHours.size, focusedMinutes, loading, onSnapshotChange]);

  const choosePreset = (minutes: number) => {
    if (isRunning) return;
    setPresetMinutes(minutes);
    setRemainingSeconds(minutes * 60);
    setSessionReady(false);
  };

  const start = () => {
    if (remainingSeconds === 0) setRemainingSeconds(totalSeconds);
    const seconds = remainingSeconds === 0 ? totalSeconds : remainingSeconds;
    setSessionReady(false);
    setEndAt(Date.now() + seconds * 1000);
    pulseActivity('feedback', 900);
    onScenePulse?.({ type: 'focus-started', taskId: selectedTask?.id || null, durationMinutes: presetMinutes });
  };

  const pause = () => {
    if (!endAt) return;
    const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    setRemainingSeconds(next);
    setEndAt(null);
    onScenePulse?.({ type: 'focus-paused', progress: totalSeconds ? 1 - next / totalSeconds : 0 });
  };

  const reset = () => {
    setEndAt(null);
    setRemainingSeconds(totalSeconds);
    setSessionReady(false);
  };

  const saveSession = async () => {
    if (!user?.id || savingSession || elapsedSeconds < 1) return;
    const minutes = remainingSeconds === 0 ? presetMinutes : Math.max(1, Math.round(elapsedSeconds / 60));
    const nextTotal = focusedMinutes + minutes;
    setSavingSession(true);
    pulseActivity('interaction', 900);
    setError('');
    try {
      const saved = dateRecord
        ? await api.updateDate({ id: dateRecord.id, focusedMinutes: nextTotal })
        : await api.createDate({ userId: user.id, day: today.day, month: today.month, year: today.year, focusedMinutes: nextTotal, keyOfSuccess });
      setDateRecord(saved);
      setEndAt(null);
      setRemainingSeconds(totalSeconds);
      setSessionReady(false);
      onScenePulse?.({ type: 'focus-saved', minutes, totalFocusedMinutes: Number(saved.focused_minutes) || nextTotal });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This focus session could not be saved.');
    } finally {
      setSavingSession(false);
    }
  };

  const toggleHour = async (hour: number) => {
    if (!user?.id || savingHours.has(hour)) return;
    const checked = !checkedHours.has(hour);
    pulseActivity('interaction', 620);
    const previous = ticks;
    const existing = ticks.find((tick) => tick.hour === hour);
    setSavingHours((current) => new Set(current).add(hour));
    if (existing) setTicks((current) => current.map((tick) => tick.hour === hour ? { ...tick, is_checked: checked } : tick));
    else setTicks((current) => [...current, { id: `optimistic-${hour}`, user_id: user.id, ...today, hour, is_checked: checked }]);
    try {
      const saved = await api.setCycleTick({ userId: user.id, ...today, hour, checked });
      setTicks((current) => [...current.filter((tick) => tick.hour !== hour), saved]);
      onScenePulse?.({ type: 'cycle-toggled', hour, checked });
    } catch (reason) {
      setTicks(previous);
      setError(reason instanceof Error ? reason.message : 'The cycle block could not be saved.');
    } finally {
      setSavingHours((current) => {
        const next = new Set(current);
        next.delete(hour);
        return next;
      });
    }
  };

  const updateSuccessKey = async (value: number) => {
    if (!user?.id || savingKey) return;
    setSavingKey(true);
    setError('');
    try {
      const saved = dateRecord
        ? await api.updateDate({ id: dateRecord.id, keyOfSuccess: value })
        : await api.createDate({ userId: user.id, ...today, focusedMinutes, keyOfSuccess: value });
      setDateRecord(saved);
      onScenePulse?.({ type: 'success-key', value });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Key of Success could not be saved.');
    } finally {
      setSavingKey(false);
    }
  };

  if (loading) return <FocusSkeleton />;

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden px-2 pb-8 text-[var(--foreground)]">
      <motion.div aria-hidden className="pointer-events-none absolute left-[30%] top-[16%] h-[540px] w-[540px] rounded-full bg-[var(--primary)] opacity-[.08] blur-[130px]" animate={reduceMotion ? undefined : { scale: [1, 1.18, .95, 1], x: [0, 80, -20, 0] }} transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} />
      <header className="relative z-10 mb-5 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.28em] text-[var(--accent)]">Focus reactor · live chamber</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">Turn attention into energy.</h1>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">A clean timer, your current task, and the fourteen blocks that shape the day.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--glass)] px-4 py-3 backdrop-blur-xl">
          <Flame className="h-5 w-5 text-[var(--warning)]" />
          <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--foreground-subtle)]">Energy logged</p><p className="text-lg font-semibold tabular-nums">{focusedMinutes} min</p></div>
        </div>
      </header>

      <AnimatePresence>
        {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="relative z-20 mb-4 flex items-center justify-between rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span><button type="button" onClick={() => void load()} className="min-h-9 rounded-xl px-3 font-semibold hover:bg-black/5">Retry sync</button></motion.div>}
      </AnimatePresence>

      <main className="relative z-10 grid min-h-[690px] grid-cols-[minmax(260px,.72fr)_minmax(560px,1.5fr)_minmax(280px,.76fr)] gap-5">
        <aside className="flex min-h-0 flex-col rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-sm)] backdrop-blur-xl">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--primary)]">Task signal</p><h2 className="mt-1 text-lg font-semibold">Choose one intention</h2></div><Target className="h-5 w-5 text-[var(--primary)]" /></div>
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {tasks.length ? tasks.slice(0, 12).map((task, index) => (
              <motion.button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * .035 }}
                whileHover={{ x: 4 }}
                className={`relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-colors ${selectedTaskId === task.id ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--border)] bg-[var(--surface)]/65 hover:border-[var(--border-strong)]'}`}
              >
                {selectedTaskId === task.id && <motion.span layoutId="focus-task-signal" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-[var(--primary)] shadow-[0_0_12px_var(--primary)]" transition={reactorSpring} />}
                <span className="block truncate text-sm font-semibold">{task.title}</span>
                <span className="mt-1 block truncate text-[11px] text-[var(--foreground-muted)]">{task.deadline ? `Due ${formatDate(task.deadline)}` : 'No deadline · open focus'}</span>
              </motion.button>
            )) : <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--foreground-muted)]">No open leaf task. You can still run a free focus session.</div>}
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--foreground-subtle)]">Key of Success</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((value) => <motion.button key={value} type="button" disabled={savingKey} onClick={() => void updateSuccessKey(value)} whileTap={{ scale: .9 }} className={`relative grid h-10 place-items-center rounded-xl border text-sm font-semibold ${keyOfSuccess === value ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)]'}`}>{keyOfSuccess === value && <motion.span layoutId="success-key-glow" className="absolute inset-0 rounded-xl shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_25%,transparent)]" />}{value}</motion.button>)}
            </div>
          </div>
        </aside>

        <section className="relative isolate flex flex-col items-center justify-center overflow-hidden rounded-[40px] border border-[var(--border)] bg-[radial-gradient(circle_at_50%_48%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_45%),linear-gradient(160deg,color-mix(in_srgb,var(--surface)_82%,transparent),color-mix(in_srgb,var(--surface-soft)_72%,transparent))] shadow-[var(--shadow-lg)]">
          <div aria-hidden className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--foreground) 25%, transparent) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(circle, black, transparent 73%)' }} />
          <CycleOrbit hours={cycleHours} checkedHours={checkedHours} savingHours={savingHours} onToggle={toggleHour} reduceMotion={Boolean(reduceMotion)} />
          <Reactor progress={progress} running={isRunning} reduceMotion={Boolean(reduceMotion)} />
          <div className="relative z-20 mt-2 text-center">
            <AnimatePresence mode="wait">
              <motion.div key={remainingSeconds} initial={{ opacity: .35, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .12 }} className="text-6xl font-semibold tracking-[-.065em] tabular-nums 2xl:text-7xl">{formatTimer(remainingSeconds)}</motion.div>
            </AnimatePresence>
            <p className="mt-2 max-w-[340px] truncate text-sm text-[var(--foreground-muted)]">{selectedTask?.title || 'Unbound focus session'}</p>
          </div>
          <div className="relative z-20 mt-7 flex items-center gap-3">
            {!isRunning ? (
              <motion.button type="button" onClick={start} whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: .94 }} transition={reactorSpring} className="grid h-14 w-14 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)] shadow-[0_12px_34px_color-mix(in_srgb,var(--primary)_34%,transparent)]" aria-label="Start focus"><Play className="h-5 w-5 fill-current" /></motion.button>
            ) : (
              <motion.button type="button" onClick={pause} whileHover={{ scale: 1.04 }} whileTap={{ scale: .94 }} transition={reactorSpring} className="grid h-14 w-14 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)]" aria-label="Pause focus"><Pause className="h-5 w-5 fill-current" /></motion.button>
            )}
            <motion.button type="button" onClick={reset} whileTap={{ rotate: -40, scale: .9 }} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--glass)] text-[var(--foreground-muted)]" aria-label="Reset timer"><RotateCcw className="h-4 w-4" /></motion.button>
            <motion.button type="button" onClick={() => { pause(); setSessionReady(true); }} disabled={elapsedSeconds < 1} whileTap={{ scale: .92 }} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--glass)] text-[var(--foreground-muted)] disabled:opacity-30" aria-label="Finish session"><Square className="h-3.5 w-3.5 fill-current" /></motion.button>
          </div>
          <AnimatePresence>
            {sessionReady && elapsedSeconds > 0 && (
              <motion.button initial={{ opacity: 0, y: 14, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} type="button" onClick={() => void saveSession()} disabled={savingSession} className="relative z-20 mt-5 flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_10px_26px_color-mix(in_srgb,var(--accent)_28%,transparent)]">
                {savingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Log {remainingSeconds === 0 ? presetMinutes : Math.max(1, Math.round(elapsedSeconds / 60))} focused minute{Math.round(elapsedSeconds / 60) === 1 ? '' : 's'}
              </motion.button>
            )}
          </AnimatePresence>
        </section>

        <aside className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-4">
          <section className="rounded-[28px] border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-sm)] backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--secondary)]"><TimerReset className="h-4 w-4" />Focus depth</div>
            <div className="relative mt-4 grid grid-cols-3 rounded-2xl bg-[var(--surface-soft)] p-1">
              {presets.map((minutes) => <button key={minutes} type="button" disabled={isRunning} onClick={() => choosePreset(minutes)} className="relative z-10 min-h-10 rounded-xl text-sm font-semibold disabled:cursor-not-allowed">{presetMinutes === minutes && <motion.span layoutId="focus-preset-pill" className="absolute inset-0 -z-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm" transition={reactorSpring} />}{minutes}m</button>)}
            </div>
          </section>
          <section className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/72 p-5 shadow-[var(--shadow-sm)]">
            <motion.div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--warning)] opacity-[.1] blur-3xl" animate={reduceMotion ? undefined : { scale: [1, 1.3, 1], x: [0, -20, 0] }} transition={{ duration: 8, repeat: Infinity }} />
            <div className="relative flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--warning)]">Daily cycle</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">{checkedHours.size}<span className="text-base text-[var(--foreground-muted)]"> / 14</span></h2></div><Zap className="h-5 w-5 text-[var(--warning)]" /></div>
            <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><motion.div className="h-full rounded-full bg-[linear-gradient(90deg,var(--warning),var(--accent))]" initial={{ width: 0 }} animate={{ width: `${checkedHours.size / 14 * 100}%` }} transition={reactorSpring} /></div>
            <div className="relative mt-5 grid grid-cols-7 gap-1.5">{cycleHours.map((hour) => <motion.div key={hour} animate={{ opacity: checkedHours.has(hour) ? 1 : .24, scaleY: checkedHours.has(hour) ? 1 : .55 }} className="h-14 origin-bottom rounded-full bg-[linear-gradient(to_top,var(--warning),var(--accent))]" />)}</div>
            <p className="relative mt-4 text-xs leading-5 text-[var(--foreground-muted)]">Each segment maps exactly to the existing 08:00–21:00 cycle record.</p>
          </section>
          <section className="rounded-[28px] border border-[var(--border)] bg-[var(--glass)] p-4 backdrop-blur-xl"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Sparkles className="h-4 w-4" /></div><div><p className="text-xs text-[var(--foreground-muted)]">Today&apos;s Key of Success</p><p className="text-lg font-semibold">Level {keyOfSuccess} resonance</p></div></div></section>
        </aside>
      </main>
    </div>
  );
}

function Reactor({ progress, running, reduceMotion }: { progress: number; running: boolean; reduceMotion: boolean }) {
  return (
    <div className="relative z-10 mt-4 grid h-[330px] w-[330px] place-items-center 2xl:h-[370px] 2xl:w-[370px]">
      {[0, 1, 2].map((ring) => <motion.div key={ring} aria-hidden className="absolute rounded-full border border-[color:var(--border-strong)]" style={{ inset: 18 + ring * 27 }} animate={reduceMotion || !running ? undefined : { rotate: ring % 2 ? -360 : 360 }} transition={{ duration: 8 + ring * 5, repeat: Infinity, ease: 'linear' }}><span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" /></motion.div>)}
      <div className="absolute h-[61%] w-[61%] rounded-full p-[2px]" style={{ background: `conic-gradient(var(--accent) ${progress * 360}deg, color-mix(in srgb, var(--border) 80%, transparent) 0deg)` }}><div className="h-full w-full rounded-full bg-[var(--surface)]" /></div>
      <motion.div className="relative h-[47%] w-[47%] overflow-hidden rounded-full border border-white/20 bg-[#090b18] shadow-[0_0_60px_color-mix(in_srgb,var(--primary)_32%,transparent),inset_0_0_28px_rgba(0,0,0,.6)]" animate={reduceMotion || !running ? { scale: 1 } : { scale: [1, 1.045, 1], y: [-3, 4, -3] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}>
        <motion.div aria-hidden className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,var(--primary),var(--secondary)_65%,rgba(255,255,255,.78))]" initial={false} animate={{ height: `${18 + progress * 82}%` }} transition={reactorSpring} />
        <motion.div aria-hidden className="absolute -left-[20%] h-6 w-[140%] rounded-[50%] bg-white/30 blur-sm" animate={reduceMotion ? undefined : { bottom: [`${15 + progress * 78}%`, `${18 + progress * 78}%`, `${15 + progress * 78}%`], x: [-8, 8, -8] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
        <span className="absolute left-[26%] top-[16%] h-[18%] w-[12%] -rotate-[24deg] rounded-full bg-white/40 blur-[4px]" />
      </motion.div>
    </div>
  );
}

function CycleOrbit({ hours, checkedHours, savingHours, onToggle, reduceMotion }: { hours: number[]; checkedHours: Set<number>; savingHours: Set<number>; onToggle: (hour: number) => Promise<void>; reduceMotion: boolean }) {
  return (
    <motion.div aria-label="Daily cycle blocks" className="absolute left-1/2 top-[49%] z-20 h-[510px] w-[510px] -translate-x-1/2 -translate-y-1/2 rounded-full" animate={reduceMotion ? undefined : { rotate: [0, .8, 0, -.8, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}>
      {hours.map((hour, index) => {
        const angle = index / hours.length * 360 - 90;
        const checked = checkedHours.has(hour);
        return <div key={hour} className="absolute left-1/2 top-1/2 h-10 w-10 -ml-5 -mt-5" style={{ transform: `rotate(${angle}deg) translateY(-242px) rotate(${-angle}deg)` }}><motion.button type="button" onClick={() => void onToggle(hour)} disabled={savingHours.has(hour)} whileHover={{ scale: 1.22 }} whileTap={{ scale: .82 }} transition={reactorSpring} aria-label={`${checked ? 'Uncheck' : 'Check'} ${hour}:00 cycle`} className={`grid h-10 w-10 place-items-center rounded-full border text-[10px] font-semibold tabular-nums backdrop-blur-xl ${checked ? 'border-[var(--warning)] bg-[var(--warning)] text-[#14120c] shadow-[0_0_18px_color-mix(in_srgb,var(--warning)_48%,transparent)]' : 'border-[var(--border-strong)] bg-[var(--glass)] text-[var(--foreground-muted)] hover:border-[var(--warning)]'}`}>{savingHours.has(hour) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : checked ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : hour}</motion.button></div>;
      })}
    </motion.div>
  );
}

function FocusSkeleton() {
  return <div className="grid min-h-[690px] animate-pulse grid-cols-[.72fr_1.5fr_.76fr] gap-5"><div className="rounded-[30px] bg-[var(--surface-soft)]" /><div className="rounded-[40px] bg-[var(--surface-soft)]" /><div className="rounded-[30px] bg-[var(--surface-soft)]" /></div>;
}

function formatTimer(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}
