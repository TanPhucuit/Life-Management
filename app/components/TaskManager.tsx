'use client';

import { FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Folder,
  FolderPlus,
  GitBranch,
  MoreHorizontal,
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

const nodeWidth = 300;
const nodeHeight = 156;
const compactNodeWidth = 225;
const compactNodeHeight = 117;
const levelGap = 470;
const siblingGap = 214;
const canvasPadding = 48;
const canvasMinWidth = 2200;
const canvasMinHeight = 1400;
const canvasExpansionPadding = 900;
const autoPanThreshold = 80;
const autoPanStep = 28;
const connectorSpineOffset = 118;
const connectorChildInset = 74;
const connectorRadius = 14;

function isCompactTaskNode(task: Pick<ApiTask, 'depth'>) {
  return (task.depth || 0) >= 2;
}

function getTaskNodeSize(task: Pick<ApiTask, 'depth'>) {
  return isCompactTaskNode(task)
    ? { width: compactNodeWidth, height: compactNodeHeight }
    : { width: nodeWidth, height: nodeHeight };
}
const taskThemes = {
  incomplete: {
    background: '#FFFFFF',
    border: '#E2E8F0',
    text: '#334155',
    muted: '#64748B',
    chipBackground: '#F1F5F9',
    chipText: '#64748B',
    progress: '#94A3B8',
    connector: '#94A3B8',
    selected: '#2563EB',
    shadow: 'rgba(15, 23, 42, 0.06)',
    markerId: 'task-arrow-slate',
  },
  inProgress: {
    background: '#EFF6FF',
    border: '#93C5FD',
    text: '#1E3A8A',
    muted: '#475569',
    chipBackground: '#DBEAFE',
    chipText: '#1D4ED8',
    progress: '#3B82F6',
    connector: '#3B82F6',
    selected: '#2563EB',
    shadow: 'rgba(59, 130, 246, 0.12)',
    markerId: 'task-arrow-blue',
  },
  completed: {
    background: '#ECFDF5',
    border: '#86EFAC',
    text: '#14532D',
    muted: '#475569',
    chipBackground: '#DCFCE7',
    chipText: '#15803D',
    progress: '#22C55E',
    connector: '#22C55E',
    selected: '#16A34A',
    shadow: 'rgba(34, 197, 94, 0.12)',
    markerId: 'task-arrow-green',
  },
  overdue: {
    background: '#FEF2F2',
    border: '#FCA5A5',
    text: '#7F1D1D',
    muted: '#64748B',
    chipBackground: '#FEE2E2',
    chipText: '#DC2626',
    progress: '#EF4444',
    connector: '#EF4444',
    selected: '#DC2626',
    shadow: 'rgba(239, 68, 68, 0.12)',
    markerId: 'task-arrow-red',
  },
};
type TaskTheme = (typeof taskThemes)[keyof typeof taskThemes];

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const formatDate = (value?: string | null, emptyLabel = 'Chưa có hạn') => {
  if (!value) return emptyLabel;
  return new Date(value).toLocaleDateString('vi-VN');
};

const isTaskDone = (task: ApiTask) => task.effective_status === 'completed' || task.status === 'completed';
const isTaskInProgress = (task: ApiTask) => !isTaskDone(task) && task.status === 'in_progress';
const isTaskOverdue = (task: ApiTask) => {
  if (!task.deadline || isTaskDone(task)) return false;
  return new Date(task.deadline) < new Date();
};

const getTaskTone = (task: ApiTask): keyof typeof taskThemes => {
  if (isTaskDone(task)) return 'completed';
  if (isTaskOverdue(task)) return 'overdue';
  if (isTaskInProgress(task)) return 'inProgress';
  return 'incomplete';
};

const getTaskStatusLabel = (status?: ApiTaskStatus) => {
  if (status === 'completed') return 'Hoàn thành';
  if (status === 'in_progress') return 'Đang thực hiện';
  return 'Chưa hoàn thành';
};

const getTaskDisplayStatus = (task: ApiTask) => {
  if (isTaskOverdue(task)) return 'Quá hạn';
  return getTaskStatusLabel(task.effective_status || task.status);
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
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);

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

      setSelectedTaskId((current) => {
        if (current && taskRows.some((task) => task.id === current && task.topic_id === nextTopicId)) return current;
        return taskRows.find((task) => !task.parent_task_id && task.topic_id === nextTopicId)?.id || null;
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

  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;
  const selectedTaskChildren = selectedTask ? childrenByParent.get(selectedTask.id) || [] : [];

  const canvasTasks = useMemo(() => {
    const baseTasks = topicScopedTasks;
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
  }, [searchTerm, taskById, topicScopedTasks]);

  const canvasTaskIds = useMemo(() => new Set(canvasTasks.map((task) => task.id)), [canvasTasks]);
  const layoutStorageKey = user?.id && selectedTopicId ? `life-manager-task-layout:v2:${user.id}:topic:${selectedTopicId}` : null;

  const autoLayoutPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    const visibleRoots = rootTasks.filter((root) => canvasTaskIds.has(root.id));
    if (visibleRoots.length === 0) return positions;

    let leafIndex = 0;
    const place = (task: ApiTask, depth: number): number => {
      const currentSize = getTaskNodeSize({ depth });
      const visibleChildren = (childrenByParent.get(task.id) || []).filter((child) => canvasTaskIds.has(child.id));
      if (visibleChildren.length === 0) {
        const y = canvasPadding + leafIndex * siblingGap;
        positions[task.id] = { x: canvasPadding + depth * levelGap, y };
        leafIndex += 1;
        return y + currentSize.height / 2;
      }

      const childCenters = visibleChildren.map((child) => place(child, depth + 1));
      const y = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length - currentSize.height / 2;
      positions[task.id] = { x: canvasPadding + depth * levelGap, y };
      return y + currentSize.height / 2;
    };

    visibleRoots.forEach((root, index) => {
      if (index > 0) leafIndex += 1;
      place(root, 0);
    });
    return positions;
  }, [canvasTaskIds, childrenByParent, rootTasks]);

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
    const positionedTasks = canvasTasks
      .map((task) => ({ task, position: nodePositions[task.id] }))
      .filter((item): item is { task: ApiTask; position: NodePosition } => Boolean(item.position));
    const maxX = Math.max(
      canvasMinWidth,
      ...positionedTasks.map(({ task, position }) => position.x + getTaskNodeSize(task).width + canvasExpansionPadding)
    );
    const maxY = Math.max(
      canvasMinHeight,
      ...positionedTasks.map(({ task, position }) => position.y + getTaskNodeSize(task).height + canvasExpansionPadding)
    );
    return { width: maxX, height: maxY };
  }, [canvasTasks, nodePositions]);

  const scaledCanvasSize = useMemo(
    () => ({
      width: Math.ceil(canvasSize.width * canvasZoom),
      height: Math.ceil(canvasSize.height * canvasZoom),
    }),
    [canvasSize.height, canvasSize.width, canvasZoom]
  );

  const updateCanvasZoom = (nextZoom: number) => {
    setCanvasZoom(Math.min(1.6, Math.max(0.5, Math.round(nextZoom * 10) / 10)));
  };

  useEffect(() => {
    const isZoomOutShortcut = (event: KeyboardEvent) => event.code === 'Minus' || event.code === 'NumpadSubtract' || event.key === '-' || event.key === '_';
    const isZoomInShortcut = (event: KeyboardEvent) => event.code === 'Equal' || event.code === 'NumpadAdd' || event.key === '+' || event.key === '=';
    const isZoomResetShortcut = (event: KeyboardEvent) => event.code === 'Digit0' || event.code === 'Numpad0' || event.key === '0';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (isZoomOutShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        setCanvasZoom((current) => Math.min(1.6, Math.max(0.5, Math.round((current - 0.1) * 10) / 10)));
      }
      if (isZoomInShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        setCanvasZoom((current) => Math.min(1.6, Math.max(0.5, Math.round((current + 0.1) * 10) / 10)));
      }
      if (isZoomResetShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        setCanvasZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleCanvasWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      setCanvasZoom((current) => {
        const direction = event.deltaY > 0 ? -0.1 : 0.1;
        return Math.min(1.6, Math.max(0.5, Math.round((current + direction) * 10) / 10));
      });
    };

    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false, capture: true });
    return () => canvas.removeEventListener('wheel', handleCanvasWheel, { capture: true });
  }, []);

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
    setSelectedTaskId(firstRoot?.id || null);
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

  const handleTopScroll = () => {
    if (!topScrollRef.current || !canvasRef.current) return;
    canvasRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  };

  const handleCanvasScroll = () => {
    if (!topScrollRef.current || !canvasRef.current) return;
    if (topScrollRef.current.scrollLeft !== canvasRef.current.scrollLeft) {
      topScrollRef.current.scrollLeft = canvasRef.current.scrollLeft;
    }
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
      offsetX: (event.clientX - canvasRect.left + (canvasRef.current?.scrollLeft || 0)) / canvasZoom - currentPosition.x,
      offsetY: (event.clientY - canvasRect.top + (canvasRef.current?.scrollTop || 0)) / canvasZoom - currentPosition.y,
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

    if (topScrollRef.current && topScrollRef.current.scrollLeft !== canvas.scrollLeft) {
      topScrollRef.current.scrollLeft = canvas.scrollLeft;
    }

    const nextX = (event.clientX - canvasRect.left + canvas.scrollLeft) / canvasZoom - dragState.offsetX;
    const nextY = (event.clientY - canvasRect.top + canvas.scrollTop) / canvasZoom - dragState.offsetY;

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
      setSelectedTaskId((current) => (current === taskId ? null : current));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu trữ được nhiệm vụ.');
    }
  };

  return (
    <div className="overflow-visible rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm lg:min-h-[calc(100vh-120px)] lg:overflow-hidden">
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-120px)] lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="flex min-w-0 flex-col">
          <header className="border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-xl font-semibold">Nhiệm vụ</h1>
                <p className="text-sm text-slate-500">Canvas task tree kéo thả tự do, có đường nối trực tiếp giữa node cha và node con.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <form onSubmit={handleCreateTopic} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
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
                  onClick={() => openTaskModal(null)}
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

            {errorMessage && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
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
            onScroll={handleCanvasScroll}
            className="relative h-[64vh] min-h-[460px] overflow-auto bg-slate-50 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto"
          >
            <div className="sticky left-0 top-0 z-20 min-w-max border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:px-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resetCanvasLayout}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LocateFixed className="h-4 w-4" />
                  Auto layout
                </button>
                <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white text-sm">
                  <button type="button" onClick={() => updateCanvasZoom(canvasZoom - 0.1)} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50">-</button>
                  <button type="button" onClick={() => updateCanvasZoom(1)} className="border-x border-slate-200 px-3 py-1.5 font-medium text-slate-700">{Math.round(canvasZoom * 100)}%</button>
                  <button type="button" onClick={() => updateCanvasZoom(canvasZoom + 0.1)} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50">+</button>
                </div>
                <span className="text-xs text-slate-500">Ctrl + - / Ctrl + + để zoom. Kéo node để sắp xếp theo vị trí dọc.</span>
              </div>
              <div ref={topScrollRef} onScroll={handleTopScroll} className="h-3 overflow-x-auto overflow-y-hidden">
                <div style={{ width: scaledCanvasSize.width, height: 1 }} />
              </div>
            </div>

            {canvasTasks.length === 0 ? (
              <div className="m-4 flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
                Chưa có task trong root này.
              </div>
            ) : (
              <div className="relative" style={{ width: scaledCanvasSize.width, height: scaledCanvasSize.height }}>
                <div className="absolute left-0 top-0" style={{ width: canvasSize.width, height: canvasSize.height, transform: `scale(${canvasZoom})`, transformOrigin: '0 0' }}>
                <svg className="pointer-events-none absolute inset-0 z-0" width={canvasSize.width} height={canvasSize.height}>
                  <defs>
                    {[
                      ['task-arrow-slate', taskThemes.incomplete.connector],
                      ['task-arrow-blue', taskThemes.inProgress.connector],
                      ['task-arrow-green', taskThemes.completed.connector],
                      ['task-arrow-red', taskThemes.overdue.connector],
                    ].map(([id, color]) => (
                      <marker key={id} id={id} markerWidth="7" markerHeight="7" refX="6.2" refY="3.5" orient="auto" markerUnits="strokeWidth">
                        <path d="M 0 0 L 7 3.5 L 0 7 z" fill={color} />
                      </marker>
                    ))}
                  </defs>
                  {connectorGroups.map((group) => {
                    const parentTask = taskById.get(group.parentId);
                    const parent = nodePositions[group.parentId];
                    const children = group.childIds
                      .map((childId) => ({ task: taskById.get(childId), position: nodePositions[childId] }))
                      .filter((child): child is { task: ApiTask; position: NodePosition } => Boolean(child.task && child.position));
                    if (!parentTask || !parent || children.length === 0) return null;
                    const connectorTheme = taskThemes[getTaskTone(parentTask)];
                    const parentSize = getTaskNodeSize(parentTask);

                    const parentAnchorX = parent.x + parentSize.width;
                    const parentAnchorY = parent.y + parentSize.height / 2;
                    const firstChildX = Math.min(...children.map((child) => child.position.x));
                    const preferredTrunkX = parentAnchorX + connectorSpineOffset;
                    const maxTrunkX = firstChildX - connectorChildInset;
                    const trunkX = Math.max(parentAnchorX + 64, Math.min(preferredTrunkX, maxTrunkX));
                    const childYs = children.map((child) => child.position.y + getTaskNodeSize(child.task).height / 2);
                    const minSpineY = Math.min(parentAnchorY, ...childYs);
                    const maxSpineY = Math.max(parentAnchorY, ...childYs);

                    return (
                      <g key={group.parentId} stroke={connectorTheme.connector} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.76">
                        <path d={`M ${parentAnchorX} ${parentAnchorY} H ${Math.max(parentAnchorX, trunkX - connectorRadius)} Q ${trunkX} ${parentAnchorY} ${trunkX} ${parentAnchorY}`} />
                        {(children.length > 1 || childYs[0] !== parentAnchorY) && <path d={`M ${trunkX} ${minSpineY} V ${maxSpineY}`} />}
                        {children.map((child) => {
                          const childAnchorY = child.position.y + getTaskNodeSize(child.task).height / 2;
                          const arrowEndX = child.position.x - 6;
                          return (
                            <path
                              key={child.task.id}
                              d={`M ${trunkX} ${childAnchorY} H ${arrowEndX}`}
                              markerEnd={`url(#${connectorTheme.markerId})`}
                            />
                          );
                        })}
                        <circle cx={trunkX} cy={parentAnchorY} r="2.4" fill={connectorTheme.connector} stroke="none" />
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
                      depth={task.depth || 0}
                      onSelect={() => setSelectedTaskId(task.id)}
                      onDragStart={(event) => startDrag(event, task.id)}
                      onToggle={() => handleToggleLeaf(task)}
                      onAddChild={() => openTaskModal(task.id)}
                    />
                  );
                })}
                </div>
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
  depth,
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
  depth: number;
  onSelect: () => void;
  onDragStart: (event: ReactMouseEvent) => void;
  onToggle: () => void;
  onAddChild: () => void;
}) {
  const taskDone = isTaskDone(task);
  const taskOverdue = isTaskOverdue(task);
  const theme = taskThemes[getTaskTone(task)];
  const completedCount = task.completed_leaf_count || (taskDone ? 1 : 0);
  const totalCount = task.leaf_count || 1;
  const statusLabel = getTaskDisplayStatus(task);
  const isCompact = depth >= 2;
  const nodeSize = getTaskNodeSize({ depth });

  if (isCompact) {
    return (
      <div
        className="group absolute z-10"
        style={{ width: nodeSize.width, height: nodeSize.height, transform: `translate(${position.x}px, ${position.y}px)` }}
        onMouseDown={onSelect}
      >
        <div
          className="relative h-full overflow-hidden rounded-xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          style={{
            background: theme.background,
            borderColor: isSelected ? theme.selected : theme.border,
            color: theme.text,
            boxShadow: isSelected ? `0 0 0 2px ${theme.selected}22, 0 10px 24px ${theme.shadow}` : `0 1px 2px ${theme.shadow}`,
          }}
        >
          <div className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: theme.progress }} />

          <div className="mb-1.5 flex items-start justify-between gap-1.5 pl-1">
            <div className="flex min-w-0 items-start gap-1.5">
              {hasChildren ? (
                <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full" style={{ background: theme.chipBackground, color: theme.chipText }} title="Task cha tự tính trạng thái">
                  {taskDone ? <CheckCircle2 className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                  className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full transition hover:scale-105"
                  style={{ background: theme.chipBackground, color: theme.chipText }}
                  title="Đổi trạng thái"
                >
                  {taskDone ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                </button>
              )}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold leading-4" style={{ color: theme.text }}>
                  {task.title}
                </p>
                <span className="mt-0.5 inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-3.5" style={{ background: theme.chipBackground, color: theme.chipText }}>
                  {statusLabel}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddChild();
                }}
                className="grid h-[22px] w-[22px] place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-500 opacity-80 transition hover:bg-white hover:text-slate-900 group-hover:opacity-100"
                title="Thêm task con"
              >
                <Plus className="h-3 w-3" />
              </button>
              <button
                type="button"
                onMouseDown={onDragStart}
                className="grid h-[22px] w-[22px] cursor-grab place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-500 opacity-80 transition hover:bg-white hover:text-slate-900 active:cursor-grabbing group-hover:opacity-100"
                title="Kéo node"
              >
                <Move className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="mb-1.5 flex flex-wrap gap-1 pl-1">
            <TaskMetaChip icon={<CalendarDays className="h-2.5 w-2.5" />} label={formatDate(task.deadline)} theme={taskOverdue ? taskThemes.overdue : taskThemes.incomplete} compact />
            {task.start_date && <TaskMetaChip icon={<CalendarDays className="h-2.5 w-2.5" />} label={formatDate(task.start_date)} theme={taskThemes.inProgress} compact />}
            <TaskMetaChip icon={<GitBranch className="h-2.5 w-2.5" />} label={`${task.child_count || 0} con`} theme={taskThemes.incomplete} compact />
          </div>

          <div className="pl-1">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px]" style={{ color: theme.muted }}>
              <span>{completion}%</span>
              <span>{completedCount}/{totalCount}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div className="h-full rounded-full transition-all" style={{ width: `${completion}%`, background: theme.progress }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group absolute z-10"
      style={{ width: nodeSize.width, height: nodeSize.height, transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseDown={onSelect}
    >
      <div
        className="relative h-full overflow-hidden rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        style={{
          background: theme.background,
          borderColor: isSelected ? theme.selected : theme.border,
          color: theme.text,
          boxShadow: isSelected ? `0 0 0 2px ${theme.selected}22, 0 10px 26px ${theme.shadow}` : `0 1px 2px ${theme.shadow}`,
        }}
      >
        <div className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: theme.progress }} />

        <div className="mb-2.5 flex items-start justify-between gap-2 pl-1">
          <div className="flex min-w-0 items-start gap-2">
            {hasChildren ? (
              <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full" style={{ background: theme.chipBackground, color: theme.chipText }} title="Task cha tự tính trạng thái">
                {taskDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}
              </span>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
                className="mt-0.5 grid h-5 w-5 place-items-center rounded-full transition hover:scale-105"
                style={{ background: theme.chipBackground, color: theme.chipText }}
                title="Đổi trạng thái"
              >
                {taskDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              </button>
            )}
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-5" style={{ color: theme.text }}>{task.title}</p>
              <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: theme.chipBackground, color: theme.chipText }}>
                {statusLabel}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild();
              }}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-500 opacity-80 transition hover:bg-white hover:text-slate-900 group-hover:opacity-100"
              title="Thêm task con"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={onDragStart}
              className="grid h-7 w-7 cursor-grab place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-500 opacity-80 transition hover:bg-white hover:text-slate-900 active:cursor-grabbing group-hover:opacity-100"
              title="Kéo node"
            >
              <Move className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-900 group-hover:opacity-100"
              title="Tùy chọn"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mb-2.5 flex flex-wrap gap-1.5 pl-1">
          <TaskMetaChip icon={<CalendarDays className="h-3 w-3" />} label={`Hạn: ${formatDate(task.deadline)}`} theme={taskOverdue ? taskThemes.overdue : taskThemes.incomplete} />
          {task.start_date && <TaskMetaChip icon={<CalendarDays className="h-3 w-3" />} label={`Bắt đầu: ${formatDate(task.start_date)}`} theme={taskThemes.inProgress} />}
          <TaskMetaChip icon={<GitBranch className="h-3 w-3" />} label={`${task.child_count || 0} con`} theme={taskThemes.incomplete} />
        </div>

        <div className="mb-2 pl-1">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.muted }}>
            <span>{completion}%</span>
            <span>{completedCount}/{totalCount} hoàn thành</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div className="h-full rounded-full transition-all" style={{ width: `${completion}%`, background: theme.progress }} />
          </div>
        </div>

        <div className="flex items-center justify-between pl-1 text-[11px]" style={{ color: theme.muted }}>
          <span>{hasChildren ? 'Task cha · trạng thái tự tính' : 'Task con · có thể tick hoàn thành'}</span>
        </div>
      </div>
    </div>
  );
}

function TaskMetaChip({ icon, label, theme, compact = false }: { icon: ReactNode; label: string; theme: TaskTheme; compact?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-medium ${compact ? 'px-1.5 py-0.5 text-[9px] leading-[14px]' : 'px-2 py-0.5 text-[11px] leading-4'}`}
      style={{ background: theme.chipBackground, color: theme.chipText }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
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
    <aside className="max-h-[72vh] overflow-y-auto border-t border-slate-200 bg-white p-3 pb-20 sm:p-4 lg:max-h-none lg:border-l lg:border-t-0 lg:pb-4">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-4">
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:p-5">
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
