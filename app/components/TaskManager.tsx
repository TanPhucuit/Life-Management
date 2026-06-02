'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Circle,
  Clock3,
  Folder,
  FolderPlus,
  GitBranch,
  LayoutGrid,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiSession, ApiTask, ApiTaskStatus, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { getTopicColorByName, topicColorPalette } from '@/app/lib/topicColors';

type TaskDraft = {
  title: string;
  description: string;
  deadline: string;
  parentTaskId: string | null;
};

type SessionDraft = {
  sessionName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  inTimeStatus: 'in_time' | 'out_time';
};

const today = new Date().toISOString().slice(0, 10);
const emptyTaskDraft: TaskDraft = { title: '', description: '', deadline: '', parentTaskId: null };
const emptySessionDraft: SessionDraft = {
  sessionName: '',
  sessionDate: today,
  startTime: '09:00',
  endTime: '10:00',
  inTimeStatus: 'in_time',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Chưa có hạn';
  return new Date(value).toLocaleDateString('vi-VN');
};

const formatTime = (value: string) => {
  return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const getDurationMinutes = (session: ApiSession) => {
  if (session.focused_minutes !== null && session.focused_minutes !== undefined) return session.focused_minutes;
  return Math.max(0, Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000));
};

export default function TaskManager() {
  const { user } = useAppStore();
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(emptySessionDraft);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setErrorMessage('');
      const [topicRows, taskRows, sessionRows] = await Promise.all([
        api.getTopics(user.id),
        api.getTasks(user.id, { view: 'tree' }),
        api.getSessions(user.id),
      ]);

      setTopics(topicRows);
      setTasks(taskRows);
      setSessions(sessionRows);

      if (selectedPath.length === 0) {
        const firstRoot = taskRows.find((task) => !task.parent_task_id);
        if (firstRoot) setSelectedPath([firstRoot.id]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu nhiệm vụ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const topicMatch = selectedTopicId === 'all' || task.topic_id === selectedTopicId;
      const search = searchTerm.trim().toLowerCase();
      const searchMatch = !search || task.title.toLowerCase().includes(search) || task.description?.toLowerCase().includes(search);
      return topicMatch && searchMatch;
    });
  }, [searchTerm, selectedTopicId, tasks]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ApiTask[]>();
    filteredTasks.forEach((task) => {
      const parentId = task.parent_task_id || null;
      map.set(parentId, [...(map.get(parentId) || []), task]);
    });
    map.forEach((items) => items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return map;
  }, [filteredTasks]);

  const rootTasks = childrenByParent.get(null) || [];
  const selectedTask = selectedPath.length > 0 ? taskById.get(selectedPath[selectedPath.length - 1]) || null : null;
  const selectedTaskChildren = selectedTask ? childrenByParent.get(selectedTask.id) || [] : [];
  const selectedTaskSessions = selectedTask ? sessions.filter((session) => session.task_id === selectedTask.id) : [];

  const columns = useMemo(() => {
    const nextColumns: Array<{ parent: ApiTask | null; tasks: ApiTask[] }> = [{ parent: null, tasks: rootTasks }];
    selectedPath.forEach((taskId) => {
      const parent = taskById.get(taskId) || null;
      if (parent) nextColumns.push({ parent, tasks: childrenByParent.get(taskId) || [] });
    });
    return nextColumns;
  }, [childrenByParent, rootTasks, selectedPath, taskById]);

  const stats = useMemo(() => {
    const scopedTasks = selectedTopicId === 'all' ? tasks : tasks.filter((task) => task.topic_id === selectedTopicId);
    const leafTasks = scopedTasks.filter((task) => (task.child_count || 0) === 0);
    const completedLeafTasks = leafTasks.filter((task) => task.status === 'completed' || task.effective_status === 'completed');
    const activeRootTasks = scopedTasks.filter((task) => !task.parent_task_id && task.effective_status !== 'completed');
    const overdueLeafTasks = leafTasks.filter((task) => task.deadline && task.status !== 'completed' && new Date(task.deadline) < new Date());
    const scopedTaskIds = new Set(scopedTasks.map((task) => task.id));
    const scopedSessions = sessions.filter((session) => scopedTaskIds.has(session.task_id));
    const onTimeSessions = scopedSessions.filter((session) => session.in_time_status === 'in_time');
    const totalMinutes = scopedSessions.reduce((sum, session) => sum + getDurationMinutes(session), 0);

    return {
      completedLeafTasks: completedLeafTasks.length,
      activeRootTasks: activeRootTasks.length,
      overdueLeafTasks: overdueLeafTasks.length,
      onTimeSessions: onTimeSessions.length,
      totalSessionHours: Math.round((totalMinutes / 60) * 10) / 10,
    };
  }, [selectedTopicId, sessions, tasks]);

  const selectTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    const firstRoot = tasks.find((task) => !task.parent_task_id && (topicId === 'all' || task.topic_id === topicId));
    setSelectedPath(firstRoot ? [firstRoot.id] : []);
  };

  const selectRootTask = (taskId: string) => {
    setSelectedPath([taskId]);
  };

  const selectTask = (task: ApiTask, columnIndex: number) => {
    setSelectedPath([...selectedPath.slice(0, columnIndex), task.id]);
  };

  const openTaskModal = (parentTaskId: string | null) => {
    setTaskDraft({ ...emptyTaskDraft, parentTaskId });
    setIsTaskModalOpen(true);
  };

  const getCompletionPercent = (task: ApiTask) => {
    if ((task.leaf_count || 0) > 0) return Math.round(((task.completed_leaf_count || 0) / (task.leaf_count || 1)) * 100);
    return task.status === 'completed' ? 100 : 0;
  };

  const handleCreateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !newTopicName.trim()) return;

    try {
      setIsLoading(true);
      const topic = await api.createTopic(user.id, newTopicName.trim(), topicColorPalette[topics.length % topicColorPalette.length].name);
      setTopics((current) => [topic, ...current]);
      setSelectedTopicId(topic.id);
      setNewTopicName('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được chủ đề.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !taskDraft.title.trim()) return;

    const parentTask = taskDraft.parentTaskId ? taskById.get(taskDraft.parentTaskId) : null;
    const topicId = parentTask?.topic_id || (selectedTopicId !== 'all' ? selectedTopicId : topics[0]?.id);
    if (!topicId) {
      setErrorMessage('Hãy tạo ít nhất một chủ đề trước khi thêm nhiệm vụ.');
      return;
    }

    try {
      setIsLoading(true);
      const created = await api.createTask({
        userId: user.id,
        topicId,
        parentTaskId: taskDraft.parentTaskId,
        title: taskDraft.title,
        description: taskDraft.description || undefined,
        deadline: taskDraft.deadline || undefined,
      });
      setIsTaskModalOpen(false);
      setTaskDraft(emptyTaskDraft);
      await loadData();
      setSelectedPath(taskDraft.parentTaskId ? [...selectedPath, created.id] : [created.id]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được nhiệm vụ.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLeaf = async (task: ApiTask) => {
    if ((childrenByParent.get(task.id) || []).length > 0) return;

    const status: ApiTaskStatus = task.status === 'completed' ? 'not_completed' : 'completed';
    try {
      await api.updateTask({ id: task.id, status });
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái.');
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    if (!window.confirm('Lưu trữ nhiệm vụ này? Dữ liệu session sẽ được giữ lại.')) return;

    try {
      await api.deleteTask(taskId);
      setSelectedPath((current) => current.filter((id) => id !== taskId));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu trữ được nhiệm vụ.');
    }
  };

  const handleCreateSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !selectedTask) return;

    try {
      setIsLoading(true);
      await api.createSession({
        userId: user.id,
        taskId: selectedTask.id,
        sessionName: sessionDraft.sessionName || null,
        startTime: `${sessionDraft.sessionDate}T${sessionDraft.startTime}:00`,
        endTime: `${sessionDraft.sessionDate}T${sessionDraft.endTime}:00`,
        sessionDate: sessionDraft.sessionDate,
        inTimeStatus: sessionDraft.inTimeStatus,
      });
      setIsSessionModalOpen(false);
      setSessionDraft(emptySessionDraft);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Xóa session này?')) return;
    try {
      await api.deleteSession(sessionId);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được session.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm">
      <div className="grid min-h-[calc(100vh-120px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="flex min-w-0 flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-xl font-semibold">Nhiệm vụ</h1>
                <p className="text-sm text-slate-500">Mỗi chủ đề là một tab. Bên dưới là cây task nối từ node cha đến node con.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <form onSubmit={handleCreateTopic} className="flex gap-2">
                  <input
                    value={newTopicName}
                    onChange={(event) => setNewTopicName(event.target.value)}
                    placeholder="Chủ đề mới"
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 sm:w-36"
                  />
                  <button className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50">
                    <FolderPlus className="h-4 w-4" />
                    Tạo
                  </button>
                </form>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Tìm nhiệm vụ, mô tả..."
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64"
                  />
                </div>
                <button onClick={() => openTaskModal(selectedTask?.id || null)} className="flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                  Thêm task
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              <TopicTab active={selectedTopicId === 'all'} label="Tất cả" count={tasks.length} icon={<LayoutGrid className="h-4 w-4" />} onClick={() => selectTopic('all')} />
              {topics.map((topic, index) => {
                const color = getTopicColorByName(topic.topic_color, index);
                const count = tasks.filter((task) => task.topic_id === topic.id).length;
                return (
                  <TopicTab
                    key={topic.id}
                    active={selectedTopicId === topic.id}
                    label={topic.name}
                    count={count}
                    color={color.text}
                    onClick={() => selectTopic(topic.id)}
                  />
                );
              })}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto border-t border-slate-100 pt-3">
              {rootTasks.length === 0 ? (
                <button onClick={() => openTaskModal(null)} className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">
                  Thêm root task cho tab này
                </button>
              ) : (
                rootTasks.map((root) => (
                  <button
                    key={root.id}
                    onClick={() => selectRootTask(root.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                      selectedPath[0] === root.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <GitBranch className="h-4 w-4" />
                    {root.title}
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{getCompletionPercent(root)}%</span>
                  </button>
                ))
              )}
            </div>

            {errorMessage && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-5">
              <StatCard label="Task hoàn thành" value={stats.completedLeafTasks} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
              <StatCard label="Root đang chạy" value={stats.activeRootTasks} icon={<GitBranch className="h-4 w-4 text-blue-600" />} />
              <StatCard label="Session đúng giờ" value={stats.onTimeSessions} icon={<Clock3 className="h-4 w-4 text-emerald-600" />} />
              <StatCard label="Tổng giờ session" value={`${stats.totalSessionHours}h`} icon={<BarChart3 className="h-4 w-4 text-violet-600" />} />
              <StatCard label="Leaf quá hạn" value={stats.overdueLeafTasks} icon={<AlertCircle className="h-4 w-4 text-orange-600" />} />
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-x-auto bg-slate-50 p-4">
            <div className="flex min-h-[560px] gap-8">
              {columns.map((column, columnIndex) => (
                <div key={column.parent?.id || 'root'} className="w-[280px] shrink-0">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{column.parent ? 'Task con' : 'Root task'}</h3>
                      <p className="truncate text-xs text-slate-500">{column.parent?.title || 'Danh sách nhiệm vụ lớn'}</p>
                    </div>
                    <button onClick={() => openTaskModal(column.parent?.id || null)} className="rounded-md border border-slate-200 bg-white p-1.5 hover:bg-slate-50" title="Thêm task">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {column.tasks.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
                        Chưa có task ở cấp này
                      </div>
                    ) : (
                      column.tasks.map((task) => (
                        <TaskNodeCard
                          key={task.id}
                          task={task}
                          completion={getCompletionPercent(task)}
                          isSelected={selectedPath[columnIndex] === task.id}
                          hasChildren={(childrenByParent.get(task.id) || []).length > 0}
                          hasIncomingConnector={columnIndex > 0}
                          hasOutgoingConnector={selectedPath[columnIndex] === task.id && (childrenByParent.get(task.id) || []).length > 0}
                          onSelect={() => selectTask(task, columnIndex)}
                          onToggle={() => handleToggleLeaf(task)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="border-t border-slate-200 bg-white p-4 lg:border-l lg:border-t-0">
          {selectedTask ? (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Inspector</p>
                  <h2 className="text-lg font-semibold">{selectedTask.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedTask.description || 'Chưa có mô tả.'}</p>
                </div>
                <button onClick={() => handleArchiveTask(selectedTask.id)} className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Lưu trữ">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 space-y-2 rounded-md border border-slate-200 p-3 text-sm">
                <InfoRow label="Deadline" value={formatDate(selectedTask.deadline)} />
                <InfoRow label="Trạng thái" value={selectedTask.effective_status === 'completed' ? 'Hoàn thành' : 'Đang làm'} />
                <InfoRow label="Task con" value={`${selectedTaskChildren.length}`} />
                <InfoRow label="Session" value={`${selectedTaskSessions.length}`} />
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Tiến độ cây</h3>
                  <span className="text-sm font-medium text-blue-600">{getCompletionPercent(selectedTask)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${getCompletionPercent(selectedTask)}%` }} />
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <button onClick={() => openTaskModal(selectedTask.id)} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Thêm task con
                </button>
                <button onClick={() => setIsSessionModalOpen(true)} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  Thêm session
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <h3 className="mb-2 text-sm font-semibold">Sessions</h3>
                <div className="space-y-2">
                  {selectedTaskSessions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Chưa có session</div>
                  ) : (
                    selectedTaskSessions.map((session) => (
                      <div key={session.id} className="rounded-md border border-slate-200 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{session.session_name || 'Session không tên'}</p>
                            <p className="text-xs text-slate-500">{session.session_date} · {formatTime(session.start_time)} - {formatTime(session.end_time)}</p>
                          </div>
                          <button onClick={() => handleDeleteSession(session.id)} className="text-slate-400 hover:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`rounded-full px-2 py-1 font-medium ${session.in_time_status === 'in_time' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                            {session.in_time_status === 'in_time' ? 'Đúng giờ' : 'Trễ giờ'}
                          </span>
                          <span className="text-slate-500">{getDurationMinutes(session)} phút</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-500">
              <Folder className="mb-3 h-8 w-8" />
              <p className="text-sm font-medium">Chọn một task để xem chi tiết</p>
              <p className="mt-1 text-xs">Inspector sẽ hiển thị task con, session và tiến độ.</p>
            </div>
          )}
        </aside>
      </div>

      {isTaskModalOpen && (
        <Modal title={taskDraft.parentTaskId ? 'Tạo task con' : 'Tạo root task'} onClose={() => setIsTaskModalOpen(false)}>
          <form onSubmit={handleCreateTask} className="space-y-3">
            <Field label="Tiêu đề">
              <input value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} className="input-light" required />
            </Field>
            <Field label="Mô tả">
              <textarea value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })} className="input-light min-h-20 resize-none" />
            </Field>
            <Field label="Deadline">
              <input type="datetime-local" value={taskDraft.deadline} onChange={(event) => setTaskDraft({ ...taskDraft, deadline: event.target.value })} className="input-light" />
            </Field>
            {taskDraft.parentTaskId && <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">Task con sẽ nằm dưới: {taskById.get(taskDraft.parentTaskId)?.title}</p>}
            <button disabled={isLoading} className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Lưu task</button>
          </form>
        </Modal>
      )}

      {isSessionModalOpen && selectedTask && (
        <Modal title="Thêm session" onClose={() => setIsSessionModalOpen(false)}>
          <form onSubmit={handleCreateSession} className="space-y-3">
            <Field label="Tên session">
              <input value={sessionDraft.sessionName} onChange={(event) => setSessionDraft({ ...sessionDraft, sessionName: event.target.value })} className="input-light" />
            </Field>
            <Field label="Ngày">
              <input type="date" value={sessionDraft.sessionDate} onChange={(event) => setSessionDraft({ ...sessionDraft, sessionDate: event.target.value })} className="input-light" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bắt đầu">
                <input type="time" value={sessionDraft.startTime} onChange={(event) => setSessionDraft({ ...sessionDraft, startTime: event.target.value })} className="input-light" required />
              </Field>
              <Field label="Kết thúc">
                <input type="time" value={sessionDraft.endTime} onChange={(event) => setSessionDraft({ ...sessionDraft, endTime: event.target.value })} className="input-light" required />
              </Field>
            </div>
            <Field label="Trạng thái session">
              <select value={sessionDraft.inTimeStatus} onChange={(event) => setSessionDraft({ ...sessionDraft, inTimeStatus: event.target.value as SessionDraft['inTimeStatus'] })} className="input-light">
                <option value="in_time">Đúng giờ</option>
                <option value="out_time">Trễ giờ</option>
              </select>
            </Field>
            <button disabled={isLoading} className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Lưu session</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function TopicTab({
  active,
  label,
  count,
  icon,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon?: ReactNode;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
        active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon || <span className="h-2.5 w-2.5 rounded-full" style={{ background: color || '#64748b' }} />}
      <span className="max-w-36 truncate">{label}</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{count}</span>
    </button>
  );
}

function TaskNodeCard({
  task,
  completion,
  isSelected,
  hasChildren,
  hasIncomingConnector,
  hasOutgoingConnector,
  onSelect,
  onToggle,
}: {
  task: ApiTask;
  completion: number;
  isSelected: boolean;
  hasChildren: boolean;
  hasIncomingConnector: boolean;
  hasOutgoingConnector: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      {hasIncomingConnector && (
        <>
          <span className="absolute -left-8 top-1/2 h-px w-8 bg-slate-300" />
          <span className="absolute -left-[9px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-slate-300 bg-white" />
        </>
      )}
      {hasOutgoingConnector && (
        <>
          <span className="absolute -right-8 top-1/2 h-px w-8 bg-blue-400" />
          <span className="absolute -right-[35px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-blue-500" />
        </>
      )}
      <button
        onClick={onSelect}
        className={`w-full rounded-md border bg-white p-3 text-left shadow-sm transition hover:border-blue-300 ${
          isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              className={`mt-0.5 ${hasChildren ? 'text-slate-300' : 'text-slate-500 hover:text-blue-600'}`}
              title={hasChildren ? 'Task cha tự tính trạng thái' : 'Đổi trạng thái'}
            >
              {task.effective_status === 'completed' || task.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(task.deadline)}</p>
            </div>
          </div>
          {hasChildren && <GitBranch className="mt-0.5 h-4 w-4 text-slate-400" />}
        </div>
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${completion}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{completion}% hoàn thành</span>
          <span>{task.child_count || 0} con</span>
        </div>
      </button>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
