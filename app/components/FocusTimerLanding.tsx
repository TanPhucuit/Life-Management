'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Clock3, ListTodo, Play, Square } from 'lucide-react';
import { api, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { formatStopwatch, useFocusTimerStore } from '@/app/lib/timerStore';

const isOpenTask = (task: ApiTask) => {
  const status = task.effective_status || task.status;
  return status !== 'completed' && !task.archived_at;
};

export default function FocusTimerLanding() {
  const { user, sessionReady, sessionError } = useAppStore();
  const { timer, ready, hydrate, start, stop, error: timerError } = useFocusTimerStore();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const focusTasks = useMemo(
    () => tasks.filter((task) => isOpenTask(task)).sort((a, b) => a.title.localeCompare(b.title)),
    [tasks],
  );
  const selectedTask = focusTasks.find((task) => task.id === selectedTaskId) || focusTasks[0] || null;

  const loadTasks = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTasks(true);
    setTasksError('');
    try {
      const rows = await api.getTasks(user.id, { view: 'tree' });
      setTasks(rows);
      const openRows = rows.filter((task) => isOpenTask(task));
      setSelectedTaskId((current) => (current && openRows.some((task) => task.id === current) ? current : openRows[0]?.id || ''));
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
  const canStart = Boolean(user?.id && selectedTask && !timer);
  const statusText = timer ? `Đang chạy: ${timer.taskTitle}` : selectedTask ? `Sẵn sàng: ${selectedTask.title}` : 'Chưa có task để chạy';

  const handleStart = async () => {
    if (!user?.id || !selectedTask) return;
    setBusy(true);
    try {
      await start(user.id, selectedTask.id, selectedTask.title);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await stop(user.id);
      void loadTasks();
    } finally {
      setBusy(false);
    }
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
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl content-center gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,.95fr)] lg:px-8">
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg sm:p-7 lg:p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <Clock3 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--foreground-muted)]">Focus timer</p>
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Bộ đếm thời gian</h1>
              </div>
            </div>
            <Link href="/overview" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)]" aria-label="Open dashboard">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          <div className="grid min-h-[220px] place-items-center rounded-3xl bg-[var(--surface-soft)] px-4 py-8 text-center sm:min-h-[280px]">
            <div>
              <p className="mb-3 text-sm font-medium text-[var(--foreground-muted)]">{sessionReady && ready ? statusText : 'Đang mở workspace...'}</p>
              <p className="font-mono text-[clamp(3rem,14vw,8.5rem)] font-semibold leading-none tracking-normal tabular-nums">
                {formatStopwatch(elapsed)}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-[var(--foreground-muted)]">
                <span className={`h-2.5 w-2.5 rounded-full ${timer ? 'bg-red-500' : 'bg-[var(--foreground-subtle)]'}`} />
                {timer ? 'Đang tự tính thời gian ngầm' : 'Chỉ lưu thành một focus time khi bấm dừng'}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              value={selectedTask?.id || ''}
              onChange={(event) => setSelectedTaskId(event.target.value)}
              disabled={Boolean(timer) || loadingTasks || focusTasks.length === 0}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none transition focus:border-[var(--primary)] disabled:opacity-60"
              aria-label="Chọn task focus"
            >
              {focusTasks.length === 0 ? <option value="">Chưa có task đang mở</option> : focusTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
            {timer ? (
              <button type="button" onClick={() => void handleStop()} disabled={busy || !user?.id} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">
                <Square className="h-4 w-4 fill-current" />
                Dừng và lưu
              </button>
            ) : (
              <button type="button" onClick={() => void handleStart()} disabled={busy || !canStart} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60">
                <Play className="h-4 w-4 fill-current" />
                Chạy
              </button>
            )}
          </div>

          {(tasksError || timerError) && (
            <div className="mt-4 flex gap-2 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{tasksError || timerError}</p>
            </div>
          )}
        </section>

        <aside className="grid content-start gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-md backdrop-blur sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <ListTodo className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">Task focus</p>
              <p className="text-sm text-[var(--foreground-muted)]">{loadingTasks ? 'Đang tải task...' : `${focusTasks.length} task có thể chạy`}</p>
            </div>
          </div>
          <div className="space-y-2">
            {focusTasks.slice(0, 5).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                disabled={Boolean(timer)}
                className={`flex min-h-12 w-full min-w-0 items-center rounded-2xl border px-3 text-left text-sm transition disabled:opacity-60 ${selectedTask?.id === task.id ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]'}`}
              >
                <span className="truncate font-medium">{task.title}</span>
              </button>
            ))}
          </div>
          <Link href="/tasks" className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-soft)]">
            Mở danh sách task
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
