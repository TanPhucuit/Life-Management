'use client';

import { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Palette, Plus, Search, X } from 'lucide-react';
import { ApiTask, ApiTopic } from '@/app/lib/api';
import { getTopicColorByName } from '@/app/lib/topicColors';
import { CALENDAR_COLORS, CALENDAR_DONE_HEX, contrastText, resolveCalendarColor } from '@/app/lib/calendarColors';
import { CalendarEvent, loadEvents, newEventId, saveEvents } from '@/app/lib/calendarEvents';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const LANE_HEIGHT = 30;
const LANE_TOP = 8;
const CELL_MIN_HEIGHT = 520;

// ---- date helpers ---------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromYMD = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (ymd: string, days: number) => {
  const date = fromYMD(ymd);
  date.setDate(date.getDate() + days);
  return toYMD(date);
};
const dayDiff = (a: string, b: string) => Math.round((fromYMD(a).getTime() - fromYMD(b).getTime()) / 86400000);
// A Postgres TIMESTAMP comes back date-first, so the calendar day is the first
// ten characters — reading it that way avoids any timezone day-shift.
const ymdFromTimestamp = (value?: string | null): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toYMD(date);
};
// Written back at local noon so it never lands on the previous day.
const timestampFor = (ymd: string) => `${ymd}T12:00:00`;

const startOfWeekMonday = (date: Date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - weekday);
  return copy;
};

const isTaskDone = (task: ApiTask) => (task.effective_status !== undefined ? task.effective_status : task.status) === 'completed';

type ScheduledItem = {
  id: string;
  kind: 'task' | 'event';
  title: string;
  startYMD: string;
  endYMD: string;
  color: string;
  done: boolean;
  task?: ApiTask;
  event?: CalendarEvent;
};

type Lane = ScheduledItem & { startCol: number; span: number; lane: number };

type DragPayload = { kind: 'task' | 'event'; id: string; span: number };

export type CalendarUpdate = { startDate?: string | null; deadline?: string | null; taskColor?: string | null };

