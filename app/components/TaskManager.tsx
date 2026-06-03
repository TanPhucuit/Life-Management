'use client';

import { FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Folder,
  FolderPlus,
  GitBranch,
  LocateFixed,
  Move,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiTask, ApiTaskStatus, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { getTopicColorByName, topicColorPalette } from '@/app/lib/topicColors';

type TaskDraft = {
  title: string;
  description: string;
  startDate: string;
  deadline: string;
  parentTaskId: string | null;
};

type NodePosition = { x: number; y: number };
type DragState = { taskId: string; offsetX: number; offsetY: number };

const emptyTaskDraft: TaskDraft = { title: '', description: '', startDate: '', deadline: '', parentTaskId: null };

const nodeWidth = 280;
const nodeHeight = 124;
const levelGap = 430;
const siblingGap = 176;
const canvasPadding = 48;
const canvasMinWidth = 2200;
const canvasMinHeight = 1400;
const canvasExpansionPadding = 900;
const autoPanThreshold = 80;
const autoPanStep = 28;
const connectorSpineOffset = 118;
const connectorChildInset = 74;
const completedTaskBackground = '#dcfce7';
const inProgressTaskBackground = '#dbeafe';
const pendingTaskBackground = '#ffffff';

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const formatDate = (value?: string | null, emptyLabel = 'Chưa có hạn') => {
  if (!value) return emptyLabel;
  return new Date(value).toLocaleDateString('vi-VN');
};

const isTaskDone = (task: ApiTask) => task.effective_status === 'completed' || task.status === 'completed';
const isTaskInProgress = (task: ApiTask) => !isTaskDone(task) && (task.effective_status === 'in_progress' || task.status === 'in_progress');

const getTaskStatusLabel = (status?: ApiTaskStatus) => {
  if (status === 'completed') return 'Hoàn thành';
  if (status === 'in_progress') return 'Đang thực hiện';
  return 'Chưa hoàn thành';
};

const toDateTimeInputValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

export default function TaskManager() {
  const { user } = useAppStore();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setErrorMessage('');
      const [topicRows, taskRows] = await Promise.all([
        api.getTopics(user.id),
        api.getTasks(user.id, { view: 'tree' }),
      ]);

      setTopics(topicRows);
      setTasks(taskRows);

      const nextTopicId = selectedTopicId && topicRows.some((topic) => topic.id === selectedTopicId) ? selectedTopicId : topicRows[0]?.id || '';
      if (nextTopicId !== selectedTopicId) setSelectedTopicId(nextTopicId);

      const scopedRoots = taskRows.filter((task) => !task.parent_task_id && task.topic_id === nextTopicId);
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

  const topicScopedTasks = useMemo(() => tasks.filter((task) => task.topic_id === selectedTopicId), [selectedTopicId, tasks]);

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

  const connectorGroups = useMemo(() => {
    return canvasTasks
      .map((task) => {
        const children = (childrenByParent.get(task.id) || [])
          .filter((child) => canvasTaskIds.has(child.id))
          .sort((a, b) => (nodePositions[a.id]?.y || 0) - (nodePositions[b.id]?.y || 0));
        return { parentId: task.id, childIds: children.map((child) => child.id) };
      })
      .filter((group) => group.childIds.length > 0);
  }, [canvasTaskIds, canvasTasks, childrenByParent, nodePositions]);

  const canvasSize = useMemo(() => {
    const positions = canvasTasks.map((task) => nodePositions[task.id]).filter(Boolean);
    const maxX = Math.max(canvasMinWidth, ...positions.map((position) => position.x + nodeWidth + canvasExpansionPadding));
    const maxY = Math.max(canvasMinHeight, ...positions.map((position) => position.y + nodeHeight + canvasExpansionPadding));
    return { width: maxX, height: maxY };
  }, [canvasTasks, nodePositions]);

  const stats = useMemo(() => {
    const leafTasks = topicScopedTasks.filter((task) => (task.child_count || 0) === 0);
    const completedLeafTasks = leafTasks.filter((task) => task.status === 'completed' || task.effective_status === 'completed');
    const incompleteLeafTasks = leafTasks.filter((task) => task.status !== 'completed' && task.effective_status !== 'completed');
    const inProgressTasks = topicScopedTasks.filter((task) => task.status === 'in_progress' || task.effective_status === 'in_progress');
    const overdueLeafTasks = leafTasks.filter((task) => task.deadline && task.status !== 'completed' && new Date(task.deadline) < new Date());

    return {
      completedLeafTasks: completedLeafTasks.length,
      incompleteLeafTasks: incompleteLeafTasks.length,
      inProgressTasks: inProgressTasks.length,
      overdueLeafTasks: overdueLeafTasks.length,
      totalTasks: topicScopedTasks.length,
    };
  }, [topicScopedTasks]);

  const selectTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    const firstRoot = tasks.find((task) => !task.parent_task_id && task.topic_id === topicId);
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
    const canvas = canvasRef.current;
    const canvasRect = canvas.getBoundingClientRect();

    const distanceRight = canvasRect.right - event.clientX;
    const distanceLeft = event.clientX - canvasRect.left;
    const distanceBottom = canvasRect.bottom - event.clientY;
    const distanceTop = event.clientY - canvasRect.top;

    if (distanceRight < autoPanThreshold) canvas.scrollLeft += autoPanStep;
    if (distanceLeft < autoPanThreshold) canvas.scrollLeft = Math.max(0, canvas.scrollLeft - autoPanStep);
    if (distanceBottom < autoPanThreshold) canvas.scrollTop += autoPanStep;
    if (distanceTop < autoPanThreshold) canvas.scrollTop = Math.max(0, canvas.scrollTop - autoPanStep);

    const nextX = event.clientX - canvasRect.left + canvas.scrollLeft - dragState.offsetX;
    const nextY = event.clientY - canvasRect.top + canvas.scrollTop - dragState.offsetY;

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

    const snappedX = autoLayoutPositions[draggedId]?.x ?? canvasPadding + (draggedTask.depth || 0) * levelGap;
    setNodePositions((current) => ({
      ...current,
      [draggedId]: {
        ...(current[draggedId] || { y: canvasPadding }),
        x: snappedX,
      },
    }));

    const siblings = (childrenByParent.get(draggedTask.parent_task_id || null) || []).filter((task) => canvasTaskIds.has(task.id));
    const ordered = [...siblings].sort((a, b) => (nodePositions[a.id]?.y || 0) - (nodePositions[b.id]?.y || 0));
    const changedOrders = ordered
      .map((task, index) => ({ task, sortOrder: index }))
      .filter(({ task, sortOrder }) => sortOrder !== (task.sort_order || 0));

    if (changedOrders.length > 0) {
      try {
        await Promise.all(changedOrders.map(({ task, sortOrder }) => api.updateTask({ id: task.id, sortOrder })));
        setTasks((current) =>
          current.map((task) => {
            const changed = changedOrders.find((item) => item.task.id === task.id);
            return changed ? { ...task, sort_order: changed.sortOrder } : task;
          })
        );
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
    const topicId = parentTask?.topic_id || selectedTopicId;
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
        startDate: taskDraft.startDate || undefined,
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
    await handleUpdateTask(task.id, { status });
  };

  const handleUpdateTask = async (taskId: string, input: { status?: ApiTaskStatus; startDate?: string | null; deadline?: string | null }) => {
    try {
      await api.updateTask({ id: taskId, ...input });
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái.');
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    if (!window.confirm('Lưu trữ nhiệm vụ này?')) return;

    try {
      await api.deleteTask(taskId);
      setSelectedTaskId((current) => (current === taskId ? selectedRootId : current));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu trữ được nhiệm vụ.');
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

            <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <StatCard label="Task hoàn thành" value={stats.completedLeafTasks} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
              <StatCard label="Chưa hoàn thành" value={stats.incompleteLeafTasks} icon={<Circle className="h-4 w-4 text-slate-500" />} />
              <StatCard label="Đang thực hiện" value={stats.inProgressTasks} icon={<GitBranch className="h-4 w-4 text-blue-600" />} />
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
                  {connectorGroups.map((group) => {
                    const parent = nodePositions[group.parentId];
                    const children = group.childIds
                      .map((childId) => ({ id: childId, position: nodePositions[childId] }))
                      .filter((child): child is { id: string; position: NodePosition } => Boolean(child.position));
                    if (!parent || children.length === 0) return null;

                    const parentAnchorX = parent.x + nodeWidth;
                    const parentAnchorY = parent.y + nodeHeight / 2;
                    const firstChildX = Math.min(...children.map((child) => child.position.x));
                    const preferredTrunkX = parentAnchorX + connectorSpineOffset;
                    const maxTrunkX = firstChildX - connectorChildInset;
                    const trunkX = Math.max(parentAnchorX + 64, Math.min(preferredTrunkX, maxTrunkX));
                    const childYs = children.map((child) => child.position.y + nodeHeight / 2);
                    const minSpineY = Math.min(parentAnchorY, ...childYs);
                    const maxSpineY = Math.max(parentAnchorY, ...childYs);

                    return (
                      <g key={group.parentId} stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
                        <path d={`M ${parentAnchorX} ${parentAnchorY} H ${trunkX}`} />
                        {(children.length > 1 || childYs[0] !== parentAnchorY) && <path d={`M ${trunkX} ${minSpineY} V ${maxSpineY}`} />}
                        {children.map((child) => {
                          const childAnchorY = child.position.y + nodeHeight / 2;
                          return <path key={child.id} d={`M ${trunkX} ${childAnchorY} H ${child.position.x}`} />;
                        })}
                        <circle cx={trunkX} cy={parentAnchorY} r="2.5" fill="#94a3b8" stroke="none" />
                      </g>
                    );
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
          completion={selectedTask ? getCompletionPercent(selectedTask) : 0}
          onArchive={handleArchiveTask}
          onAddChild={() => selectedTask && openTaskModal(selectedTask.id)}
          onUpdateTask={handleUpdateTask}
          onToggleTask={handleToggleLeaf}
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
            <Field label="Ngày thực hiện">
              <input type="datetime-local" value={taskDraft.startDate} onChange={(event) => setTaskDraft({ ...taskDraft, startDate: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Deadline">
              <input type="datetime-local" value={taskDraft.deadline} onChange={(event) => setTaskDraft({ ...taskDraft, deadline: event.target.value })} className={inputClass} />
            </Field>
            {taskDraft.parentTaskId && <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">Task con sẽ nằm dưới: {taskById.get(taskDraft.parentTaskId)?.title}</p>}
            <button disabled={isLoading} className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Lưu task</button>
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
  const taskDone = isTaskDone(task);
  const taskInProgress = isTaskInProgress(task);
  const taskBackground = taskDone ? completedTaskBackground : taskInProgress ? inProgressTaskBackground : pendingTaskBackground;
  const taskBorderClass = taskDone ? 'border-emerald-300' : taskInProgress ? 'border-blue-300' : 'border-slate-200';

  return (
    <div
      className="absolute z-10"
      style={{ width: nodeWidth, height: nodeHeight, transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseDown={onSelect}
    >
      <div
        className={`h-full rounded-md border p-3 text-left shadow-sm transition hover:border-blue-300 ${
          isSelected ? 'border-blue-500 ring-2 ring-blue-100' : taskBorderClass
        }`}
        style={{ background: taskBackground }}
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
              {taskDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className={`h-4 w-4 ${taskInProgress ? 'text-blue-600' : ''}`} />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{task.title}</p>
              <p className="mt-1 text-xs text-slate-500">Bắt đầu: {formatDate(task.start_date, 'Chưa có ngày')}</p>
              <p className="text-xs text-slate-500">Hạn: {formatDate(task.deadline)}</p>
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
          <div className={`h-full rounded-full ${taskDone ? 'bg-emerald-600' : taskInProgress ? 'bg-blue-600' : 'bg-blue-500'}`} style={{ width: `${completion}%` }} />
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
  completion,
  onArchive,
  onAddChild,
  onUpdateTask,
  onToggleTask,
}: {
  selectedTask: ApiTask | null;
  selectedTaskChildren: ApiTask[];
  completion: number;
  onArchive: (taskId: string) => void;
  onAddChild: () => void;
  onUpdateTask: (taskId: string, input: { status?: ApiTaskStatus; startDate?: string | null; deadline?: string | null }) => Promise<void>;
  onToggleTask: (task: ApiTask) => void;
}) {
  const canToggleSelectedTask = selectedTaskChildren.length === 0;

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
            <InfoRow label="Ngày thực hiện" value={formatDate(selectedTask.start_date, 'Chưa có ngày')} />
            <InfoRow label="Deadline" value={formatDate(selectedTask.deadline)} />
            <InfoRow label="Trạng thái" value={getTaskStatusLabel(selectedTask.effective_status)} />
            <InfoRow label="Task con" value={String(selectedTaskChildren.length)} />
          </div>

          <div className="mb-4 space-y-3 rounded-md border border-slate-200 p-3">
            <Field label="Ngày thực hiện">
              <input
                type="datetime-local"
                value={toDateTimeInputValue(selectedTask.start_date)}
                onChange={(event) => onUpdateTask(selectedTask.id, { startDate: event.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field label="Deadline">
              <input
                type="datetime-local"
                value={toDateTimeInputValue(selectedTask.deadline)}
                onChange={(event) => onUpdateTask(selectedTask.id, { deadline: event.target.value || null })}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mb-4 rounded-md border border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Trạng thái task</h3>
              <span className={'rounded-full px-2 py-1 text-xs font-medium ' + (selectedTask.effective_status === 'completed' ? 'bg-emerald-50 text-emerald-700' : selectedTask.effective_status === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                {getTaskStatusLabel(selectedTask.effective_status)}
              </span>
            </div>
            {canToggleSelectedTask ? (
              <div className="space-y-2">
                <select
                  value={selectedTask.status}
                  onChange={(event) => onUpdateTask(selectedTask.id, { status: event.target.value as ApiTaskStatus })}
                  className={inputClass}
                >
                  <option value="not_completed">Chưa hoàn thành</option>
                  <option value="in_progress">Đang thực hiện</option>
                  <option value="completed">Hoàn thành</option>
                </select>
                <button
                  type="button"
                  onClick={() => onToggleTask(selectedTask)}
                  className={'w-full rounded-md px-3 py-2 text-sm font-semibold transition ' + (selectedTask.status === 'completed' ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-emerald-600 text-white hover:bg-emerald-700')}
                >
                  {selectedTask.status === 'completed' ? 'Mở lại task' : 'Đánh dấu hoàn thành'}
                </button>
              </div>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Task cha tự hoàn thành khi toàn bộ task con hoàn thành.
              </p>
            )}
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Tiến độ cây</h3>
              <span className="text-sm font-medium text-blue-600">{completion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: completion + '%' }} />
            </div>
          </div>

          <button onClick={onAddChild} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Thêm task con
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-500">
          <Folder className="mb-3 h-8 w-8" />
          <p className="text-sm font-medium">Chọn một task để xem chi tiết</p>
          <p className="mt-1 text-xs">Inspector sẽ hiển thị task con và tiến độ.</p>
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
