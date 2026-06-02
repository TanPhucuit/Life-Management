'use client';

import { FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
  LocateFixed,
  Move,
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

type NodePosition = { x: number; y: number };
type DragState = { taskId: string; offsetX: number; offsetY: number };

const today = new Date().toISOString().slice(0, 10);
const emptyTaskDraft: TaskDraft = { title: '', description: '', deadline: '', parentTaskId: null };
const emptySessionDraft: SessionDraft = {
  sessionName: '',
  sessionDate: today,
  startTime: '09:00',
  endTime: '10:00',
  inTimeStatus: 'in_time',
};

const nodeWidth = 280;
const nodeHeight = 104;
const levelGap = 360;
const siblingGap = 132;
const canvasPadding = 48;

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

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
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(emptySessionDraft);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);

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

      const scopedRoots = taskRows.filter((task) => !task.parent_task_id && (selectedTopicId === 'all' || task.topic_id === selectedTopicId));
      const nextRoot = selectedRootId && scopedRoots.some((task) => task.id === selectedRootId) ? selectedRootId : scopedRoots[0]?.id || null;
      setSelectedRootId(nextRoot);
      setSelectedTaskId((current) => {
        if (current && taskRows.some((task) => task.id === current)) return current;
        return nextRoot;
      });
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

  const topicScopedTasks = useMemo(() => {
    return tasks.filter((task) => selectedTopicId === 'all' || task.topic_id === selectedTopicId);
  }, [selectedTopicId, tasks]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ApiTask[]>();
    topicScopedTasks.forEach((task) => {
      const parentId = task.parent_task_id || null;
      map.set(parentId, [...(map.get(parentId) || []), task]);
    });
    map.forEach((items) => items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return map;
  }, [topicScopedTasks]);

  const rootTasks = childrenByParent.get(null) || [];

  useEffect(() => {
    const rootExists = selectedRootId && rootTasks.some((task) => task.id === selectedRootId);
    const nextRootId = rootExists ? selectedRootId : rootTasks[0]?.id || null;
    if (nextRootId !== selectedRootId) {
      setSelectedRootId(nextRootId);
      setSelectedTaskId(nextRootId);
    }
  }, [rootTasks, selectedRootId]);

  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;
  const selectedTaskChildren = selectedTask ? childrenByParent.get(selectedTask.id) || [] : [];
  const selectedTaskSessions = selectedTask ? sessions.filter((session) => session.task_id === selectedTask.id) : [];

  const canvasTasks = useMemo(() => {
    if (!selectedRootId) return [];

    const subtreeIds = new Set<string>();
    const collect = (taskId: string) => {
      subtreeIds.add(taskId);
      (childrenByParent.get(taskId) || []).forEach((child) => collect(child.id));
    };
    collect(selectedRootId);

    const baseTasks = topicScopedTasks.filter((task) => subtreeIds.has(task.id));
    const search = searchTerm.trim().toLowerCase();
    if (!search) return baseTasks;

    const visibleIds = new Set<string>();
    baseTasks.forEach((task) => {
      const matches = task.title.toLowerCase().includes(search) || task.description?.toLowerCase().includes(search);
      if (!matches) return;

      visibleIds.add(task.id);
      let current = task;
      while (current.parent_task_id) {
        visibleIds.add(current.parent_task_id);
        const parent = taskById.get(current.parent_task_id);
        if (!parent) break;
        current = parent;
      }
    });

    return baseTasks.filter((task) => visibleIds.has(task.id));
  }, [childrenByParent, searchTerm, selectedRootId, taskById, topicScopedTasks]);

  const canvasTaskIds = useMemo(() => new Set(canvasTasks.map((task) => task.id)), [canvasTasks]);
  const layoutStorageKey = user?.id && selectedRootId ? `life-manager-task-layout:${user.id}:${selectedRootId}` : null;

  const autoLayoutPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    if (!selectedRootId || !canvasTaskIds.has(selectedRootId)) return positions;

    let leafIndex = 0;
    const place = (task: ApiTask, depth: number): number => {
      const visibleChildren = (childrenByParent.get(task.id) || []).filter((child) => canvasTaskIds.has(child.id));
      if (visibleChildren.length === 0) {
        const y = canvasPadding + leafIndex * siblingGap;
        positions[task.id] = { x: canvasPadding + depth * levelGap, y };
        leafIndex += 1;
        return y;
      }

      const childYs = visibleChildren.map((child) => place(child, depth + 1));
      const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
      positions[task.id] = { x: canvasPadding + depth * levelGap, y };
      return y;
    };

    const root = taskById.get(selectedRootId);
    if (root) place(root, 0);
    return positions;
  }, [canvasTaskIds, childrenByParent, selectedRootId, taskById]);

  useEffect(() => {
    setNodePositions((current) => {
      let savedPositions: Record<string, NodePosition> = {};
      if (layoutStorageKey && typeof window !== 'undefined') {
        try {
          savedPositions = JSON.parse(localStorage.getItem(layoutStorageKey) || '{}') as Record<string, NodePosition>;
        } catch {
          savedPositions = {};
        }
      }

      const next: Record<string, NodePosition> = {};
      canvasTasks.forEach((task) => {
        next[task.id] = current[task.id] || savedPositions[task.id] || autoLayoutPositions[task.id] || { x: canvasPadding, y: canvasPadding };
      });
      return next;
    });
  }, [autoLayoutPositions, canvasTasks, layoutStorageKey]);

  useEffect(() => {
    if (!layoutStorageKey || canvasTasks.length === 0 || typeof window === 'undefined') return;

    const savedPositions: Record<string, NodePosition> = {};
    canvasTasks.forEach((task) => {
      if (nodePositions[task.id]) savedPositions[task.id] = nodePositions[task.id];
    });
    localStorage.setItem(layoutStorageKey, JSON.stringify(savedPositions));
  }, [canvasTasks, layoutStorageKey, nodePositions]);

  const visibleEdges = useMemo(() => {
    return canvasTasks
      .filter((task) => task.parent_task_id && canvasTaskIds.has(task.parent_task_id))
      .map((task) => ({ parentId: task.parent_task_id!, childId: task.id }));
  }, [canvasTaskIds, canvasTasks]);

  const canvasSize = useMemo(() => {
    const positions = canvasTasks.map((task) => nodePositions[task.id]).filter(Boolean);
    const maxX = Math.max(900, ...positions.map((position) => position.x + nodeWidth + canvasPadding));
    const maxY = Math.max(560, ...positions.map((position) => position.y + nodeHeight + canvasPadding));
    return { width: maxX, height: maxY };
  }, [canvasTasks, nodePositions]);

  const stats = useMemo(() => {
    const leafTasks = topicScopedTasks.filter((task) => (task.child_count || 0) === 0);
    const completedLeafTasks = leafTasks.filter((task) => task.status === 'completed' || task.effective_status === 'completed');
    const activeRootTasks = topicScopedTasks.filter((task) => !task.parent_task_id && task.effective_status !== 'completed');
    const overdueLeafTasks = leafTasks.filter((task) => task.deadline && task.status !== 'completed' && new Date(task.deadline) < new Date());
    const scopedTaskIds = new Set(topicScopedTasks.map((task) => task.id));
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
  }, [sessions, topicScopedTasks]);

  const selectTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    const firstRoot = tasks.find((task) => !task.parent_task_id && (topicId === 'all' || task.topic_id === topicId));
    setSelectedRootId(firstRoot?.id || null);
    setSelectedTaskId(firstRoot?.id || null);
  };

  const selectRootTask = (taskId: string) => {
    setSelectedRootId(taskId);
    setSelectedTaskId(taskId);
  };

  const openTaskModal = (parentTaskId: string | null) => {
    setTaskDraft({ ...emptyTaskDraft, parentTaskId });
    setIsTaskModalOpen(true);
  };

  const getCompletionPercent = (task: ApiTask) => {
    if ((task.leaf_count || 0) > 0) return Math.round(((task.completed_leaf_count || 0) / (task.leaf_count || 1)) * 100);
    return task.status === 'completed' ? 100 : 0;
  };

  const resetCanvasLayout = () => {
    if (layoutStorageKey && typeof window !== 'undefined') localStorage.removeItem(layoutStorageKey);
    setNodePositions(autoLayoutPositions);
  };

  const startDrag = (event: ReactMouseEvent, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const currentPosition = nodePositions[taskId];
    if (!canvasRect || !currentPosition) return;

    setSelectedTaskId(taskId);
    setDragState({
      taskId,
      offsetX: event.clientX - canvasRect.left + (canvasRef.current?.scrollLeft || 0) - currentPosition.x,
      offsetY: event.clientY - canvasRect.top + (canvasRef.current?.scrollTop || 0) - currentPosition.y,
    });
  };

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragState || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const nextX = event.clientX - canvasRect.left + canvasRef.current.scrollLeft - dragState.offsetX;
    const nextY = event.clientY - canvasRect.top + canvasRef.current.scrollTop - dragState.offsetY;

    setNodePositions((current) => ({
      ...current,
      [dragState.taskId]: {
        x: Math.max(16, nextX),
        y: Math.max(16, nextY),
      },
    }));
  };

  const handleCanvasMouseUp = async () => {
    if (!dragState) return;
    const draggedId = dragState.taskId;
    setDragState(null);

    const draggedTask = taskById.get(draggedId);
    if (!draggedTask) return;

    const siblings = (childrenByParent.get(draggedTask.parent_task_id || null) || []).filter((task) => canvasTaskIds.has(task.id));
    const ordered = [...siblings].sort((a, b) => (nodePositions[a.id]?.y || 0) - (nodePositions[b.id]?.y || 0));
    const nextSortOrder = ordered.findIndex((task) => task.id === draggedId);
    if (nextSortOrder >= 0 && nextSortOrder !== (draggedTask.sort_order || 0)) {
      try {
        await api.updateTask({ id: draggedId, sortOrder: nextSortOrder });
        setTasks((current) => current.map((task) => (task.id === draggedId ? { ...task, sort_order: nextSortOrder } : task)));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Không lưu được thứ tự task.');
      }
    }
  };

  const handleCreateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !newTopicName.trim()) return;

    try {
      setIsLoading(true);
      const topic = await api.createTopic(user.id, newTopicName.trim(), topicColorPalette[topics.length % topicColorPalette.length].name);
      setTopics((current) => [topic, ...current]);
      setSelectedTopicId(topic.id);
      setSelectedRootId(null);
      setSelectedTaskId(null);
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
      setSelectedRootId(taskDraft.parentTaskId ? selectedRootId : created.id);
      setSelectedTaskId(created.id);
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
      setSelectedTaskId((current) => (current === taskId ? selectedRootId : current));
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
                <p className="text-sm text-slate-500">Canvas task tree kéo thả tự do, có đường nối trực tiếp giữa node cha và node con.</p>
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
                <button
                  onClick={() => openTaskModal(selectedTask?.id || selectedRootId)}
                  className="flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
                >
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
                      selectedRootId === root.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white hover:bg-slate-50'
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

          <section
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            className="relative min-h-0 flex-1 overflow-auto bg-slate-50"
          >
            <div className="sticky left-0 top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
              <button
                type="button"
                onClick={resetCanvasLayout}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <LocateFixed className="h-4 w-4" />
                Auto layout
              </button>
              <span className="text-xs text-slate-500">Kéo node để sắp xếp. Thứ tự anh em được lưu theo vị trí dọc.</span>
            </div>

            {canvasTasks.length === 0 ? (
              <div className="m-4 flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
                Chưa có task trong root này.
              </div>
            ) : (
              <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
                <svg className="pointer-events-none absolute inset-0 z-0" width={canvasSize.width} height={canvasSize.height}>
                  <defs>
                    <marker id="task-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#60a5fa" />
                    </marker>
                  </defs>
                  {visibleEdges.map((edge) => {
                    const parent = nodePositions[edge.parentId];
                    const child = nodePositions[edge.childId];
                    if (!parent || !child) return null;

                    const startX = parent.x + nodeWidth;
                    const startY = parent.y + nodeHeight / 2;
                    const endX = child.x;
                    const endY = child.y + nodeHeight / 2;
                    const curve = Math.max(80, Math.abs(endX - startX) / 2);
                    const path = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
                    return <path key={`${edge.parentId}-${edge.childId}`} d={path} fill="none" stroke="#60a5fa" strokeWidth="2" markerEnd="url(#task-arrow)" />;
                  })}
                </svg>

                {canvasTasks.map((task) => {
                  const position = nodePositions[task.id] || autoLayoutPositions[task.id] || { x: canvasPadding, y: canvasPadding };
                  return (
                    <TaskDiagramNode
                      key={task.id}
                      task={task}
                      position={position}
                      completion={getCompletionPercent(task)}
                      isSelected={selectedTaskId === task.id}
                      hasChildren={(childrenByParent.get(task.id) || []).length > 0}
                      onSelect={() => setSelectedTaskId(task.id)}
                      onDragStart={(event) => startDrag(event, task.id)}
                      onToggle={() => handleToggleLeaf(task)}
                      onAddChild={() => openTaskModal(task.id)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </main>

        <Inspector
          selectedTask={selectedTask}
          selectedTaskChildren={selectedTaskChildren}
          selectedTaskSessions={selectedTaskSessions}
          completion={selectedTask ? getCompletionPercent(selectedTask) : 0}
          onArchive={handleArchiveTask}
          onAddChild={() => selectedTask && openTaskModal(selectedTask.id)}
          onAddSession={() => setIsSessionModalOpen(true)}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {isTaskModalOpen && (
        <Modal title={taskDraft.parentTaskId ? 'Tạo task con' : 'Tạo root task'} onClose={() => setIsTaskModalOpen(false)}>
          <form onSubmit={handleCreateTask} className="space-y-3">
            <Field label="Tiêu đề">
              <input value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} className={inputClass} required />
            </Field>
            <Field label="Mô tả">
              <textarea
                value={taskDraft.description}
                onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })}
                className={`${inputClass} min-h-20 resize-none py-2`}
              />
            </Field>
            <Field label="Deadline">
              <input type="datetime-local" value={taskDraft.deadline} onChange={(event) => setTaskDraft({ ...taskDraft, deadline: event.target.value })} className={inputClass} />
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
              <input value={sessionDraft.sessionName} onChange={(event) => setSessionDraft({ ...sessionDraft, sessionName: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Ngày">
              <input type="date" value={sessionDraft.sessionDate} onChange={(event) => setSessionDraft({ ...sessionDraft, sessionDate: event.target.value })} className={inputClass} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bắt đầu">
                <input type="time" value={sessionDraft.startTime} onChange={(event) => setSessionDraft({ ...sessionDraft, startTime: event.target.value })} className={inputClass} required />
              </Field>
              <Field label="Kết thúc">
                <input type="time" value={sessionDraft.endTime} onChange={(event) => setSessionDraft({ ...sessionDraft, endTime: event.target.value })} className={inputClass} required />
              </Field>
            </div>
            <Field label="Trạng thái session">
              <select value={sessionDraft.inTimeStatus} onChange={(event) => setSessionDraft({ ...sessionDraft, inTimeStatus: event.target.value as SessionDraft['inTimeStatus'] })} className={inputClass}>
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

function TaskDiagramNode({
  task,
  position,
  completion,
  isSelected,
  hasChildren,
  onSelect,
  onDragStart,
  onToggle,
  onAddChild,
}: {
  task: ApiTask;
  position: NodePosition;
  completion: number;
  isSelected: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onDragStart: (event: ReactMouseEvent) => void;
  onToggle: () => void;
  onAddChild: () => void;
}) {
  return (
    <div
      className="absolute z-10"
      style={{ width: nodeWidth, height: nodeHeight, transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseDown={onSelect}
    >
      <div
        className={`h-full rounded-md border bg-white p-3 text-left shadow-sm transition hover:border-blue-300 ${
          isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              className={`mt-0.5 ${hasChildren ? 'cursor-default text-slate-300' : 'text-slate-500 hover:text-blue-600'}`}
              title={hasChildren ? 'Task cha tự tính trạng thái' : 'Đổi trạng thái'}
            >
              {task.effective_status === 'completed' || task.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{task.title}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(task.deadline)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild();
              }}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              title="Thêm task con"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={onDragStart}
              className="grid h-7 w-7 cursor-grab place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 active:cursor-grabbing"
              title="Kéo node"
            >
              <Move className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${completion}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{completion}% hoàn thành</span>
          <span>{task.child_count || 0} con</span>
        </div>
      </div>
    </div>
  );
}

function Inspector({
  selectedTask,
  selectedTaskChildren,
  selectedTaskSessions,
  completion,
  onArchive,
  onAddChild,
  onAddSession,
  onDeleteSession,
}: {
  selectedTask: ApiTask | null;
  selectedTaskChildren: ApiTask[];
  selectedTaskSessions: ApiSession[];
  completion: number;
  onArchive: (taskId: string) => void;
  onAddChild: () => void;
  onAddSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}) {
  return (
    <aside className="border-t border-slate-200 bg-white p-4 lg:border-l lg:border-t-0">
      {selectedTask ? (
        <div className="flex h-full flex-col">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Inspector</p>
              <h2 className="text-lg font-semibold">{selectedTask.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedTask.description || 'Chưa có mô tả.'}</p>
            </div>
            <button onClick={() => onArchive(selectedTask.id)} className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Lưu trữ">
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
              <span className="text-sm font-medium text-blue-600">{completion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${completion}%` }} />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <button onClick={onAddChild} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Thêm task con
            </button>
            <button onClick={onAddSession} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">
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
                        <p className="text-xs text-slate-500">
                          {session.session_date} · {formatTime(session.start_time)} - {formatTime(session.end_time)}
                        </p>
                      </div>
                      <button onClick={() => onDeleteSession(session.id)} className="text-slate-400 hover:text-red-600">
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
