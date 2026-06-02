'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, CheckCircle2, Clock3, FolderTree, Timer } from 'lucide-react';
import { api, ApiSession, ApiTask, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { getTopicColorByName } from '@/app/lib/topicColors';

const getDurationMinutes = (session: ApiSession) => {
  if (session.focused_minutes !== null && session.focused_minutes !== undefined) return session.focused_minutes;
  return Math.max(0, Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000));
};

const isLeaf = (task: ApiTask) => (task.child_count || 0) === 0;

export default function Analytics() {
  const { user } = useAppStore();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user?.id) return;

    const loadAnalytics = async () => {
      try {
        setErrorMessage('');
        const [taskRows, sessionRows, topicRows] = await Promise.all([
          api.getTasks(user.id, { view: 'tree' }),
          api.getSessions(user.id),
          api.getTopics(user.id),
        ]);
        setTasks(taskRows);
        setSessions(sessionRows);
        setTopics(topicRows);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Không tải được phân tích.');
      }
    };

    void loadAnalytics();
  }, [user?.id]);

  const data = useMemo(() => {
    const leafTasks = tasks.filter(isLeaf);
    const completedLeaves = leafTasks.filter((task) => task.status === 'completed' || task.effective_status === 'completed');
    const activeRoots = tasks.filter((task) => !task.parent_task_id && task.effective_status !== 'completed');
    const overdueLeaves = leafTasks.filter((task) => task.deadline && task.status !== 'completed' && new Date(task.deadline) < new Date());
    const onTimeSessions = sessions.filter((session) => session.in_time_status === 'in_time');
    const outTimeSessions = sessions.filter((session) => session.in_time_status === 'out_time');
    const totalMinutes = sessions.reduce((sum, session) => sum + getDurationMinutes(session), 0);

    const sessionsByDate = new Map<string, number>();
    sessions.forEach((session) => {
      sessionsByDate.set(session.session_date, (sessionsByDate.get(session.session_date) || 0) + 1);
    });
    const sessionTrend = Array.from(sessionsByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, count]) => ({ date: date.slice(5), sessions: count }));

    const completionByTopic = topics.map((topic, index) => {
      const topicTasks = leafTasks.filter((task) => task.topic_id === topic.id);
      const completed = topicTasks.filter((task) => task.status === 'completed' || task.effective_status === 'completed').length;
      const topicColor = getTopicColorByName(topic.topic_color, index);
      return {
        name: topic.name,
        completed,
        total: topicTasks.length,
        percent: topicTasks.length ? Math.round((completed / topicTasks.length) * 100) : 0,
        color: topicColor.text,
      };
    });

    return {
      completedLeaves,
      activeRoots,
      overdueLeaves,
      onTimeSessions,
      outTimeSessions,
      totalMinutes,
      sessionTrend,
      completionByTopic,
    };
  }, [sessions, tasks, topics]);

  const sessionPie = [
    { name: 'Đúng giờ', value: data.onTimeSessions.length, color: '#22c55e' },
    { name: 'Trễ giờ', value: data.outTimeSessions.length, color: '#f97316' },
  ];

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xl font-semibold">Productivity Analytics</h2>
        <p className="mt-1 text-sm text-slate-500">Thống kê task tree, session đúng giờ và tiến độ theo topic.</p>
        {errorMessage && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Completed Tasks" value={data.completedLeaves.length} hint="Leaf task hoàn thành" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} />
        <MetricCard label="Active Root Tasks" value={data.activeRoots.length} hint="Nhiệm vụ lớn đang chạy" icon={<FolderTree className="h-5 w-5 text-blue-600" />} />
        <MetricCard label="On-time Sessions" value={data.onTimeSessions.length} hint={`${sessions.length} session tổng`} icon={<Clock3 className="h-5 w-5 text-emerald-600" />} />
        <MetricCard label="Total Duration" value={`${Math.round((data.totalMinutes / 60) * 10) / 10}h`} hint="Tổng thời lượng" icon={<Timer className="h-5 w-5 text-violet-600" />} />
        <MetricCard label="Overdue Leaf Tasks" value={data.overdueLeaves.length} hint="Task nhỏ quá hạn" icon={<AlertCircle className="h-5 w-5 text-orange-600" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">On-time vs Out-time Sessions</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sessionPie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4}>
                {sessionPie.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">Đúng giờ: {data.onTimeSessions.length}</div>
            <div className="rounded-md bg-orange-50 p-2 text-orange-700">Trễ giờ: {data.outTimeSessions.length}</div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Session Volume Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.sessionTrend}>
              <defs>
                <linearGradient id="sessionTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" />
              <YAxis stroke="#64748b" allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="sessions" stroke="#2563eb" strokeWidth={2} fill="url(#sessionTrend)" />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">Completion by Topic</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data.completionByTopic}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="name" stroke="#64748b" />
            <YAxis stroke="#64748b" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={(value) => [`${value}%`, 'Hoàn thành']} />
            <Bar dataKey="percent" radius={[6, 6, 0, 0]}>
              {data.completionByTopic.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function MetricCard({ label, value, hint, icon }: { label: string; value: number | string; hint: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
