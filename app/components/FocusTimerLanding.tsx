'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowRight, Clock3, ListTodo, Play, Square } from 'lucide-react';
import { api, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { formatStopwatch, useFocusTimerStore } from '@/app/lib/timerStore';
import { StopwatchDigits } from '@/app/components/StopwatchDigits';

const isOpenTask = (task: ApiTask) => {
  const status = task.effective_status || task.status;
  return status !== 'completed' && !task.archived_at;
};

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function FocusTimerLanding() {
  const { user, sessionReady, sessionError } = useAppStore();
  const { timer, ready, busy, hydrate, start, stop, error: timerError } = useFocusTimerStore();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [, setTick] = useState(0);
  const reducedMotion = Boolean(useReducedMotion());

  const focusTasks = useMemo(
    () => tasks.filter((task) => isOpenTask(task)).sort((a, b) => a.title.localeCompare(b.title)),
    [tasks],
  );
  // Không fallback về focusTasks[0]: nếu người dùng chưa chọn gì thì nghĩa là
  // KHÔNG gắn task, chứ không phải gắn vào task đầu danh sách.
  const selectedTask = selectedTaskId ? focusTasks.find((task) => task.id === selectedTaskId) ?? null : null;

  const loadTasks = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTasks(true);
    setTasksError('');
    try {
      const rows = await api.getTasks(user.id, { view: 'tree' });
      setTasks(rows);
      const openRows = rows.filter((task) => isOpenTask(task));
      setSelectedTaskId((current) => (current && openRows.some((task) => task.id === current) ? current : ''));
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : 'Could not load tasks.');
    } finally {
      setLoadingTasks(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void hydrate(user.id);
    void loadTasks();
  }, [hydrate, loadTasks, user?.id]);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const elapsed = timer ? Date.now() - timer.startedAtMs : 0;
  // Chạy được kể cả khi không chọn task: phần lớn thời gian tập trung không
  // thuộc task nào, ép gán bừa vào một task chỉ làm hỏng số liệu của task đó.
  const canStart = Boolean(user?.id && !timer);
  const statusText = timer
    ? `Đang chạy: ${timer.taskTitle}`
    : selectedTask
      ? `Sẵn sàng: ${selectedTask.title}`
      : 'Sẵn sàng: không gắn task';
  // The animated status line keys off this SAME string it renders — never a
  // value computed separately from the visible text — so the swap trigger and
  // the content can never fall out of sync with each other.
  const displayStatus = sessionReady && ready ? statusText : 'Đang mở workspace...';

  // `busy` sống trong store, không phải state cục bộ: bấm nút chỉ uỷ thác cho
  // store, còn store tự chặn lần gọi thứ hai và tự vô hiệu hoá kết quả hydrate
  // đến muộn. Trước đây mỗi component giữ cờ busy riêng nên một hydrate chạy
  // song song vẫn ghi đè được kết quả, khiến phải bấm hai lần mới ăn.
  const handleStart = async () => {
    if (!user?.id) return;
    await start(user.id, selectedTask?.id ?? null, selectedTask?.title ?? 'Không thuộc task nào');
  };

  const handleStop = async () => {
    if (!user?.id) return;
    await stop(user.id);
    void loadTasks();
  };

  if (sessionReady && sessionError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--background)] p-6 text-center text-[var(--foreground)]">
        <div>
          <p className="font-semibold">Workspace unavailable</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">{sessionError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Ambient drift: two soft blurred blobs that breathe slowly in the
          background. Purely decorative, so they sit still under reduced motion
          instead of being removed outright — the page keeps its mood. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -left-1/4 -top-1/4 h-[60vmax] w-[60vmax] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 70%)' }}
          animate={reducedMotion ? undefined : { x: [0, 40, -20, 0], y: [0, 30, -10, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 h-[55vmax] w-[55vmax] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)' }}
          animate={reducedMotion ? undefined : { x: [0, -30, 20, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: easeOut }}
        className="mx-auto grid min-h-dvh w-full max-w-6xl content-center gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,.95fr)] lg:px-8"
      >
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl sm:p-7 lg:p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <motion.span
                animate={!reducedMotion && timer ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 2.4, repeat: timer ? Infinity : 0, ease: 'easeInOut' }}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"
              >
                <Clock3 className="h-5 w-5" />
              </motion.span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--foreground-muted)]">Focus timer</p>
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Bộ đếm thời gian</h1>
              </div>
            </div>
            <Link href="/overview" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--border)] text-[var(--foreground-muted)] transition hover:bg-[var(--surface-soft)]" aria-label="Open dashboard">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          <div
            className="relative grid min-h-[220px] place-items-center rounded-3xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:min-h-[300px] sm:py-12"
            style={{ containerType: 'inline-size' }}
          >
            {/* A faint static glow sits behind the digits at rest so the box
                never reads as flat/empty; the running state layers a brighter
                breathing halo on top of it. Both are sized in % of THIS box
                (not the viewport), so they can never bleed past its rounded
                corners — no overflow-hidden needed to contain them. */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-[65%] w-[65%] rounded-full transition-opacity duration-700"
              style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 72%)', opacity: timer ? 0 : 0.35 }}
            />
            {timer && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute h-[65%] w-[65%] rounded-full"
                style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 72%)' }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.05, 0.95] }}
                transition={reducedMotion ? { duration: 0 } : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            <div className="relative flex flex-col items-center">
              {/* Deliberately no AnimatePresence/exit here: this line can change
                  twice in a row inside one second (loading -> ready -> task
                  switched), and an exit animation that has to fully finish
                  before the next enter starts is exactly what can leave stale
                  text on screen if a browser tab throttles it mid-transition.
                  Keying by the text itself still gives every change its own
                  fade-in; the old text is simply gone the instant React swaps
                  the keyed node, which can never get stuck. */}
              <motion.p
                key={displayStatus}
                initial={reducedMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: easeOut }}
                className="mb-4 max-w-full truncate rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--foreground-muted)] sm:text-sm"
              >
                {displayStatus}
              </motion.p>

              {/* Font-size is driven by cqw (this box's own rendered width via
                  container-type: inline-size above), never vw — vw sizes off
                  the FULL viewport, which is what let the digits render wider
                  than this card and get clipped on a two-column desktop
                  layout. cqw is always correctly scoped to this box, so the
                  row can never outgrow it regardless of column width. */}
              <StopwatchDigits
                value={formatStopwatch(elapsed)}
                className="font-mono text-[clamp(2.75rem,17cqw,7rem)] font-semibold leading-none tracking-normal"
              />

              <div className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-muted)] sm:text-sm">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {timer && !reducedMotion && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  )}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-300 ${timer ? 'bg-red-500' : 'bg-[var(--foreground-subtle)]'}`} />
                </span>
                {timer ? 'Đang tự tính thời gian ngầm' : 'Chỉ lưu thành một focus time khi bấm dừng'}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            {/* "Không gắn task" là lựa chọn đầu tiên và là mặc định khi chưa
                chọn gì — phần lớn thời gian tập trung không thuộc task nào, và
                trước đây danh sách tự chọn sẵn task đầu tiên (READING) khiến
                thời gian bị ghi nhầm sang task đó. */}
            <select
              value={selectedTaskId}
              onChange={(event) => setSelectedTaskId(event.target.value)}
              disabled={Boolean(timer) || loadingTasks}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none transition focus:border-[var(--primary)] disabled:opacity-60"
              aria-label="Chọn task focus"
            >
              <option value="">Không gắn task</option>
              {focusTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
            {/* One persistent button, not a pair swapped through AnimatePresence
                — only its label/colour change. That way "does the button
                actually flip to Stop" can never be held hostage by an exit
                animation that has to finish first (see StopwatchDigits for
                why that risk is real on this page: things tick every second
                for potentially hours). `layout` still gives the width change
                between "Chạy" and "Dừng và lưu" a smooth resize. */}
            <motion.button
              type="button"
              layout
              onClick={() => void (timer ? handleStop() : handleStart())}
              disabled={timer ? busy || !user?.id : busy || !canStart}
              whileHover={reducedMotion || busy || (!timer && !canStart) ? undefined : { scale: 1.03 }}
              whileTap={reducedMotion || busy || (!timer && !canStart) ? undefined : { scale: 0.96 }}
              transition={{ duration: 0.18, ease: easeOut }}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                timer ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
              }`}
            >
              <motion.span
                key={timer ? 'stop' : 'start'}
                initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: easeOut }}
                className="inline-flex items-center gap-2"
              >
                {timer ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                {timer ? 'Dừng và lưu' : 'Chạy'}
              </motion.span>
            </motion.button>
          </div>

          {(tasksError || timerError) && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: easeOut }}
              className="mt-4 flex gap-2 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{tasksError || timerError}</p>
            </motion.div>
          )}
        </section>

        <motion.aside
          initial={reducedMotion ? false : 'hidden'}
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
          className="grid content-start gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-md backdrop-blur sm:p-6"
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: -8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.3, ease: easeOut }}
            className="flex items-center gap-3"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <ListTodo className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">Task focus</p>
              <p className="text-sm text-[var(--foreground-muted)]">{loadingTasks ? 'Đang tải task...' : `${focusTasks.length} task có thể chạy`}</p>
            </div>
          </motion.div>
          <div className="space-y-2.5">
            {focusTasks.slice(0, 5).map((task) => (
              <motion.button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                disabled={Boolean(timer)}
                variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                whileHover={reducedMotion || timer ? undefined : { x: 2 }}
                whileTap={reducedMotion || timer ? undefined : { scale: 0.98 }}
                className={`flex min-h-12 w-full min-w-0 items-center rounded-2xl border px-3 text-left text-sm transition-colors disabled:opacity-60 ${selectedTask?.id === task.id ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]'}`}
              >
                <span className="truncate font-medium">{task.title}</span>
              </motion.button>
            ))}
          </div>
          <Link href="/tasks" className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-soft)]">
            Mở danh sách task
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.aside>
      </motion.div>
    </main>
  );
}
