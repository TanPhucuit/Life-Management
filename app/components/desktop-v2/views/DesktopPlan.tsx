'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  FolderTree,
  GripVertical,
  Inbox,
  Layers3,
  ListTodo,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiTask, ApiTaskStatus, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { useMotionDirector } from '@/app/components/desktop-v2/core/MotionDirector';

export type DesktopPlanMode = 'inbox' | 'calendar' | 'spaces';

type DesktopPlanProps = {
  initialMode?: DesktopPlanMode;
  onScenePulse?: (kind: 'schedule' | 'complete' | 'space') => void;
  onSnapshotChange?: (snapshot: {
    completion: number;
    overdue: number;
    activeSpaces: number;
  }) => void;
};

const spring = { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.8 };
const morphSpring = { type: 'spring' as const, stiffness: 380, damping: 34 };

const taskIsDone = (task: ApiTask) => task.status === 'completed' || task.effective_status === 'completed';
const taskIsLeaf = (task: ApiTask) => (task.child_count || 0) === 0;
const dateKeyFromValue = (value?: string | null) => value?.slice(0, 10) || '';
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const canonicalStartDate = (key: string) => `${key}T00:00:00`;

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(value: Date) {
  const day = value.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(new Date(value.getFullYear(), value.getMonth(), value.getDate()), mondayOffset);
}

