'use client';

import { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api, ApiTask, ApiTaskStatus, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { getTopicColorByName, topicColorPalette } from '@/app/lib/topicColors';
import TaskTableView from './TaskTableView';

type TaskDraft = {
  title: string;
  description: string;
  startDate: string;
  deadline: string;
  parentTaskId: string | null;
  topicId: string | null;
};

type NodePosition = { x: number; y: number };
type DragState = { taskId: string; offsetX: number; offsetY: number };
type TaskContextMenu = { taskId: string; x: number; y: number };
type TaskWorkspaceView = 'tree' | 'table';
export type TaskWorkspaceVariant = 'legacy' | 'desktop-cinematic';
type DiagramNodeKind = 'topic' | 'task';
type DiagramNode = {
  id: string;
  kind: DiagramNodeKind;
  title: string;
  depth: number;
  task?: ApiTask;
  topic?: ApiTopic;
};

const topicNodeId = (topicId: string) => `topic:${topicId}`;

const emptyTaskDraft: TaskDraft = { title: '', description: '', startDate: '', deadline: '', parentTaskId: null, topicId: null };

const nodeWidth = 220;
const nodeHeight = 78;
const levelTwoNodeWidth = Math.round(nodeWidth * 0.75);
const levelTwoNodeHeight = Math.round(nodeHeight * 0.75);
const compactNodeWidth = Math.round(levelTwoNodeWidth * 0.5);
const compactNodeHeight = Math.round(levelTwoNodeHeight * 0.5);
const levelGap = 96;
const siblingGap = 74;
const canvasPadding = 48;
const canvasMinWidth = 2200;
const canvasMinHeight = 1400;
const canvasExpansionPadding = 900;
const autoPanThreshold = 80;
const autoPanStep = 28;
const connectorSpineOffset = 56;
const connectorChildInset = 24;
const connectorRadius = 10;

function getNodeSize(node: Pick<DiagramNode, 'depth' | 'title'>) {
  const depth = node.depth || 0;
  const titleLength = Math.max(node.title?.length || 0, 1);
  if (depth >= 2) {
    const width = Math.min(180, compactNodeWidth + Math.max(0, titleLength - 4) * 6);
    const charsPerLine = titleLength <= 12 ? titleLength : Math.max(12, Math.floor((width - 42) / 6));
    const lineCount = titleLength <= 12 ? 1 : Math.ceil(titleLength / charsPerLine);
    return { width, height: compactNodeHeight + Math.max(0, lineCount - 1) * 12 };
  }
  if (depth === 1) {
    const width = Math.min(280, levelTwoNodeWidth + Math.max(0, titleLength - 4) * 6);
    const charsPerLine = titleLength <= 12 ? titleLength : Math.max(12, Math.floor((width - 56) / 7));
    const lineCount = titleLength <= 12 ? 1 : Math.ceil(titleLength / charsPerLine);
    return { width, height: levelTwoNodeHeight + Math.max(0, lineCount - 1) * 15 };
  }
  const width = Math.min(340, nodeWidth + Math.max(0, titleLength - 4) * 6);
  const charsPerLine = titleLength <= 12 ? titleLength : Math.max(12, Math.floor((width - 68) / 7));
  const lineCount = titleLength <= 12 ? 1 : Math.ceil(titleLength / charsPerLine);
  return { width, height: nodeHeight + Math.max(0, lineCount - 1) * 16 };
}
const taskThemes = {
  incomplete: {
    background: 'var(--surface-raised)',
    border: 'var(--border-strong)',
    text: 'var(--foreground)',
    muted: 'var(--foreground-muted)',
    chipBackground: 'var(--surface-soft)',
    chipText: 'var(--foreground-muted)',
    progress: 'var(--foreground-subtle)',
    connector: 'var(--foreground-subtle)',
    selected: 'var(--primary)',
    shadow: 'rgba(15, 23, 42, 0.06)',
    markerId: 'task-arrow-slate',
  },
  inProgress: {
    background: 'var(--primary-soft)',
    border: 'var(--primary)',
    text: 'var(--foreground)',
    muted: 'var(--foreground-muted)',
    chipBackground: 'var(--surface-raised)',
    chipText: 'var(--primary)',
    progress: 'var(--primary)',
    connector: 'var(--primary)',
    selected: 'var(--primary)',
    shadow: 'rgba(59, 130, 246, 0.12)',
    markerId: 'task-arrow-blue',
  },
  completed: {
    background: 'var(--accent-soft)',
    border: 'var(--accent)',
    text: 'var(--foreground)',
    muted: 'var(--foreground-muted)',
    chipBackground: 'var(--surface-raised)',
    chipText: 'var(--accent)',
    progress: 'var(--accent)',
    connector: 'var(--accent)',
    selected: 'var(--accent)',
    shadow: 'rgba(34, 197, 94, 0.12)',
    markerId: 'task-arrow-green',
  },
  overdue: {
    background: 'var(--danger-soft)',
    border: 'var(--danger)',
    text: 'var(--foreground)',
    muted: 'var(--foreground-muted)',
    chipBackground: 'var(--surface-raised)',
    chipText: 'var(--danger)',
    progress: 'var(--danger)',
    connector: 'var(--danger)',
    selected: 'var(--danger)',
    shadow: 'rgba(239, 68, 68, 0.12)',
    markerId: 'task-arrow-red',
  },
};
type TaskTheme = (typeof taskThemes)[keyof typeof taskThemes];

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const formatDate = (value?: string | null, emptyLabel = 'No deadline') => {
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
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Not completed';
};

const toDateTimeInputValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

export default function TaskManager({ variant = 'legacy' }: { variant?: TaskWorkspaceVariant }) {
  const { user } = useAppStore();
  const isDesktopCinematic = variant === 'desktop-cinematic';
  const reducedMotion = Boolean(useReducedMotion());
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const titleLayoutSignatureRef = useRef('');
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [editingTopic, setEditingTopic] = useState<ApiTopic | null>(null);
  const [topicNameDraft, setTopicNameDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [taskContextMenu, setTaskContextMenu] = useState<TaskContextMenu | null>(null);
  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [workspaceView, setWorkspaceView] = useState<TaskWorkspaceView>(() => isDesktopCinematic ? 'table' : 'tree');

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
      setErrorMessage(error instanceof Error ? error.message : 'Could not load tasks.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!taskContextMenu) return;

    const closeMenu = () => setTaskContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [taskContextMenu]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ApiTask[]>();
    tasks.forEach((task) => {
      const parentId = task.parent_task_id || null;
      map.set(parentId, [...(map.get(parentId) || []), task]);
    });
    map.forEach((items) => items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return map;
  }, [tasks]);

  const rootTasks = useMemo(() => childrenByParent.get(null) || [], [childrenByParent]);
  const selectedRootTopic = topics.find((topic) => topic.id === selectedTopicId) || null;

  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;
  const selectedTaskChildren = selectedTask ? childrenByParent.get(selectedTask.id) || [] : [];

  const diagramNodes = useMemo<DiagramNode[]>(() => {
    const search = searchTerm.trim().toLowerCase();
    const visibleTaskIds = new Set<string>();
    const tasksInSelectedRoot = selectedTopicId
      ? tasks.filter((task) => task.topic_id === selectedTopicId)
      : [];

    if (search) {
      if (selectedRootTopic?.name.toLowerCase().includes(search)) {
        tasksInSelectedRoot.forEach((task) => visibleTaskIds.add(task.id));
      }

      tasksInSelectedRoot.forEach((task) => {
        const matches = task.title.toLowerCase().includes(search) || task.description?.toLowerCase().includes(search);
        if (!matches) return;

        visibleTaskIds.add(task.id);
        let current = task;
        while (current.parent_task_id) {
          visibleTaskIds.add(current.parent_task_id);
          const parent = taskById.get(current.parent_task_id);
          if (!parent) break;
          current = parent;
        }
      });
    } else {
      tasksInSelectedRoot.forEach((task) => visibleTaskIds.add(task.id));
    }

    const nodes: DiagramNode[] = [];

    if (selectedRootTopic) {
      nodes.push({
        id: topicNodeId(selectedRootTopic.id),
        kind: 'topic',
        title: selectedRootTopic.name,
        depth: 0,
        topic: selectedRootTopic,
      });
    }

    tasksInSelectedRoot
      .filter((task) => visibleTaskIds.has(task.id))
      .forEach((task) => {
        nodes.push({
          id: task.id,
          kind: 'task',
          title: task.title,
          depth: (task.depth || 0) + 1,
          task,
        });
      });

    return nodes;
  }, [searchTerm, selectedRootTopic, selectedTopicId, taskById, tasks]);

  const diagramNodeById = useMemo(() => new Map(diagramNodes.map((node) => [node.id, node])), [diagramNodes]);
  const canvasNodeIds = useMemo(() => new Set(diagramNodes.map((node) => node.id)), [diagramNodes]);
  const titleLayoutSignature = useMemo(() => diagramNodes.map((node) => `${node.id}:${node.title}`).join('|'), [diagramNodes]);
  const layoutStorageKey = user?.id && selectedTopicId
    ? `life-manager-task-layout:v8:${user.id}:topic:${selectedTopicId}`
    : null;

  const diagramChildrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();

    rootTasks.forEach((task) => {
      if (task.topic_id !== selectedTopicId || !canvasNodeIds.has(task.id)) return;
      const parentTopicNodeId = topicNodeId(task.topic_id);
      map.set(parentTopicNodeId, [...(map.get(parentTopicNodeId) || []), task.id]);
    });

    tasks.forEach((task) => {
      if (!task.parent_task_id || !canvasNodeIds.has(task.id)) return;
      map.set(task.parent_task_id, [...(map.get(task.parent_task_id) || []), task.id]);
    });

    return map;
  }, [canvasNodeIds, rootTasks, selectedTopicId, tasks]);

  const autoLayoutPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    const rootNodes = diagramNodes.filter((node) => node.kind === 'topic');
    if (rootNodes.length === 0) return positions;

    let leafIndex = 0;
    const place = (node: DiagramNode, x: number): number => {
      const currentSize = getNodeSize(node);
      const visibleChildren = (diagramChildrenByParent.get(node.id) || [])
        .map((childId) => diagramNodeById.get(childId))
        .filter((child): child is DiagramNode => Boolean(child));

      if (visibleChildren.length === 0) {
        const y = canvasPadding + leafIndex * siblingGap;
        positions[node.id] = { x, y };
        leafIndex += 1;
        return y + currentSize.height / 2;
      }

      const childX = x + currentSize.width + levelGap;
      const childCenters = visibleChildren.map((child) => place(child, childX));
      const y = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length - currentSize.height / 2;
      positions[node.id] = { x, y };
      return y + currentSize.height / 2;
    };

    rootNodes.forEach((rootNode, index) => {
      if (index > 0) leafIndex += 1;
      place(rootNode, canvasPadding);
    });
    return positions;
  }, [diagramChildrenByParent, diagramNodeById, diagramNodes]);

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
      diagramNodes.forEach((node) => {
        next[node.id] = current[node.id] || savedPositions[node.id] || autoLayoutPositions[node.id] || { x: canvasPadding, y: canvasPadding };
      });
      return next;
    });
  }, [autoLayoutPositions, diagramNodes, layoutStorageKey]);

  useEffect(() => {
    if (!layoutStorageKey || diagramNodes.length === 0 || typeof window === 'undefined') return;

    const savedPositions: Record<string, NodePosition> = {};
    diagramNodes.forEach((node) => {
      if (nodePositions[node.id]) savedPositions[node.id] = nodePositions[node.id];
    });
    localStorage.setItem(layoutStorageKey, JSON.stringify(savedPositions));
  }, [diagramNodes, layoutStorageKey, nodePositions]);

  useEffect(() => {
    if (!titleLayoutSignature) return;
    if (!titleLayoutSignatureRef.current) {
      titleLayoutSignatureRef.current = titleLayoutSignature;
      return;
    }
    if (titleLayoutSignatureRef.current === titleLayoutSignature) return;
    titleLayoutSignatureRef.current = titleLayoutSignature;
    setNodePositions(autoLayoutPositions);
  }, [autoLayoutPositions, titleLayoutSignature]);

  const connectorGroups = useMemo(() => {
    return diagramNodes
      .map((node) => {
        const children = (diagramChildrenByParent.get(node.id) || [])
          .filter((childId) => canvasNodeIds.has(childId))
          .sort((a, b) => (nodePositions[a]?.y || 0) - (nodePositions[b]?.y || 0));
        return { parentId: node.id, childIds: children };
      })
      .filter((group) => group.childIds.length > 0);
  }, [canvasNodeIds, diagramChildrenByParent, diagramNodes, nodePositions]);

  const canvasSize = useMemo(() => {
    const positionedNodes = diagramNodes
      .map((node) => ({ node, position: nodePositions[node.id] }))
      .filter((item): item is { node: DiagramNode; position: NodePosition } => Boolean(item.position));
    const maxX = Math.max(
      canvasMinWidth,
      ...positionedNodes.map(({ node, position }) => position.x + getNodeSize(node).width + canvasExpansionPadding)
    );
    const maxY = Math.max(
      canvasMinHeight,
      ...positionedNodes.map(({ node, position }) => position.y + getNodeSize(node).height + canvasExpansionPadding)
    );
    return { width: maxX, height: maxY };
  }, [diagramNodes, nodePositions]);

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
    const leafTasks = tasks.filter((task) => (task.child_count || 0) === 0);
    const completedLeafTasks = leafTasks.filter((task) => task.status === 'completed' || task.effective_status === 'completed');
    const incompleteLeafTasks = leafTasks.filter((task) => task.status !== 'completed' && task.effective_status !== 'completed');
    const inProgressTasks = tasks.filter((task) => task.status === 'in_progress' || task.effective_status === 'in_progress');
    const overdueLeafTasks = leafTasks.filter((task) => task.deadline && task.status !== 'completed' && new Date(task.deadline) < new Date());

    return {
      completedLeafTasks: completedLeafTasks.length,
      incompleteLeafTasks: incompleteLeafTasks.length,
      inProgressTasks: inProgressTasks.length,
      overdueLeafTasks: overdueLeafTasks.length,
      totalTasks: tasks.length,
    };
  }, [tasks]);

  const openTopicEditor = (topic: ApiTopic) => {
    setEditingTopic(topic);
    setTopicNameDraft(topic.name);
  };

  const openTaskModal = (parentTaskId: string | null, topicId?: string | null) => {
    setTaskDraft({ ...emptyTaskDraft, parentTaskId, topicId: topicId || null });
    setIsTaskModalOpen(true);
  };

  const openTaskDetails = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskContextMenu(null);
    setIsTaskDetailsOpen(true);
  };

  const openTaskContextMenu = (event: ReactMouseEvent<HTMLElement>, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTaskId(taskId);
    setTaskContextMenu({ taskId, x: event.clientX, y: event.clientY });
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

  const startDrag = (event: ReactPointerEvent<HTMLElement>, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const currentPosition = nodePositions[taskId];
    if (!canvasRect || !currentPosition) return;

    const draggedNode = diagramNodeById.get(taskId);
    if (draggedNode?.kind === 'task') {
      setSelectedTaskId(taskId);
    } else {
      setSelectedTaskId(null);
      if (draggedNode?.topic) setSelectedTopicId(draggedNode.topic.id);
    }
    setDragState({
      taskId,
      offsetX: (event.clientX - canvasRect.left + (canvasRef.current?.scrollLeft || 0)) / canvasZoom - currentPosition.x,
      offsetY: (event.clientY - canvasRect.top + (canvasRef.current?.scrollTop || 0)) / canvasZoom - currentPosition.y,
    });
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const handleCanvasPointerUp = async () => {
    if (!dragState) return;
    const draggedId = dragState.taskId;
    setDragState(null);

    const draggedTask = taskById.get(draggedId);
    if (!draggedTask) return;

    const siblings = (childrenByParent.get(draggedTask.parent_task_id || null) || [])
      .filter((task) => task.topic_id === draggedTask.topic_id && canvasNodeIds.has(task.id));
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
        setErrorMessage(error instanceof Error ? error.message : 'Could not save task order.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the root.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTopic) return;

    const nextName = topicNameDraft.trim();
    if (!nextName) {
      setErrorMessage('Root name cannot be empty.');
      return;
    }

    if (nextName === editingTopic.name) {
      setEditingTopic(null);
      return;
    }

    try {
      setIsLoading(true);
      const updated = await api.updateTopic(editingTopic.id, { name: nextName });
      setTopics((current) => current.map((topic) => (topic.id === updated.id ? updated : topic)));
      setEditingTopic(null);
      setTopicNameDraft('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the root.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !taskDraft.title.trim()) return;

    const parentTask = taskDraft.parentTaskId ? taskById.get(taskDraft.parentTaskId) : null;
    const fallbackTopicId = topics[0]?.id || '';
    const topicId = parentTask?.topic_id || taskDraft.topicId || selectedTopicId || fallbackTopicId;
    if (!topicId) {
      setErrorMessage('Create at least one root before adding a task.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the task.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLeaf = async (task: ApiTask) => {
    if ((childrenByParent.get(task.id) || []).length > 0) return;

    const status: ApiTaskStatus = task.status === 'completed' ? 'not_completed' : 'completed';
    await handleUpdateTask(task.id, { status });
  };

  const handleUpdateTask = async (taskId: string, input: { status?: ApiTaskStatus; title?: string; startDate?: string | null; deadline?: string | null }) => {
    try {
      await api.updateTask({ id: taskId, ...input });
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update task status.');
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    if (!window.confirm('Archive this task and its subtree?')) return;

    try {
      await api.deleteTask(taskId);
      setSelectedTaskId((current) => (current === taskId ? null : current));
      setTaskContextMenu(null);
      setIsTaskDetailsOpen(false);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not archive the task.');
    }
  };

  return (
    <div
      className={`premium-card overflow-visible text-slate-950 lg:min-h-[calc(100vh-140px)] lg:overflow-hidden ${isDesktopCinematic ? 'desktop-task-workspace rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,.12)]' : ''}`}
      data-task-workspace-variant={variant}
      data-task-workspace-view={workspaceView}
    >
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-120px)]">
        <main className="flex min-w-0 flex-col">
          <header className={`border-b border-slate-200 px-3 py-4 sm:px-5 ${isDesktopCinematic ? 'bg-white/85 backdrop-blur-xl' : 'bg-transparent'}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-[-.025em]">{isDesktopCinematic ? 'Tasks' : 'Task workspace'}</h1>
                  <p className="text-sm text-slate-500">
                    {isDesktopCinematic
                      ? 'Manage every task in a clear hierarchical table or tree.'
                      : workspaceView === 'tree'
                      ? 'Choose one life root and focus on its complete task tree.'
                      : 'Each root becomes a sheet with tasks arranged by hierarchy.'}
                  </p>
                </div>
                <div className={`inline-flex w-fit shrink-0 overflow-hidden rounded-xl border border-slate-200 p-1 ${isDesktopCinematic ? 'bg-slate-100/80 shadow-inner' : 'bg-slate-50'}`} role="group" aria-label="Task view">
                  <button
                    type="button"
                    onClick={() => setWorkspaceView('tree')}
                    aria-pressed={workspaceView === 'tree'}
                    className={`relative isolate inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                      isDesktopCinematic
                        ? workspaceView === 'tree' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
                        : workspaceView === 'tree' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {isDesktopCinematic && workspaceView === 'tree' && (
                      <motion.span
                        layoutId={reducedMotion ? undefined : 'desktop-task-workspace-view'}
                        className="absolute inset-0 -z-10 rounded bg-white shadow-sm"
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
                      />
                    )}
                    <GitBranch className="relative h-3.5 w-3.5" />
                    <span className="relative">Tree</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceView('table')}
                    aria-pressed={workspaceView === 'table'}
                    className={`relative isolate inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                      isDesktopCinematic
                        ? workspaceView === 'table' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
                        : workspaceView === 'table' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {isDesktopCinematic && workspaceView === 'table' && (
                      <motion.span
                        layoutId={reducedMotion ? undefined : 'desktop-task-workspace-view'}
                        className="absolute inset-0 -z-10 rounded bg-white shadow-sm"
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
                      />
                    )}
                    <Table2 className="relative h-3.5 w-3.5" />
                    <span className="relative">Table</span>
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <form onSubmit={handleCreateTopic} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
                  <input
                    value={newTopicName}
                    onChange={(event) => setNewTopicName(event.target.value)}
                    placeholder="New root"
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 sm:w-36"
                  />
                  <button className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50">
                    <FolderPlus className="h-4 w-4" />
                    Create
                  </button>
                </form>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search tasks or notes"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64"
                  />
                </div>
                <button
                  onClick={() => openTaskModal(null, selectedTopicId || topics[0]?.id)}
                  className="flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  Add task
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatCard label="Completed" value={stats.completedLeafTasks} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
              <StatCard label="Open" value={stats.incompleteLeafTasks} icon={<Circle className="h-4 w-4 text-slate-500" />} />
              <StatCard label="In progress" value={stats.inProgressTasks} icon={<GitBranch className="h-4 w-4 text-blue-600" />} />
              <StatCard label="Overdue leaves" value={stats.overdueLeafTasks} icon={<AlertCircle className="h-4 w-4 text-orange-600" />} />
            </div>
          </header>

          <WorkspaceViewTransition enabled={isDesktopCinematic && !reducedMotion} view={workspaceView}>
          {workspaceView === 'tree' ? (
          <section
            ref={canvasRef}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            onScroll={handleCanvasScroll}
            className="relative h-[58vh] min-h-[360px] select-none overflow-auto bg-slate-50 sm:h-[64vh] sm:min-h-[460px] lg:min-h-0 lg:flex-1"
            style={{ touchAction: dragState ? 'none' : 'pan-x pan-y' }}
          >
            <div className="sticky left-0 top-0 z-20 w-full border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Root task</span>
                  <select
                    value={selectedTopicId}
                    onChange={(event) => {
                      setSelectedTopicId(event.target.value);
                      setSelectedTaskId(null);
                    }}
                    disabled={topics.length === 0}
                    aria-label="Choose a root to display"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-64 sm:flex-none"
                  >
                    {topics.length === 0 && <option value="">No roots yet</option>}
                    {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                  </select>
                </label>
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
                <span className="hidden text-xs text-slate-500 sm:inline">Use Ctrl + / − to zoom. Drag nodes to organize the tree.</span>
              </div>
              <div ref={topScrollRef} onScroll={handleTopScroll} className="h-4 w-full overflow-x-auto overflow-y-hidden">
                <div style={{ width: scaledCanvasSize.width, height: 1 }} />
              </div>
            </div>

            {diagramNodes.length === 0 ? (
              <div className="m-4 flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
                No roots yet. Create your first life root to begin.
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
                    const parentNode = diagramNodeById.get(group.parentId);
                    const parent = nodePositions[group.parentId];
                    const children = group.childIds
                      .map((childId) => ({ node: diagramNodeById.get(childId), position: nodePositions[childId] }))
                      .filter((child): child is { node: DiagramNode; position: NodePosition } => Boolean(child.node && child.position));
                    if (!parentNode || !parent || children.length === 0) return null;
                    const connectorTheme = parentNode.kind === 'task' && parentNode.task ? taskThemes[getTaskTone(parentNode.task)] : taskThemes.incomplete;
                    const parentSize = getNodeSize(parentNode);

                    const parentAnchorX = parent.x + parentSize.width;
                    const parentAnchorY = parent.y + parentSize.height / 2;
                    const firstChildX = Math.min(...children.map((child) => child.position.x));
                    const preferredTrunkX = parentAnchorX + connectorSpineOffset;
                    const maxTrunkX = firstChildX - connectorChildInset;
                    const minTrunkX = parentAnchorX + 18;
                    const trunkX = maxTrunkX <= minTrunkX
                      ? Math.max(parentAnchorX + 8, firstChildX - 12)
                      : Math.max(minTrunkX, Math.min(preferredTrunkX, maxTrunkX));
                    const childYs = children.map((child) => child.position.y + getNodeSize(child.node).height / 2);
                    const minSpineY = Math.min(parentAnchorY, ...childYs);
                    const maxSpineY = Math.max(parentAnchorY, ...childYs);

                    return (
                      <g key={group.parentId} stroke={connectorTheme.connector} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.76">
                        <path d={`M ${parentAnchorX} ${parentAnchorY} H ${Math.max(parentAnchorX, trunkX - connectorRadius)} Q ${trunkX} ${parentAnchorY} ${trunkX} ${parentAnchorY}`} />
                        {(children.length > 1 || childYs[0] !== parentAnchorY) && <path d={`M ${trunkX} ${minSpineY} V ${maxSpineY}`} />}
                        {children.map((child) => {
                          const childAnchorY = child.position.y + getNodeSize(child.node).height / 2;
                          const arrowEndX = child.position.x - 6;
                          return (
                            <path
                              key={child.node.id}
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

                {diagramNodes.map((node) => {
                  const position = nodePositions[node.id] || autoLayoutPositions[node.id] || { x: canvasPadding, y: canvasPadding };
                  if (node.kind !== 'task') {
                    return (
                      <TopicDiagramNode
                        key={node.id}
                        node={node}
                        position={position}
                        isSelected={selectedTaskId === null && node.topic?.id === selectedTopicId}
                        taskCount={tasks.filter((task) => task.topic_id === node.topic?.id).length}
                        onSelect={() => {
                          setSelectedTaskId(null);
                          setSelectedTopicId(node.topic?.id || '');
                        }}
                        onDragStart={(event) => startDrag(event, node.id)}
                        onEditTopic={node.topic ? () => openTopicEditor(node.topic as ApiTopic) : undefined}
                        onAddTask={node.topic ? () => openTaskModal(null, node.topic?.id) : undefined}
                      />
                    );
                  }
                  const task = node.task;
                  if (!task) return null;
                  return (
                    <TaskDiagramNode
                      key={node.id}
                      task={task}
                      visualDepth={node.depth}
                      position={position}
                      isSelected={selectedTaskId === task.id}
                      hasChildren={(childrenByParent.get(task.id) || []).length > 0}
                      onSelect={() => setSelectedTaskId(task.id)}
                      onContextMenu={(event) => openTaskContextMenu(event, task.id)}
                      onDragStart={(event) => startDrag(event, node.id)}
                      onToggle={() => handleToggleLeaf(task)}
                      onAddChild={() => openTaskModal(task.id)}
                    />
                  );
                })}
                </div>
              </div>
            )}
          </section>
          ) : (
            <TaskTableView
              tasks={tasks}
              topics={topics}
              searchTerm={searchTerm}
              isLoading={isLoading}
              variant={variant}
              onToggleTask={handleToggleLeaf}
              onOpenTask={openTaskDetails}
              onAddChild={(taskId) => openTaskModal(taskId)}
            />
          )}
          </WorkspaceViewTransition>
        </main>
      </div>

      {taskContextMenu && (
        <div
          className="fixed z-50 w-40 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl"
          style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => openTaskDetails(taskContextMenu.taskId)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => void handleArchiveTask(taskContextMenu.taskId)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Archive task
          </button>
        </div>
      )}

      {isTaskDetailsOpen && selectedTask && (
        <Modal title="Task details" onClose={() => setIsTaskDetailsOpen(false)}>
          <TaskDetailsContent
            selectedTask={selectedTask}
            selectedTaskChildren={selectedTaskChildren}
            completion={getCompletionPercent(selectedTask)}
            onArchive={handleArchiveTask}
            onAddChild={() => openTaskModal(selectedTask.id)}
            onUpdateTask={handleUpdateTask}
            onToggleTask={handleToggleLeaf}
          />
        </Modal>
      )}

      {isTaskModalOpen && (
        <Modal title={taskDraft.parentTaskId ? 'Create child task' : 'Create top-level task'} onClose={() => setIsTaskModalOpen(false)}>
          <form onSubmit={handleCreateTask} className="space-y-3">
            <Field label="Title">
              <input value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} className={inputClass} required />
            </Field>
            <Field label="Description">
              <textarea
                value={taskDraft.description}
                onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })}
                className={`${inputClass} min-h-20 resize-none py-2`}
              />
            </Field>
            <Field label="Start date">
              <input type="datetime-local" value={taskDraft.startDate} onChange={(event) => setTaskDraft({ ...taskDraft, startDate: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Deadline">
              <input type="datetime-local" value={taskDraft.deadline} onChange={(event) => setTaskDraft({ ...taskDraft, deadline: event.target.value })} className={inputClass} />
            </Field>
            {taskDraft.parentTaskId && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">This task will be created under: {taskById.get(taskDraft.parentTaskId)?.title}</p>}
            <button disabled={isLoading} className="btn-primary w-full">Save task</button>
          </form>
        </Modal>
      )}

      {editingTopic && (
        <Modal title="Edit root" onClose={() => setEditingTopic(null)}>
          <form onSubmit={handleUpdateTopic} className="space-y-3">
            <Field label="Root name">
              <input
                value={topicNameDraft}
                onChange={(event) => setTopicNameDraft(event.target.value)}
                className={inputClass}
                autoFocus
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditingTopic(null)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={isLoading || !topicNameDraft.trim()}
                className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}

function WorkspaceViewTransition({
  enabled,
  view,
  children,
}: {
  enabled: boolean;
  view: TaskWorkspaceView;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 10, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.998 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function TopicDiagramNode({
  node,
  position,
  isSelected,
  taskCount,
  onSelect,
  onDragStart,
  onEditTopic,
  onAddTask,
}: {
  node: DiagramNode;
  position: NodePosition;
  isSelected: boolean;
  taskCount: number;
  onSelect: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onEditTopic?: () => void;
  onAddTask?: () => void;
}) {
  const nodeSize = getNodeSize(node);
  const color = node.topic ? getTopicColorByName(node.topic.topic_color, 0).text : '#2563eb';
  const background = '#FFFFFF';
  const borderColor = isSelected ? '#2563EB' : '#E2E8F0';

  return (
    <div
      className="group absolute z-10"
      style={{ width: nodeSize.width, height: nodeSize.height, transform: `translate(${position.x}px, ${position.y}px)` }}
      onPointerDown={onSelect}
    >
      <div
        className="relative h-full overflow-visible rounded-xl border p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        style={{
          background,
          borderColor,
          boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.16), 0 10px 26px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div className="absolute inset-y-2 left-0 w-0.5 rounded-r-full" style={{ background: color }} />
        <div className="flex items-start justify-between gap-1.5 pl-1">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700">
              <GitBranch className="h-3 w-3" />
            </span>
            <div className="min-w-0">
              <p className="whitespace-normal break-normal text-[13px] font-semibold leading-4 text-slate-800" style={{ overflowWrap: 'normal' }}>
                {node.title}
              </p>
              <p className="mt-0.5 text-[10px] leading-3 text-slate-500">
                {taskCount} task
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onAddTask && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddTask();
                }}
                className="grid h-5 w-5 place-items-center rounded-md border border-slate-200/80 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-900"
                title="Add task"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            )}
            {onEditTopic && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditTopic();
                }}
                className="grid h-5 w-5 place-items-center rounded-md border border-slate-200/80 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-900"
                title="Edit root"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            )}
            <button
              type="button"
              onPointerDown={onDragStart}
              className="grid h-5 w-5 cursor-grab touch-none place-items-center rounded-md border border-slate-200/80 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-900 active:cursor-grabbing"
              title="Drag node"
            >
              <Move className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskDiagramNode({
  task,
  visualDepth,
  position,
  isSelected,
  hasChildren,
  onSelect,
  onContextMenu,
  onDragStart,
  onToggle,
  onAddChild,
}: {
  task: ApiTask;
  visualDepth: number;
  position: NodePosition;
  isSelected: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onToggle: () => void;
  onAddChild: () => void;
}) {
  const taskDone = isTaskDone(task);
  const taskOverdue = isTaskOverdue(task);
  const theme = taskThemes[getTaskTone(task)];
  const isCompact = visualDepth >= 2;
  const isLevelTwo = visualDepth === 1;
  const nodeSize = getNodeSize({ title: task.title, depth: visualDepth });

  if (isCompact) {
    return (
      <div
        className="group absolute z-10"
        style={{ width: nodeSize.width, height: nodeSize.height, transform: `translate(${position.x}px, ${position.y}px)` }}
        onPointerDown={onSelect}
        onContextMenu={onContextMenu}
      >
        <div
          className="relative h-full overflow-visible rounded-md border p-1.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          style={{
            background: theme.background,
            borderColor: isSelected ? theme.selected : theme.border,
            color: theme.text,
            boxShadow: isSelected ? `0 0 0 2px color-mix(in srgb, ${theme.selected} 22%, transparent), 0 10px 24px ${theme.shadow}` : `0 1px 2px ${theme.shadow}`,
          }}
        >
          <div className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full" style={{ background: theme.progress }} />

          <div className="flex h-full min-w-0 items-center gap-1 pl-0.5">
            {hasChildren ? (
              <span className="grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full" style={{ background: theme.chipBackground, color: theme.chipText }} title="Parent status is calculated automatically">
                {taskDone ? <CheckCircle2 className="h-2.5 w-2.5" /> : <GitBranch className="h-2.5 w-2.5" />}
              </span>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
                className="grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full transition hover:scale-105"
                style={{ background: theme.chipBackground, color: theme.chipText }}
                title="Change status"
              >
                {taskDone ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
              </button>
            )}
            <p className="min-w-0 flex-1 whitespace-normal break-normal text-[10px] font-semibold leading-3" style={{ color: theme.text, overflowWrap: 'normal' }}>
              {task.title}
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild();
              }}
              className="grid h-[16px] w-[16px] shrink-0 place-items-center rounded border border-slate-200/80 bg-white/70 text-slate-500 opacity-60 transition hover:bg-white hover:text-slate-900 group-hover:opacity-100"
              title="Add child task"
            >
              <Plus className="h-2 w-2" />
            </button>
            <button
              type="button"
              onPointerDown={onDragStart}
              className="grid h-[18px] w-[18px] shrink-0 cursor-grab touch-none place-items-center rounded border border-slate-200/80 bg-white/80 text-slate-500 opacity-80 transition hover:bg-white hover:text-slate-900 active:cursor-grabbing sm:h-[16px] sm:w-[16px] sm:opacity-0 sm:group-hover:opacity-100"
              title="Drag node"
            >
              <Move className="h-2.5 w-2.5 sm:h-2 sm:w-2" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group absolute z-10"
      style={{ width: nodeSize.width, height: nodeSize.height, transform: `translate(${position.x}px, ${position.y}px)` }}
      onPointerDown={onSelect}
      onContextMenu={onContextMenu}
    >
      <div
        className={`relative h-full overflow-visible rounded-xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isLevelTwo ? 'p-1.5' : 'p-2'}`}
        style={{
          background: theme.background,
          borderColor: isSelected ? theme.selected : theme.border,
          color: theme.text,
          boxShadow: isSelected ? `0 0 0 2px color-mix(in srgb, ${theme.selected} 22%, transparent), 0 10px 26px ${theme.shadow}` : `0 1px 2px ${theme.shadow}`,
        }}
      >
        <div className={`${isLevelTwo ? 'absolute inset-y-1.5 left-0 w-0.5 rounded-r-full' : 'absolute inset-y-2 left-0 w-0.5 rounded-r-full'}`} style={{ background: theme.progress }} />

        <div className={`flex items-start justify-between gap-1.5 pl-1 ${isLevelTwo ? 'mb-1' : 'mb-1.5'}`}>
          <div className={`flex min-w-0 items-start ${isLevelTwo ? 'gap-1.5' : 'gap-2'}`}>
            {hasChildren ? (
              <span className={`${isLevelTwo ? 'mt-0.5 grid h-4 w-4' : 'mt-0.5 grid h-[18px] w-[18px]'} place-items-center rounded-full`} style={{ background: theme.chipBackground, color: theme.chipText }} title="Parent status is calculated automatically">
                {taskDone ? <CheckCircle2 className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> : <GitBranch className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
              </span>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
                className={`${isLevelTwo ? 'mt-0.5 grid h-4 w-4' : 'mt-0.5 grid h-[18px] w-[18px]'} place-items-center rounded-full transition hover:scale-105`}
                style={{ background: theme.chipBackground, color: theme.chipText }}
                title="Change status"
              >
                {taskDone ? <CheckCircle2 className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> : <Circle className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
              </button>
            )}
            <div className="min-w-0">
              <p className={`whitespace-normal break-normal font-semibold ${isLevelTwo ? 'text-[11px] leading-[14px]' : 'text-[13px] leading-4'}`} style={{ color: theme.text, overflowWrap: 'normal' }}>{task.title}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild();
              }}
              className={`${isLevelTwo ? 'grid h-5 w-5' : 'grid h-6 w-6'} place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-500 opacity-80 transition hover:bg-white hover:text-slate-900 group-hover:opacity-100`}
              title="Add child task"
            >
              <Plus className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            </button>
            <button
              type="button"
              onPointerDown={onDragStart}
              className={`${isLevelTwo ? 'grid h-5 w-5' : 'grid h-6 w-6'} cursor-grab touch-none place-items-center rounded-md border border-slate-200/80 bg-white/80 text-slate-500 opacity-90 transition hover:bg-white hover:text-slate-900 active:cursor-grabbing sm:opacity-80 sm:group-hover:opacity-100`}
              title="Drag node"
            >
              <Move className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            </button>
            <button
              type="button"
              className={`${isLevelTwo ? 'hidden' : 'grid h-6 w-6'} place-items-center rounded-md border border-slate-200/80 bg-white/70 text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-900 group-hover:opacity-100`}
              title="Options"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className={`flex flex-wrap pl-1 ${isLevelTwo ? 'mb-0.5 gap-1' : 'mb-1 gap-1'}`}>
          <TaskMetaChip icon={<CalendarDays className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} />} label={`Due: ${formatDate(task.deadline)}`} theme={taskOverdue ? taskThemes.overdue : taskThemes.incomplete} compact={isLevelTwo} />
          {task.start_date && <TaskMetaChip icon={<CalendarDays className={isLevelTwo ? 'h-2.5 w-2.5' : 'h-3 w-3'} />} label={`Start: ${formatDate(task.start_date)}`} theme={taskThemes.inProgress} compact={isLevelTwo} />}
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
      <span className="whitespace-normal break-words">{label}</span>
    </span>
  );
}

function TaskDetailsContent({
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
  onUpdateTask: (taskId: string, input: { status?: ApiTaskStatus; title?: string; startDate?: string | null; deadline?: string | null }) => Promise<void>;
  onToggleTask: (task: ApiTask) => void;
}) {
  const canToggleSelectedTask = selectedTaskChildren.length === 0;
  const [titleDraft, setTitleDraft] = useState(selectedTask?.title || '');
  const trimmedTitleDraft = titleDraft.trim();
  const titleChanged = Boolean(selectedTask && trimmedTitleDraft && trimmedTitleDraft !== selectedTask.title);

  useEffect(() => {
    setTitleDraft(selectedTask?.title || '');
  }, [selectedTask?.id, selectedTask?.title]);

  const saveTitle = async () => {
    if (!selectedTask) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === selectedTask.title) {
      setTitleDraft(selectedTask.title);
      return;
    }
    await onUpdateTask(selectedTask.id, { title: nextTitle });
  };

  return (
    <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
      {selectedTask ? (
        <div className="flex h-full flex-col">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Task details</p>
              <h2 className="text-lg font-semibold">{selectedTask.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedTask.description || 'No description yet.'}</p>
            </div>
            <button onClick={() => onArchive(selectedTask.id)} className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Archive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 space-y-2 rounded-md border border-slate-200 p-3 text-sm">
            <InfoRow label="Start date" value={formatDate(selectedTask.start_date, 'No start date')} />
            <InfoRow label="Deadline" value={formatDate(selectedTask.deadline)} />
            <InfoRow label="Status" value={getTaskStatusLabel(selectedTask.effective_status)} />
            <InfoRow label="Task con" value={String(selectedTaskChildren.length)} />
          </div>

          <div className="mb-4 space-y-3 rounded-md border border-slate-200 p-3">
            <Field label="Task name">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveTitle();
                    }
                  }}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void saveTitle()}
                  disabled={!titleChanged}
                  className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  Save
                </button>
              </div>
            </Field>
            <Field label="Start date">
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
              <h3 className="text-sm font-semibold">Task status</h3>
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
                  <option value="not_completed">Not completed</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
                <button
                  type="button"
                  onClick={() => onToggleTask(selectedTask)}
                  className={'w-full rounded-md px-3 py-2 text-sm font-semibold transition ' + (selectedTask.status === 'completed' ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-emerald-600 text-white hover:bg-emerald-700')}
                >
                  {selectedTask.status === 'completed' ? 'Reopen task' : 'Mark completed'}
                </button>
              </div>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Parent tasks complete automatically when every child is complete.
              </p>
            )}
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Tree progress</h3>
              <span className="text-sm font-medium text-blue-600">{completion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: completion + '%' }} />
            </div>
          </div>

          <button onClick={onAddChild} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Add child task
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-500">
          <Folder className="mb-3 h-8 w-8" />
          <p className="text-sm font-medium">Select a task to view details</p>
          <p className="mt-1 text-xs">Right-click a task to edit or archive it.</p>
        </div>
      )}
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
  const modalRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); previouslyFocused?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="task-modal-title" onMouseDown={(event) => event.stopPropagation()} className="glass-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-[28px] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="task-modal-title" className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


