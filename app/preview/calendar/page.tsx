'use client';

// Dev-only harness for the week calendar: mock topics/tasks, patches applied to
// local state so drag/resize/complete are exercised without a Supabase session.
import { useState } from 'react';
import CalendarWeekView, { type CalendarUpdate } from '@/app/components/CalendarWeekView';
import type { ApiTask, ApiTopic } from '@/app/lib/api';

const topics: ApiTopic[] = [
  { id: 't1', user_id: 'u', name: 'Career & Craft', topic_color: 'blue' },
  { id: 't2', user_id: 'u', name: 'Health & Energy', topic_color: 'sage' },
];

const ymd = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00:00`;
};

const seed: ApiTask[] = [
  { id: 'a', user_id: 'u', topic_id: 't1', title: 'Design review', status: 'not_completed', start_date: ymd(0), deadline: ymd(2) },
  { id: 'b', user_id: 'u', topic_id: 't1', title: 'Ship release', status: 'in_progress', start_date: ymd(3), deadline: ymd(3), task_color: '#8e24aa' },
  { id: 'c', user_id: 'u', topic_id: 't2', title: 'Long run', status: 'completed', start_date: ymd(1), deadline: ymd(1) },
  { id: 'd', user_id: 'u', topic_id: 't1', title: 'Unscheduled task 1', status: 'not_completed' },
  { id: 'e', user_id: 'u', topic_id: 't1', title: 'Unscheduled task 2', status: 'not_completed' },
  { id: 'f', user_id: 'u', topic_id: 't2', title: 'Meal prep', status: 'not_completed' },
];

export default function CalendarPreviewPage() {
  const [tasks, setTasks] = useState<ApiTask[]>(seed);

  const onUpdateTask = (id: string, patch: CalendarUpdate) => {
    setTasks((current) => current.map((task) => task.id === id ? {
      ...task,
      ...(patch.startDate !== undefined ? { start_date: patch.startDate } : {}),
      ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
      ...(patch.taskColor !== undefined ? { task_color: patch.taskColor } : {}),
    } : task));
  };
  const onCreateTask = (input: { topicId: string; title: string; deadline?: string; startDate?: string; taskColor?: string }) => {
    setTasks((current) => [...current, {
      id: `n${current.length}`, user_id: 'u', topic_id: input.topicId, title: input.title, status: 'not_completed',
      start_date: input.startDate, deadline: input.deadline, task_color: input.taskColor,
    }]);
  };
  const onToggleTask = (task: ApiTask) => {
    setTasks((current) => current.map((t) => t.id === task.id ? { ...t, status: t.status === 'completed' ? 'not_completed' : 'completed' } : t));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <CalendarWeekView
        tasks={tasks}
        topics={topics}
        userId="preview-user"
        onUpdateTask={onUpdateTask}
        onCreateTask={onCreateTask}
        onToggleTask={onToggleTask}
        onOpenTask={(id) => console.log('open', id)}
      />
    </div>
  );
}
