'use client';

import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, CalendarOff, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { ApiTask, ApiTopic } from '@/app/lib/api';
import { getTopicColorByName } from '@/app/lib/topicColors';
import { CALENDAR_COLORS, CALENDAR_DONE_HEX, contrastText, resolveCalendarColor } from '@/app/lib/calendarColors';
import { CalendarEvent, loadEvents, newEventId, saveEvents } from '@/app/lib/calendarEvents';

// Sunday-first, like Google Calendar's default.
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const HOUR_HEIGHT = 48; // px per hour
const GUTTER = 56; // time-axis width
const SNAP_MIN = 15;
const MIN_EVENT_MIN = 30;
const DAY_MINUTES = 24 * 60;

// ---- date helpers ---------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromYMD = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (ymd: string, days: number) => { const date = fromYMD(ymd); date.setDate(date.getDate() + days); return toYMD(date); };
const dayDiff = (a: string, b: string) => Math.round((fromYMD(a).getTime() - fromYMD(b).getTime()) / 86400000);

const parseStamp = (value?: string | null): { ymd: string; min: number } | null => {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  return { ymd: toYMD(date), min: date.getHours() * 60 + date.getMinutes() };
};
const stampFor = (ymd: string, min: number) => `${ymd}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`;
const snap = (min: number) => Math.round(min / SNAP_MIN) * SNAP_MIN;
const fmtTime = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${pad(m)}${period}`;
};

const startOfWeekSunday = (date: Date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
};

const isTaskDone = (task: ApiTask) => (task.effective_status !== undefined ? task.effective_status : task.status) === 'completed';

type Timed = {
  id: string; kind: 'task' | 'event'; title: string; ymd: string;
  startMin: number; endMin: number; color: string; done: boolean;
  task?: ApiTask; event?: CalendarEvent;
};
type AllDay = {
  id: string; kind: 'task' | 'event'; title: string; startYMD: string; endYMD: string;
  color: string; done: boolean; task?: ApiTask; event?: CalendarEvent;
};
type DragPayload = { kind: 'task' | 'event'; id: string; durMin: number };
export type CalendarUpdate = { startDate?: string | null; deadline?: string | null; taskColor?: string | null };

export default function CalendarWeekView({
  tasks, topics, userId, onUpdateTask, onCreateTask, onToggleTask, onOpenTask,
}: {
  tasks: ApiTask[];
  topics: ApiTopic[];
  userId: string;
  onUpdateTask: (id: string, patch: CalendarUpdate) => void | Promise<void>;
  onCreateTask: (input: { topicId: string; title: string; deadline?: string; startDate?: string; taskColor?: string }) => void | Promise<void>;
  onToggleTask: (task: ApiTask) => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfWeekSunday(new Date()));
  const [sidebarTopicId, setSidebarTopicId] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ymd: string; min: number | null } | null>(null);
  // Right-click on a scheduled task/event: recolour it, or take it off the
  // calendar without touching the underlying task.
  const [itemMenu, setItemMenu] = useState<{ id: string; kind: 'task' | 'event'; x: number; y: number } | null>(null);
  const [composer, setComposer] = useState<{ mode: 'task' | 'event'; ymd: string; min: number | null; x: number; y: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Set true for the duration of a pointer gesture so nothing re-renders under
  // it — the gesture writes to the DOM directly and commits once on release.
  const draggingRef = useRef(false);

  useEffect(() => { setEvents(loadEvents(userId)); }, [userId]);
  useEffect(() => { if (!sidebarTopicId && topics.length) setSidebarTopicId(topics[0].id); }, [sidebarTopicId, topics]);
  useEffect(() => { setExpandedIds(new Set()); }, [sidebarTopicId]);
  useEffect(() => {
    const close = () => { setContextMenu(null); setItemMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, []);
  // The initial `anchor`/`now` are computed once during render, which for a
  // 'use client' page also runs on the server — if the server's clock is in a
  // different timezone than the visitor's (e.g. a UTC deployment vs a UTC+7
  // browser), that first guess at "today" can be a whole day off. Re-deriving
  // both from the browser's own clock the moment we mount fixes that for good,
  // instead of waiting up to a minute for the next interval tick to correct it.
  useEffect(() => {
    const clientNow = new Date();
    setNow(clientNow);
    setAnchor(startOfWeekSunday(clientNow));
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 12; }, []);

  const persistEvents = (next: CalendarEvent[]) => { setEvents(next); saveEvents(userId, next); };

  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const topicIndex = useMemo(() => new Map(topics.map((t, i) => [t.id, i])), [topics]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = new Date(anchor); date.setDate(anchor.getDate() + i); return date;
  }), [anchor]);
  const weekStartYMD = toYMD(weekDays[0]);
  const weekEndYMD = toYMD(weekDays[6]);
  const todayYMD = toYMD(now);

  const colorFor = (task: ApiTask, done: boolean) => {
    if (done) return CALENDAR_DONE_HEX;
    const topicColor = getTopicColorByName(topicById.get(task.topic_id)?.topic_color, topicIndex.get(task.topic_id) || 0).text;
    return resolveCalendarColor(task.task_color, topicColor);
  };

  const { timed, allDay } = useMemo(() => {
    const timedList: Timed[] = [];
    const allDayList: AllDay[] = [];
    const consider = (
      id: string, kind: 'task' | 'event', title: string, color: string, done: boolean,
      start: { ymd: string; min: number } | null, end: { ymd: string; min: number } | null,
      task?: ApiTask, event?: CalendarEvent,
    ) => {
      const s = start || end; const e = end || start;
      if (!s || !e) return;
      if (s.ymd !== e.ymd || (s.min === 0 && e.min === 0)) {
        allDayList.push({ id, kind, title, startYMD: s.ymd, endYMD: dayDiff(e.ymd, s.ymd) < 0 ? s.ymd : e.ymd, color, done, task, event });
      } else {
        const startMin = s.min;
        const endMin = Math.max(startMin + MIN_EVENT_MIN, end && end.ymd === s.ymd ? end.min : startMin + 60);
        timedList.push({ id, kind, title, ymd: s.ymd, startMin, endMin: Math.min(DAY_MINUTES, endMin), color, done, task, event });
      }
    };
    tasks.forEach((task) => {
      const start = parseStamp(task.start_date); const end = parseStamp(task.deadline);
      if (!start && !end) return;
      consider(task.id, 'task', task.title, colorFor(task, isTaskDone(task)), isTaskDone(task), start, end, task);
    });
    events.forEach((evt) => consider(evt.id, 'event', evt.title, evt.done ? CALENDAR_DONE_HEX : resolveCalendarColor(evt.color, '#616161'), evt.done, parseStamp(evt.start), parseStamp(evt.end), undefined, evt));
    return { timed: timedList, allDay: allDayList };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks, topicById, topicIndex]);

  // ---- sidebar hierarchy --------------------------------------------------
  const scheduledIds = useMemo(() => {
    const set = new Set<string>();
    timed.forEach((t) => set.add(t.id));
    allDay.forEach((a) => set.add(a.id));
    return set;
  }, [allDay, timed]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, ApiTask[]>();
    tasks.forEach((task) => {
      if (task.topic_id !== sidebarTopicId) return;
      const parent = task.parent_task_id || null;
      map.set(parent, [...(map.get(parent) || []), task]);
    });
    map.forEach((list) => list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return map;
  }, [sidebarTopicId, tasks]);

  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  type SidebarRow = { task: ApiTask; depth: number; hasChildren: boolean; scheduled: boolean };
  const sidebarRows = useMemo<SidebarRow[]>(() => {
    const search = sidebarSearch.trim().toLowerCase();
    const matchMemo = new Map<string, boolean>();
    const matches = (task: ApiTask): boolean => {
      const cached = matchMemo.get(task.id);
      if (cached !== undefined) return cached;
      const self = !search || task.title.toLowerCase().includes(search);
      const result = self || (childrenOf.get(task.id) || []).some(matches);
      matchMemo.set(task.id, result);
      return result;
    };
    const rows: SidebarRow[] = [];
    const walk = (task: ApiTask, depth: number) => {
      if (search && !matches(task)) return;
      const children = childrenOf.get(task.id) || [];
      rows.push({ task, depth, hasChildren: children.length > 0, scheduled: scheduledIds.has(task.id) });
      if (search || expandedIds.has(task.id)) children.forEach((child) => walk(child, depth + 1));
    };
    (childrenOf.get(null) || []).forEach((root) => walk(root, 0));
    return rows;
  }, [childrenOf, expandedIds, scheduledIds, sidebarSearch]);

  // ---- geometry -----------------------------------------------------------
  const pointFrom = (clientX: number, clientY: number) => {
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return { col: 0, ymd: weekStartYMD, min: 0 };
    const col = Math.max(0, Math.min(6, Math.floor(((clientX - rect.left) / rect.width) * 7)));
    const min = Math.max(0, Math.min(DAY_MINUTES, ((clientY - rect.top + (scrollRef.current?.scrollTop || 0) - (scrollRef.current?.scrollTop || 0)) / HOUR_HEIGHT) * 60));
    return { col, ymd: addDays(weekStartYMD, col), min: snap(min) };
  };

  // Timed blocks laid across the whole 7-day area (so a drag can cross days
  // without changing DOM parents). Returns geometry in the units the DOM uses:
  // left/width in %, top/height in px.
  const placed = useMemo(() => {
    const perDay = new Map<string, Timed[]>();
    timed.forEach((item) => {
      if (dayDiff(item.ymd, weekStartYMD) < 0 || dayDiff(item.ymd, weekEndYMD) > 0) return;
      perDay.set(item.ymd, [...(perDay.get(item.ymd) || []), item]);
    });
    const out: Array<Timed & { leftPct: number; widthPct: number; top: number; height: number }> = [];
    perDay.forEach((items, ymd) => {
      const dayIndex = dayDiff(ymd, weekStartYMD);
      const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
      const cluster: Array<Timed & { col: number; cols: number }> = [];
      let clusterEnd = -1;
      const flush = () => {
        const cols = cluster.reduce((m, it) => Math.max(m, it.col + 1), 0) || 1;
        cluster.forEach((it) => {
          const colW = 100 / 7 / cols;
          out.push({
            ...it,
            leftPct: dayIndex * (100 / 7) + it.col * colW,
            widthPct: colW,
            top: (it.startMin / 60) * HOUR_HEIGHT,
            height: Math.max(16, ((it.endMin - it.startMin) / 60) * HOUR_HEIGHT),
          });
        });
        cluster.length = 0; clusterEnd = -1;
      };
      sorted.forEach((item) => {
        if (cluster.length && item.startMin >= clusterEnd) flush();
        const taken = new Set(cluster.filter((it) => it.endMin > item.startMin).map((it) => it.col));
        let col = 0; while (taken.has(col)) col += 1;
        cluster.push({ ...item, col, cols: 1 });
        clusterEnd = Math.max(clusterEnd, item.endMin);
      });
      flush();
    });
    return out;
  }, [timed, weekEndYMD, weekStartYMD]);

  const commitTimed = (item: Timed, ymd: string, startMin: number, endMin: number) => {
    if (item.kind === 'task') void onUpdateTask(item.id, { startDate: stampFor(ymd, startMin), deadline: stampFor(ymd, endMin) });
    else persistEvents(events.map((evt) => evt.id === item.id ? { ...evt, start: stampFor(ymd, startMin), end: stampFor(ymd, endMin) } : evt));
  };

  // Writes geometry straight to the element — no React, no re-layout.
  const writeGeom = (el: HTMLElement, leftPct: number, widthPct: number, top: number, height: number) => {
    el.style.left = `${leftPct}%`;
    el.style.width = `${widthPct}%`;
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>, item: Timed) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const el = event.currentTarget;
    const label = el.querySelector<HTMLElement>('[data-time-label]');
    const dur = item.endMin - item.startMin;
    const rect = columnsRef.current?.getBoundingClientRect();
    const grabOffsetMin = rect ? snap(((event.clientY - rect.top) / HOUR_HEIGHT) * 60) - item.startMin : 0;
    draggingRef.current = true;
    el.style.zIndex = '40';
    el.style.boxShadow = '0 8px 24px rgba(15,23,42,.28)';
    el.style.opacity = '0.92';
    let latest = { ymd: item.ymd, startMin: item.startMin, endMin: item.endMin };
    let frame = 0;
    let pending: { col: number; startMin: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!pending) return;
      const startMin = pending.startMin;
      latest = { ymd: addDays(weekStartYMD, pending.col), startMin, endMin: startMin + dur };
      writeGeom(el, pending.col * (100 / 7), 100 / 7, (startMin / 60) * HOUR_HEIGHT, (dur / 60) * HOUR_HEIGHT);
      if (label) label.textContent = `${fmtTime(startMin)} – ${fmtTime(startMin + dur)}`;
    };
    const move = (native: PointerEvent) => {
      const p = pointFrom(native.clientX, native.clientY);
      const startMin = Math.max(0, Math.min(DAY_MINUTES - dur, snap(p.min - grabOffsetMin)));
      pending = { col: p.col, startMin };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (frame) cancelAnimationFrame(frame);
      draggingRef.current = false;
      const grabbed = pending !== null;
      if (grabbed) commitTimed(item, latest.ymd, latest.startMin, latest.endMin);
      else if (item.kind === 'task') onOpenTask(item.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const beginResize = (event: ReactPointerEvent, item: Timed, hostEl: HTMLElement) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const label = hostEl.querySelector<HTMLElement>('[data-time-label]');
    draggingRef.current = true;
    let latestEnd = item.endMin;
    let frame = 0;
    let pendingEnd = item.endMin;
    const apply = () => {
      frame = 0;
      latestEnd = pendingEnd;
      hostEl.style.height = `${((latestEnd - item.startMin) / 60) * HOUR_HEIGHT}px`;
      if (label) label.textContent = `${fmtTime(item.startMin)} – ${fmtTime(latestEnd)}`;
    };
    const move = (native: PointerEvent) => {
      const p = pointFrom(native.clientX, native.clientY);
      pendingEnd = Math.max(item.startMin + MIN_EVENT_MIN, Math.min(DAY_MINUTES, snap(p.min)));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (frame) cancelAnimationFrame(frame);
      draggingRef.current = false;
      commitTimed(item, item.ymd, item.startMin, latestEnd);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDropSchedule = (clientX: number, clientY: number, raw: string) => {
    let payload: DragPayload;
    try { payload = JSON.parse(raw); } catch { return; }
    const p = pointFrom(clientX, clientY);
    const dur = Math.max(MIN_EVENT_MIN, payload.durMin || 60);
    const startMin = Math.min(DAY_MINUTES - dur, p.min);
    if (payload.kind === 'task') void onUpdateTask(payload.id, { startDate: stampFor(p.ymd, startMin), deadline: stampFor(p.ymd, startMin + dur) });
    else persistEvents(events.map((evt) => evt.id === payload.id ? { ...evt, start: stampFor(p.ymd, startMin), end: stampFor(p.ymd, startMin + dur) } : evt));
  };

  const toggleDone = (item: Timed | AllDay) => {
    if (item.kind === 'task' && item.task) void onToggleTask(item.task);
    else if (item.event) persistEvents(events.map((evt) => evt.id === item.id ? { ...evt, done: !evt.done } : evt));
  };
  const applyColorTo = (id: string, kind: 'task' | 'event', hex: string) => {
    if (kind === 'task') void onUpdateTask(id, { taskColor: hex });
    else persistEvents(events.map((evt) => evt.id === id ? { ...evt, color: hex } : evt));
    setItemMenu(null);
  };
  // "Remove from calendar" — the task itself is untouched, it just loses its
  // dates and drops back into the sidebar's unscheduled list. A standalone
  // event has nowhere else to live, so it is deleted outright.
  const removeFromCalendar = (id: string, kind: 'task' | 'event') => {
    if (kind === 'task') void onUpdateTask(id, { startDate: null, deadline: null });
    else persistEvents(events.filter((evt) => evt.id !== id));
    setItemMenu(null);
  };
  const openItemMenu = (event: ReactMouseEvent, id: string, kind: 'task' | 'event') => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setItemMenu({ id, kind, x: event.clientX, y: event.clientY });
  };
  // Both popovers anchor at the click point but must not spill past the
  // viewport edge — clamped against an approximate menu footprint.
  const clampMenu = (x: number, y: number, width: number, height: number) => ({
    left: typeof window === 'undefined' ? x : Math.min(x, window.innerWidth - width - 8),
    top: typeof window === 'undefined' ? y : Math.min(y, window.innerHeight - height - 8),
  });

  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Picking weekDays[0] (always Sunday) biased the label toward last month
  // whenever a week starts with a trailing day from the previous month, even
  // though 6 of the 7 visible days already belong to the new one — the
  // Wednesday is never a trailing/leading day, so it always names the month
  // this week actually belongs to.
  const monthLabel = weekDays[3].toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  const allDayLanes = useMemo(() => {
    const visible = allDay
      .map((item) => {
        if (dayDiff(item.endYMD, weekStartYMD) < 0 || dayDiff(item.startYMD, weekEndYMD) > 0) return null;
        const startCol = Math.max(0, dayDiff(item.startYMD, weekStartYMD));
        const endCol = Math.min(6, dayDiff(item.endYMD, weekStartYMD));
        return { ...item, startCol, span: endCol - startCol + 1, lane: 0 };
      })
      .filter(Boolean) as Array<AllDay & { startCol: number; span: number; lane: number }>;
    visible.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    const laneEnds: number[] = [];
    visible.forEach((bar) => {
      let lane = laneEnds.findIndex((end) => end < bar.startCol);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = bar.startCol + bar.span - 1;
      bar.lane = lane;
    });
    return visible;
  }, [allDay, weekEndYMD, weekStartYMD]);
  const allDayRows = allDayLanes.reduce((m, b) => Math.max(m, b.lane + 1), 0);

  return (
    <section className="lm-cal flex min-h-0 flex-1 select-none bg-white">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Chủ đề</label>
          <select value={sidebarTopicId} onChange={(event) => setSidebarTopicId(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 outline-none focus:border-blue-500">
            {!topics.length && <option value="">Chưa có chủ đề</option>}
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <input value={sidebarSearch} onChange={(event) => setSidebarSearch(event.target.value)} placeholder="Tìm task…" className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-xs outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          <p className="px-3 pb-1 pt-1 text-[11px] text-slate-400">Kéo task vào lịch</p>
          {sidebarRows.map(({ task, depth, hasChildren, scheduled }) => {
            const color = colorFor(task, isTaskDone(task));
            const expanded = !!sidebarSearch.trim() || expandedIds.has(task.id);
            return (
              <div key={task.id} className="flex items-center gap-1 pr-2 hover:bg-slate-50" style={{ paddingLeft: 8 + depth * 14 }}>
                {hasChildren ? (
                  <button type="button" onClick={() => toggleExpanded(task.id)} className="grid h-6 w-6 shrink-0 place-items-center text-slate-400 hover:text-slate-700" aria-label={expanded ? 'Thu gọn' : 'Mở rộng'}>
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : <span className="w-6 shrink-0" />}
                <div
                  draggable={!scheduled}
                  onDragStart={(event) => { const payload: DragPayload = { kind: 'task', id: task.id, durMin: 60 }; event.dataTransfer.setData('application/json', JSON.stringify(payload)); event.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => onOpenTask(task.id)}
                  title={scheduled ? 'Đã có trên lịch' : 'Kéo vào lịch'}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-xs ${scheduled ? 'cursor-default text-slate-400' : 'cursor-grab text-slate-700 active:cursor-grabbing'}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, opacity: scheduled ? 0.4 : 1 }} />
                  <span className={`truncate ${scheduled ? 'line-through' : ''}`}>{task.title}</span>
                </div>
              </div>
            );
          })}
          {!sidebarRows.length && <p className="px-3 py-6 text-center text-xs text-slate-400">Chủ đề này chưa có task.</p>}
        </div>
      </aside>

      {/* Calendar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <button type="button" onClick={() => setAnchor(startOfWeekSunday(new Date()))} className="h-8 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">Hôm nay</button>
          <button type="button" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
          <h2 className="ml-1 text-lg font-normal capitalize text-slate-800">{monthLabel}</h2>
          <span className="ml-auto text-[11px] text-slate-400">Kéo để dời · kéo mép dưới để chỉnh giờ · chuột phải để thêm</span>
        </header>

        {/* Day headers */}
        <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, 1fr)` }}>
          <div />
          {weekDays.map((date, index) => {
            const ymd = toYMD(date);
            const isToday = ymd === todayYMD;
            return (
              <div key={ymd} className="py-1.5 text-center">
                <div className={`text-[11px] font-medium uppercase tracking-wide ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>{DAY_LABELS[index]}</div>
                <div className={`mx-auto mt-1 grid h-9 w-9 place-items-center rounded-full text-xl font-normal ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>{date.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* All-day row */}
        {allDayLanes.length > 0 && (
          <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, 1fr)` }}>
            <div className="flex items-start justify-end pr-2 pt-1 text-[10px] text-slate-400">Cả ngày</div>
            <div className="relative col-span-7" style={{ height: allDayRows * 24 + 8 }}>
              {allDayLanes.map((bar) => {
                const text = contrastText(bar.color);
                return (
                  <div key={bar.id} className="absolute px-1" style={{ left: `${(bar.startCol / 7) * 100}%`, width: `${(bar.span / 7) * 100}%`, top: 4 + bar.lane * 24 }}>
                    <div
                      className="flex h-5 cursor-pointer items-center gap-1 overflow-hidden rounded px-1.5 text-[11px] font-medium transition hover:brightness-95"
                      style={{ background: bar.color, color: text, opacity: bar.done ? 0.85 : 1 }}
                      title={bar.title}
                      onClick={() => bar.kind === 'task' && onOpenTask(bar.id)}
                      onContextMenu={(event) => openItemMenu(event, bar.id, bar.kind)}
                    >
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleDone(bar); }} className="grid h-3 w-3 shrink-0 place-items-center rounded-sm border" style={{ borderColor: text, background: bar.done ? text : 'transparent' }} aria-label="Hoàn thành">
                        {bar.done && <Check className="h-2 w-2" style={{ color: bar.color }} />}
                      </button>
                      <span className={`truncate ${bar.done ? 'line-through' : ''}`}>{bar.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Time grid */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className="grid" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, 1fr)`, height: DAY_MINUTES / 60 * HOUR_HEIGHT }}>
            <div className="relative">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: hour * HOUR_HEIGHT }}>
                  {hour === 0 ? '' : `${(hour % 12 === 0 ? 12 : hour % 12)} ${hour < 12 ? 'AM' : 'PM'}`}
                </div>
              ))}
            </div>

            <div ref={columnsRef} className="relative col-span-7">
              {/* hour + half-hour lines */}
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="pointer-events-none absolute left-0 right-0 border-t border-slate-100" style={{ top: hour * HOUR_HEIGHT }} />
              ))}
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={`${hour}-half`} className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-slate-100/70" style={{ top: hour * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
              ))}
              {/* vertical day separators + per-day drop / right-click targets */}
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {weekDays.map((date) => {
                  const ymd = toYMD(date);
                  return (
                    <div
                      key={ymd}
                      className={`border-l border-slate-100 ${ymd === todayYMD ? 'bg-blue-100' : ''}`}
                      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain'); if (raw) onDropSchedule(event.clientX, event.clientY, raw); }}
                      onContextMenu={(event) => { event.preventDefault(); const p = pointFrom(event.clientX, event.clientY); setContextMenu({ x: event.clientX, y: event.clientY, ymd, min: p.min }); }}
                      onDoubleClick={(event) => { const p = pointFrom(event.clientX, event.clientY); setComposer({ mode: 'task', ymd, min: p.min, x: event.clientX, y: event.clientY }); }}
                    />
                  );
                })}
              </div>

              {/* now line */}
              {dayDiff(todayYMD, weekStartYMD) >= 0 && dayDiff(todayYMD, weekEndYMD) <= 0 && (
                <div className="pointer-events-none absolute z-30" style={{ top: (nowMin / 60) * HOUR_HEIGHT, left: `${dayDiff(todayYMD, weekStartYMD) * (100 / 7)}%`, width: `${100 / 7}%` }}>
                  <div className="relative border-t-2 border-red-500"><span className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-red-500" /></div>
                </div>
              )}

              {/* timed blocks — one overlay so a drag can cross days smoothly */}
              {placed.map((item) => {
                const text = contrastText(item.color);
                return (
                  <div
                    key={item.id}
                    onPointerDown={(event) => beginMove(event, item)}
                    onContextMenu={(event) => openItemMenu(event, item.id, item.kind)}
                    className="lm-cal-event group absolute z-10 flex cursor-grab flex-col overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px] leading-tight shadow-sm transition-shadow duration-150 hover:shadow-md active:cursor-grabbing"
                    style={{ left: `${item.leftPct}%`, width: `${item.widthPct}%`, top: item.top, height: item.height - 2, background: item.color, color: text, opacity: item.done ? 0.9 : 1, boxShadow: 'inset 3px 0 0 rgba(0,0,0,.18)' }}
                    title={item.title}
                  >
                    <div className="flex items-start gap-1">
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleDone(item); }} className="mt-[1px] grid h-3 w-3 shrink-0 place-items-center rounded-sm border" style={{ borderColor: text, background: item.done ? text : 'transparent' }} aria-label="Hoàn thành">
                        {item.done && <Check className="h-2 w-2" style={{ color: item.color }} />}
                      </button>
                      <span className={`min-w-0 flex-1 truncate font-semibold ${item.done ? 'line-through' : ''}`}>{item.title}</span>
                    </div>
                    <span data-time-label className="mt-0.5 truncate opacity-80" style={{ display: item.height > 30 ? 'block' : 'none' }}>{fmtTime(item.startMin)} – {fmtTime(item.endMin)}</span>
                    <span onPointerDown={(event) => beginResize(event, item, event.currentTarget.parentElement as HTMLElement)} className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center" style={{ touchAction: 'none' }}>
                      <span className="mb-[1px] h-1 w-6 rounded-full bg-black/25 opacity-0 group-hover:opacity-100" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            key="day-context-menu"
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="fixed z-50 w-44 origin-top-left overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
            style={clampMenu(contextMenu.x, contextMenu.y, 176, 110)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[11px] text-slate-400">{fromYMD(contextMenu.ymd).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}{contextMenu.min !== null ? ` · ${fmtTime(contextMenu.min)}` : ''}</div>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50" onClick={() => { setComposer({ mode: 'task', ymd: contextMenu.ymd, min: contextMenu.min, x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}><Plus className="h-3.5 w-3.5 text-blue-600" /> Task mới</button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50" onClick={() => { setComposer({ mode: 'event', ymd: contextMenu.ymd, min: contextMenu.min, x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}><CalendarDays className="h-3.5 w-3.5 text-purple-600" /> Sự kiện mới</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right-click on a scheduled task/event: recolour or take off the
          calendar. Scale-and-fade in, the way Google Calendar's own event
          menu settles into place. */}
      <AnimatePresence>
        {itemMenu && (
          <motion.div
            key="item-context-menu"
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 w-52 origin-top-left overflow-hidden rounded-lg border border-slate-200 bg-white py-2 text-sm shadow-xl"
            style={clampMenu(itemMenu.x, itemMenu.y, 208, 140)}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Màu sắc</p>
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {CALENDAR_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  title={c.label}
                  onClick={() => applyColorTo(itemMenu.id, itemMenu.kind, c.hex)}
                  className="h-5 w-5 rounded-full ring-1 ring-black/5 transition hover:scale-110"
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50"
              onClick={() => removeFromCalendar(itemMenu.id, itemMenu.kind)}
            >
              <CalendarOff className="h-3.5 w-3.5" />
              {itemMenu.kind === 'task' ? 'Bỏ khỏi lịch' : 'Xóa sự kiện'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
  composer, topics, defaultTopicId, onClose, onSubmitTask, onSubmitEvent,
}: {
  composer: { mode: 'task' | 'event'; ymd: string; min: number | null; x: number; y: number };
  topics: ApiTopic[];
  defaultTopicId: string;
  onClose: () => void;
  onSubmitTask: (input: { topicId: string; title: string; deadline?: string; startDate?: string; taskColor?: string }) => void;
  onSubmitEvent: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState(defaultTopicId);
  const startMin = composer.min ?? 9 * 60;
  const [time, setTime] = useState(`${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`);
  const [durHours, setDurHours] = useState(1);
  const [color, setColor] = useState(CALENDAR_COLORS[composer.mode === 'event' ? 9 : 6].hex);

  const left = Math.min(composer.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300);
  const top = Math.min(composer.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300);

  const submit = () => {
    if (!title.trim()) return;
    const [h, m] = time.split(':').map(Number);
    const s = (h || 0) * 60 + (m || 0);
    const e = Math.min(24 * 60, s + Math.round(durHours * 60));
    const startStamp = `${composer.ymd}T${pad(Math.floor(s / 60))}:${pad(s % 60)}:00`;
    const endStamp = `${composer.ymd}T${pad(Math.floor(e / 60) % 24)}:${pad(e % 60)}:00`;
    if (composer.mode === 'task') { if (!topicId) return; onSubmitTask({ topicId, title: title.trim(), startDate: startStamp, deadline: endStamp, taskColor: color }); }
    else onSubmitEvent({ id: newEventId(), title: title.trim(), start: startStamp, end: endStamp, color, done: false });
  };

  return (
    <div className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{composer.mode === 'task' ? 'Task mới' : 'Sự kiện mới'}</h3>
        <button type="button" onClick={onClose} className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }} placeholder="Tên…" className="mb-2 h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500" />
      {composer.mode === 'task' && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Chủ đề</span>
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500">
            {!topics.length && <option value="">Chưa có chủ đề</option>}
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </label>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Giờ</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500" /></label>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Thời lượng (giờ)</span><input type="number" min={0.25} step={0.25} value={durHours} onChange={(e) => setDurHours(Math.max(0.25, Number(e.target.value) || 1))} className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500" /></label>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {CALENDAR_COLORS.map((entry) => <button key={entry.name} type="button" title={entry.label} onClick={() => setColor(entry.hex)} className={`h-5 w-5 rounded-full ring-2 ${color === entry.hex ? 'ring-slate-900' : 'ring-transparent'}`} style={{ background: entry.hex }} />)}
      </div>
      <button type="button" onClick={submit} disabled={!title.trim()} className="h-9 w-full rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">Tạo</button>
    </div>
  );
}