export default function CalendarWeekView({
  tasks,
  topics,
  userId,
  onUpdateTask,
  onCreateTask,
  onToggleTask,
  onOpenTask,
}: {
  tasks: ApiTask[];
  topics: ApiTopic[];
  userId: string;
  onUpdateTask: (id: string, patch: CalendarUpdate) => void | Promise<void>;
  onCreateTask: (input: { topicId: string; title: string; deadline?: string; startDate?: string; taskColor?: string }) => void | Promise<void>;
  onToggleTask: (task: ApiTask) => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfWeekMonday(new Date()));
  const [sidebarTopicId, setSidebarTopicId] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ymd: string } | null>(null);
  const [composer, setComposer] = useState<{ mode: 'task' | 'event'; ymd: string; x: number; y: number } | null>(null);
  // Live overrides while dragging a resize handle, so the bar tracks the cursor
  // before the change is committed.
  const [resizeOverride, setResizeOverride] = useState<{ id: string; endYMD: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setEvents(loadEvents(userId)); }, [userId]);
  useEffect(() => {
    if (!sidebarTopicId && topics.length) setSidebarTopicId(topics[0].id);
  }, [sidebarTopicId, topics]);
  useEffect(() => {
    const close = () => { setContextMenu(null); setColorPickerId(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, []);

  const persistEvents = (next: CalendarEvent[]) => { setEvents(next); saveEvents(userId, next); };

  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const topicIndex = useMemo(() => new Map(topics.map((t, i) => [t.id, i])), [topics]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() + i);
    return date;
  }), [anchor]);
  const weekStartYMD = toYMD(weekDays[0]);
  const weekEndYMD = toYMD(weekDays[6]);
  const todayYMD = toYMD(new Date());

  // Every task that carries a date becomes a bar; the rest stay in the sidebar.
  const scheduledItems = useMemo<ScheduledItem[]>(() => {
    const items: ScheduledItem[] = [];
    tasks.forEach((task) => {
      const start = ymdFromTimestamp(task.start_date);
      const end = ymdFromTimestamp(task.deadline);
      if (!start && !end) return;
      const startYMD = start || (end as string);
      let endYMD = end || (start as string);
      if (dayDiff(endYMD, startYMD) < 0) endYMD = startYMD;
      const done = isTaskDone(task);
      const topicColor = getTopicColorByName(topicById.get(task.topic_id)?.topic_color, topicIndex.get(task.topic_id) || 0).text;
      items.push({
        id: task.id,
        kind: 'task',
        title: task.title,
        startYMD,
        endYMD,
        done,
        color: done ? CALENDAR_DONE_HEX : resolveCalendarColor(task.task_color, topicColor),
        task,
      });
    });
    events.forEach((event) => {
      items.push({
        id: event.id,
        kind: 'event',
        title: event.title,
        startYMD: event.start,
        endYMD: dayDiff(event.end, event.start) < 0 ? event.start : event.end,
        done: event.done,
        color: event.done ? CALENDAR_DONE_HEX : resolveCalendarColor(event.color, '#616161'),
        event,
      });
    });
    return items;
  }, [events, tasks, topicById, topicIndex]);

  // Clip to the visible week and pack into non-overlapping lanes.
  const lanes = useMemo<Lane[]>(() => {
    const visible = scheduledItems
      .map((item) => {
        const endYMD = resizeOverride?.id === item.id ? resizeOverride.endYMD : item.endYMD;
        if (dayDiff(endYMD, weekStartYMD) < 0 || dayDiff(item.startYMD, weekEndYMD) > 0) return null;
        const startCol = Math.max(0, dayDiff(item.startYMD, weekStartYMD));
        const endCol = Math.min(6, dayDiff(endYMD, weekStartYMD));
        return { ...item, endYMD, startCol, span: endCol - startCol + 1, lane: 0 } as Lane;
      })
      .filter(Boolean) as Lane[];
    visible.sort((a, b) => a.startCol - b.startCol || b.span - a.span || a.title.localeCompare(b.title));
    const laneEnds: number[] = [];
    visible.forEach((bar) => {
      let lane = laneEnds.findIndex((end) => end < bar.startCol);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = bar.startCol + bar.span - 1;
      bar.lane = lane;
    });
    return visible;
  }, [resizeOverride, scheduledItems, weekEndYMD, weekStartYMD]);

  const laneCount = lanes.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
  const bodyMinHeight = Math.max(CELL_MIN_HEIGHT, LANE_TOP + laneCount * LANE_HEIGHT + 24);

  const scheduledIds = useMemo(() => new Set(scheduledItems.map((item) => item.id)), [scheduledItems]);
  const sidebarTasks = useMemo(() => {
    const search = sidebarSearch.trim().toLowerCase();
    return tasks.filter((task) =>
      task.topic_id === sidebarTopicId &&
      !scheduledIds.has(task.id) &&
      (!search || task.title.toLowerCase().includes(search)),
    );
  }, [scheduledIds, sidebarSearch, sidebarTopicId, tasks]);

  // ---- drag & drop --------------------------------------------------------
  const columnFromClientX = (clientX: number) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(6, Math.floor(ratio * 7)));
  };

  const handleDropOnDay = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
    if (!raw) return;
    let payload: DragPayload;
    try { payload = JSON.parse(raw); } catch { return; }
    const targetCol = columnFromClientX(event.clientX);
    const targetYMD = addDays(weekStartYMD, targetCol);
    const span = Math.max(1, payload.span || 1);
    if (payload.kind === 'task') {
      void onUpdateTask(payload.id, { startDate: timestampFor(targetYMD), deadline: timestampFor(addDays(targetYMD, span - 1)) });
    } else {
      persistEvents(events.map((evt) => evt.id === payload.id
        ? { ...evt, start: targetYMD, end: addDays(targetYMD, span - 1) }
        : evt));
    }
  };

  const beginResize = (event: ReactPointerEvent, item: Lane) => {
    event.preventDefault();
    event.stopPropagation();
    const move = (native: PointerEvent) => {
      const col = columnFromClientX(native.clientX);
      const endYMD = addDays(weekStartYMD, Math.max(dayDiff(item.startYMD, weekStartYMD), col));
      setResizeOverride({ id: item.id, endYMD });
    };
    const up = (native: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const col = columnFromClientX(native.clientX);
      const endYMD = addDays(weekStartYMD, Math.max(dayDiff(item.startYMD, weekStartYMD), col));
      setResizeOverride(null);
      if (item.kind === 'task') void onUpdateTask(item.id, { deadline: timestampFor(endYMD) });
      else persistEvents(events.map((evt) => evt.id === item.id ? { ...evt, end: endYMD } : evt));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const toggleItemDone = (item: ScheduledItem) => {
    if (item.kind === 'task' && item.task) void onToggleTask(item.task);
    else if (item.event) persistEvents(events.map((evt) => evt.id === item.id ? { ...evt, done: !evt.done } : evt));
  };

  const applyColor = (item: ScheduledItem, hex: string) => {
    if (item.kind === 'task') void onUpdateTask(item.id, { taskColor: hex });
    else persistEvents(events.map((evt) => evt.id === item.id ? { ...evt, color: hex } : evt));
    setColorPickerId(null);
  };

  const monthLabel = `${weekDays[0].toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' })} – ${weekDays[6].toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <section className="lm-cal flex min-h-0 flex-1">
      {/* Sidebar: pick a topic, drag an unscheduled task onto the grid. */}
      <aside className="lm-cal-side flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Chủ đề</label>
          <select
            value={sidebarTopicId}
            onChange={(event) => setSidebarTopicId(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
          >
            {!topics.length && <option value="">Chưa có chủ đề</option>}
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={sidebarSearch}
              onChange={(event) => setSidebarSearch(event.target.value)}
              placeholder="Tìm task…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-xs outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <p className="px-1 pb-1 text-[11px] text-slate-400">Kéo task vào lịch ({sidebarTasks.length})</p>
          {sidebarTasks.map((task) => {
            const topicColor = getTopicColorByName(topicById.get(task.topic_id)?.topic_color, topicIndex.get(task.topic_id) || 0).text;
            const color = resolveCalendarColor(task.task_color, topicColor);
            return (
              <div
                key={task.id}
                draggable
                onDragStart={(event) => {
                  const payload: DragPayload = { kind: 'task', id: task.id, span: 1 };
                  event.dataTransfer.setData('application/json', JSON.stringify(payload));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onOpenTask(task.id)}
                className="mb-1 flex cursor-grab items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm transition hover:border-slate-300 active:cursor-grabbing"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{task.title}</span>
              </div>
            );
          })}
          {!sidebarTasks.length && <p className="px-1 py-6 text-center text-xs text-slate-400">Không có task chưa xếp lịch.</p>}
        </div>
      </aside>

      {/* Week grid */}
      <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <button type="button" onClick={() => setAnchor(startOfWeekMonday(new Date()))} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Hôm nay</button>
          <button type="button" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
          <h2 className="ml-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarDays className="h-4 w-4 text-slate-400" />{monthLabel}</h2>
          <span className="ml-auto text-[11px] text-slate-400">Chuột phải vào một ngày để thêm task / sự kiện</span>
        </header>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-white">
          {weekDays.map((date, index) => {
            const ymd = toYMD(date);
            const isToday = ymd === todayYMD;
            return (
              <div key={ymd} className="border-r border-slate-100 px-2 py-1.5 text-center last:border-r-0">
                <div className="text-[11px] font-medium uppercase text-slate-400">{DAY_LABELS[index]}</div>
                <div className={`mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>{date.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Body: day columns (drop + right-click) with a bar overlay on top. */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={bodyRef} className="relative" style={{ minHeight: bodyMinHeight }}>
            <div className="absolute inset-0 grid grid-cols-7">
              {weekDays.map((date) => {
                const ymd = toYMD(date);
                return (
                  <div
                    key={ymd}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(event) => handleDropOnDay(event)}
                    onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, ymd }); }}
                    onDoubleClick={(event) => setComposer({ mode: 'task', ymd, x: event.clientX, y: event.clientY })}
                    className={`border-r border-slate-100 last:border-r-0 ${ymd === todayYMD ? 'bg-blue-50/40' : 'bg-white'}`}
                  />
                );
              })}
            </div>

            <div className="pointer-events-none absolute inset-0">
              {lanes.map((bar) => {
                const left = (bar.startCol / 7) * 100;
                const width = (bar.span / 7) * 100;
                const text = contrastText(bar.color);
                return (
                  <div
                    key={bar.id}
                    className="pointer-events-auto absolute"
                    style={{ left: `${left}%`, width: `${width}%`, top: LANE_TOP + bar.lane * LANE_HEIGHT, paddingLeft: 4, paddingRight: 4 }}
                  >
                    <div
                      draggable
                      onDragStart={(event) => {
                        const payload: DragPayload = { kind: bar.kind, id: bar.id, span: bar.span };
                        event.dataTransfer.setData('application/json', JSON.stringify(payload));
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => { if (bar.kind === 'task') onOpenTask(bar.id); }}
                      className="group relative flex h-[26px] cursor-grab items-center gap-1.5 overflow-hidden rounded-md pl-1.5 pr-4 text-xs font-medium shadow-sm active:cursor-grabbing"
                      style={{ background: bar.color, color: text, opacity: bar.done ? 0.85 : 1 }}
                      title={bar.title}
                    >
                      {/* complete checkbox */}
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); toggleItemDone(bar); }}
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-sm border"
                        style={{ borderColor: text, background: bar.done ? text : 'transparent' }}
                        aria-label={bar.done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}
                      >
                        {bar.done ? <Check className="h-3 w-3" style={{ color: bar.color }} /> : <Circle className="h-2.5 w-2.5 opacity-0" />}
                      </button>
                      <span className={`truncate ${bar.done ? 'line-through' : ''}`}>{bar.title}</span>
                      {bar.kind === 'event' && <span className="ml-1 shrink-0 rounded-sm bg-black/15 px-1 text-[9px] uppercase tracking-wide">sự kiện</span>}
                      {/* colour */}
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); setColorPickerId(colorPickerId === bar.id ? null : bar.id); }}
                        className="absolute right-3 top-1/2 hidden -translate-y-1/2 group-hover:block"
                        style={{ color: text }}
                        aria-label="Đổi màu"
                      >
                        <Palette className="h-3 w-3" />
                      </button>
                      {/* resize handle */}
                      <span
                        onPointerDown={(event) => beginResize(event, bar)}
                        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                        style={{ touchAction: 'none' }}
                      />
                    </div>

                    {colorPickerId === bar.id && (
                      <div className="absolute left-0 top-8 z-30 flex w-40 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-xl" onClick={(event) => event.stopPropagation()}>
                        {CALENDAR_COLORS.map((color) => (
                          <button key={color.name} type="button" title={color.label} onClick={() => applyColor(bar, color.hex)} className="h-5 w-5 rounded-full ring-1 ring-black/5" style={{ background: color.hex }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* right-click menu */}
      {contextMenu && (
        <div className="fixed z-50 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <div className="px-3 py-1 text-[11px] text-slate-400">{fromYMD(contextMenu.ymd).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50" onClick={() => { setComposer({ mode: 'task', ymd: contextMenu.ymd, x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}><Plus className="h-3.5 w-3.5 text-blue-600" /> Task mới</button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50" onClick={() => { setComposer({ mode: 'event', ymd: contextMenu.ymd, x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}><CalendarDays className="h-3.5 w-3.5 text-purple-600" /> Sự kiện mới</button>
        </div>
      )}

      {composer && (
        <Composer
          composer={composer}
          topics={topics}
          defaultTopicId={sidebarTopicId || topics[0]?.id || ''}
          onClose={() => setComposer(null)}
          onSubmitTask={(input) => { void onCreateTask(input); setComposer(null); }}
          onSubmitEvent={(evt) => { persistEvents([...events, evt]); setComposer(null); }}
        />
      )}
    </section>
  );
}

function Composer({
  composer,
  topics,
  defaultTopicId,
  onClose,
  onSubmitTask,
  onSubmitEvent,
}: {
  composer: { mode: 'task' | 'event'; ymd: string; x: number; y: number };
  topics: ApiTopic[];
  defaultTopicId: string;
  onClose: () => void;
  onSubmitTask: (input: { topicId: string; title: string; deadline?: string; startDate?: string; taskColor?: string }) => void;
  onSubmitEvent: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState(defaultTopicId);
  const [deadline, setDeadline] = useState(composer.ymd);
  const [color, setColor] = useState(CALENDAR_COLORS[composer.mode === 'event' ? 9 : 6].hex);

  const left = Math.min(composer.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300);
  const top = Math.min(composer.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260);

  const submit = () => {
    if (!title.trim()) return;
    if (composer.mode === 'task') {
      if (!topicId) return;
      onSubmitTask({ topicId, title: title.trim(), startDate: `${composer.ymd}T12:00:00`, deadline: `${deadline}T12:00:00`, taskColor: color });
    } else {
      onSubmitEvent({ id: newEventId(), title: title.trim(), start: composer.ymd, end: deadline, color, done: false });
    }
  };

  return (
    <div className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl" style={{ left, top }} onClick={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{composer.mode === 'task' ? 'Task mới' : 'Sự kiện mới'}</h3>
        <button type="button" onClick={onClose} className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') onClose(); }} placeholder="Tên…" className="mb-2 h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500" />
      {composer.mode === 'task' && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Chủ đề</span>
          <select value={topicId} onChange={(event) => setTopicId(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500">
            {!topics.length && <option value="">Chưa có chủ đề</option>}
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </label>
      )}
      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">{composer.mode === 'task' ? 'Deadline' : 'Kết thúc'}</span>
        <input type="date" value={deadline} min={composer.ymd} onChange={(event) => setDeadline(event.target.value || composer.ymd)} className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500" />
      </label>
      <div className="mb-3 flex flex-wrap gap-1">
        {CALENDAR_COLORS.map((entry) => (
          <button key={entry.name} type="button" title={entry.label} onClick={() => setColor(entry.hex)} className={`h-5 w-5 rounded-full ring-2 ${color === entry.hex ? 'ring-slate-900' : 'ring-transparent'}`} style={{ background: entry.hex }} />
        ))}
      </div>
      <button type="button" onClick={submit} disabled={!title.trim()} className="h-9 w-full rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">Tạo</button>
    </div>
  );
}
