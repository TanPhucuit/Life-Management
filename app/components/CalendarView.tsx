'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { calendarUtils } from '@/app/lib/calendar';
import { api, ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { EmptyState, PageHeader, Surface } from './ui';

interface CalendarViewProps { month: number; year: number; onMonthChange: (month: number, year: number) => void; onSelectDay?: (day: number, month: number, year: number) => void; }
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const dateKey = (day: number, month: number, year: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const getKey = (value?: string | null) => value ? value.slice(0, 10) : '';

export default function CalendarView({ month, year, onMonthChange, onSelectDay }: CalendarViewProps) {
  const { user } = useAppStore();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [direction, setDirection] = useState(1);
  const today = new Date();
  const fallbackDay = today.getMonth() + 1 === month && today.getFullYear() === year ? today.getDate() : 1;
  const [selectedDay, setSelectedDay] = useState(fallbackDay);
  const calendarData = calendarUtils.getMonthCalendar(year, month);

  useEffect(() => { setSelectedDay(today.getMonth() + 1 === month && today.getFullYear() === year ? today.getDate() : 1); }, [month, year]);
  useEffect(() => { if (!user?.id) return; void api.getTasks(user.id, { view: 'tree' }).then(setTasks).catch(() => setTasks([])); }, [user?.id]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Array<{ task: ApiTask; type: 'start' | 'deadline' }>>();
    tasks.forEach((task) => {
      const start = getKey(task.start_date); const deadline = getKey(task.deadline);
      if (start) map.set(start, [...(map.get(start) || []), { task, type: 'start' }]);
      if (deadline) map.set(deadline, [...(map.get(deadline) || []), { task, type: 'deadline' }]);
    });
    return map;
  }, [tasks]);

  const moveMonth = (delta: -1 | 1) => {
    setDirection(delta);
    if (delta === -1) onMonthChange(month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year);
    else onMonthChange(month === 12 ? 1 : month + 1, month === 12 ? year + 1 : year);
  };
  const goToday = () => { setDirection(1); onMonthChange(today.getMonth() + 1, today.getFullYear()); setSelectedDay(today.getDate()); };
  const selectedEvents = eventsByDate.get(dateKey(selectedDay, month, year)) || [];

  return (
    <div>
      <PageHeader eyebrow="Plan with clarity" title={`${monthNames[month - 1]} ${year}`} description="Blue marks a start date. Coral marks a deadline." action={<div className="glass-panel flex items-center gap-1 rounded-2xl p-1"><button type="button" onClick={() => moveMonth(-1)} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-[var(--surface-soft)]" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={goToday} className="min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-[var(--surface-soft)]">Today</button><button type="button" onClick={() => moveMonth(1)} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-[var(--surface-soft)]" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button></div>} />

      <div className="lg:hidden">
        <Surface className="p-4">
          <div className="mb-4 flex snap-x gap-2 overflow-x-auto pb-2">{Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => index + 1).map((day) => { const active = day === selectedDay; const events = eventsByDate.get(dateKey(day, month, year)) || []; return <button key={day} type="button" onClick={() => setSelectedDay(day)} className={`relative flex min-h-[66px] min-w-[52px] snap-start flex-col items-center justify-center rounded-2xl border text-sm transition ${active ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-lg' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)]'}`}><span className="text-[10px] uppercase">{weekdays[new Date(year, month - 1, day).getDay()].slice(0, 1)}</span><span className="text-lg font-semibold">{day}</span>{events.length > 0 && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${active ? 'bg-white' : 'bg-[var(--primary)]'}`} />}</button>; })}</div>
          <div className="mb-3 flex items-center justify-between"><div><p className="font-semibold">{weekdays[new Date(year, month - 1, selectedDay).getDay()]}, {monthNames[month - 1]} {selectedDay}</p><p className="text-sm text-[var(--foreground-muted)]">{selectedEvents.length} scheduled item{selectedEvents.length === 1 ? '' : 's'}</p></div><button type="button" onClick={() => onSelectDay?.(selectedDay, month, year)} className="btn-secondary">Open day</button></div>
          {selectedEvents.length === 0 ? <EmptyState title="A clear day" description="No starts or deadlines are scheduled for this date." /> : <div className="space-y-2">{selectedEvents.map(({ task, type }) => <EventChip key={`${type}-${task.id}`} task={task} type={type} roomy />)}</div>}
        </Surface>
      </div>

      <Surface className="hidden overflow-hidden lg:block">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-soft)]">{weekdays.map((day) => <div key={day} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-[.12em] text-[var(--foreground-muted)]">{day}</div>)}</div>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div key={`${year}-${month}`} custom={direction} variants={{ enter: (value: number) => ({ opacity: 0, x: value * 24 }), center: { opacity: 1, x: 0 }, exit: (value: number) => ({ opacity: 0, x: value * -18 }) }} initial="enter" animate="center" exit="exit" transition={{ duration: .3, ease: [.16, 1, .3, 1] }} className="grid grid-cols-7">
            {calendarData.allDates.map((dateInfo, index) => {
              const events = eventsByDate.get(dateKey(dateInfo.day, dateInfo.month, dateInfo.year)) || [];
              const isToday = dateInfo.day === today.getDate() && dateInfo.month === today.getMonth() + 1 && dateInfo.year === today.getFullYear();
              return <button key={`${dateInfo.day}-${dateInfo.month}-${index}`} type="button" onClick={() => dateInfo.isCurrentMonth && onSelectDay?.(dateInfo.day, dateInfo.month, dateInfo.year)} disabled={!dateInfo.isCurrentMonth} className={`group min-h-[152px] border-b border-r border-[var(--border)] p-2.5 text-left transition ${dateInfo.isCurrentMonth ? 'bg-[var(--surface)] hover:bg-[var(--primary-soft)]' : 'bg-[var(--surface-soft)] opacity-45'}`}><div className="mb-2 flex items-center justify-between"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${isToday ? 'bg-[var(--primary)] text-white shadow-md' : ''}`}>{dateInfo.day}</span>{events.length > 0 && <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--foreground-muted)]">{events.length}</span>}</div><div className="space-y-1">{events.slice(0, 4).map(({ task, type }) => <EventChip key={`${type}-${task.id}`} task={task} type={type} />)}{events.length > 4 && <p className="px-1 text-[10px] font-medium text-[var(--foreground-muted)]">+{events.length - 4} more</p>}</div></button>;
            })}
          </motion.div>
        </AnimatePresence>
      </Surface>
    </div>
  );
}

function EventChip({ task, type, roomy = false }: { task: ApiTask; type: 'start' | 'deadline'; roomy?: boolean }) {
  const deadline = type === 'deadline';
  return <div className={`flex min-w-0 items-center gap-2 rounded-xl ${roomy ? 'p-3' : 'px-2 py-1.5'} ${deadline ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--primary-soft)] text-[var(--primary)]'}`}><div className="shrink-0">{deadline ? <Clock3 className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}</div><span className={`${roomy ? 'text-sm' : 'text-[10px]'} truncate font-semibold`}>{deadline ? 'Due' : 'Start'} · {task.title}</span></div>;
}