function getMonthCells(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const mondayOffset = first.getDay() === 0 ? -6 : 1 - first.getDay();
  const gridStart = addDays(first, mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export default function DesktopPlan({ initialMode = 'inbox', onScenePulse, onSnapshotChange }: DesktopPlanProps) {
  const router = useRouter();
  const { user } = useAppStore();
  const { preferences, reducedMotion } = useMotionDirector();
  const [mode, setMode] = useState<DesktopPlanMode>(initialMode);
  const [calendarView, setCalendarView] = useState<'week' | 'month'>(initialMode === 'calendar' ? 'month' : 'week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [dropPulse, setDropPulse] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const [topicRows, taskRows] = await Promise.all([
        api.getTopics(user.id),
        api.getTasks(user.id, { view: 'tree' }),
      ]);
      setTopics(topicRows);
      setTasks(taskRows);
      setSelectedTopicId((current) => current && topicRows.some((topic) => topic.id === current) ? current : topicRows[0]?.id || '');
      setSelectedTaskId((current) => current && taskRows.some((task) => task.id === current) ? current : taskRows[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The plan could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { setMode(initialMode); }, [initialMode]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (!normalizedSearch) return true;
    const topic = topicById.get(task.topic_id)?.name || '';
    return `${task.title} ${task.description || ''} ${topic}`.toLowerCase().includes(normalizedSearch);
  }), [normalizedSearch, tasks, topicById]);
  const inboxTasks = filteredTasks.filter((task) => !task.start_date && !taskIsDone(task));
  const activeTask = activeTaskId ? taskById.get(activeTaskId) || null : null;
  const planSnapshot = useMemo(() => {
    const leaves = tasks.filter(taskIsLeaf);
    const completed = leaves.filter(taskIsDone);
    const open = leaves.filter((task) => !taskIsDone(task));
    const activeTopicIds = new Set(open.map((task) => task.topic_id));
    return {
      completion: leaves.length ? completed.length / leaves.length : 0,
      overdue: open.filter((task) => task.deadline && new Date(task.deadline).getTime() < Date.now()).length,
      activeSpaces: topics.filter((topic) => activeTopicIds.has(topic.id)).length,
    };
  }, [tasks, topics]);

  useEffect(() => {
    if (loading) return;
    onSnapshotChange?.(planSnapshot);
  }, [loading, onSnapshotChange, planSnapshot]);

  const dates = useMemo(() => calendarView === 'week'
    ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchorDate), index))
    : getMonthCells(anchorDate), [anchorDate, calendarView]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, ApiTask[]>();
    filteredTasks.forEach((task) => {
      const key = dateKeyFromValue(task.start_date);
      if (!key) return;
      map.set(key, [...(map.get(key) || []), task]);
    });
    return map;
  }, [filteredTasks]);

  const showPulse = (key: string) => {
    setDropPulse(key);
    window.setTimeout(() => setDropPulse((current) => current === key ? null : current), 620);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = String(event.active.data.current?.taskId || '').trim();
    if (taskId) {
      setActiveTaskId(taskId);
      setSelectedTaskId(taskId);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = String(event.active.data.current?.taskId || '').trim();
    const target = event.over?.id ? String(event.over.id) : '';
    setActiveTaskId(null);
    if (!taskId || !target) return;
    const task = taskById.get(taskId);
    if (!task) return;

    const previousStart = task.start_date || null;
    const nextStart = target === 'inbox-drop'
      ? null
      : target.startsWith('day:')
        ? canonicalStartDate(target.slice(4))
        : previousStart;
    if (dateKeyFromValue(previousStart) === dateKeyFromValue(nextStart)) return;

    setTasks((current) => current.map((item) => item.id === taskId ? { ...item, start_date: nextStart } : item));
    setSaving(true);
    try {
      await api.updateTask({ id: taskId, startDate: nextStart });
      showPulse(target);
      setToast(nextStart ? `Scheduled for ${formatDay(nextStart)}.` : 'Moved back to Inbox.');
      onScenePulse?.('schedule');
    } catch (updateError) {
      setTasks((current) => current.map((item) => item.id === taskId ? { ...item, start_date: previousStart } : item));
      setError(updateError instanceof Error ? updateError.message : 'The schedule change was reverted.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id || !quickTitle.trim()) return;
    const topicId = selectedTopicId || topics[0]?.id;
    if (!topicId) {
      setError('Create a life space before adding a task.');
      return;
    }
    setSaving(true);
    try {
      const created = await api.createTask({ userId: user.id, topicId, title: quickTitle.trim(), parentTaskId: null });
      setQuickTitle('');
      setSelectedTaskId(created.id);
      setToast('A new task entered the Inbox.');
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The task could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (task: ApiTask, origin?: { x: number; y: number }) => {
    if (!taskIsLeaf(task)) return;
    const nextStatus: ApiTaskStatus = taskIsDone(task) ? 'not_completed' : 'completed';
    const previousStatus = task.status;
    const previousEffectiveStatus = task.effective_status;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus, effective_status: nextStatus } : item));
    try {
      await api.updateTask({ id: task.id, status: nextStatus });
      if (nextStatus === 'completed') {
        onScenePulse?.('complete');
        if (preferences.celebrations && !reducedMotion) {
          // Completion is already committed at this point. Celebration is a
          // best-effort visual enhancement and must never roll back API state.
          void import('canvas-confetti')
            .then(({ default: confetti }) => confetti({
              particleCount: 18,
              spread: 64,
              startVelocity: 20,
              gravity: 0.75,
              scalar: 0.72,
              origin: origin ? { x: origin.x / window.innerWidth, y: origin.y / window.innerHeight } : { x: 0.5, y: 0.5 },
              colors: ['#6ae4ff', '#8b7cff', '#77f2bd', '#ffffff'],
            }))
            .catch(() => undefined);
        }
      }
      await loadData();
    } catch (updateError) {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: previousStatus, effective_status: previousEffectiveStatus } : item));
      setError(updateError instanceof Error ? updateError.message : 'The task update was reverted.');
    }
  };

  const changeMode = (nextMode: DesktopPlanMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (nextMode === 'spaces') onScenePulse?.('space');
    router.push(
      nextMode === 'calendar'
        ? '/calendar'
        : nextMode === 'spaces'
          ? '/tasks?mode=spaces'
          : '/tasks',
    );
  };

  const moveCalendar = (amount: number) => {
    setAnchorDate((current) => calendarView === 'week'
      ? addDays(current, amount * 7)
      : new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveTaskId(null)}>
      <LayoutGroup id="desktop-plan">
        <div className="desktop-plan-surface relative flex h-full min-h-0 flex-col overflow-hidden text-white">
          <PlanHeader
            mode={mode}
            setMode={changeMode}
            search={search}
            setSearch={setSearch}
            saving={saving}
          />

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-300/25 bg-red-950/80 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur-2xl">
                <span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
              </motion.div>
            )}
            {toast && (
              <motion.div initial={{ opacity: 0, y: 18, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={spring} className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-950/75 px-4 py-2.5 text-sm text-emerald-50 shadow-[0_16px_60px_rgba(16,185,129,.26)] backdrop-blur-2xl">
                <Check className="h-4 w-4" />{toast}
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? <PlanLoading /> : mode === 'spaces' ? (
            <SpacesView topics={topics} tasks={tasks} selectedTopicId={selectedTopicId} onSelectTopic={setSelectedTopicId} onSelectTask={setSelectedTaskId} />
          ) : (
            <motion.div key="plan-grid" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: [.16, 1, .3, 1] }} className="grid min-h-0 flex-1 grid-cols-[310px_minmax(0,1fr)_330px] gap-3 p-3 pt-0">
              <InboxPanel
                tasks={inboxTasks}
                topics={topics}
                topicById={topicById}
                selectedTopicId={selectedTopicId}
                setSelectedTopicId={setSelectedTopicId}
                quickTitle={quickTitle}
                setQuickTitle={setQuickTitle}
                onCreate={handleCreateTask}
                onSelect={setSelectedTaskId}
                onToggle={toggleTask}
                pulse={dropPulse === 'inbox-drop'}
              />
              <CalendarBoard
                dates={dates}
                tasksByDate={tasksByDate}
                view={calendarView}
                setView={setCalendarView}
                anchor={anchorDate}
                move={moveCalendar}
                onToday={() => setAnchorDate(new Date())}
                onSelect={setSelectedTaskId}
                onToggle={toggleTask}
                pulseKey={dropPulse}
              />
              <Inspector task={selectedTask} topic={selectedTask ? topicById.get(selectedTask.topic_id) : undefined} onRefresh={loadData} onError={setError} onToggle={toggleTask} />
            </motion.div>
          )}

          <DragOverlay dropAnimation={{ duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' }}>
            {activeTask ? <TaskGhost task={activeTask} topic={topicById.get(activeTask.topic_id)?.name} /> : null}
          </DragOverlay>
        </div>
      </LayoutGroup>
    </DndContext>
  );
}

function PlanHeader({ mode, setMode, search, setSearch, saving }: { mode: DesktopPlanMode; setMode: (mode: DesktopPlanMode) => void; search: string; setSearch: (value: string) => void; saving: boolean }) {
  const options: Array<{ id: DesktopPlanMode; label: string; icon: typeof Inbox }> = [
    { id: 'inbox', label: 'Plan', icon: ListTodo },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'spaces', label: 'Spaces', icon: Layers3 },
  ];
  return (
    <header className="relative z-20 flex h-[82px] shrink-0 items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.28em] text-cyan-200/60">Living plan</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.045em]">Shape what comes next.</h1></div>
        {saving && <motion.span animate={{ opacity: [.4, 1, .4] }} transition={{ duration: 1.2, repeat: Infinity }} className="ml-2 text-xs text-cyan-200/60">Synchronizing</motion.span>}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex rounded-2xl border border-white/10 bg-white/[.055] p-1 backdrop-blur-2xl">
          {options.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setMode(id)} className={`relative flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition ${mode === id ? 'text-white' : 'text-white/50 hover:text-white/80'}`}>{mode === id && <motion.span layoutId="plan-mode" className="absolute inset-0 rounded-xl bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.15),0_8px_30px_rgba(45,212,191,.08)]" transition={morphSpring} />}<Icon className="relative h-4 w-4" /><span className="relative">{label}</span></button>)}
        </div>
        <label className="group relative block w-64"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35 transition group-focus-within:text-cyan-200" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the constellation" className="h-12 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-10 pr-4 text-sm text-white outline-none backdrop-blur-2xl transition placeholder:text-white/30 focus:border-cyan-200/35 focus:bg-white/[.075] focus:shadow-[0_0_0_4px_rgba(34,211,238,.07)]" /></label>
      </div>
    </header>
  );
}

