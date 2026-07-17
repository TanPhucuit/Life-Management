'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, FolderTree, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import { api, ApiTask, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Surface } from './ui';

const isDone = (task: ApiTask) => task.status === 'completed' || task.effective_status === 'completed';
const localDateKey = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};
const todayKey = () => { const date = new Date(); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; };

export default function Overview() {
  const { user } = useAppStore();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError('');
    const [taskResult, topicResult] = await Promise.allSettled([api.getTasks(user.id, { view: 'tree' }), api.getTopics(user.id)]);
    if (taskResult.status === 'fulfilled') setTasks(taskResult.value);
    if (topicResult.status === 'fulfilled') setTopics(topicResult.value);
    if (taskResult.status === 'rejected' || topicResult.status === 'rejected') setError('Some overview data could not be loaded.');
    setLoading(false);
  }, [user?.id]);
  useEffect(() => { void load(); }, [load]);

  const data = useMemo(() => {
    const leaves = tasks.filter((task) => (task.child_count || 0) === 0);
    const incomplete = leaves.filter((task) => !isDone(task));
    const now = new Date();
    const todayTasks = incomplete.filter((task) => localDateKey(task.start_date) === todayKey());
    const overdue = incomplete.filter((task) => task.deadline && new Date(task.deadline) < now);
    const activeTopicIds = new Set(incomplete.map((task) => task.topic_id));
    const completion = leaves.length ? Math.round((leaves.filter(isDone).length / leaves.length) * 100) : 0;
    const priority = [...incomplete].sort((a, b) => {
      const aOverdue = Boolean(a.deadline && new Date(a.deadline) < now);
      const bOverdue = Boolean(b.deadline && new Date(b.deadline) < now);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return new Date(a.deadline || '2999-12-31').getTime() - new Date(b.deadline || '2999-12-31').getTime();
    }).slice(0, 5);
    const upcoming = incomplete.filter((task) => task.deadline && new Date(task.deadline) >= now).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()).slice(0, 5);
    return { leaves, todayTasks, overdue, activeRoots: topics.filter((topic) => activeTopicIds.has(topic.id)).length, completion, priority, upcoming };
  }, [tasks, topics]);

  return (
    <div>
      <PageHeader eyebrow="Personal command center" title={`Good ${getGreeting()}, ${user?.username}`} description="A calm, live view of what matters today and what is coming next." action={<Link href="/tasks" className="btn-primary"><Target className="h-4 w-4" />Open tasks</Link>} />
      {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
      {loading ? <LoadingOverview /> : (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Today tasks" value={data.todayTasks.length} hint="Scheduled to start today" icon={<Clock3 className="h-5 w-5" />} />
            <StatCard label="Active roots" value={data.activeRoots} hint="Life areas with open work" icon={<FolderTree className="h-5 w-5" />} tone="secondary" />
            <StatCard label="Completion" value={`${data.completion}%`} hint={`${data.leaves.length} leaf tasks total`} icon={<CheckCircle2 className="h-5 w-5" />} tone="accent" />
            <StatCard label="Overdue" value={data.overdue.length} hint="Leaf tasks needing attention" icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <Surface className="relative overflow-hidden p-5 sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[var(--primary)] opacity-[.08] blur-3xl" />
              <div className="relative mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--primary)]">Focus queue</p><h2 className="mt-1 text-xl font-semibold tracking-[-.025em]">Priority tasks</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">Overdue items appear first, followed by the nearest deadline.</p></div><Sparkles className="h-5 w-5 text-[var(--secondary)]" /></div>
              {data.priority.length === 0 ? <EmptyState title="Your queue is clear" description="Create a task or schedule a start date to see it here." action={<Link href="/tasks" className="btn-secondary">Create a task</Link>} /> : <div className="space-y-2">{data.priority.map((task, index) => <TaskRow key={task.id} task={task} index={index} topic={topics.find((topic) => topic.id === task.topic_id)?.name} />)}</div>}
            </Surface>

            <Surface className="p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Timeline</p><h2 className="mt-1 text-xl font-semibold tracking-[-.025em]">Upcoming deadlines</h2></div><CalendarClock className="h-5 w-5 text-[var(--accent)]" /></div>
              {data.upcoming.length === 0 ? <EmptyState title="Nothing due soon" description="Future deadlines will appear here." /> : <div className="space-y-3">{data.upcoming.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-2xl bg-[var(--surface-soft)] p-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><CalendarClock className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{task.title}</p><p className="text-xs text-[var(--foreground-muted)]">{formatDate(task.deadline)}</p></div></div>)}</div>}
              <Link href="/calendar" className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]">View calendar<ArrowRight className="h-4 w-4" /></Link>
            </Surface>
          </section>
        </>
      )}
    </div>
  );
}

function TaskRow({ task, index, topic }: { task: ApiTask; index: number; topic?: string }) {
  const overdue = Boolean(task.deadline && new Date(task.deadline) < new Date());
  return <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .045 }} className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--border-strong)] hover:shadow-sm"><span className={`h-9 w-1 rounded-full ${overdue ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{task.title}</p><p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{topic || 'Uncategorized'} · {task.deadline ? formatDate(task.deadline) : 'No deadline'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--primary-soft)] text-[var(--primary)]'}`}>{overdue ? 'Overdue' : 'Open'}</span></motion.div>;
}
function LoadingOverview() { return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div><div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /></div></div>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'No date'; }
function getGreeting() { const hour = new Date().getHours(); return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'; }