function InboxPanel({ tasks, topics, topicById, selectedTopicId, setSelectedTopicId, quickTitle, setQuickTitle, onCreate, onSelect, onToggle, pulse }: { tasks: ApiTask[]; topics: ApiTopic[]; topicById: Map<string, ApiTopic>; selectedTopicId: string; setSelectedTopicId: (id: string) => void; quickTitle: string; setQuickTitle: (value: string) => void; onCreate: (event: FormEvent) => void; onSelect: (id: string) => void; onToggle: (task: ApiTask, origin?: { x: number; y: number }) => void; pulse: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'inbox-drop' });
  return (
    <motion.section ref={setNodeRef} animate={pulse ? { scale: [1, .985, 1], borderColor: ['rgba(255,255,255,.1)', 'rgba(103,232,249,.55)', 'rgba(255,255,255,.1)'] } : undefined} className={`flex min-h-0 flex-col overflow-hidden rounded-[26px] border bg-[#07111f]/[.72] shadow-[0_24px_80px_rgba(0,0,0,.24)] backdrop-blur-3xl transition ${isOver ? 'border-cyan-200/45 bg-cyan-300/[.07]' : 'border-white/10'}`}>
      <div className="border-b border-white/8 p-4"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.18em] text-cyan-200/55">Unscheduled</p><h2 className="mt-1 text-lg font-semibold">Inbox <span className="text-white/35">{tasks.length}</span></h2></div><Inbox className="h-5 w-5 text-cyan-200/70" /></div>
        <form onSubmit={onCreate} className="mt-4 space-y-2"><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="Capture a new task…" className="h-11 w-full rounded-xl border border-white/10 bg-white/[.055] px-3 text-sm outline-none placeholder:text-white/28 focus:border-cyan-200/40" /><div className="grid grid-cols-[1fr_auto] gap-2"><select value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#0c1728] px-3 text-xs text-white/65 outline-none">{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select><motion.button whileTap={{ scale: .92 }} className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 text-slate-950 shadow-[0_8px_26px_rgba(34,211,238,.24)]" aria-label="Add task"><Plus className="h-4 w-4" /></motion.button></div></form>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 [scrollbar-color:rgba(255,255,255,.16)_transparent]">{tasks.length === 0 ? <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/10 text-center"><div><Sparkles className="mx-auto h-6 w-6 text-cyan-200/45" /><p className="mt-3 text-sm font-medium text-white/70">The inbox is clear.</p><p className="mt-1 text-xs text-white/35">Capture an idea or drag a task back here.</p></div></div> : tasks.map((task, index) => <DraggableTask key={task.id} task={task} topic={topicById.get(task.topic_id)?.name} index={index} onSelect={() => onSelect(task.id)} onToggle={onToggle} />)}</div>
    </motion.section>
  );
}

function CalendarBoard({ dates, tasksByDate, view, setView, anchor, move, onToday, onSelect, onToggle, pulseKey }: { dates: Date[]; tasksByDate: Map<string, ApiTask[]>; view: 'week' | 'month'; setView: (view: 'week' | 'month') => void; anchor: Date; move: (amount: number) => void; onToday: () => void; onSelect: (id: string) => void; onToggle: (task: ApiTask, origin?: { x: number; y: number }) => void; pulseKey: string | null }) {
  const label = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(anchor);
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#07111f]/[.58] shadow-[0_24px_100px_rgba(0,0,0,.25)] backdrop-blur-3xl">
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/8 px-4"><div className="flex items-center gap-2"><button onClick={() => move(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[.035] text-white/55 transition hover:bg-white/10 hover:text-white" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button><button onClick={onToday} className="h-10 rounded-xl px-3 text-sm font-medium text-white/70 transition hover:bg-white/8 hover:text-white">Today</button><button onClick={() => move(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[.035] text-white/55 transition hover:bg-white/10 hover:text-white" aria-label="Next"><ChevronRight className="h-4 w-4" /></button><h2 className="ml-2 text-lg font-semibold tracking-[-.025em]">{label}</h2></div><div className="relative flex rounded-xl bg-white/[.05] p-1">{(['week', 'month'] as const).map((option) => <button key={option} onClick={() => setView(option)} className={`relative h-8 rounded-lg px-3 text-xs font-semibold capitalize ${view === option ? 'text-white' : 'text-white/38'}`}>{view === option && <motion.span layoutId="calendar-view" className="absolute inset-0 rounded-lg bg-white/10" transition={morphSpring} />}<span className="relative">{option}</span></button>)}</div></div>
      <div className="grid grid-cols-7 border-b border-white/8 bg-white/[.025]">{['MON','TUE','WED','THU','FRI','SAT','SUN'].map((day) => <div key={day} className="px-2 py-2 text-center text-[9px] font-semibold tracking-[.18em] text-white/30">{day}</div>)}</div>
      <motion.div layout className={`grid min-h-0 flex-1 grid-cols-7 overflow-hidden ${view === 'week' ? '' : 'grid-rows-6'}`}>{dates.map((date) => { const key = localDateKey(date); return <DayDropZone key={key} date={date} tasks={tasksByDate.get(key) || []} compact={view === 'month'} onSelect={onSelect} onToggle={onToggle} pulse={pulseKey === `day:${key}`} />; })}</motion.div>
    </section>
  );
}

function DayDropZone({ date, tasks, compact, onSelect, onToggle, pulse }: { date: Date; tasks: ApiTask[]; compact: boolean; onSelect: (id: string) => void; onToggle: (task: ApiTask, origin?: { x: number; y: number }) => void; pulse: boolean }) {
  const key = localDateKey(date);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}` });
  const today = key === localDateKey(new Date());
  const currentMonth = date.getMonth() === new Date().getMonth();
  return (
    <motion.div ref={setNodeRef} animate={pulse ? { scale: [1, .97, 1.015, 1], backgroundColor: ['rgba(255,255,255,.018)', 'rgba(34,211,238,.16)', 'rgba(255,255,255,.018)'] } : undefined} transition={spring} className={`relative min-h-0 overflow-hidden border-b border-r border-white/[.065] p-2 transition ${isOver ? 'bg-cyan-300/[.1] shadow-[inset_0_0_40px_rgba(34,211,238,.12)]' : 'bg-white/[.018]'} ${compact && !currentMonth ? 'opacity-35' : ''}`}>
      {isOver && <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1.6, opacity: [0, .8, 0] }} transition={{ duration: .7, repeat: Infinity }} className="pointer-events-none absolute inset-1/3 rounded-full border border-cyan-200/40" />}
      <div className="mb-2 flex items-center justify-between"><span className={`grid place-items-center rounded-full text-xs font-semibold ${today ? 'h-7 w-7 bg-cyan-300 text-slate-950 shadow-[0_0_26px_rgba(34,211,238,.5)]' : 'h-6 w-6 text-white/58'}`}>{date.getDate()}</span>{tasks.length > 0 && <span className="text-[9px] font-semibold text-white/25">{tasks.length}</span>}</div>
      <div className={`space-y-1.5 overflow-y-auto ${compact ? 'max-h-[72px]' : 'max-h-[calc(100%-34px)]'}`}>{tasks.slice(0, compact ? 3 : 8).map((task, index) => <DraggableTask key={task.id} task={task} index={index} compact topic={undefined} onSelect={() => onSelect(task.id)} onToggle={onToggle} />)}{compact && tasks.length > 3 && <p className="px-2 text-[9px] text-white/32">+{tasks.length - 3} orbiting</p>}</div>
    </motion.div>
  );
}

function DraggableTask({ task, topic, index, compact = false, onSelect, onToggle }: { task: ApiTask; topic?: string; index: number; compact?: boolean; onSelect: () => void; onToggle: (task: ApiTask, origin?: { x: number; y: number }) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: `task:${task.id}`, data: { taskId: task.id } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.03) rotate(${Math.max(-.6, Math.min(.6, transform.x / 600))}deg)` } : undefined;
  const done = taskIsDone(task);
  const overdue = Boolean(task.deadline && new Date(task.deadline) < new Date() && !done);
  return (
    <motion.article ref={setNodeRef} layoutId={`desktop-task-${task.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: isDragging ? .14 : 1, y: 0 }} transition={{ ...spring, delay: Math.min(index * .018, .18) }} style={style} onClick={onSelect} className={`group relative overflow-hidden border backdrop-blur-xl ${compact ? 'rounded-lg px-2 py-1.5' : 'rounded-2xl px-3 py-2.5'} ${overdue ? 'border-rose-300/20 bg-rose-300/[.075]' : done ? 'border-emerald-200/15 bg-emerald-300/[.055]' : 'border-white/10 bg-white/[.055] hover:border-cyan-200/25 hover:bg-white/[.085]'}`}>
      <motion.span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-200/80 to-transparent" initial={{ y: '-100%' }} whileHover={{ y: '100%' }} transition={{ duration: .65 }} />
      <div className="flex items-start gap-2"><button ref={setActivatorNodeRef} type="button" onClick={(event) => event.stopPropagation()} {...attributes} {...listeners} className={`mt-0.5 grid shrink-0 touch-none place-items-center rounded-md text-white/25 transition hover:bg-white/8 hover:text-cyan-100 active:cursor-grabbing ${compact ? 'h-4 w-3 cursor-grab' : 'h-5 w-4 cursor-grab'}`} aria-label={`Drag ${task.title}`}><GripVertical className="h-3 w-3" /></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void onToggle(task, { x: event.clientX, y: event.clientY }); }} className={`mt-0.5 grid shrink-0 place-items-center rounded-full transition hover:scale-110 ${compact ? 'h-4 w-4' : 'h-5 w-5'} ${done ? 'bg-emerald-300 text-slate-950' : 'border border-white/25 text-white/35'}`} aria-label={done ? 'Reopen task' : 'Complete task'}>{done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}</button><div className="min-w-0 flex-1"><p className={`${compact ? 'truncate text-[10px]' : 'text-xs'} font-semibold leading-snug ${done ? 'text-white/38 line-through' : 'text-white/78'}`}>{task.title}</p>{!compact && <div className="mt-1 flex items-center gap-2 text-[9px] text-white/30"><span>{topic || 'Life space'}</span>{task.deadline && <span className={overdue ? 'text-rose-200/70' : ''}>Due {formatDay(task.deadline)}</span>}</div>}</div></div>
    </motion.article>
  );
}

function TaskGhost({ task, topic }: { task: ApiTask; topic?: string }) {
  return <motion.div initial={{ scale: .92, rotate: -1.2 }} animate={{ scale: 1.03, rotate: .35 }} transition={spring} className="w-64 rounded-2xl border border-cyan-200/30 bg-[#10243b]/90 p-3 shadow-[0_26px_80px_rgba(34,211,238,.25)] backdrop-blur-3xl"><p className="text-xs font-semibold text-white">{task.title}</p><p className="mt-1 text-[10px] text-cyan-100/50">{topic || 'Life space'} · release to reshape the day</p><motion.div animate={{ x: [-30, 260] }} transition={{ duration: 1.2, repeat: Infinity }} className="mt-3 h-px w-12 bg-gradient-to-r from-transparent via-cyan-200 to-transparent" /></motion.div>;
}

function Inspector({ task, topic, onRefresh, onError, onToggle }: { task: ApiTask | null; topic?: ApiTopic; onRefresh: () => Promise<void>; onError: (message: string) => void; onToggle: (task: ApiTask, origin?: { x: number; y: number }) => void }) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [startDate, setStartDate] = useState(dateKeyFromValue(task?.start_date));
  const [deadline, setDeadline] = useState(task?.deadline?.slice(0, 16) || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setTitle(task?.title || ''); setDescription(task?.description || ''); setStartDate(dateKeyFromValue(task?.start_date)); setDeadline(task?.deadline?.slice(0, 16) || ''); }, [task?.deadline, task?.description, task?.id, task?.start_date, task?.title]);
  if (!task) return <aside className="grid min-h-0 place-items-center rounded-[26px] border border-white/10 bg-[#07111f]/60 p-8 text-center backdrop-blur-3xl"><div><Sparkles className="mx-auto h-7 w-7 text-violet-200/45" /><h2 className="mt-4 font-semibold text-white/65">Select a signal.</h2><p className="mt-2 text-xs leading-5 text-white/30">A task will expand into this inspector without breaking your planning flow.</p></div></aside>;
  const save = async () => { setSaving(true); try { await api.updateTask({ id: task.id, title: title.trim() || task.title, description: description.trim() || null, startDate: startDate ? canonicalStartDate(startDate) : null, deadline: deadline || null }); await onRefresh(); } catch (error) { onError(error instanceof Error ? error.message : 'The task could not be saved.'); } finally { setSaving(false); } };
  const archive = async () => { if (!window.confirm('Archive this task and its subtree?')) return; try { await api.deleteTask(task.id); await onRefresh(); } catch (error) { onError(error instanceof Error ? error.message : 'The task could not be archived.'); } };
  const completion = (task.leaf_count || 0) > 0 ? Math.round(((task.completed_leaf_count || 0) / Math.max(task.leaf_count || 1, 1)) * 100) : taskIsDone(task) ? 100 : 0;
  return (
    <motion.aside layoutId={`desktop-task-${task.id}`} transition={morphSpring} className="relative min-h-0 overflow-x-hidden overflow-y-auto rounded-[26px] border border-white/10 bg-[#07111f]/[.76] p-5 shadow-[0_24px_90px_rgba(0,0,0,.3)] backdrop-blur-3xl [scrollbar-color:rgba(255,255,255,.15)_transparent]">
      <div className="pointer-events-none absolute -right-20 -top-16 h-44 w-44 rounded-full bg-violet-400/12 blur-3xl" />
      <div className="relative"><div className="flex items-center justify-between"><span className="rounded-full border border-violet-200/15 bg-violet-300/[.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.16em] text-violet-100/65">{topic?.name || 'Life space'}</span><button onClick={archive} className="grid h-9 w-9 place-items-center rounded-xl text-white/28 transition hover:bg-rose-300/10 hover:text-rose-200" aria-label="Archive task"><Trash2 className="h-4 w-4" /></button></div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-4 w-full bg-transparent text-2xl font-semibold tracking-[-.04em] text-white outline-none placeholder:text-white/25" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context…" rows={3} className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-white/45 outline-none placeholder:text-white/22" />
        <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
        <div className="space-y-3"><InspectorField label="Scheduled day" icon={<CalendarDays className="h-4 w-4" />}><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full bg-transparent text-sm text-white/70 outline-none [color-scheme:dark]" /></InspectorField><InspectorField label="Deadline" icon={<Clock3 className="h-4 w-4" />}><input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="w-full bg-transparent text-sm text-white/70 outline-none [color-scheme:dark]" /></InspectorField></div>
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="flex items-center justify-between text-xs"><span className="text-white/38">Constellation progress</span><span className="font-semibold text-cyan-200/75">{completion}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/7"><motion.div initial={{ width: 0 }} animate={{ width: `${completion}%` }} transition={{ duration: .8, ease: [.16,1,.3,1] }} className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 shadow-[0_0_18px_rgba(34,211,238,.55)]" /></div></div>
        {taskIsLeaf(task) && <motion.button whileTap={{ scale: .97 }} onClick={(event) => void onToggle(task, { x: event.clientX, y: event.clientY })} className={`mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${taskIsDone(task) ? 'border border-white/10 bg-white/[.04] text-white/55 hover:bg-white/[.08]' : 'bg-emerald-300 text-emerald-950 shadow-[0_12px_34px_rgba(52,211,153,.2)]'}`}>{taskIsDone(task) ? <Circle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{taskIsDone(task) ? 'Reopen signal' : 'Complete with energy'}</motion.button>}
        <motion.button whileTap={{ scale: .97 }} disabled={saving} onClick={() => void save()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-300/[.08] text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/[.13] disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'Synchronizing…' : 'Save changes'}</motion.button>
      </div>
    </motion.aside>
  );
}

function InspectorField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block rounded-2xl border border-white/8 bg-white/[.035] p-3 transition focus-within:border-cyan-200/25 focus-within:bg-cyan-300/[.045]"><span className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/28">{icon}{label}</span>{children}</label>;
}

function SpacesView({ topics, tasks, selectedTopicId, onSelectTopic, onSelectTask }: { topics: ApiTopic[]; tasks: ApiTask[]; selectedTopicId: string; onSelectTopic: (id: string) => void; onSelectTask: (id: string) => void }) {
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) || topics[0];
  const selectedTasks = tasks.filter((task) => task.topic_id === selectedTopic?.id);
  const roots = selectedTasks.filter((task) => !task.parent_task_id);
  return (
    <motion.div key="spaces" initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .65, ease: [.16,1,.3,1] }} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-3 p-3 pt-0">
      <section className="relative min-h-0 overflow-hidden rounded-[30px] border border-white/10 bg-[#050d19]/50 shadow-[0_30px_120px_rgba(0,0,0,.3)] backdrop-blur-3xl"><div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_45%,rgba(75,125,255,.16),transparent_32%),radial-gradient(circle_at_28%_72%,rgba(45,212,191,.11),transparent_28%)]" /><div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,.24)_1px,transparent_1px)] [background-size:38px_38px]" />
        <div className="relative h-full min-h-[620px]">{topics.map((topic, index) => { const angle = (Math.PI * 2 * index) / Math.max(topics.length, 1) - Math.PI / 2; const radius = 31 + (index % 2) * 8; const left = 50 + Math.cos(angle) * radius; const top = 50 + Math.sin(angle) * radius; const count = tasks.filter((task) => task.topic_id === topic.id).length; const active = topic.id === selectedTopic?.id; return <motion.button key={topic.id} onClick={() => onSelectTopic(topic.id)} style={{ left: `${left}%`, top: `${top}%` }} className="group absolute -translate-x-1/2 -translate-y-1/2" animate={{ y: active ? [-4, 5, -4] : [0, -5, 0], scale: active ? 1.12 : 1 }} transition={{ y: { duration: 5.5 + index, repeat: Infinity, ease: 'easeInOut' }, scale: spring }}><span className={`relative grid rounded-full border backdrop-blur-xl transition ${active ? 'h-32 w-32 border-cyan-200/40 bg-cyan-300/[.12] shadow-[0_0_80px_rgba(34,211,238,.28)]' : 'h-24 w-24 border-white/12 bg-white/[.055] shadow-[0_18px_50px_rgba(0,0,0,.25)] group-hover:border-violet-200/35 group-hover:bg-violet-300/[.09]'}`}><motion.span animate={{ rotate: 360 }} transition={{ duration: 18 + index * 2, repeat: Infinity, ease: 'linear' }} className="absolute -inset-3 rounded-full border border-dashed border-white/10" /><span className="m-auto"><span className="block max-w-24 truncate text-sm font-semibold text-white/80">{topic.name}</span><span className="mt-1 block text-[10px] text-cyan-100/42">{count} signals</span></span></span></motion.button>; })}
          {topics.length === 0 && <div className="grid h-full place-items-center text-center"><div><Layers3 className="mx-auto h-10 w-10 text-cyan-200/35" /><h2 className="mt-4 text-xl font-semibold">No life spaces yet.</h2><p className="mt-2 text-sm text-white/35">Create one from the Plan capture controls.</p></div></div>}
        </div>
      </section>
      <aside className="min-h-0 overflow-y-auto rounded-[30px] border border-white/10 bg-[#07111f]/[.72] p-5 backdrop-blur-3xl"><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-200/55">Selected space</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{selectedTopic?.name || 'Constellation'}</h2><p className="mt-2 text-sm text-white/35">Projects orbit here. Open one to inspect the full task signal.</p><div className="mt-6 space-y-3">{roots.map((root, index) => { const descendants = selectedTasks.filter((task) => task.root_task_id === root.id && task.id !== root.id); const completion = root.leaf_count ? Math.round(((root.completed_leaf_count || 0) / root.leaf_count) * 100) : taskIsDone(root) ? 100 : 0; return <motion.button key={root.id} onClick={() => onSelectTask(root.id)} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .05 }} className="group w-full rounded-2xl border border-white/8 bg-white/[.035] p-4 text-left transition hover:border-violet-200/24 hover:bg-violet-300/[.06]"><div className="flex items-center justify-between"><span className="font-semibold text-white/75">{root.title}</span><FolderTree className="h-4 w-4 text-violet-200/45" /></div><div className="mt-3 flex items-center gap-3"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8"><motion.div initial={{ width: 0 }} animate={{ width: `${completion}%` }} className="h-full bg-gradient-to-r from-violet-400 to-cyan-300" /></div><span className="text-[10px] text-white/35">{completion}%</span></div><p className="mt-2 text-[10px] text-white/28">{descendants.length} connected tasks</p></motion.button>; })}</div></aside>
    </motion.div>
  );
}

function PlanLoading() {
  return <div className="grid min-h-0 flex-1 grid-cols-[310px_minmax(0,1fr)_330px] gap-3 p-3 pt-0">{[0,1,2].map((item) => <div key={item} className="relative overflow-hidden rounded-[26px] border border-white/8 bg-white/[.035]"><motion.div animate={{ x: ['-120%', '220%'] }} transition={{ duration: 1.7, repeat: Infinity, ease: 'linear', delay: item * .14 }} className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/8 to-transparent" /></div>)}</div>;
}

function formatDay(value: string) {
  const key = value.slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return 'this day';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
}
