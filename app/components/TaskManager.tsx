'use client';

import { CSSProperties, DragEvent as ReactDragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Folder,
  FolderPlus,
  GitBranch,
  MoreHorizontal,
  LocateFixed,
  Maximize2,
  Minimize2,
  Move,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { flushSync } from 'react-dom';
import { api, ApiTask, ApiTaskStatus, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { getTopicColorByName, topicColorPalette } from '@/app/lib/topicColors';
import TaskTableView from './TaskTableView';
import { ElasticTopologyField } from './task-network/ElasticTopologyField';
import type { OrbitPlanetInput, TreeTaskInput } from './topic-orbit/types';
import { SemanticDiveDirection, SemanticDiveDirector, SemanticDivePhase } from './task-network/SemanticDiveDirector';
import { SidebarChromeContext } from './desktop-v2/DesktopShell';

type TaskDraft = {
  title: string;
  description: string;
  startDate: string;
  deadline: string;
  parentTaskId: string | null;
  topicId: string | null;
};

type NodePosition = { x: number; y: number };
type NetworkViewportState = NodePosition & { zoom: number };
type NetworkDiveSnapshot = {
  worldKey: string;
  stage: { width: number; height: number };
  portal: NodePosition;
  nodes: Array<{ id: string; x: number; y: number; radius: number; label: string; tone: string; kind: 'topic' | 'task' }>;
  edges: Array<{ key: string; from: string; to: string; d: string; active: boolean }>;
};
type TreeViewport = { left: number; top: number; width: number; height: number };
type DragState = {
  taskId: string;
  offsetX: number;
  offsetY: number;
  origin: NodePosition;
  originPositions: Record<string, NodePosition>;
};
type DropFeedback = { taskId: string; tone: 'success' | 'error'; nonce: number };
type TaskContextMenu = { taskId: string; x: number; y: number };
type NetworkDragState =
  | { mode: 'node'; id: string; pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number }
  | {
      mode: 'cluster';
      id: string;
      pointerId: number;
      offsetX: number;
      offsetY: number;
      startX: number;
      startY: number;
      originLogical: Record<string, NodePosition>;
      originDisplayed: Record<string, NodePosition>;
      followById: Record<string, number>;
    }
  | { mode: 'pan'; pointerId: number; startX: number; startY: number; originScroll: NodePosition }
  | {
      mode: 'graph';
      id: string;
      pointerId: number;
      startX: number;
      startY: number;
      originOffset: NodePosition;
      originCustomPositions: Record<string, NodePosition>;
    };
export type TaskWorkspaceView = 'tree' | 'table' | 'orbit';
export type TaskWorkspaceVariant = 'legacy' | 'desktop-cinematic';
type TreeMotionMode = 'cinematic' | 'balanced' | 'minimal';
type CompletionReplayPhase = 'idle' | 'primed' | 'playing';
type TopicStoryPhase = 'focus' | 'nodes' | 'edges' | 'completion' | 'done';
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

function getNodeSize(node: Pick<DiagramNode, 'depth' | 'title'>, cinematic = false) {
  const depth = node.depth || 0;
  const titleLength = Math.max(node.title?.length || 0, 1);
  if (cinematic) {
    if (depth === 0) {
      return {
        width: Math.min(330, 264 + Math.max(0, titleLength - 18) * 4.2),
        height: titleLength > 36 ? 112 : 98,
      };
    }
    if (depth === 1) {
      return {
        width: Math.min(318, 246 + Math.max(0, titleLength - 18) * 4),
        height: titleLength > 42 ? 98 : 86,
      };
    }
    return {
      width: Math.min(286, 214 + Math.max(0, titleLength - 18) * 3.6),
      height: titleLength > 44 ? 88 : 74,
    };
  }
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

const isTaskDone = (task: ApiTask) => task.effective_status !== undefined
  ? task.effective_status === 'completed'
  : task.status === 'completed';
const isTaskInProgress = (task: ApiTask) => !isTaskDone(task) && task.status === 'in_progress';
const isTaskOverdue = (task: ApiTask) => {
  if (!task.deadline || isTaskDone(task)) return false;
  return new Date(task.deadline) < new Date();
};
// Due on today's date, and still outstanding. Compared calendar day to
// calendar day in LOCAL time — a deadline is a day on the user's wall
// calendar, so an instant comparison would mark a task due at 09:00 this
// morning as "not today" for the rest of the day, and a UTC comparison would
// get the day itself wrong either side of midnight.
const isTaskDueToday = (task: ApiTask) => {
  if (!task.deadline || isTaskDone(task)) return false;
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  const now = new Date();
  return deadline.getFullYear() === now.getFullYear()
    && deadline.getMonth() === now.getMonth()
    && deadline.getDate() === now.getDate();
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

// Three.js only ever loads when the user actually opens the 3D view, and never
// on the server — the orbit scene needs a real WebGL context.
const TopicOrbitView = dynamic(() => import('./topic-orbit/TopicOrbitView').then((module) => module.TopicOrbitView), {
  ssr: false,
  loading: () => <div className="topic-orbit-loading">Charting the system…</div>,
});

export default function TaskManager({
  variant = 'desktop-cinematic',
  initialView,
}: {
  variant?: TaskWorkspaceVariant;
  initialView?: TaskWorkspaceView;
}) {
  const { user } = useAppStore();
  // The network renderer is now the canonical Task Tree for every mount.
  // Sidebar toggle handed down by the shell: on /tasks the workspace header is
  // gone, so this command bar carries the control instead.
  const sidebarChrome = useContext(SidebarChromeContext);
  // `variant` remains in the public API for compatibility with existing
  // callers, but it can no longer route /tasks back to the legacy tree.
  const isDesktopCinematic = true;
  const reducedMotion = Boolean(useReducedMotion());
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const titleLayoutSignatureRef = useRef('');
  const centeredLargeTreeKeyRef = useRef('');
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragPositionsRef = useRef<Record<string, NodePosition> | null>(null);
  const dropFeedbackTimerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const viewportFrameRef = useRef<number | null>(null);
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
  const [dropFeedback, setDropFeedback] = useState<DropFeedback | null>(null);
  const [completionPulseId, setCompletionPulseId] = useState<string | null>(null);
  const [isCommittingDrag, setIsCommittingDrag] = useState(false);
  const [shouldReflowAfterDrop, setShouldReflowAfterDrop] = useState(false);
  const [treeViewport, setTreeViewport] = useState<TreeViewport>({ left: 0, top: 0, width: 1600, height: 1000 });
  const [taskContextMenu, setTaskContextMenu] = useState<TaskContextMenu | null>(null);
  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [workspaceView, setWorkspaceView] = useState<TaskWorkspaceView>(
    () => initialView ?? 'tree',
  );
  const treeCanvasPadding = isDesktopCinematic ? 72 : canvasPadding;
  const treeLevelGap = isDesktopCinematic ? 124 : levelGap;
  const treeSiblingGap = isDesktopCinematic ? 34 : siblingGap;

  useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
    if (dropFeedbackTimerRef.current !== null) window.clearTimeout(dropFeedbackTimerRef.current);
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    if (viewportFrameRef.current !== null) window.cancelAnimationFrame(viewportFrameRef.current);
  }, []);

  useEffect(() => {
    if (isDesktopCinematic && initialView) setWorkspaceView(initialView);
  }, [initialView, isDesktopCinematic]);

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
        if (isDesktopCinematic && taskRows.filter((task) => task.topic_id === nextTopicId).length > 240) return null;
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
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
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

  // ---- Topic Orbit (3D task tree) -----------------------------------------
  // Only the selected topic and its FIRST-LEVEL tasks ever become celestial
  // objects. Everything deeper stays the job of the existing 2D tree.
  const orbitPlanets = useMemo<OrbitPlanetInput[]>(() => {
    const level1 = rootTasks.filter((task) => task.topic_id === selectedTopicId);
    const heaviest = level1.reduce((maximum, task) => Math.max(maximum, task.descendant_count || 0), 0);
    return level1.map((task, index) => {
      const leaves = task.leaf_count || 0;
      const done = isTaskDone(task);
      return {
        id: task.id,
        title: task.title,
        status: done ? 'completed' : isTaskInProgress(task) ? 'in_progress' : 'not_completed',
        // Size encodes how much work hangs off this branch.
        importance: heaviest ? Math.min(1, (task.descendant_count || 0) / heaviest) : 0.4,
        childCount: (childrenByParent.get(task.id) || []).length,
        accent: getTopicColorByName(task.task_color, index).text,
        completion: leaves ? (task.completed_leaf_count || 0) / leaves : done ? 1 : 0,
        urgent: isTaskDueToday(task) || isTaskOverdue(task),
      };
    });
  }, [childrenByParent, rootTasks, selectedTopicId]);

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
    ? `life-manager-task-layout:${isDesktopCinematic ? 'v9-cinematic' : 'v8'}:${user.id}:topic:${selectedTopicId}`
    : null;

  const diagramChildrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();

    rootTasks.forEach((task) => {
      if (task.topic_id !== selectedTopicId || !canvasNodeIds.has(task.id)) return;
      const parentTopicNodeId = topicNodeId(task.topic_id);
      map.set(parentTopicNodeId, [...(map.get(parentTopicNodeId) || []), task.id]);
    });

    childrenByParent.forEach((children, parentId) => {
      if (!parentId) return;
      children.forEach((task) => {
        if (!canvasNodeIds.has(task.id)) return;
        map.set(parentId, [...(map.get(parentId) || []), task.id]);
      });
    });

    return map;
  }, [canvasNodeIds, childrenByParent, rootTasks, selectedTopicId]);

  const selectedBranchIds = useMemo(() => {
    const branch = new Set<string>();
    if (!selectedTaskId || !canvasNodeIds.has(selectedTaskId)) return branch;

    let current = taskById.get(selectedTaskId);
    while (current) {
      branch.add(current.id);
      if (!current.parent_task_id) {
        branch.add(topicNodeId(current.topic_id));
        break;
      }
      current = taskById.get(current.parent_task_id);
    }

    const descendants = [selectedTaskId];
    const descendantLimit = diagramNodes.length > 160 ? 120 : Number.POSITIVE_INFINITY;
    let descendantCount = 0;
    while (descendants.length > 0 && descendantCount < descendantLimit) {
      const parentId = descendants.pop();
      if (!parentId) continue;
      (diagramChildrenByParent.get(parentId) || []).forEach((childId) => {
        if (branch.has(childId) || descendantCount >= descendantLimit) return;
        branch.add(childId);
        descendants.push(childId);
        descendantCount += 1;
      });
    }
    return branch;
  }, [canvasNodeIds, diagramChildrenByParent, diagramNodes.length, selectedTaskId, taskById]);

  const treeMotionMode: TreeMotionMode = reducedMotion || diagramNodes.length > 160
    ? 'minimal'
    : diagramNodes.length > 80
      ? 'balanced'
      : 'cinematic';

  const autoLayoutPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    const rootNodes = diagramNodes.filter((node) => node.kind === 'topic');
    if (rootNodes.length === 0) return positions;

    let leafIndex = 0;
    let nextLeafY = treeCanvasPadding;
    const place = (node: DiagramNode, x: number): number => {
      const currentSize = getNodeSize(node, isDesktopCinematic);
      const visibleChildren = (diagramChildrenByParent.get(node.id) || [])
        .map((childId) => diagramNodeById.get(childId))
        .filter((child): child is DiagramNode => Boolean(child));

      if (visibleChildren.length === 0) {
        const y = isDesktopCinematic ? nextLeafY : treeCanvasPadding + leafIndex * treeSiblingGap;
        positions[node.id] = { x, y };
        if (isDesktopCinematic) nextLeafY += currentSize.height + treeSiblingGap;
        leafIndex += 1;
        return y + currentSize.height / 2;
      }

      const childX = x + currentSize.width + treeLevelGap;
      const childCenters = visibleChildren.map((child) => place(child, childX));
      const y = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length - currentSize.height / 2;
      positions[node.id] = { x, y };
      return y + currentSize.height / 2;
    };

    rootNodes.forEach((rootNode, index) => {
      if (index > 0) {
        leafIndex += 1;
        if (isDesktopCinematic) nextLeafY += treeSiblingGap;
      }
      place(rootNode, treeCanvasPadding);
    });
    return positions;
  }, [diagramChildrenByParent, diagramNodeById, diagramNodes, isDesktopCinematic, treeCanvasPadding, treeLevelGap, treeSiblingGap]);

  useEffect(() => {
    if (!shouldReflowAfterDrop) return;
    setNodePositions(autoLayoutPositions);
    setShouldReflowAfterDrop(false);
  }, [autoLayoutPositions, shouldReflowAfterDrop]);

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
        next[node.id] = current[node.id] || savedPositions[node.id] || autoLayoutPositions[node.id] || { x: treeCanvasPadding, y: treeCanvasPadding };
      });
      return next;
    });
  }, [autoLayoutPositions, diagramNodes, layoutStorageKey, treeCanvasPadding]);

  useEffect(() => {
    if (!isDesktopCinematic || workspaceView !== 'tree' || diagramNodes.length <= 240 || !selectedTopicId) return;
    const centerKey = selectedTopicId;
    if (centeredLargeTreeKeyRef.current === centerKey) return;
    const rootNode = diagramNodeById.get(topicNodeId(selectedTopicId));
    const rootPosition = nodePositions[topicNodeId(selectedTopicId)] || autoLayoutPositions[topicNodeId(selectedTopicId)];
    if (!rootNode || !rootPosition) return;

    window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rootSize = getNodeSize(rootNode, true);
      canvas.scrollLeft = Math.max(0, (rootPosition.x - 36) * canvasZoom);
      canvas.scrollTop = Math.max(0, (rootPosition.y + rootSize.height / 2) * canvasZoom - canvas.clientHeight / 2);
      if (topScrollRef.current) topScrollRef.current.scrollLeft = canvas.scrollLeft;
      centeredLargeTreeKeyRef.current = centerKey;
    });
  }, [autoLayoutPositions, canvasZoom, diagramNodeById, diagramNodes.length, isDesktopCinematic, nodePositions, selectedTopicId, workspaceView]);

  useEffect(() => {
    if (!layoutStorageKey || diagramNodes.length === 0 || dragState || isCommittingDrag || shouldReflowAfterDrop || searchTerm.trim() || typeof window === 'undefined') return;

    const savedPositions: Record<string, NodePosition> = {};
    diagramNodes.forEach((node) => {
      if (nodePositions[node.id]) savedPositions[node.id] = nodePositions[node.id];
    });
    localStorage.setItem(layoutStorageKey, JSON.stringify(savedPositions));
  }, [diagramNodes, dragState, isCommittingDrag, layoutStorageKey, nodePositions, searchTerm, shouldReflowAfterDrop]);

  useEffect(() => {
    if (!titleLayoutSignature) return;
    if (!titleLayoutSignatureRef.current) {
      titleLayoutSignatureRef.current = titleLayoutSignature;
      return;
    }
    if (titleLayoutSignatureRef.current === titleLayoutSignature) return;
    titleLayoutSignatureRef.current = titleLayoutSignature;
    if (isDesktopCinematic) return;
    setNodePositions(autoLayoutPositions);
  }, [autoLayoutPositions, isDesktopCinematic, titleLayoutSignature]);

  const visibleDiagramNodes = useMemo(() => {
    if (!isDesktopCinematic || diagramNodes.length <= 240) return diagramNodes;
    const overscan = 420;
    const left = treeViewport.left - overscan;
    const top = treeViewport.top - overscan;
    const right = treeViewport.left + treeViewport.width + overscan;
    const bottom = treeViewport.top + treeViewport.height + overscan;

    return diagramNodes.filter((node) => {
      if (node.kind === 'topic' || node.id === dragState?.taskId || selectedBranchIds.has(node.id)) return true;
      const position = nodePositions[node.id] || autoLayoutPositions[node.id];
      if (!position) return false;
      const size = getNodeSize(node, true);
      return position.x + size.width >= left && position.x <= right && position.y + size.height >= top && position.y <= bottom;
    });
  }, [autoLayoutPositions, diagramNodes, dragState?.taskId, isDesktopCinematic, nodePositions, selectedBranchIds, treeViewport]);

  const visibleDiagramNodeIds = useMemo(
    () => new Set(visibleDiagramNodes.map((node) => node.id)),
    [visibleDiagramNodes],
  );

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

  const dragDropPreview = useMemo(() => {
    if (!isDesktopCinematic || !dragState) return null;
    const draggedTask = taskById.get(dragState.taskId);
    const draggedPosition = nodePositions[dragState.taskId];
    if (!draggedTask || !draggedPosition) return null;

    const siblings = (childrenByParent.get(draggedTask.parent_task_id || null) || [])
      .filter((task) => task.id !== draggedTask.id && task.topic_id === draggedTask.topic_id && canvasNodeIds.has(task.id))
      .sort((a, b) => (nodePositions[a.id]?.y || 0) - (nodePositions[b.id]?.y || 0));
    const draggedNode = diagramNodeById.get(draggedTask.id);
    const draggedCenter = draggedPosition.y + (draggedNode ? getNodeSize(draggedNode, true).height / 2 : 0);
    const insertionIndex = siblings.findIndex((sibling) => {
      const siblingNode = diagramNodeById.get(sibling.id);
      const siblingPosition = nodePositions[sibling.id];
      if (!siblingNode || !siblingPosition) return false;
      return draggedCenter < siblingPosition.y + getNodeSize(siblingNode, true).height / 2;
    });
    const order = insertionIndex === -1 ? siblings.length : insertionIndex;
    const beforeTask = siblings[order - 1];
    const afterTask = siblings[order];
    const beforePosition = beforeTask ? nodePositions[beforeTask.id] : null;
    const afterPosition = afterTask ? nodePositions[afterTask.id] : null;
    const beforeNode = beforeTask ? diagramNodeById.get(beforeTask.id) : null;
    const guideY = beforePosition && beforeNode && afterPosition
      ? (beforePosition.y + getNodeSize(beforeNode, true).height + afterPosition.y) / 2
      : afterPosition
        ? afterPosition.y - 17
        : beforePosition && beforeNode
          ? beforePosition.y + getNodeSize(beforeNode, true).height + 17
          : draggedPosition.y + getNodeSize(draggedNode || { depth: 1, title: '' }, true).height + 17;

    return {
      x: Math.max(24, draggedPosition.x - 10),
      y: Math.max(20, guideY),
      order: order + 1,
      total: siblings.length + 1,
    };
  }, [canvasNodeIds, childrenByParent, diagramNodeById, dragState, isDesktopCinematic, nodePositions, taskById]);

  const canvasSize = useMemo(() => {
    const positionedNodes = diagramNodes
      .map((node) => ({ node, position: nodePositions[node.id] }))
      .filter((item): item is { node: DiagramNode; position: NodePosition } => Boolean(item.position));
    const maxX = Math.max(
      isDesktopCinematic ? 1800 : canvasMinWidth,
      ...positionedNodes.map(({ node, position }) => position.x + getNodeSize(node, isDesktopCinematic).width + (isDesktopCinematic ? 360 : canvasExpansionPadding))
    );
    const maxY = Math.max(
      isDesktopCinematic ? 1050 : canvasMinHeight,
      ...positionedNodes.map(({ node, position }) => position.y + getNodeSize(node, isDesktopCinematic).height + (isDesktopCinematic ? 300 : canvasExpansionPadding))
    );
    return { width: maxX, height: maxY };
  }, [diagramNodes, isDesktopCinematic, nodePositions]);

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

  const handleDesktopTreeWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!isDesktopCinematic || dragState || (!event.ctrlKey && !event.metaKey) || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const contentX = (canvas.scrollLeft + pointerX) / canvasZoom;
    const contentY = (canvas.scrollTop + pointerY) / canvasZoom;
    const nextZoom = Math.min(1.6, Math.max(0.5, Math.round((canvasZoom + (event.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10));
    if (nextZoom === canvasZoom) return;
    setCanvasZoom(nextZoom);
    window.requestAnimationFrame(() => {
      canvas.scrollLeft = Math.max(0, contentX * nextZoom - pointerX);
      canvas.scrollTop = Math.max(0, contentY * nextZoom - pointerY);
      if (topScrollRef.current) topScrollRef.current.scrollLeft = canvas.scrollLeft;
    });
  };

  const handleDesktopTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isDesktopCinematic || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, button')) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      updateCanvasZoom(canvasZoom + 0.1);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      updateCanvasZoom(canvasZoom - 0.1);
    } else if (event.key === '0') {
      event.preventDefault();
      updateCanvasZoom(1);
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const topicId = selectedRootTopic ? topicNodeId(selectedRootTopic.id) : null;
      const currentId = selectedTaskId || topicId;
      if (!currentId) return;
      const visuallyOrdered = [...diagramNodes].sort((a, b) => {
        const aPosition = nodePositions[a.id] || autoLayoutPositions[a.id];
        const bPosition = nodePositions[b.id] || autoLayoutPositions[b.id];
        return (aPosition?.y || 0) - (bPosition?.y || 0) || (aPosition?.x || 0) - (bPosition?.x || 0);
      });
      const currentIndex = visuallyOrdered.findIndex((node) => node.id === currentId);
      let nextId: string | null = null;
      if (event.key === 'ArrowUp') nextId = visuallyOrdered[Math.max(0, currentIndex - 1)]?.id || null;
      if (event.key === 'ArrowDown') nextId = visuallyOrdered[Math.min(visuallyOrdered.length - 1, currentIndex + 1)]?.id || null;
      if (event.key === 'Home') nextId = visuallyOrdered[0]?.id || null;
      if (event.key === 'End') nextId = visuallyOrdered[visuallyOrdered.length - 1]?.id || null;
      if (event.key === 'ArrowLeft') {
        const currentTask = taskById.get(currentId);
        nextId = currentTask?.parent_task_id || (currentTask ? topicNodeId(currentTask.topic_id) : currentId);
      }
      if (event.key === 'ArrowRight') {
        nextId = (diagramChildrenByParent.get(currentId) || [])[0] || currentId;
      }
      if (!nextId || nextId === currentId) return;
      event.preventDefault();
      const nextNode = diagramNodeById.get(nextId);
      setSelectedTaskId(nextNode?.kind === 'task' ? nextId : null);
      window.requestAnimationFrame(() => {
        const selector = `[data-tree-node-id="${CSS.escape(nextId || '')}"]`;
        canvasRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: false });
      });
    }
  };

  useEffect(() => {
    if (isDesktopCinematic) return;
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
  }, [isDesktopCinematic]);

  useEffect(() => {
    if (isDesktopCinematic) return;
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
  }, [isDesktopCinematic, workspaceView]);

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
    const menuWidth = 176;
    const menuHeight = 104;
    setTaskContextMenu({
      taskId,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight - 8)),
    });
  };

  const getCompletionPercent = (task: ApiTask) => {
    if ((task.leaf_count || 0) > 0) return Math.round(((task.completed_leaf_count || 0) / (task.leaf_count || 1)) * 100);
    return task.status === 'completed' ? 100 : 0;
  };

  const resetCanvasLayout = () => {
    if (layoutStorageKey && typeof window !== 'undefined') localStorage.removeItem(layoutStorageKey);
    setNodePositions(autoLayoutPositions);
    if (isDesktopCinematic) {
      setCanvasZoom(1);
      window.requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rootId = selectedTopicId ? topicNodeId(selectedTopicId) : '';
        const rootNode = rootId ? diagramNodeById.get(rootId) : null;
        const rootPosition = rootId ? autoLayoutPositions[rootId] : null;
        const largeTreeTop = rootNode && rootPosition && diagramNodes.length > 240
          ? Math.max(0, rootPosition.y + getNodeSize(rootNode, true).height / 2 - canvas.clientHeight / 2)
          : 0;
        canvas.scrollTo({ left: 0, top: largeTreeTop, behavior: reducedMotion ? 'auto' : 'smooth' });
        if (topScrollRef.current) topScrollRef.current.scrollLeft = 0;
      });
    }
  };

  const scheduleTreeViewportSync = () => {
    if (!isDesktopCinematic || diagramNodes.length <= 240 || viewportFrameRef.current !== null) return;
    viewportFrameRef.current = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        setTreeViewport({
          left: canvas.scrollLeft / canvasZoom,
          top: canvas.scrollTop / canvasZoom,
          width: canvas.clientWidth / canvasZoom,
          height: canvas.clientHeight / canvasZoom,
        });
      }
      viewportFrameRef.current = null;
    });
  };

  useEffect(() => {
    scheduleTreeViewportSync();
    // The sync is intentionally tied to zoom/view changes; scroll events use
    // the rAF-coalesced handler below instead of adding another listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasZoom, workspaceView, diagramNodes.length]);

  const showDropFeedback = (taskId: string, tone: DropFeedback['tone']) => {
    if (dropFeedbackTimerRef.current !== null) window.clearTimeout(dropFeedbackTimerRef.current);
    setDropFeedback({ taskId, tone, nonce: Date.now() });
    dropFeedbackTimerRef.current = window.setTimeout(() => {
      setDropFeedback(null);
      dropFeedbackTimerRef.current = null;
    }, tone === 'success' ? 620 : 780);
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
    scheduleTreeViewportSync();
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const currentPosition = nodePositions[taskId];
    if (!canvasRect || !currentPosition) return;

    const draggedNode = diagramNodeById.get(taskId);
    if (isDesktopCinematic && draggedNode?.kind === 'task' && searchTerm.trim()) {
      setErrorMessage('Clear the search filter before reordering so hidden siblings keep their correct order.');
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (draggedNode?.kind === 'task') {
      setSelectedTaskId(taskId);
    } else {
      setSelectedTaskId(null);
      if (draggedNode?.topic) setSelectedTopicId(draggedNode.topic.id);
    }
    const movingIds = [taskId];
    if (isDesktopCinematic) {
      for (let index = 0; index < movingIds.length; index += 1) {
        (diagramChildrenByParent.get(movingIds[index]) || []).forEach((childId) => movingIds.push(childId));
      }
    }
    const originPositions = movingIds.reduce<Record<string, NodePosition>>((positions, nodeId) => {
      if (nodePositions[nodeId]) positions[nodeId] = { ...nodePositions[nodeId] };
      return positions;
    }, {});

    pendingDragPositionsRef.current = null;
    setDragState({
      taskId,
      offsetX: (event.clientX - canvasRect.left + (canvasRef.current?.scrollLeft || 0)) / canvasZoom - currentPosition.x,
      offsetY: (event.clientY - canvasRect.top + (canvasRef.current?.scrollTop || 0)) / canvasZoom - currentPosition.y,
      origin: { ...currentPosition },
      originPositions,
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

    const pointerX = (event.clientX - canvasRect.left + canvas.scrollLeft) / canvasZoom - dragState.offsetX;
    const pointerY = (event.clientY - canvasRect.top + canvas.scrollTop) / canvasZoom - dragState.offsetY;
    const rawDeltaX = pointerX - dragState.origin.x;
    const rawDeltaY = pointerY - dragState.origin.y;
    const minOriginY = Math.min(...Object.values(dragState.originPositions).map((position) => position.y));
    const deltaY = Math.max(rawDeltaY, 16 - minOriginY);
    const deltaX = isDesktopCinematic ? 0 : Math.max(rawDeltaX, 16 - dragState.origin.x);
    const nextPositions = Object.entries(dragState.originPositions).reduce<Record<string, NodePosition>>((positions, [nodeId, origin]) => {
      positions[nodeId] = {
        x: Math.max(16, origin.x + deltaX),
        y: Math.max(16, origin.y + deltaY),
      };
      return positions;
    }, {});

    pendingDragPositionsRef.current = nextPositions;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      const pending = pendingDragPositionsRef.current;
      if (pending) setNodePositions((current) => ({ ...current, ...pending }));
      dragFrameRef.current = null;
    });
  };

  const handleCanvasPointerUp = async () => {
    if (!dragState) return;
    const draggedId = dragState.taskId;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const pendingPositions = pendingDragPositionsRef.current;
    pendingDragPositionsRef.current = null;
    const positionSnapshot = pendingPositions ? { ...nodePositions, ...pendingPositions } : nodePositions;
    if (pendingPositions) setNodePositions(positionSnapshot);
    setDragState(null);

    const draggedTask = taskById.get(draggedId);
    if (!draggedTask) return;

    const siblings = (childrenByParent.get(draggedTask.parent_task_id || null) || [])
      .filter((task) => task.topic_id === draggedTask.topic_id && canvasNodeIds.has(task.id));
    const ordered = [...siblings].sort((a, b) => (positionSnapshot[a.id]?.y || 0) - (positionSnapshot[b.id]?.y || 0));
    const changedOrders = ordered
      .map((task, index) => ({ task, sortOrder: index }))
      .filter(({ task, sortOrder }) => sortOrder !== (task.sort_order ?? 0));

    if (changedOrders.length > 0) {
      if (isDesktopCinematic) setIsCommittingDrag(true);
      try {
        await Promise.all(changedOrders.map(({ task, sortOrder }) => api.updateTask({ id: task.id, sortOrder })));
        setTasks((current) =>
          current.map((task) => {
            const changed = changedOrders.find((item) => item.task.id === task.id);
            return changed ? { ...task, sort_order: changed.sortOrder } : task;
          })
        );
        if (isDesktopCinematic) setShouldReflowAfterDrop(true);
        showDropFeedback(draggedId, 'success');
      } catch (error) {
        setNodePositions((current) => ({ ...current, ...dragState.originPositions }));
        showDropFeedback(draggedId, 'error');
        setErrorMessage(error instanceof Error ? error.message : 'Could not save task order.');
      } finally {
        if (isDesktopCinematic) setIsCommittingDrag(false);
      }
    } else {
      if (isDesktopCinematic) {
        setNodePositions((current) => ({ ...current, ...dragState.originPositions }));
      }
      showDropFeedback(draggedId, 'success');
    }
  };

  const handleCanvasPointerCancel = () => {
    if (!dragState) return;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragPositionsRef.current = null;
    setNodePositions((current) => ({ ...current, ...dragState.originPositions }));
    setDragState(null);
  };

  const handleOutlineReorder = async (draggedId: string, targetId: string, position: 'before' | 'after') => {
    const draggedTask = taskById.get(draggedId);
    const targetTask = taskById.get(targetId);
    if (!draggedTask || !targetTask || draggedId === targetId) return;
    if ((draggedTask.parent_task_id || null) !== (targetTask.parent_task_id || null) || draggedTask.topic_id !== targetTask.topic_id) {
      showDropFeedback(draggedId, 'error');
      setErrorMessage('Tasks can only be reordered inside the same branch.');
      return;
    }

    const siblings = (childrenByParent.get(draggedTask.parent_task_id || null) || [])
      .filter((task) => task.topic_id === draggedTask.topic_id);
    const withoutDragged = siblings.filter((task) => task.id !== draggedId);
    const targetIndex = withoutDragged.findIndex((task) => task.id === targetId);
    if (targetIndex < 0) return;

    const reordered = [...withoutDragged];
    reordered.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, draggedTask);
    const changedOrders = reordered
      .map((task, sortOrder) => ({ task, sortOrder }))
      .filter(({ task, sortOrder }) => (task.sort_order ?? 0) !== sortOrder);
    if (changedOrders.length === 0) {
      showDropFeedback(draggedId, 'success');
      return;
    }

    const previousTasks = tasks;
    setTasks((current) => current.map((task) => {
      const changed = changedOrders.find((item) => item.task.id === task.id);
      return changed ? { ...task, sort_order: changed.sortOrder } : task;
    }));
    try {
      await Promise.all(changedOrders.map(({ task, sortOrder }) => api.updateTask({ id: task.id, sortOrder })));
      showDropFeedback(draggedId, 'success');
      setErrorMessage('');
    } catch (error) {
      setTasks(previousTasks);
      showDropFeedback(draggedId, 'error');
      setErrorMessage(error instanceof Error ? error.message : 'Could not save task order.');
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
      const parentTaskId = taskDraft.parentTaskId;
      setIsTaskModalOpen(false);
      setTaskDraft(emptyTaskDraft);
      await loadData();
      // When adding a CHILD, keep the current selection/view (the network stays
      // exactly where it was — no jump back to the topic orbit). Only jump to
      // the new task when it's a brand-new top-level root, where there's no
      // prior branch context to preserve.
      if (!parentTaskId) setSelectedTaskId(created.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the task.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLeaf = async (task: ApiTask, clickEvent?: ReactMouseEvent<HTMLElement>) => {
    if ((childrenByParent.get(task.id) || []).length > 0) return;

    const status: ApiTaskStatus = task.status === 'completed' ? 'not_completed' : 'completed';
    const clickOrigin = clickEvent
      ? { x: clickEvent.clientX / window.innerWidth, y: clickEvent.clientY / window.innerHeight }
      : { x: 0.5, y: 0.5 };
    const updated = await handleUpdateTask(task.id, { status });
    if (!updated || !isDesktopCinematic || status !== 'completed') return;

    setCompletionPulseId(task.id);
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = window.setTimeout(() => {
      setCompletionPulseId(null);
      completionTimerRef.current = null;
    }, 760);

    if (!reducedMotion) {
      const { default: confetti } = await import('canvas-confetti');
      confetti({
        particleCount: 16,
        spread: 46,
        startVelocity: 18,
        gravity: 0.72,
        scalar: 0.62,
        ticks: 76,
        origin: clickOrigin,
        colors: ['#67e8f9', '#34d399', '#a78bfa', '#f8fafc'],
        disableForReducedMotion: true,
      });
    }
  };

  const handleUpdateTask = async (taskId: string, input: { status?: ApiTaskStatus; title?: string; startDate?: string | null; deadline?: string | null }) => {
    // Optimistic: flip the status locally right away so the click reads as
    // instant, instead of waiting on the round-trip before anything visible
    // happens. The subsequent loadData() reconciles with the server's truth
    // (including any recomputed parent effective_status).
    if (input.status) {
      setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: input.status as ApiTaskStatus, effective_status: input.status } : task));
    }
    try {
      await api.updateTask({ id: taskId, ...input });
      await loadData();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update task status.');
      await loadData();
      return false;
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

  // Orbit asks for the shape of a branch; it never asks for tree UI. Task
  // logic (toggling, editing, ordering) stays here in the workspace.
  const getOrbitSubtree = useCallback((taskId: string): TreeTaskInput[] => {
    const flattened: TreeTaskInput[] = [];
    const visit = (task: ApiTask, parentId: string | null) => {
      const children = (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId);
      flattened.push({
        id: task.id,
        parentId,
        title: task.title,
        done: isTaskDone(task),
        isLeaf: children.length === 0,
        urgent: isTaskDueToday(task) || isTaskOverdue(task),
      });
      children.forEach((child) => visit(child, task.id));
    };
    const rootTask = taskById.get(taskId);
    if (rootTask) visit(rootTask, null);
    return flattened;
  }, [childrenByParent, selectedTopicId, taskById]);

  return (
    <div
      className={`premium-card overflow-visible text-slate-950 lg:min-h-[calc(100vh-140px)] lg:overflow-hidden ${isDesktopCinematic ? 'experience-v2 desktop-task-workspace rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,.12)]' : ''}`}
      data-task-workspace-variant={variant}
      data-task-workspace-view={workspaceView}
    >
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-120px)]">
        <main className="flex min-w-0 flex-col">
          <header className={`desktop-task-commandbar border-b border-slate-200 px-3 py-4 sm:px-5 ${isDesktopCinematic ? 'bg-white/85 backdrop-blur-xl' : 'bg-transparent'}`}>
            <div className="desktop-task-commandbar-row flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                {sidebarChrome && (
                  <button
                    type="button"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    onClick={sidebarChrome.toggle}
                    aria-label={sidebarChrome.collapsed ? 'Show navigation sidebar' : 'Hide navigation sidebar'}
                    aria-pressed={sidebarChrome.collapsed}
                    title={sidebarChrome.collapsed ? 'Show navigation sidebar' : 'Hide navigation sidebar'}
                  >
                    {sidebarChrome.collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </button>
                )}
                <div className="desktop-task-intro">
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
                  <button
                    type="button"
                    onClick={() => setWorkspaceView('orbit')}
                    aria-pressed={workspaceView === 'orbit'}
                    className={`relative isolate inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                      isDesktopCinematic
                        ? workspaceView === 'orbit' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
                        : workspaceView === 'orbit' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {isDesktopCinematic && workspaceView === 'orbit' && (
                      <motion.span
                        layoutId={reducedMotion ? undefined : 'desktop-task-workspace-view'}
                        className="absolute inset-0 -z-10 rounded bg-white shadow-sm"
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
                      />
                    )}
                    <Orbit className="relative h-3.5 w-3.5" />
                    <span className="relative">3D tree</span>
                  </button>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:flex-nowrap">
                <form onSubmit={handleCreateTopic} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-[1_1_260px] xl:flex-none">
                  <input
                    value={newTopicName}
                    onChange={(event) => setNewTopicName(event.target.value)}
                    placeholder="New root"
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 sm:min-w-0 sm:flex-1 xl:w-36 xl:flex-none"
                  />
                  <button className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50">
                    <FolderPlus className="h-4 w-4" />
                    Create
                  </button>
                </form>
                <div className="relative min-w-0 sm:flex-[1_1_220px] xl:flex-none">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search tasks or notes"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 xl:w-64"
                  />
                </div>
                <button
                  onClick={() => openTaskModal(null, selectedTopicId || topics[0]?.id)}
                  className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
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
          </header>

          <WorkspaceViewTransition enabled={isDesktopCinematic && !reducedMotion} view={workspaceView}>
          {workspaceView === 'orbit' ? (
            <TopicOrbitView
              topicName={selectedRootTopic?.name || 'No topic selected'}
              topicAccent={getTopicColorByName(selectedRootTopic?.topic_color, 0).text}
              planets={orbitPlanets}
              reducedMotion={Boolean(reducedMotion)}
              getSubtree={getOrbitSubtree}
              onSelectPlanet={(taskId) => setSelectedTaskId(taskId)}
              onOpenTask={openTaskDetails}
              onToggleTask={(taskId) => {
                const task = taskById.get(taskId);
                if (task) void handleToggleLeaf(task);
              }}
              controls={
                <select
                  value={selectedTopicId}
                  onChange={(event) => { setSelectedTopicId(event.target.value); setSelectedTaskId(null); }}
                  disabled={topics.length === 0}
                  aria-label="Choose a life root to put in orbit"
                  className="topic-orbit-hud-select"
                >
                  {topics.length === 0 && <option value="">No roots yet</option>}
                  {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
              }
              emptyState={selectedRootTopic
                ? 'This life root has no first-level projects yet — add one and it will fall into the disk.'
                : 'Pick a life root in the Tree view to pull its projects into the disk.'}
            />
          ) : workspaceView === 'tree' ? (
          isDesktopCinematic ? (
            <DesktopTaskOutline
              topics={topics}
              selectedTopicId={selectedTopicId}
              selectedTopic={selectedRootTopic}
              tasks={tasks}
              rootTasks={rootTasks}
              childrenByParent={childrenByParent}
              visibleTaskIds={canvasNodeIds}
              selectedTaskId={selectedTaskId}
              selectedBranchIds={selectedBranchIds}
              searchTerm={searchTerm}
              reducedMotion={reducedMotion}
              dropFeedback={dropFeedback}
              completionPulseId={completionPulseId}
              onTopicChange={(topicId) => {
                setSelectedTopicId(topicId);
                setSelectedTaskId(null);
              }}
              onSelectTask={setSelectedTaskId}
              onOpenTask={openTaskDetails}
              onToggleTask={handleToggleLeaf}
              onAddChild={(taskId) => openTaskModal(taskId)}
              onAddRootTask={() => openTaskModal(null, selectedTopicId || topics[0]?.id)}
              onEditTopic={() => selectedRootTopic && openTopicEditor(selectedRootTopic)}
              onContextMenu={openTaskContextMenu}
              onReorder={handleOutlineReorder}
            />
          ) : (
          <section
            ref={canvasRef}
            role={isDesktopCinematic ? 'tree' : undefined}
            aria-label={isDesktopCinematic ? 'Task hierarchy' : undefined}
            tabIndex={isDesktopCinematic ? 0 : undefined}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerCancel}
            onScroll={handleCanvasScroll}
            onWheelCapture={handleDesktopTreeWheel}
            onKeyDown={handleDesktopTreeKeyDown}
            className={`relative h-[58vh] min-h-[360px] select-none overflow-auto sm:h-[64vh] sm:min-h-[460px] lg:min-h-0 lg:flex-1 ${isDesktopCinematic ? 'desktop-task-tree-shell' : 'bg-slate-50'}`}
            style={{ touchAction: dragState ? 'none' : 'pan-x pan-y' }}
            data-tree-motion={treeMotionMode}
            data-tree-dragging={dragState ? 'true' : 'false'}
          >
            <div className={`sticky left-0 top-0 z-20 w-full px-3 py-3 backdrop-blur-xl sm:px-4 ${isDesktopCinematic ? 'desktop-task-tree-toolbar' : 'border-b border-slate-200 bg-white/95'}`}>
              <div className={`mb-2 flex flex-wrap items-center gap-2 ${isDesktopCinematic ? 'min-h-11' : ''}`}>
                <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <span className={`shrink-0 text-xs font-semibold uppercase ${isDesktopCinematic ? 'tracking-[.16em] text-cyan-100/55' : 'tracking-wide text-slate-500'}`}>
                    {isDesktopCinematic ? 'Life root' : 'Root task'}
                  </span>
                  <select
                    value={selectedTopicId}
                    onChange={(event) => {
                      setSelectedTopicId(event.target.value);
                      setSelectedTaskId(null);
                    }}
                    disabled={topics.length === 0}
                    aria-label="Choose a root to display"
                    className={`h-10 min-w-0 flex-1 rounded-xl px-3 text-sm font-medium outline-none disabled:cursor-not-allowed sm:w-64 sm:flex-none ${isDesktopCinematic ? 'desktop-task-tree-select border border-white/10 bg-white/[.07] text-slate-100 focus:border-cyan-300/55 focus:ring-2 focus:ring-cyan-300/10 disabled:text-slate-500' : 'border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400'}`}
                  >
                    {topics.length === 0 && <option value="">No roots yet</option>}
                    {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                  </select>
                </label>
                {isDesktopCinematic && (
                  <div className="desktop-task-tree-context hidden min-w-0 items-center gap-2 xl:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.85)]" />
                    <span className="max-w-48 truncate text-xs text-slate-300">
                      {selectedTask ? selectedTask.title : `${Math.max(0, diagramNodes.length - 1)} tasks mapped`}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
                      {Math.max(0, diagramNodes.length - 1)} nodes
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={resetCanvasLayout}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${isDesktopCinematic ? 'desktop-task-tree-control border-white/10 bg-white/[.06] text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <LocateFixed className="h-4 w-4" />
                  {isDesktopCinematic ? 'Reflow tree' : 'Auto layout'}
                </button>
                <div className={`inline-flex h-9 overflow-hidden rounded-lg border text-sm ${isDesktopCinematic ? 'border-white/10 bg-white/[.06]' : 'border-slate-200 bg-white'}`}>
                  <button type="button" onClick={() => updateCanvasZoom(canvasZoom - 0.1)} aria-label="Zoom out" className={isDesktopCinematic ? 'px-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white' : 'px-2.5 text-slate-600 hover:bg-slate-50'}>−</button>
                  <button type="button" onClick={() => updateCanvasZoom(1)} aria-label="Reset zoom" className={isDesktopCinematic ? 'border-x border-white/10 px-3 font-medium text-cyan-100' : 'border-x border-slate-200 px-3 font-medium text-slate-700'}>{Math.round(canvasZoom * 100)}%</button>
                  <button type="button" onClick={() => updateCanvasZoom(canvasZoom + 0.1)} aria-label="Zoom in" className={isDesktopCinematic ? 'px-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white' : 'px-2.5 text-slate-600 hover:bg-slate-50'}>+</button>
                </div>
                <span className={`hidden text-xs sm:inline ${isDesktopCinematic ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isDesktopCinematic
                    ? searchTerm.trim() ? 'Clear search to reorder. Hidden siblings stay protected.' : 'Drag vertically to reorder a branch. Double-click for details.'
                    : 'Use Ctrl + / − to zoom. Drag nodes to organize the tree.'}
                </span>
              </div>
              <div ref={topScrollRef} onScroll={handleTopScroll} className={`h-4 w-full overflow-x-auto overflow-y-hidden ${isDesktopCinematic ? 'desktop-task-tree-minimap-scroll' : ''}`}>
                <div style={{ width: scaledCanvasSize.width, height: 1 }} />
              </div>
            </div>

            {diagramNodes.length === 0 ? (
              <div className={`m-4 flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed text-center text-sm ${isDesktopCinematic ? 'border-white/15 bg-white/[.035] text-slate-400' : 'border-slate-300 bg-white text-slate-500'}`}>
                No roots yet. Create your first life root to begin.
              </div>
            ) : (
              <div className="relative" style={{ width: scaledCanvasSize.width, height: scaledCanvasSize.height }}>
                <div className={`absolute left-0 top-0 ${isDesktopCinematic ? 'desktop-task-tree-stage' : ''}`} style={{ width: canvasSize.width, height: canvasSize.height, transform: `scale(${canvasZoom})`, transformOrigin: '0 0' }}>
                {isDesktopCinematic ? (
                  <DesktopTreeConnectors
                    canvasSize={canvasSize}
                    connectorGroups={connectorGroups}
                    diagramNodeById={diagramNodeById}
                    nodePositions={nodePositions}
                    visibleNodeIds={visibleDiagramNodeIds}
                    selectedBranchIds={selectedBranchIds}
                    selectedTaskId={selectedTaskId}
                    draggedTaskId={dragState?.taskId || null}
                    motionMode={treeMotionMode}
                  />
                ) : (
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
                )}

                {dragDropPreview && (
                  <motion.div
                    className="desktop-task-tree-drop-slot pointer-events-none absolute z-[8]"
                    initial={treeMotionMode === 'cinematic' ? { opacity: 0, scaleX: 0.72 } : false}
                    animate={{ opacity: 1, scaleX: 1, x: dragDropPreview.x, y: dragDropPreview.y }}
                    transition={treeMotionMode === 'minimal' ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                  >
                    <span>Position {dragDropPreview.order} / {dragDropPreview.total}</span>
                  </motion.div>
                )}

                {visibleDiagramNodes.map((node) => {
                  const position = nodePositions[node.id] || autoLayoutPositions[node.id] || { x: treeCanvasPadding, y: treeCanvasPadding };
                  const nodeSize = getNodeSize(node, isDesktopCinematic);
                  if (node.kind !== 'task') {
                    return (
                      <TopicDiagramNode
                        key={node.id}
                        node={node}
                        position={position}
                        nodeSize={nodeSize}
                        variant={variant}
                        isSelected={selectedTaskId === null && node.topic?.id === selectedTopicId}
                        isBranchActive={selectedBranchIds.has(node.id)}
                        taskCount={tasks.filter((task) => task.topic_id === node.topic?.id).length}
                        onSelect={() => {
                          setSelectedTaskId(null);
                          setSelectedTopicId(node.topic?.id || '');
                        }}
                        onDragStart={isDesktopCinematic ? undefined : (event) => startDrag(event, node.id)}
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
                      nodeSize={nodeSize}
                      variant={variant}
                      isSelected={selectedTaskId === task.id}
                      isDragging={dragState?.taskId === task.id}
                      isMuted={Boolean(selectedTaskId && !selectedBranchIds.has(task.id))}
                      isBranchActive={selectedBranchIds.has(task.id)}
                      motionMode={treeMotionMode}
                      feedbackTone={dropFeedback?.taskId === task.id ? dropFeedback.tone : null}
                      completionPulse={completionPulseId === task.id}
                      hasChildren={(childrenByParent.get(task.id) || []).length > 0}
                      onSelect={() => setSelectedTaskId(task.id)}
                      onContextMenu={(event) => openTaskContextMenu(event, task.id)}
                      onDragStart={(event) => startDrag(event, node.id)}
                      onToggle={(event) => handleToggleLeaf(task, event)}
                      onAddChild={() => openTaskModal(task.id)}
                      onOpen={() => openTaskDetails(task.id)}
                    />
                  );
                })}
                </div>
              </div>
            )}
          </section>
          )
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
              onAddRootTask={(topicId) => openTaskModal(null, topicId)}
            />
          )}
          </WorkspaceViewTransition>
        </main>
      </div>

      {taskContextMenu && (
        <div
          className={`fixed z-50 w-44 overflow-hidden py-1 text-sm shadow-xl ${isDesktopCinematic ? 'desktop-task-tree-menu rounded-xl border border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl' : 'rounded-md border border-slate-200 bg-white'}`}
          style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
          aria-label="Task actions"
        >
          <button
            type="button"
            onClick={() => { const taskId = taskContextMenu.taskId; setTaskContextMenu(null); openTaskModal(taskId); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left ${isDesktopCinematic ? 'text-slate-200 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            role="menuitem"
          >
            <FolderPlus className="h-4 w-4" />
            Add child task
          </button>
          <button
            type="button"
            onClick={() => { const taskId = taskContextMenu.taskId; setTaskContextMenu(null); openTaskDetails(taskId); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left ${isDesktopCinematic ? 'text-slate-200 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            role="menuitem"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => { const taskId = taskContextMenu.taskId; setTaskContextMenu(null); void handleArchiveTask(taskId); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left ${isDesktopCinematic ? 'text-rose-300 hover:bg-rose-400/10 hover:text-rose-200' : 'text-red-600 hover:bg-red-50'}`}
            role="menuitem"
          >
            <Trash2 className="h-4 w-4" />
            Delete task
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
            onUpdateTask={async (taskId, input) => { await handleUpdateTask(taskId, input); }}
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

function DesktopTaskOutline({
  topics,
  selectedTopicId,
  selectedTopic,
  tasks,
  rootTasks,
  childrenByParent,
  visibleTaskIds,
  selectedTaskId,
  selectedBranchIds,
  searchTerm,
  reducedMotion,
  dropFeedback,
  completionPulseId,
  onTopicChange,
  onSelectTask,
  onOpenTask,
  onToggleTask,
  onAddChild,
  onAddRootTask,
  onEditTopic,
  onContextMenu,
  onReorder,
}: {
  topics: ApiTopic[];
  selectedTopicId: string;
  selectedTopic: ApiTopic | null;
  tasks: ApiTask[];
  rootTasks: ApiTask[];
  childrenByParent: Map<string | null, ApiTask[]>;
  visibleTaskIds: Set<string>;
  selectedTaskId: string | null;
  selectedBranchIds: Set<string>;
  searchTerm: string;
  reducedMotion: boolean;
  dropFeedback: DropFeedback | null;
  completionPulseId: string | null;
  onTopicChange: (topicId: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (task: ApiTask, event?: ReactMouseEvent<HTMLElement>) => void;
  onAddChild: (taskId: string) => void;
  onAddRootTask: () => void;
  onEditTopic: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, taskId: string) => void;
  onReorder: (draggedId: string, targetId: string, position: 'before' | 'after') => Promise<void>;
}) {
  const initializedTopicRef = useRef('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ taskId: string; position: 'before' | 'after' } | null>(null);
  const topicTasks = useMemo(() => tasks.filter((task) => task.topic_id === selectedTopicId), [selectedTopicId, tasks]);
  const displayedRoots = useMemo(
    () => rootTasks.filter((task) => task.topic_id === selectedTopicId && visibleTaskIds.has(task.id)),
    [rootTasks, selectedTopicId, visibleTaskIds],
  );
  const parentIds = useMemo(
    () => new Set(topicTasks.filter((task) => (childrenByParent.get(task.id) || []).some((child) => child.topic_id === selectedTopicId)).map((task) => task.id)),
    [childrenByParent, selectedTopicId, topicTasks],
  );

  useEffect(() => {
    if (initializedTopicRef.current === selectedTopicId) return;
    initializedTopicRef.current = selectedTopicId;
    setExpandedIds(new Set(parentIds));
  }, [parentIds, selectedTopicId]);

  useEffect(() => {
    if (!searchTerm.trim()) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      visibleTaskIds.forEach((id) => {
        if (parentIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [parentIds, searchTerm, visibleTaskIds]);

  const completedCount = topicTasks.filter(isTaskDone).length;
  const leafTasks = topicTasks.filter((task) => (childrenByParent.get(task.id) || []).length === 0);
  const completedLeaves = leafTasks.filter(isTaskDone).length;
  const completion = leafTasks.length ? Math.round((completedLeaves / leafTasks.length) * 100) : 0;
  const visibleCount = topicTasks.filter((task) => visibleTaskIds.has(task.id)).length;
  const shouldAnimate = !reducedMotion && topicTasks.length <= 120;

  const toggleExpanded = (taskId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleDragStart = (event: ReactDragEvent<HTMLElement>, taskId: string) => {
    setDraggingId(taskId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
    const row = event.currentTarget.closest('[data-outline-row]');
    if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 32, 30);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>, target: ApiTask) => {
    if (!draggingId || draggingId === target.id) return;
    const dragged = tasks.find((task) => task.id === draggingId);
    if (!dragged || (dragged.parent_task_id || null) !== (target.parent_task_id || null) || dragged.topic_id !== target.topic_id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ taskId: target.id, position });
  };

  const finishDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const renderTask = (task: ApiTask, depth: number): ReactNode => {
    const directChildren = (childrenByParent.get(task.id) || [])
      .filter((child) => child.topic_id === selectedTopicId);
    const children = directChildren.filter((child) => visibleTaskIds.has(child.id));
    const hasChildren = directChildren.length > 0;
    const hasVisibleChildren = children.length > 0;
    const expanded = hasVisibleChildren && expandedIds.has(task.id);
    const done = isTaskDone(task);
    const overdue = isTaskOverdue(task);
    const inProgress = isTaskInProgress(task);
    const taskCompletion = (task.leaf_count || 0) > 0
      ? Math.round(((task.completed_leaf_count || 0) / Math.max(1, task.leaf_count || 1)) * 100)
      : done ? 100 : 0;
    const tone = done ? 'complete' : overdue ? 'overdue' : inProgress ? 'progress' : 'open';
    const isSelected = selectedTaskId === task.id;
    const branchActive = selectedBranchIds.has(task.id);
    const dropPosition = dropTarget?.taskId === task.id ? dropTarget.position : undefined;

    return (
      <li key={task.id} className="desktop-outline-item" role="treeitem" aria-level={depth + 1} aria-selected={isSelected} aria-expanded={hasChildren ? expanded : undefined}>
        <motion.div
          layout={shouldAnimate ? 'position' : false}
          initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: draggingId === task.id ? 0.48 : 1, y: 0, scale: dropFeedback?.taskId === task.id && dropFeedback.tone === 'success' ? [1, 1.012, 1] : 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
          className="desktop-outline-row-wrap"
          data-drop-position={dropPosition}
        >
          <div
            data-outline-row
            data-tone={tone}
            data-selected={isSelected ? 'true' : 'false'}
            data-branch-active={branchActive ? 'true' : 'false'}
            data-completion-pulse={completionPulseId === task.id ? 'true' : 'false'}
            className="desktop-outline-row group"
            onClick={() => onSelectTask(task.id)}
            onDoubleClick={() => onOpenTask(task.id)}
            onContextMenu={(event) => onContextMenu(event, task.id)}
            onDragOver={(event) => handleDragOver(event, task)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const activeDrop = dropTarget;
              const draggedId = draggingId || event.dataTransfer.getData('text/plain');
              finishDrag();
              if (draggedId && activeDrop?.taskId === task.id) void onReorder(draggedId, task.id, activeDrop.position);
            }}
          >
            <div className="desktop-outline-primary">
              <button
                type="button"
                className="desktop-outline-disclosure"
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasVisibleChildren) toggleExpanded(task.id);
                }}
                aria-label={hasVisibleChildren ? `${expanded ? 'Collapse' : 'Expand'} ${task.title}` : undefined}
                tabIndex={hasVisibleChildren ? 0 : -1}
                disabled={!hasVisibleChildren}
              >
                {hasChildren ? expanded ? <ChevronDown /> : <ChevronRight /> : <span className="desktop-outline-leaf-dot" />}
              </button>
              {hasChildren ? (
                <span className="desktop-outline-status" title="Project status is calculated from leaf tasks">
                  {done ? <CheckCircle2 /> : <GitBranch />}
                </span>
              ) : (
                <button
                  type="button"
                  className="desktop-outline-status desktop-outline-check"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTask(task, event);
                  }}
                  aria-label={`${done ? 'Reopen' : 'Complete'} ${task.title}`}
                >
                  {done ? <CheckCircle2 /> : <Circle />}
                </button>
              )}
              <div className="desktop-outline-copy">
                <div className="desktop-outline-title-line">
                  <span className="desktop-outline-title">{task.title}</span>
                  {depth === 0 && <span className="desktop-outline-kind">Project</span>}
                </div>
                <div className="desktop-outline-meta">
                  {hasChildren ? <span>{task.completed_leaf_count || 0}/{task.leaf_count || 0} leaf tasks</span> : <span>{getTaskStatusLabel(task.effective_status)}</span>}
                  {task.deadline && <span className={overdue ? 'is-overdue' : ''}><CalendarDays /> {formatDate(task.deadline)}</span>}
                  {hasChildren && <span>{directChildren.length} direct {directChildren.length === 1 ? 'child' : 'children'}</span>}
                </div>
              </div>
            </div>

            <div className="desktop-outline-progress" aria-label={`${taskCompletion}% complete`}>
              <span><i style={{ width: `${taskCompletion}%` }} /></span>
              <strong>{taskCompletion}%</strong>
            </div>

            <div className="desktop-outline-actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); onAddChild(task.id); }} title="Add child task"><Plus /></button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onOpenTask(task.id); }} title="Open details"><Pencil /></button>
              <button
                type="button"
                draggable
                onDragStart={(event) => handleDragStart(event, task.id)}
                onDragEnd={finishDrag}
                title="Drag to reorder inside this branch"
                aria-label={`Reorder ${task.title}`}
                className="desktop-outline-drag"
              ><Move /></button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onContextMenu(event, task.id); }} title="More actions"><MoreHorizontal /></button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.ul
              role="group"
              className="desktop-outline-children"
              initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {children.map((child) => renderTask(child, depth + 1))}
            </motion.ul>
          )}
        </AnimatePresence>
      </li>
    );
  };

  return (
    <>
    <DesktopTaskNetworkCanvas
      topics={topics}
      selectedTopicId={selectedTopicId}
      selectedTopic={selectedTopic}
      tasks={tasks}
      childrenByParent={childrenByParent}
      visibleTaskIds={visibleTaskIds}
      selectedTaskId={selectedTaskId}
      selectedBranchIds={selectedBranchIds}
      searchTerm={searchTerm}
      reducedMotion={reducedMotion}
      onTopicChange={onTopicChange}
      onSelectTask={onSelectTask}
      onOpenTask={onOpenTask}
      onEditTopic={onEditTopic}
      onToggleTask={onToggleTask}
      onContextMenu={onContextMenu}
    />
    {false && (
    <section className="desktop-task-outline" aria-label="Task hierarchy">
      <header className="desktop-outline-root-card">
        <div className="desktop-outline-root-main">
          <span className="desktop-outline-root-icon"><GitBranch /></span>
          <div className="min-w-0">
            <span className="desktop-outline-eyebrow">Life root</span>
            <div className="desktop-outline-root-title">
              <select value={selectedTopicId} onChange={(event) => onTopicChange(event.target.value)} disabled={!topics.length} aria-label="Choose life root">
                {!topics.length && <option value="">No roots yet</option>}
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
              {selectedTopic && <button type="button" onClick={onEditTopic} title="Rename root"><Pencil /></button>}
            </div>
            <p>{searchTerm.trim() ? `${visibleCount} matching tasks and their paths` : `${topicTasks.length} tasks organized across ${displayedRoots.length} top-level projects`}</p>
          </div>
        </div>
        <div className="desktop-outline-root-progress">
          <div><span>Leaf completion</span><strong>{completion}%</strong></div>
          <span><i style={{ width: `${completion}%` }} /></span>
          <small>{completedLeaves} of {leafTasks.length} next actions complete</small>
        </div>
        <div className="desktop-outline-root-actions">
          <button type="button" onClick={() => setExpandedIds(new Set(parentIds))}><ChevronDown /> Expand all</button>
          <button type="button" onClick={() => setExpandedIds(new Set())}><ChevronRight /> Collapse all</button>
          <button type="button" className="is-primary" onClick={onAddRootTask}><Plus /> Add project</button>
        </div>
      </header>

      <div className="desktop-outline-column-head" aria-hidden="true">
        <span>Task hierarchy</span><span>Progress</span><span>Actions</span>
      </div>
      <div className="desktop-outline-scroll">
        {displayedRoots.length ? (
          <ul className="desktop-outline-tree" role="tree">
            {displayedRoots.map((task) => renderTask(task, 0))}
          </ul>
        ) : (
          <div className="desktop-outline-empty">
            <span><GitBranch /></span>
            <strong>{searchTerm.trim() ? 'No tasks match this search' : 'This life root is ready for its first project'}</strong>
            <p>{searchTerm.trim() ? 'Try a broader title or note.' : 'Create a top-level project, then break it into clear next actions.'}</p>
            {!searchTerm.trim() && <button type="button" onClick={onAddRootTask}><Plus /> Add first project</button>}
          </div>
        )}
      </div>
      <footer className="desktop-outline-footer">
        <span><i className="is-complete" /> {completedCount} completed</span>
        <span><i className="is-open" /> {topicTasks.length - completedCount} active</span>
        <span className="ml-auto"><Move /> Drag the handle to reorder within the same branch</span>
      </footer>
    </section>
    )}
    </>
  );
}

function DesktopTaskNetworkCanvas({
  topics,
  selectedTopicId,
  selectedTopic,
  tasks,
  childrenByParent,
  visibleTaskIds,
  selectedTaskId,
  selectedBranchIds,
  searchTerm,
  reducedMotion,
  onTopicChange,
  onSelectTask,
  onOpenTask,
  onEditTopic,
  onToggleTask,
  onContextMenu,
}: {
  topics: ApiTopic[];
  selectedTopicId: string;
  selectedTopic: ApiTopic | null;
  tasks: ApiTask[];
  childrenByParent: Map<string | null, ApiTask[]>;
  visibleTaskIds: Set<string>;
  selectedTaskId: string | null;
  selectedBranchIds: Set<string>;
  searchTerm: string;
  reducedMotion: boolean;
  onTopicChange: (topicId: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onEditTopic: () => void;
  onToggleTask: (task: ApiTask, clickEvent?: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, taskId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const diveShellRef = useRef<HTMLDivElement | null>(null);
  const semanticDiveRef = useRef<SemanticDiveDirector | null>(null);
  const diveActiveRef = useRef(false);
  const diveRequestTokenRef = useRef(0);
  const captureDiveSnapshotRef = useRef<(worldKey?: string, preferOverlay?: boolean, portalNodeId?: string) => NetworkDiveSnapshot | null>(() => null);
  const didDragRef = useRef(false);
  const expansionTimerRef = useRef<number | null>(null);
  const topicNodeRevealTimerRef = useRef<number | null>(null);
  const topicEdgeRevealTimerRef = useRef<number | null>(null);
  const topicStoryTimersRef = useRef<number[]>([]);
  const branchStoryTimersRef = useRef<number[]>([]);
  // Per-id timers for the branch/duyệt-cây reveal, keyed by edge key / node
  // id. Unlike a flat array, scheduling a new reveal for an id that already
  // has one in flight (collapse + re-expand before the last run finished)
  // cancels JUST that stale timer first — so it can never fire later and
  // re-toggle that node/edge out of order, which is what caused nodes to
  // visibly reappear in repeated waves seconds after they'd already settled.
  const edgeRevealTimersRef = useRef(new Map<string, number>());
  const nodeRevealTimersRef = useRef(new Map<string, number>());
  const siblingRevealTimerRef = useRef<number | null>(null);
  const autoScrollKeyRef = useRef('');
  const topologyFieldRef = useRef<ElasticTopologyField | null>(null);
  const topologyNodeElementsRef = useRef(new Map<string, HTMLElement>());
  const topologyEdgeElementsRef = useRef(new Map<string, SVGPathElement>());
  const topologyReverseEdgeElementsRef = useRef(new Map<string, SVGPathElement>());
  const topologyNodeRefCallbacksRef = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const topologyEdgeRefCallbacksRef = useRef(new Map<string, (element: SVGPathElement | null) => void>());
  const pendingDragLogicalRef = useRef<NodePosition | null>(null);
  const pendingClusterLogicalRef = useRef<Record<string, NodePosition> | null>(null);
  const pendingGraphOffsetRef = useRef<NodePosition | null>(null);
  const pendingReleaseIdsRef = useRef<Set<string>>(new Set());
  const graphDragFieldOriginsRef = useRef<Record<string, NodePosition>>({});
  const completionReplayFramesRef = useRef<number[]>([]);
  const completionReplayTimerRef = useRef<number | null>(null);
  const previousDoneByIdRef = useRef<{ topicId: string; map: Map<string, boolean> }>({ topicId: '', map: new Map() });
  const [viewportSize, setViewportSize] = useState({ width: 980, height: 620 });
  const [zoom, setZoom] = useState(1);
  const [isNetworkFullscreen, setIsNetworkFullscreen] = useState(false);
  const [viewportOffset, setViewportOffset] = useState<NodePosition>({ x: 0, y: 0 });
  const viewportOffsetRef = useRef<NodePosition>({ x: 0, y: 0 });
  const [customPositions, setCustomPositions] = useState<Record<string, NodePosition>>({});
  const customPositionsRef = useRef<Record<string, NodePosition>>({});
  const layoutPositionsRef = useRef<Record<string, NodePosition>>({});
  const [dragging, setDragging] = useState<NetworkDragState | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [rootLimit, setRootLimit] = useState(10);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [expansionPulseId, setExpansionPulseId] = useState<string | null>(null);
  const [topicRevealStage, setTopicRevealStage] = useState<0 | 1 | 2>(0);
  const [topicStoryPhase, setTopicStoryPhase] = useState<TopicStoryPhase>('focus');
  const [topicStoryNonce, setTopicStoryNonce] = useState(0);
  const [storyVisibleNodeIds, setStoryVisibleNodeIds] = useState<Set<string>>(new Set());
  const [storyVisibleEdgeIds, setStoryVisibleEdgeIds] = useState<Set<string>>(new Set());
  const [storyCompletedNodeIds, setStoryCompletedNodeIds] = useState<Set<string>>(new Set());
  // Additive model: a node/edge is hidden only while its id sits in these
  // "pending" sets. Anything not pending (siblings, ancestors, already-settled
  // nodes) always renders — expanding one branch never hides unrelated nodes.
  const [branchPendingNodeIds, setBranchPendingNodeIds] = useState<Set<string>>(new Set());
  const [branchPendingEdgeIds, setBranchPendingEdgeIds] = useState<Set<string>>(new Set());
  const [branchPendingCompletionIds, setBranchPendingCompletionIds] = useState<Set<string>>(new Set());
  const [divePhase, setDivePhase] = useState<SemanticDivePhase>('idle');
  const [diveSnapshots, setDiveSnapshots] = useState<{ from: NetworkDiveSnapshot; to?: NetworkDiveSnapshot } | null>(null);
  const [completionReplayNonce, setCompletionReplayNonce] = useState(0);
  const [completionReplayRootId, setCompletionReplayRootId] = useState<string | null>(null);
  const [completionReplayPhase, setCompletionReplayPhase] = useState<CompletionReplayPhase>('primed');
  const startCompletionReplay = useCallback((rootId: string | null, settleAfterMs = 4200) => {
    if (completionReplayTimerRef.current !== null) {
      window.clearTimeout(completionReplayTimerRef.current);
      completionReplayTimerRef.current = null;
    }
    completionReplayFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    completionReplayFramesRef.current = [];
    setCompletionReplayRootId(rootId);
    setCompletionReplayPhase('primed');
    setCompletionReplayNonce((current) => current + 1);
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        setCompletionReplayPhase('playing');
        completionReplayFramesRef.current = [];
      });
      completionReplayFramesRef.current.push(secondFrame);
    });
    completionReplayFramesRef.current.push(firstFrame);
    // Without this, completionReplayPhase stays 'playing' forever (nothing
    // else ever resets it), which permanently pins data-completion-armed
    // true and the CSS-driven scale(.82) on that node's inner span for the
    // rest of the session — a plausible cause of "this node won't drag"
    // reports for whichever task last triggered the burst.
    completionReplayTimerRef.current = window.setTimeout(() => {
      setCompletionReplayPhase('idle');
      setCompletionReplayRootId(null);
      completionReplayTimerRef.current = null;
    }, settleAfterMs);
  }, []);
  const completeTopicTasks = useMemo(
    () => tasks.filter((task) => task.topic_id === selectedTopicId),
    [selectedTopicId, tasks],
  );
  const completionState = useMemo(() => {
    const topicTasksById = new Map(completeTopicTasks.map((task) => [task.id, task]));
    const doneById = new Map<string, boolean>();
    const waveLevelById = new Map<string, number>();
    const resolving = new Set<string>();
    const resolve = (task: ApiTask): { done: boolean; waveLevel: number } => {
      if (doneById.has(task.id)) return { done: doneById.get(task.id) as boolean, waveLevel: waveLevelById.get(task.id) || 0 };
      if (resolving.has(task.id)) return { done: false, waveLevel: 0 };
      resolving.add(task.id);
      const children = (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId && topicTasksById.has(child.id));
      const childStates = children.map(resolve);
      const done = children.length ? childStates.every((child) => child.done) : task.status === 'completed';
      const waveLevel = done && children.length ? 1 + Math.max(...childStates.map((child) => child.waveLevel)) : 0;
      resolving.delete(task.id);
      doneById.set(task.id, done);
      waveLevelById.set(task.id, waveLevel);
      return { done, waveLevel };
    };
    completeTopicTasks.forEach(resolve);
    return { doneById, waveLevelById };
  }, [childrenByParent, completeTopicTasks, selectedTopicId]);
  // Reactively replays the completion cascade (children light up + pulse,
  // then the burn travels up each child→parent edge, then the parent flips
  // to its own green tick) the instant a task's done-state actually changes —
  // not just when the user happens to navigate into that branch.
  useEffect(() => {
    const isNewTopic = previousDoneByIdRef.current.topicId !== selectedTopicId;
    const previous = isNewTopic ? new Map<string, boolean>() : previousDoneByIdRef.current.map;
    // Collect ids that just flipped to done, then pick the deepest one (largest
    // waveLevel means an ancestor — smallest means the leaf that triggered the
    // cascade). Replaying from the leaf scopes the burn to just this subtree +
    // its ancestor chain, instead of re-burning every completed edge on the map.
    const newlyDone: string[] = [];
    completionState.doneById.forEach((done, id) => {
      if (done && previous.get(id) !== true) newlyDone.push(id);
    });
    previousDoneByIdRef.current = { topicId: selectedTopicId, map: new Map(completionState.doneById) };
    if (!isNewTopic && newlyDone.length) {
      const leafFirst = newlyDone.sort((a, b) => (completionState.waveLevelById.get(a) || 0) - (completionState.waveLevelById.get(b) || 0));
      const maxWave = Math.max(0, ...newlyDone.map((id) => completionState.waveLevelById.get(id) || 0));
      startCompletionReplay(leafFirst[0], 1400 + maxWave * 1180);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionState.doneById, selectedTopicId]);
  const completionReplayIds = useMemo(() => {
    const ids = new Set<string>();
    if (!completionReplayRootId) {
      completeTopicTasks.forEach((task) => ids.add(task.id));
      return ids;
    }
    const taskMap = new Map(completeTopicTasks.map((task) => [task.id, task]));
    const visit = (taskId: string) => {
      if (ids.has(taskId)) return;
      ids.add(taskId);
      (childrenByParent.get(taskId) || []).filter((child) => child.topic_id === selectedTopicId).forEach((child) => visit(child.id));
    };
    visit(completionReplayRootId);
    let ancestorId = taskMap.get(completionReplayRootId)?.parent_task_id || null;
    while (ancestorId && !ids.has(ancestorId)) {
      ids.add(ancestorId);
      ancestorId = taskMap.get(ancestorId)?.parent_task_id || null;
    }
    return ids;
  }, [childrenByParent, completeTopicTasks, completionReplayRootId, selectedTopicId]);

  useEffect(() => {
    if (completionReplayPhase !== 'playing') return;
    if (completionReplayTimerRef.current !== null) window.clearTimeout(completionReplayTimerRef.current);
    const maximumWave = [...completionReplayIds].reduce((maximum, taskId) => Math.max(maximum, completionState.waveLevelById.get(taskId) || 0), 0);
    completionReplayTimerRef.current = window.setTimeout(() => {
      setCompletionReplayPhase('idle');
      completionReplayTimerRef.current = null;
    }, reducedMotion ? 0 : 320 + maximumWave * 1180 + 1280);
    return () => {
      if (completionReplayTimerRef.current !== null) {
        window.clearTimeout(completionReplayTimerRef.current);
        completionReplayTimerRef.current = null;
      }
    };
  }, [completionReplayIds, completionReplayPhase, completionState.waveLevelById, reducedMotion]);

  const availableTopicTasks = useMemo(
    () => completeTopicTasks.filter((task) => visibleTaskIds.has(task.id)),
    [completeTopicTasks, visibleTaskIds],
  );
  const allTaskById = useMemo(() => new Map(completeTopicTasks.map((task) => [task.id, task])), [completeTopicTasks]);
  const availableRootTasks = useMemo(() => {
    const availableIds = new Set(availableTopicTasks.map((task) => task.id));
    return (childrenByParent.get(null) || []).filter((task) => task.topic_id === selectedTopicId && availableIds.has(task.id));
  }, [availableTopicTasks, childrenByParent, selectedTopicId]);
  const topicTasks = useMemo(() => {
    const availableIds = new Set(availableTopicTasks.map((task) => task.id));
    const revealed = new Set<string>();
    const reveal = (task: ApiTask) => {
      if (!availableIds.has(task.id) || revealed.has(task.id)) return;
      revealed.add(task.id);
      if (!searchTerm.trim() && !expandedTaskIds.has(task.id)) return;
      (childrenByParent.get(task.id) || []).forEach(reveal);
    };
    availableRootTasks.slice(0, rootLimit).forEach(reveal);
    return availableTopicTasks.filter((task) => revealed.has(task.id));
  }, [availableRootTasks, availableTopicTasks, childrenByParent, expandedTaskIds, rootLimit, searchTerm]);
  const taskById = useMemo(() => new Map(topicTasks.map((task) => [task.id, task])), [topicTasks]);
  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;
  const selectedPath = useMemo(() => {
    if (!selectedTask) return [];
    const path: ApiTask[] = [];
    let current: ApiTask | undefined = selectedTask;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parent_task_id ? allTaskById.get(current.parent_task_id) : undefined;
    }
    return path;
  }, [allTaskById, selectedTask]);
  const focusedRootId = selectedPath.length > 0 && expandedTaskIds.has(selectedPath[0].id) ? selectedPath[0].id : null;
  const networkMetrics = useMemo(() => {
    let maxDepth = 1;
    let leafCount = 0;
    topicTasks.forEach((task) => {
      let depth = 1;
      let current = task;
      const visited = new Set<string>();
      while (current.parent_task_id && taskById.has(current.parent_task_id) && !visited.has(current.parent_task_id)) {
        visited.add(current.parent_task_id);
        current = taskById.get(current.parent_task_id) as ApiTask;
        depth += 1;
      }
      maxDepth = Math.max(maxDepth, depth);
      const visibleChildren = (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId && taskById.has(child.id));
      if (!visibleChildren.length) leafCount += 1;
    });
    return { maxDepth, leafCount: Math.max(1, leafCount) };
  }, [childrenByParent, selectedTopicId, taskById, topicTasks]);
  const stageSize = useMemo(() => {
    const visibleRootCount = Math.min(rootLimit, availableRootTasks.length);
    const extraDepth = Math.max(0, networkMetrics.maxDepth - 1);
    const widthForGraph = focusedRootId
      ? 740 + extraDepth * 232
      : 980 + extraDepth * 170;
    const heightForGraph = focusedRootId
      ? Math.max(620, visibleRootCount * 64 + 160, networkMetrics.leafCount * 78 + 160)
      : Math.max(620, 540 + Math.max(0, visibleRootCount - 8) * 38 + extraDepth * 90);
    return {
      width: Math.ceil(Math.max(viewportSize.width, widthForGraph)),
      height: Math.ceil(Math.max(viewportSize.height, heightForGraph)),
    };
  }, [availableRootTasks.length, focusedRootId, networkMetrics, rootLimit, viewportSize.height, viewportSize.width]);
  const renderedStageSize = useMemo(() => ({
    width: Math.max(stageSize.width, diveSnapshots?.from.stage.width || 0, diveSnapshots?.to?.stage.width || 0),
    height: Math.max(stageSize.height, diveSnapshots?.from.stage.height || 0, diveSnapshots?.to?.stage.height || 0),
  }), [diveSnapshots, stageSize.height, stageSize.width]);

  useEffect(() => {
    customPositionsRef.current = customPositions;
  }, [customPositions]);

  useEffect(() => {
    viewportOffsetRef.current = viewportOffset;
  }, [viewportOffset]);

  useEffect(() => {
    if (!isNetworkFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNetworkFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNetworkFullscreen]);

  useEffect(() => () => {
    if (expansionTimerRef.current !== null) window.clearTimeout(expansionTimerRef.current);
    if (topicNodeRevealTimerRef.current !== null) window.clearTimeout(topicNodeRevealTimerRef.current);
    if (topicEdgeRevealTimerRef.current !== null) window.clearTimeout(topicEdgeRevealTimerRef.current);
    topicStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    branchStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    edgeRevealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    nodeRevealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (siblingRevealTimerRef.current !== null) window.clearTimeout(siblingRevealTimerRef.current);
    if (completionReplayTimerRef.current !== null) window.clearTimeout(completionReplayTimerRef.current);
    completionReplayFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    topologyFieldRef.current?.destroy();
    semanticDiveRef.current?.destroy();
  }, []);

  useEffect(() => {
    setExpandedTaskIds(new Set());
    setRootLimit(10);
  }, [selectedTopicId]);

  useEffect(() => {
    if (topicNodeRevealTimerRef.current !== null) window.clearTimeout(topicNodeRevealTimerRef.current);
    if (topicEdgeRevealTimerRef.current !== null) window.clearTimeout(topicEdgeRevealTimerRef.current);
    topicStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    topicStoryTimersRef.current = [];
    setCompletionReplayRootId(null);
    if (!selectedTopicId) {
      setTopicRevealStage(2);
      setTopicStoryPhase('done');
      setCompletionReplayPhase('idle');
      return;
    }
    setCompletionReplayPhase('idle');
    setTopicStoryPhase('focus');
    setStoryVisibleNodeIds(new Set());
    setStoryVisibleEdgeIds(new Set());
    setStoryCompletedNodeIds(new Set());
    setTopicRevealStage(0);
    return () => {
      if (topicNodeRevealTimerRef.current !== null) window.clearTimeout(topicNodeRevealTimerRef.current);
      if (topicEdgeRevealTimerRef.current !== null) window.clearTimeout(topicEdgeRevealTimerRef.current);
      topicStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      topicStoryTimersRef.current = [];
    };
  }, [reducedMotion, selectedTopicId]);

  useEffect(() => {
    setRootLimit(10);
  }, [searchTerm]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => setViewportSize({ width: Math.max(640, viewport.clientWidth), height: Math.max(440, viewport.clientHeight) });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedTopicId) {
      customPositionsRef.current = {};
      setCustomPositions({});
      viewportOffsetRef.current = { x: 0, y: 0 };
      setViewportOffset({ x: 0, y: 0 });
      return;
    }
    try {
      const saved = window.localStorage.getItem(`desktop-task-network:v7:${selectedTopicId}:${focusedRootId || 'radial'}`);
      const next = saved ? JSON.parse(saved) as Record<string, NodePosition> : {};
      customPositionsRef.current = next;
      setCustomPositions(next);
    } catch {
      customPositionsRef.current = {};
      setCustomPositions({});
    }
    try {
      const savedViewport = window.localStorage.getItem(`desktop-task-network-view:v6:${selectedTopicId}:${focusedRootId || 'radial'}`);
      const parsedViewport = savedViewport ? JSON.parse(savedViewport) as Partial<NetworkViewportState> : {};
      const nextViewport = { x: parsedViewport.x || 0, y: parsedViewport.y || 0 };
      viewportOffsetRef.current = nextViewport;
      setViewportOffset(nextViewport);
    } catch {
      viewportOffsetRef.current = { x: 0, y: 0 };
      setViewportOffset({ x: 0, y: 0 });
    }
  }, [focusedRootId, selectedTopicId]);

  // Zoom is remembered per topic only (not per focus mode), so expanding a
  // branch or returning to the global network keeps the zoom level the user
  // had instead of snapping back to 100%.
  useEffect(() => {
    if (!selectedTopicId) {
      setZoom(1);
      return;
    }
    const isMobileViewport = viewportSize.width < 768;
    const defaultZoom = focusedRootId
      ? isMobileViewport ? .54 : .74
      : isMobileViewport ? .48 : .68;
    try {
      const savedZoom = window.localStorage.getItem(`desktop-task-network-zoom:v2:${selectedTopicId}:${focusedRootId || 'radial'}`);
      const parsed = savedZoom ? Number(JSON.parse(savedZoom)) : NaN;
      setZoom(Number.isFinite(parsed) ? Math.min(1.5, Math.max(.35, parsed)) : defaultZoom);
    } catch {
      setZoom(defaultZoom);
    }
  }, [focusedRootId, selectedTopicId, viewportSize.width]);

  const network = useMemo(() => {
    const topicId = topicNodeId(selectedTopicId);
    const center = focusedRootId
      ? { x: 148 + viewportOffset.x, y: stageSize.height * .5 + viewportOffset.y }
      : { x: stageSize.width * .5 + viewportOffset.x, y: stageSize.height * .5 + viewportOffset.y };
    const roots = (childrenByParent.get(null) || [])
      .filter((task) => task.topic_id === selectedTopicId && taskById.has(task.id));
    const visibleChildren = (taskId: string) => (childrenByParent.get(taskId) || [])
      .filter((task) => task.topic_id === selectedTopicId && taskById.has(task.id));
    const leafCount = (task: ApiTask): number => {
      const children = visibleChildren(task.id);
      return children.length ? children.reduce((sum, child) => sum + leafCount(child), 0) : 1;
    };
    const totalLeaves = Math.max(1, roots.reduce((sum, root) => sum + leafCount(root), 0));
    const rootRadiusX = Math.max(270, Math.min(430, stageSize.width * .29));
    const rootRadiusY = Math.max(190, Math.min(285, stageSize.height * .34));
    const startAngle = -Math.PI / 2;
    const sweep = Math.PI * 2;
    let leafCursor = 0;
    const logicalPositions: Record<string, NodePosition> = {};
    const depths: Record<string, number> = {};
    const edges: Array<{ from: string; to: string }> = [];
    const assign = (task: ApiTask, depth: number): number => {
      depths[task.id] = depth;
      const children = visibleChildren(task.id);
      const angle = children.length
        ? children.reduce((sum, child) => sum + assign(child, depth + 1), 0) / children.length
        : startAngle + (totalLeaves === 1 ? 0 : (leafCursor++ / totalLeaves) * sweep);
      const radiusX = rootRadiusX + (depth - 1) * 176;
      const radiusY = rootRadiusY + (depth - 1) * 112;
      logicalPositions[task.id] = {
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
      };
      children.forEach((child) => edges.push({ from: task.id, to: child.id }));
      return angle;
    };
    roots.forEach((root) => {
      assign(root, 1);
      edges.push({ from: topicNodeId(selectedTopicId), to: root.id });
    });

    const focusedRoot = focusedRootId ? roots.find((root) => root.id === focusedRootId) : null;
    if (focusedRoot) {
      Object.keys(logicalPositions).forEach((id) => delete logicalPositions[id]);
      Object.keys(depths).forEach((id) => delete depths[id]);
      edges.splice(0, edges.length);
      const siblingRoots = roots.filter((root) => root.id !== focusedRoot.id);
      const siblingX = center.x + 180;
      const focusedX = center.x + 390;
      const siblingGap = Math.max(58, Math.min(76, (stageSize.height - 170) / Math.max(3, siblingRoots.length)));
      siblingRoots.forEach((root, index) => {
        logicalPositions[root.id] = {
          x: siblingX - Math.abs(index - (siblingRoots.length - 1) / 2) * 5,
          y: center.y + (index - (siblingRoots.length - 1) / 2) * siblingGap,
        };
        depths[root.id] = 1;
        edges.push({ from: topicNodeId(selectedTopicId), to: root.id });
      });

      const focusedChildren = visibleChildren(focusedRoot.id);
      const focusedLeafTotal = Math.max(1, focusedChildren.reduce((sum, child) => sum + leafCount(child), 0));
      const focusedLeafGap = Math.max(62, Math.min(88, (stageSize.height - 150) / Math.max(2, focusedLeafTotal - 1)));
      const focusedStartY = center.y - (focusedLeafTotal - 1) * focusedLeafGap / 2;
      let focusedLeafCursor = 0;
      const assignFocused = (task: ApiTask, depth: number): number => {
        const children = visibleChildren(task.id);
        const childYs = children.map((child) => assignFocused(child, depth + 1));
        const y = childYs.length ? childYs.reduce((sum, value) => sum + value, 0) / childYs.length : focusedStartY + focusedLeafCursor++ * focusedLeafGap;
        logicalPositions[task.id] = { x: focusedX + (depth - 1) * 232, y };
        depths[task.id] = depth;
        children.forEach((child) => edges.push({ from: task.id, to: child.id }));
        return y;
      };
      focusedChildren.forEach((child) => assignFocused(child, 2));
      logicalPositions[focusedRoot.id] = { x: focusedX, y: center.y };
      depths[focusedRoot.id] = 1;
      edges.push({ from: topicNodeId(selectedTopicId), to: focusedRoot.id });
      focusedChildren.forEach((child) => {
        if (!edges.some((edge) => edge.from === focusedRoot.id && edge.to === child.id)) edges.push({ from: focusedRoot.id, to: child.id });
      });
    }
    logicalPositions[topicId] = center;
    depths[topicId] = 0;

    const positions = Object.fromEntries(Object.entries(logicalPositions).map(([id, position]) => {
      const logical = customPositions[id] || position;
      const scaled = {
        x: center.x + (logical.x - center.x) * zoom,
        y: center.y + (logical.y - center.y) * zoom,
      };
      return [id, {
        x: scaled.x,
        y: scaled.y,
      }];
    })) as Record<string, NodePosition>;
    const focusPosition = focusedRootId && positions[focusedRootId]
      ? positions[focusedRootId]
      : center;
    return { center, focusPosition, positions, logicalPositions, depths, edges, roots };
  }, [childrenByParent, customPositions, focusedRootId, selectedTopicId, stageSize, taskById, viewportOffset.x, viewportOffset.y, zoom]);
  const clockwiseRootIds = useMemo(() => {
    const topicPosition = network.positions[topicNodeId(selectedTopicId)] || network.center;
    return network.roots
      .filter((root) => Boolean(network.positions[root.id]))
      .map((root) => {
        const position = network.positions[root.id];
        const polarAngle = Math.atan2(position.y - topicPosition.y, position.x - topicPosition.x);
        const clockwiseFromTwelve = (polarAngle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
        return { id: root.id, angle: clockwiseFromTwelve };
      })
      .sort((left, right) => left.angle - right.angle || left.id.localeCompare(right.id))
      .map((entry) => entry.id);
  }, [network.center, network.positions, network.roots, selectedTopicId]);

  useEffect(() => {
    if (!selectedTopicId || focusedRootId || divePhase !== 'idle') return;
    topicStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    topicStoryTimersRef.current = [];
    setTopicStoryPhase('focus');
    setTopicRevealStage(0);
    setStoryVisibleNodeIds(new Set());
    setStoryVisibleEdgeIds(new Set());
    setStoryCompletedNodeIds(new Set());
    setCompletionReplayPhase('idle');

    const viewport = viewportRef.current;
    const topicPosition = network.positions[topicNodeId(selectedTopicId)] || network.center;
    viewport?.scrollTo({
      left: Math.max(0, topicPosition.x - viewport.clientWidth / 2),
      top: Math.max(0, topicPosition.y - viewport.clientHeight / 2),
      behavior: 'smooth',
    });

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      topicStoryTimersRef.current.push(timer);
    };
    const focusDuration = 620;
    const nodeStepDuration = 500;
    const edgeStepDuration = 760;
    const completionStepDuration = 900;

    schedule(() => {
      setTopicStoryPhase('nodes');
      setTopicRevealStage(1);
    }, focusDuration);
    clockwiseRootIds.forEach((taskId, index) => {
      schedule(() => setStoryVisibleNodeIds((current) => new Set(current).add(taskId)), focusDuration + index * nodeStepDuration);
    });

    const nodesFinishedAt = focusDuration + clockwiseRootIds.length * nodeStepDuration;
    schedule(() => {
      setTopicStoryPhase('edges');
      setTopicRevealStage(2);
    }, nodesFinishedAt);
    clockwiseRootIds.forEach((taskId, index) => {
      schedule(() => setStoryVisibleEdgeIds((current) => new Set(current).add(`${topicNodeId(selectedTopicId)}:${taskId}`)), nodesFinishedAt + index * edgeStepDuration);
    });

    const edgesFinishedAt = nodesFinishedAt + clockwiseRootIds.length * edgeStepDuration;
    const completedRootIds = clockwiseRootIds.filter((taskId) => completionState.doneById.get(taskId) === true);
    schedule(() => setTopicStoryPhase('completion'), edgesFinishedAt);
    completedRootIds.forEach((taskId, index) => {
      schedule(() => setStoryCompletedNodeIds((current) => new Set(current).add(taskId)), edgesFinishedAt + index * completionStepDuration);
    });
    schedule(() => setTopicStoryPhase('done'), edgesFinishedAt + Math.max(160, completedRootIds.length * completionStepDuration));

    return () => {
      topicStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      topicStoryTimersRef.current = [];
    };
    // Intentionally scoped to "topic selection changed" (topic/focus/dive/replay).
    // network.positions, clockwiseRootIds and completionState.doneById are read
    // from the current render's closure but must NOT retrigger this effect on
    // their own — otherwise every drag, pan or zoom in the global view (which
    // recomputes node positions) would restart the whole reveal story mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divePhase, focusedRootId, selectedTopicId, topicStoryNonce]);
  // Triggered directly from a node click (not a reactive effect) — computes the
  // DFS reveal order for exactly this node's own descendants and schedules an
  // edge-then-node stagger for just those ids. Everything else already on
  // screen (ancestors, siblings, cousins, previously-settled nodes) is never
  // touched, so it never disappears while this subtree grows in.
  const startBranchReveal = (rootId: string, onDone?: () => void) => {
    const steps: Array<{ from: string; to: string; edgeKey: string }> = [];
    const seen = new Set<string>([rootId]);
    const visit = (parentId: string) => {
      (childrenByParent.get(parentId) || [])
        .filter((child) => child.topic_id === selectedTopicId && visibleTaskIds.has(child.id))
        .forEach((child) => {
          if (seen.has(child.id)) return;
          seen.add(child.id);
          steps.push({ from: parentId, to: child.id, edgeKey: `${parentId}:${child.id}` });
          visit(child.id);
        });
    };
    visit(rootId);
    if (!steps.length) {
      onDone?.();
      return;
    }

    const newPendingNodeIds = steps.map((step) => step.to);
    const newPendingEdgeIds = steps.map((step) => step.edgeKey);
    setBranchPendingNodeIds((current) => new Set([...current, ...newPendingNodeIds]));
    setBranchPendingEdgeIds((current) => new Set([...current, ...newPendingEdgeIds]));
    const completionPendingIds = [rootId, ...newPendingNodeIds].filter((taskId) => completionState.doneById.get(taskId) === true);
    if (completionPendingIds.length) {
      setBranchPendingCompletionIds((current) => new Set([...current, ...completionPendingIds]));
    }

    // edgeTravelDuration matches the 1.15s pathLength draw so the child node
    // pops the moment its incoming connector finishes being drawn from parent.
    // "Duyệt cây" itself always stays sequential/DFS, one connector at a time —
    // the parallel/simultaneous fade-in only applies to the OTHER level-1
    // siblings still attached to the topic (handled separately, see the
    // sibling-reveal effect in reconstructTaskBranch), never to this node's
    // own descendants.
    const edgeTravelDuration = 1150;
    const nodeRevealDuration = 360;
    let cursor = 160;

    steps.forEach((step) => {
      const previousEdgeTimer = edgeRevealTimersRef.current.get(step.edgeKey);
      if (previousEdgeTimer !== undefined) window.clearTimeout(previousEdgeTimer);
      const edgeTimer = window.setTimeout(() => {
        edgeRevealTimersRef.current.delete(step.edgeKey);
        setBranchPendingEdgeIds((current) => {
          if (!current.has(step.edgeKey)) return current;
          const next = new Set(current);
          next.delete(step.edgeKey);
          return next;
        });
      }, cursor);
      edgeRevealTimersRef.current.set(step.edgeKey, edgeTimer);
      cursor += edgeTravelDuration;

      const previousNodeTimer = nodeRevealTimersRef.current.get(step.to);
      if (previousNodeTimer !== undefined) window.clearTimeout(previousNodeTimer);
      const nodeTimer = window.setTimeout(() => {
        nodeRevealTimersRef.current.delete(step.to);
        setBranchPendingNodeIds((current) => {
          if (!current.has(step.to)) return current;
          const next = new Set(current);
          next.delete(step.to);
          return next;
        });
      }, cursor);
      nodeRevealTimersRef.current.set(step.to, nodeTimer);
      cursor += nodeRevealDuration;
    });

    const doneTimer = window.setTimeout(() => {
      setBranchPendingCompletionIds((current) => {
        const next = new Set(current);
        completionPendingIds.forEach((taskId) => next.delete(taskId));
        return next;
      });
      onDone?.();
    }, cursor + 120);
    branchStoryTimersRef.current.push(doneTimer);
  };
  layoutPositionsRef.current = network.logicalPositions;
  const draggedNodeId = dragging?.mode === 'node' || dragging?.mode === 'cluster' ? dragging.id : null;
  const topologyNodeInputs = useMemo(() => {
    const topicId = topicNodeId(selectedTopicId);
    return Object.entries(network.positions).filter(([id]) => topicRevealStage >= 1 || id === topicId).map(([id, target]) => {
      if (id === topicId) {
        return {
          id,
          target,
          parentId: null,
          depth: 0,
          descendantCount: topicTasks.length,
          importance: 1,
          radius: 62,
          selected: selectedTaskId === null,
        };
      }
      const task = taskById.get(id);
      const directChildCount = task ? (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId && taskById.has(child.id)).length : 0;
      return {
        id,
        target,
        parentId: task?.parent_task_id && taskById.has(task.parent_task_id) ? task.parent_task_id : topicId,
        depth: network.depths[id] || 1,
        descendantCount: task?.descendant_count || directChildCount,
        importance: task ? (isTaskOverdue(task) ? 1 : isTaskInProgress(task) ? .72 : directChildCount ? .48 : .2) : .2,
        radius: directChildCount ? 48 : 40,
        selected: selectedTaskId === id,
      };
    });
  }, [childrenByParent, network.depths, network.positions, selectedTaskId, selectedTopicId, taskById, topicRevealStage, topicTasks.length]);
  const topologyEdges = useMemo(() => network.edges.map((edge) => ({
    ...edge,
    key: `${edge.from}:${edge.to}`,
  })), [network.edges]);

  // Layout effect (not a passive effect): runs synchronously right after the
  // DOM mutates but BEFORE the browser paints. The very first edges mount via
  // ref callbacks during the same commit, before this catch-up loop registers
  // them with the field — with a passive `useEffect` the browser would have a
  // chance to paint their fully-drawn `d` first (a one-frame flash of the
  // un-hidden line) before the reveal-hide kicked in on the next tick.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stage || !viewport) return;
    const field = new ElasticTopologyField(stage, viewport);
    topologyFieldRef.current = field;
    topologyNodeElementsRef.current.forEach((element, id) => field.registerNode(id, element));
    topologyEdgeElementsRef.current.forEach((element, key) => field.registerEdge(key, element));
    topologyReverseEdgeElementsRef.current.forEach((element, key) => field.registerEdge(key, element, true));
    return () => {
      field.destroy();
      if (topologyFieldRef.current === field) topologyFieldRef.current = null;
    };
  }, []);

  useEffect(() => {
    const field = topologyFieldRef.current;
    if (!field) return;
    field.setReducedMotion(reducedMotion);
    const sourceId = selectedTaskId && network.positions[selectedTaskId]
      ? selectedTaskId
      : focusedRootId || topicNodeId(selectedTopicId);
    field.sync(topologyNodeInputs, topologyEdges, sourceId);
    if (pendingReleaseIdsRef.current.size) {
      field.releaseMany(pendingReleaseIdsRef.current);
      pendingReleaseIdsRef.current = new Set();
    }
  }, [focusedRootId, network.positions, reducedMotion, selectedTaskId, selectedTopicId, topologyEdges, topologyNodeInputs]);

  const registerTopologyNode = (id: string, element: HTMLElement | null) => {
    if (element) topologyNodeElementsRef.current.set(id, element);
    else topologyNodeElementsRef.current.delete(id);
    topologyFieldRef.current?.registerNode(id, element);
  };

  const registerTopologyEdge = (key: string, element: SVGPathElement | null, reverse = false) => {
    const collection = reverse ? topologyReverseEdgeElementsRef.current : topologyEdgeElementsRef.current;
    if (element) collection.set(key, element);
    else collection.delete(key);
    topologyFieldRef.current?.registerEdge(key, element, reverse);
  };

  const getTopologyNodeRef = (id: string) => {
    const existing = topologyNodeRefCallbacksRef.current.get(id);
    if (existing) return existing;
    const callback = (element: HTMLElement | null) => registerTopologyNode(id, element);
    topologyNodeRefCallbacksRef.current.set(id, callback);
    return callback;
  };

  const getTopologyEdgeRef = (key: string, reverse = false) => {
    const callbackKey = `${reverse ? 'reverse' : 'forward'}:${key}`;
    const existing = topologyEdgeRefCallbacksRef.current.get(callbackKey);
    if (existing) return existing;
    const callback = (element: SVGPathElement | null) => registerTopologyEdge(key, element, reverse);
    topologyEdgeRefCallbacksRef.current.set(callbackKey, callback);
    return callback;
  };

  const captureDiveSnapshot = (worldKey = selectedTopicId, preferOverlay = true, portalNodeId = topicNodeId(selectedTopicId)): NetworkDiveSnapshot | null => {
    const shell = diveShellRef.current;
    const viewport = viewportRef.current;
    if (!shell || !viewport) return null;
    const shellRect = shell.getBoundingClientRect();
    if (preferOverlay && diveSnapshots) {
      const overlayElements = new Map([...shell.querySelectorAll<HTMLElement>('.semantic-dive-node')].map((element) => [element.dataset.nodeId || '', element]));
      const overlayNodes = diveSnapshots.from.nodes.map((node) => {
        const rect = overlayElements.get(node.id)?.getBoundingClientRect();
        return rect ? { ...node, x: rect.left - shellRect.left + rect.width / 2, y: rect.top - shellRect.top + rect.height / 2, radius: Math.max(8, rect.width / 2) } : node;
      });
      const overlayPositions = new Map(overlayNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
      const overlayEdges = diveSnapshots.from.edges.flatMap((edge) => {
        const from = overlayPositions.get(edge.from);
        const to = overlayPositions.get(edge.to);
        if (!from || !to) return [];
        const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
        const bend = Math.min(42, distance * .11);
        const controlX = (from.x + to.x) / 2 - (to.y - from.y) / distance * bend;
        const controlY = (from.y + to.y) / 2 + (to.x - from.x) / distance * bend;
        return [{ ...edge, d: `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}` }];
      });
      const portal = overlayNodes.find((node) => node.id === portalNodeId)
        || overlayNodes.find((node) => node.kind === 'topic')
        || overlayNodes[0];
      return { ...diveSnapshots.from, portal: portal ? { x: portal.x, y: portal.y } : diveSnapshots.from.portal, nodes: overlayNodes, edges: overlayEdges };
    }
    const positions = new Map<string, NodePosition>();
    const nodes: NetworkDiveSnapshot['nodes'] = [];
    Object.keys(network.positions).forEach((id) => {
      const anchor = topologyNodeElementsRef.current.get(id);
      const visual = anchor?.querySelector<HTMLElement>('.desktop-network-node');
      const rect = visual?.getBoundingClientRect();
      const fieldPosition = topologyFieldRef.current?.getPosition(id) || network.positions[id];
      const x = rect && rect.width > 0 ? rect.left - shellRect.left + rect.width / 2 : fieldPosition.x - viewport.scrollLeft;
      const y = rect && rect.height > 0 ? rect.top - shellRect.top + rect.height / 2 : fieldPosition.y - viewport.scrollTop;
      const task = taskById.get(id);
      const isTopic = id === topicNodeId(selectedTopicId);
      const directChildren = task ? (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId) : [];
      const complete = task ? completionState.doneById.get(task.id) === true : false;
      positions.set(id, { x, y });
      nodes.push({
        id,
        x,
        y,
        radius: isTopic ? 38 : rect ? Math.max(16, rect.width / 2) : directChildren.length ? 25 : 16,
        label: isTopic ? selectedTopic?.name || 'Topic' : task?.title || '',
        tone: isTopic ? 'topic' : complete ? 'complete' : task && isTaskOverdue(task) ? 'overdue' : task && isTaskInProgress(task) ? 'progress' : 'open',
        kind: isTopic ? 'topic' : 'task',
      });
    });
    const edges = network.edges.flatMap((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return [];
      const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
      const bend = Math.min(42, distance * .11);
      const controlX = (from.x + to.x) / 2 - (to.y - from.y) / distance * bend;
      const controlY = (from.y + to.y) / 2 + (to.x - from.x) / distance * bend;
      return [{
        key: `${edge.from}:${edge.to}`,
        from: edge.from,
        to: edge.to,
        d: `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`,
        active: (edge.from === topicNodeId(selectedTopicId) && selectedBranchIds.has(edge.to))
          || (selectedBranchIds.has(edge.from) && selectedBranchIds.has(edge.to)),
      }];
    });
    const portal = positions.get(portalNodeId)
      || positions.get(topicNodeId(selectedTopicId))
      || { x: shell.clientWidth / 2, y: shell.clientHeight / 2 };
    return { worldKey, stage: { ...renderedStageSize }, portal, nodes, edges };
  };
  captureDiveSnapshotRef.current = captureDiveSnapshot;

  const requestSemanticDive = (
    nextTopicId: string,
    direction: SemanticDiveDirection = 'forward',
    portalNodeId = topicNodeId(selectedTopicId),
    reconstructWorld?: () => void,
    afterComplete?: () => void,
  ) => {
    if (!nextTopicId) return;
    const shell = diveShellRef.current;
    const snapshot = captureDiveSnapshot(selectedTopicId, true, portalNodeId);
    if (!shell || !snapshot || reducedMotion && !selectedTopicId) {
      onTopicChange(nextTopicId);
      reconstructWorld?.();
      afterComplete?.();
      return;
    }
    const requestToken = ++diveRequestTokenRef.current;
    diveActiveRef.current = true;
    if (dragging?.mode === 'node' || dragging?.mode === 'graph') topologyFieldRef.current?.release(dragging.id);
    setDragging(null);
    flushSync(() => {
      setDiveSnapshots({ from: snapshot });
      setDivePhase('lock');
    });
    shell.style.setProperty('--dive-live-origin-x', `${snapshot.portal.x + (viewportRef.current?.scrollLeft || 0)}px`);
    shell.style.setProperty('--dive-live-origin-y', `${snapshot.portal.y + (viewportRef.current?.scrollTop || 0)}px`);
    topologyFieldRef.current?.pause();
    if (!semanticDiveRef.current) semanticDiveRef.current = new SemanticDiveDirector(shell);
    window.requestAnimationFrame(() => {
      if (requestToken !== diveRequestTokenRef.current) return;
      semanticDiveRef.current?.start({
        direction,
        portal: snapshot.portal,
        reducedMotion,
        onPhase: (phase) => {
          if (requestToken !== diveRequestTokenRef.current) return;
          setDivePhase(phase);
          if (phase === 'reconstruct') topologyFieldRef.current?.resume();
        },
        onSwap: () => {
          if (requestToken !== diveRequestTokenRef.current) return;
          if (topicNodeRevealTimerRef.current !== null) window.clearTimeout(topicNodeRevealTimerRef.current);
          if (topicEdgeRevealTimerRef.current !== null) window.clearTimeout(topicEdgeRevealTimerRef.current);
          setTopicRevealStage(0);
          reconstructWorld?.();
          if (direction === 'reverse') setExpandedTaskIds(new Set());
          if (nextTopicId !== selectedTopicId) onTopicChange(nextTopicId);
          else if (reconstructWorld) {
            topicNodeRevealTimerRef.current = window.setTimeout(() => setTopicRevealStage(1), reducedMotion ? 0 : 180);
            topicEdgeRevealTimerRef.current = window.setTimeout(() => {
              setTopicRevealStage(2);
            }, reducedMotion ? 0 : 720);
          } else {
            setExpandedTaskIds(new Set());
            setTopicStoryNonce((current) => current + 1);
          }
        },
        onComplete: () => {
          if (requestToken !== diveRequestTokenRef.current) return;
          if (direction === 'forward') setTopicRevealStage(2);
          setDiveSnapshots(null);
          setDivePhase('idle');
          diveActiveRef.current = false;
          topologyFieldRef.current?.resume();
          topologyFieldRef.current?.kick(portalNodeId, .42);
          afterComplete?.();
        },
      });
    });
  };

  useEffect(() => {
    if (topicRevealStage < 1 || (divePhase !== 'reconstruct' && divePhase !== 'settle')) return;
    const frame = window.requestAnimationFrame(() => {
      const snapshot = captureDiveSnapshotRef.current(selectedTopicId, false);
      if (snapshot) setDiveSnapshots((current) => current && !current.to ? { ...current, to: snapshot } : current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [divePhase, selectedTopicId, topicRevealStage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || divePhase !== 'idle' || (!focusedRootId && topicStoryPhase !== 'done')) return;
    const scrollKey = `${selectedTopicId}:${focusedRootId || 'radial'}:${stageSize.width}x${stageSize.height}`;
    if (autoScrollKeyRef.current === scrollKey) return;
    autoScrollKeyRef.current = scrollKey;
    const frame = window.requestAnimationFrame(() => {
      const left = focusedRootId
        ? Math.max(0, network.focusPosition.x - viewport.clientWidth * .5)
        : Math.max(0, network.center.x - viewport.clientWidth * .5);
      const top = Math.max(0, network.focusPosition.y - viewport.clientHeight * .5);
      viewport.scrollTo({ left, top, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [divePhase, focusedRootId, network.center.x, network.center.y, network.focusPosition.x, network.focusPosition.y, selectedTopicId, stageSize.height, stageSize.width, topicStoryPhase]);
  const hoverNeighborIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hoveredNodeId) return ids;
    ids.add(hoveredNodeId);
    network.edges.forEach((edge) => {
      if (edge.from === hoveredNodeId) ids.add(edge.to);
      if (edge.to === hoveredNodeId) ids.add(edge.from);
    });
    return ids;
  }, [hoveredNodeId, network.edges]);

  const savePositions = (positions: Record<string, NodePosition>) => {
    if (!selectedTopicId) return;
    try { window.localStorage.setItem(`desktop-task-network:v7:${selectedTopicId}:${focusedRootId || 'radial'}`, JSON.stringify(positions)); } catch { /* local layout persistence is optional */ }
  };

  // Sets up the data (expandedTaskIds, sibling hide) and returns a `reveal`
  // callback that actually starts the visible animation. Split so the level-1
  // (dive) path can defer `reveal()` until the camera has actually settled —
  // running the subtree/sibling reveal WHILE the camera was still moving was
  // the source of the "quá rối mắt" clutter.
  const reconstructTaskBranch = (task: ApiTask) => {
    onSelectTask(task.id);
    setExpansionPulseId(task.id);
    if (expansionTimerRef.current !== null) window.clearTimeout(expansionTimerRef.current);
    expansionTimerRef.current = window.setTimeout(() => setExpansionPulseId((current) => current === task.id ? null : current), 520);
    const isLevelOne = !task.parent_task_id;
    let siblingRootIds: string[] = [];
    let siblingEdgeIds: string[] = [];
    let levelOneCompletionIds: string[] = [];
    if (isLevelOne) {
      customPositionsRef.current = {};
      setCustomPositions({});
      viewportOffsetRef.current = { x: 0, y: 0 };
      setViewportOffset({ x: 0, y: 0 });
      const topicId = topicNodeId(selectedTopicId);
      siblingRootIds = availableRootTasks
        .filter((root) => root.id !== task.id && visibleTaskIds.has(root.id))
        .map((root) => root.id);
      siblingEdgeIds = siblingRootIds.map((rootId) => `${topicId}:${rootId}`);
      if (siblingRootIds.length) {
        setBranchPendingNodeIds((current) => new Set([...current, ...siblingRootIds]));
        setBranchPendingEdgeIds((current) => new Set([...current, ...siblingEdgeIds]));
      }
      levelOneCompletionIds = completeTopicTasks
        .filter((candidate) => completionState.doneById.get(candidate.id) === true)
        .map((candidate) => candidate.id);
      if (levelOneCompletionIds.length) {
        setBranchPendingCompletionIds((current) => new Set([...current, ...levelOneCompletionIds]));
      }
    }
    // Read directly off the CURRENT state value rather than mutating a local
    // variable inside the updater below: setState's functional updater isn't
    // guaranteed to run synchronously before this line, so a variable only
    // ever assigned inside it can still read as stale/false by the time the
    // returned `reveal` closure checks it later — which would silently skip
    // startBranchReveal (and its pending/hide gating) entirely, making the
    // whole subtree render ungated, all at once, with no stagger at all.
    const wasFreshExpand = !expandedTaskIds.has(task.id);
    setExpandedTaskIds((current) => {
      const wasExpanded = current.has(task.id);
      const next = isLevelOne ? new Set<string>() : new Set(current);
      if (!wasExpanded) {
        // Any node — level-1 or nested — reveals its own full subtree, scoped
        // to itself only. Ancestors, siblings and cousins are untouched.
        const revealBranch = (branchTask: ApiTask) => {
          const children = (childrenByParent.get(branchTask.id) || []).filter((child) => child.topic_id === selectedTopicId && visibleTaskIds.has(child.id));
          if (!children.length) return;
          next.add(branchTask.id);
          children.forEach(revealBranch);
        };
        revealBranch(task);
      } else if (!isLevelOne) {
        // Collapse this node's own subtree only, recursively.
        const collapseBranch = (branchTaskId: string) => {
          next.delete(branchTaskId);
          (childrenByParent.get(branchTaskId) || [])
            .filter((child) => child.topic_id === selectedTopicId)
            .forEach((child) => collapseBranch(child.id));
        };
        collapseBranch(task.id);
      }
      return next;
    });
    return () => {
      // Data is revealed all at once above (needed for layout/positions), but
      // the visible reveal is gated by the pending sets — it grows the
      // subtree node-by-node, edge-by-edge, in DFS order.
      const replayCompletionAfterReveal = () => {
        if (isLevelOne && levelOneCompletionIds.length) {
          setBranchPendingCompletionIds((current) => {
            const next = new Set(current);
            levelOneCompletionIds.forEach((taskId) => next.delete(taskId));
            return next;
          });
        }
        startCompletionReplay(isLevelOne ? null : task.id);
      };
      if (wasFreshExpand) startBranchReveal(task.id, replayCompletionAfterReveal);
      if (siblingRootIds.length) {
        // These OTHER level-1 siblings never went through "duyệt cây" — they
        // just settle back after the layout re-centers on the clicked node.
        // So unlike a real branch reveal they all fade back in together, at
        // the SAME moment (topic-orbit style), not DFS-staggered. Only one
        // sibling-reveal can ever be meaningfully in flight, so cancel any
        // earlier one outright (e.g. clicking a different level-1 node again
        // before the last reveal finished) instead of letting it fire later
        // and re-toggle a now-unrelated set of siblings.
        if (siblingRevealTimerRef.current !== null) window.clearTimeout(siblingRevealTimerRef.current);
        siblingRevealTimerRef.current = window.setTimeout(() => {
          siblingRevealTimerRef.current = null;
          setBranchPendingEdgeIds((current) => {
            const next = new Set(current);
            siblingEdgeIds.forEach((edgeId) => next.delete(edgeId));
            return next;
          });
          setBranchPendingNodeIds((current) => {
            const next = new Set(current);
            siblingRootIds.forEach((rootId) => next.delete(rootId));
            return next;
          });
        }, 260);
      }
    };
  };

  const enterTaskBranch = (task: ApiTask, childCount: number) => {
    if (!childCount) {
      onSelectTask(task.id);
      return;
    }
    const isLevelOne = !task.parent_task_id;
    if (!isLevelOne) {
      // Only level-1 tasks get the semantic-dive scene transition. Anything
      // deeper just expands in place within the current tree — no camera
      // movement, no world swap, same structure as before.
      reconstructTaskBranch(task)();
      return;
    }
    let reveal: (() => void) | null = null;
    requestSemanticDive(
      selectedTopicId,
      'forward',
      task.id,
      () => { reveal = reconstructTaskBranch(task); },
      () => {
        // Only start growing the subtree / fading siblings back in once the
        // camera has actually finished moving — running this concurrently
        // with the dive itself was the main source of visual clutter.
        reveal?.();
      },
    );
  };

  const resetTopicStoryVisuals = () => {
    topicStoryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    topicStoryTimersRef.current = [];
    setExpandedTaskIds(new Set());
    setTopicRevealStage(0);
    setTopicStoryPhase('focus');
    setStoryVisibleNodeIds(new Set());
    setStoryVisibleEdgeIds(new Set());
    setStoryCompletedNodeIds(new Set());
    setCompletionReplayPhase('idle');
  };

  const selectTopicWithStory = (topicId: string) => {
    resetTopicStoryVisuals();
    onTopicChange(topicId);
  };

  const replayCurrentTopicStory = () => {
    resetTopicStoryVisuals();
    setTopicStoryNonce((current) => current + 1);
  };

  const pointerToLogical = (event: Pick<PointerEvent, 'clientX' | 'clientY'> | ReactPointerEvent<HTMLElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return {
      x: network.center.x + (x - network.center.x) / zoom,
      y: network.center.y + (y - network.center.y) / zoom,
    };
  };

  const startNodeDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || divePhase !== 'idle') return;
    didDragRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (id === topicNodeId(selectedTopicId)) {
      pendingGraphOffsetRef.current = { ...viewportOffsetRef.current };
      graphDragFieldOriginsRef.current = topologyFieldRef.current?.snapshot() || { ...network.positions };
      // Comet-trail: only the topic node is pinned 1:1 to the pointer. Every
      // other node keeps easing toward a retargeted point instead of snapping,
      // so it visibly trails behind and catches up once the drag stops.
      topologyFieldRef.current?.pinSilent(id, graphDragFieldOriginsRef.current[id] || network.positions[id]);
      setDragging({
        mode: 'graph',
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originOffset: { ...viewportOffsetRef.current },
        originCustomPositions: { ...customPositionsRef.current },
      });
      return;
    }
    const collectVisibleDescendants = (taskId: string) => {
      const ids = new Set<string>([taskId]);
      const visit = (parentId: string) => {
        (childrenByParent.get(parentId) || []).forEach((child) => {
          if (!taskById.has(child.id) || ids.has(child.id)) return;
          ids.add(child.id);
          visit(child.id);
        });
      };
      visit(taskId);
      return ids;
    };
    const clusterIds = focusedRootId
      ? collectVisibleDescendants(id)
      : new Set(Object.keys(network.positions));
    if (clusterIds.size > 1 || focusedRootId) {
      const displayedSnapshot = topologyFieldRef.current?.snapshot() || { ...network.positions };
      const pinnedIds = focusedRootId ? Object.keys(network.positions) : [...clusterIds];
      const originDisplayed = Object.fromEntries(pinnedIds.flatMap((nodeId) => {
        const position = displayedSnapshot[nodeId] || network.positions[nodeId];
        return position ? [[nodeId, position]] : [];
      })) as Record<string, NodePosition>;
      const originLogical = Object.fromEntries(Object.entries(originDisplayed).map(([nodeId, position]) => [nodeId, {
        x: network.center.x + (position.x - network.center.x) / zoom,
        y: network.center.y + (position.y - network.center.y) / zoom,
      }])) as Record<string, NodePosition>;
      const followById: Record<string, number> = {};
      if (focusedRootId) {
        Object.keys(originDisplayed).forEach((nodeId) => { followById[nodeId] = clusterIds.has(nodeId) ? 1 : 0; });
      } else {
        const neighbors = new Map<string, string[]>();
        network.edges.forEach((edge) => {
          neighbors.set(edge.from, [...(neighbors.get(edge.from) || []), edge.to]);
          neighbors.set(edge.to, [...(neighbors.get(edge.to) || []), edge.from]);
        });
        const distanceById = new Map<string, number>([[id, 0]]);
        const queue = [id];
        while (queue.length) {
          const current = queue.shift() as string;
          const distance = distanceById.get(current) || 0;
          (neighbors.get(current) || []).forEach((neighbor) => {
            if (distanceById.has(neighbor)) return;
            distanceById.set(neighbor, distance + 1);
            queue.push(neighbor);
          });
        }
        Object.keys(originDisplayed).forEach((nodeId) => {
          const distance = distanceById.get(nodeId) ?? 3;
          followById[nodeId] = nodeId === id ? 1 : Math.max(.66, Math.exp(-distance * .16));
        });
      }
      const pointer = pointerToLogical(event);
      const primaryLogical = originLogical[id];
      if (primaryLogical) {
        pendingClusterLogicalRef.current = originLogical;
        topologyFieldRef.current?.pinSilent(id, originDisplayed[id]);
        topologyFieldRef.current?.retargetMany(Object.fromEntries(
          Object.entries(originDisplayed).filter(([nodeId]) => nodeId !== id),
        ) as Record<string, NodePosition>);
        setDragging({
          mode: 'cluster',
          id,
          pointerId: event.pointerId,
          offsetX: pointer.x - primaryLogical.x,
          offsetY: pointer.y - primaryLogical.y,
          startX: event.clientX,
          startY: event.clientY,
          originLogical,
          originDisplayed,
          followById,
        });
        return;
      }
    }
    const pointer = pointerToLogical(event);
    const displayed = topologyFieldRef.current?.getPosition(id) || network.positions[id] || network.center;
    const logical = customPositions[id] || {
      x: network.center.x + (displayed.x - network.center.x) / zoom,
      y: network.center.y + (displayed.y - network.center.y) / zoom,
    };
    pendingDragLogicalRef.current = logical;
    topologyFieldRef.current?.pin(id, displayed);
    setDragging({ mode: 'node', id, pointerId: event.pointerId, offsetX: pointer.x - logical.x, offsetY: pointer.y - logical.y, startX: event.clientX, startY: event.clientY });
  };

  const startCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || divePhase !== 'idle') return;
    const target = event.target as HTMLElement;
    const isTrueCanvasSurface = target === event.currentTarget
      || target.classList.contains('desktop-network-live-world');
    if (!isTrueCanvasSurface || target.closest('button, aside, .desktop-network-legend')) return;
    didDragRef.current = false;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      mode: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originScroll: {
        x: viewportRef.current?.scrollLeft || 0,
        y: viewportRef.current?.scrollTop || 0,
      },
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragging.pointerId) return;
      event.preventDefault();
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 3) didDragRef.current = true;
      if (dragging.mode === 'pan') {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft = dragging.originScroll.x - (event.clientX - dragging.startX);
        viewport.scrollTop = dragging.originScroll.y - (event.clientY - dragging.startY);
        return;
      }
      if (dragging.mode === 'graph') {
        const requestedDeltaX = event.clientX - dragging.startX;
        const requestedDeltaY = event.clientY - dragging.startY;
        const originalPositions = Object.values(graphDragFieldOriginsRef.current);
        const minimumX = Math.min(...originalPositions.map((position) => position.x));
        const maximumX = Math.max(...originalPositions.map((position) => position.x));
        const minimumY = Math.min(...originalPositions.map((position) => position.y));
        const maximumY = Math.max(...originalPositions.map((position) => position.y));
        const deltaX = Math.min(renderedStageSize.width - 110 - maximumX, Math.max(110 - minimumX, requestedDeltaX));
        const deltaY = Math.min(renderedStageSize.height - 110 - maximumY, Math.max(110 - minimumY, requestedDeltaY));
        const nextOffset = {
          x: dragging.originOffset.x + deltaX,
          y: dragging.originOffset.y + deltaY,
        };
        pendingGraphOffsetRef.current = nextOffset;
        const topicPosition = { x: (graphDragFieldOriginsRef.current[dragging.id]?.x ?? 0) + deltaX, y: (graphDragFieldOriginsRef.current[dragging.id]?.y ?? 0) + deltaY };
        topologyFieldRef.current?.pinSilent(dragging.id, topicPosition);
        const followerTargets = Object.fromEntries(Object.entries(graphDragFieldOriginsRef.current).filter(([id]) => id !== dragging.id).map(([id, position]) => [id, {
          x: position.x + deltaX,
          y: position.y + deltaY,
        }])) as Record<string, NodePosition>;
        topologyFieldRef.current?.retargetMany(followerTargets);
        return;
      }
      if (dragging.mode === 'cluster') {
        const rect = stageRef.current?.getBoundingClientRect();
        const primaryOrigin = dragging.originLogical[dragging.id];
        if (!rect || !primaryOrigin) return;
        const stageX = event.clientX - rect.left;
        const stageY = event.clientY - rect.top;
        const pointer = {
          x: network.center.x + (stageX - network.center.x) / zoom,
          y: network.center.y + (stageY - network.center.y) / zoom,
        };
        let deltaDisplayX = (pointer.x - dragging.offsetX - primaryOrigin.x) * zoom;
        let deltaDisplayY = (pointer.y - dragging.offsetY - primaryOrigin.y) * zoom;
        let minimumDeltaX = Number.NEGATIVE_INFINITY;
        let maximumDeltaX = Number.POSITIVE_INFINITY;
        let minimumDeltaY = Number.NEGATIVE_INFINITY;
        let maximumDeltaY = Number.POSITIVE_INFINITY;
        Object.entries(dragging.originDisplayed).forEach(([nodeId, position]) => {
          const follow = dragging.followById[nodeId] ?? 1;
          if (follow <= 0) return;
          minimumDeltaX = Math.max(minimumDeltaX, (110 - position.x) / follow);
          maximumDeltaX = Math.min(maximumDeltaX, (renderedStageSize.width - 110 - position.x) / follow);
          minimumDeltaY = Math.max(minimumDeltaY, (110 - position.y) / follow);
          maximumDeltaY = Math.min(maximumDeltaY, (renderedStageSize.height - 110 - position.y) / follow);
        });
        deltaDisplayX = Math.min(maximumDeltaX, Math.max(minimumDeltaX, deltaDisplayX));
        deltaDisplayY = Math.min(maximumDeltaY, Math.max(minimumDeltaY, deltaDisplayY));
        const deltaLogicalX = deltaDisplayX / zoom;
        const deltaLogicalY = deltaDisplayY / zoom;
        const nextLogical = Object.fromEntries(Object.entries(dragging.originLogical).map(([nodeId, position]) => {
          const follow = dragging.followById[nodeId] ?? 1;
          return [nodeId, { x: position.x + deltaLogicalX * follow, y: position.y + deltaLogicalY * follow }];
        })) as Record<string, NodePosition>;
        const groupTargets = Object.fromEntries(Object.entries(dragging.originDisplayed).map(([nodeId, position]) => {
          const follow = dragging.followById[nodeId] ?? 1;
          return [nodeId, { x: position.x + deltaDisplayX * follow, y: position.y + deltaDisplayY * follow }];
        })) as Record<string, NodePosition>;
        pendingClusterLogicalRef.current = nextLogical;
        topologyFieldRef.current?.pinSilent(dragging.id, groupTargets[dragging.id]);
        topologyFieldRef.current?.retargetMany(Object.fromEntries(
          Object.entries(groupTargets).filter(([nodeId]) => nodeId !== dragging.id),
        ) as Record<string, NodePosition>);
        return;
      }
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const stageX = event.clientX - rect.left;
      const stageY = event.clientY - rect.top;
      const pointer = {
        x: network.center.x + (stageX - network.center.x) / zoom,
        y: network.center.y + (stageY - network.center.y) / zoom,
      };
      const nextLogicalPosition = {
        x: Math.min(renderedStageSize.width - 110, Math.max(110, pointer.x - dragging.offsetX)),
        y: Math.min(renderedStageSize.height - 110, Math.max(110, pointer.y - dragging.offsetY)),
      };
      pendingDragLogicalRef.current = nextLogicalPosition;
      topologyFieldRef.current?.pin(dragging.id, {
        x: network.center.x + (nextLogicalPosition.x - network.center.x) * zoom,
        y: network.center.y + (nextLogicalPosition.y - network.center.y) * zoom,
      });
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragging.pointerId) return;
      if (dragging.mode === 'pan') {
        setDragging(null);
        return;
      }
      if (dragging.mode === 'graph') {
        // Comet drag is a temporary, playful pull. React position state was
        // NEVER mutated during the drag (only the physics field moved nodes),
        // so `graphDragFieldOriginsRef` still holds every node's pre-drag home.
        // We retarget the whole field back to those homes and release the pins:
        // the field eases everyone from where they were dragged smoothly back
        // into the circle, and because React state already equals home there is
        // no jump — the settle lands exactly on the rendered layout.
        pendingGraphOffsetRef.current = null;
        const home = graphDragFieldOriginsRef.current;
        topologyFieldRef.current?.retargetMany(home);
        const releaseIds = new Set(Object.keys(home));
        releaseIds.add(dragging.id);
        topologyFieldRef.current?.releaseMany(releaseIds);
        graphDragFieldOriginsRef.current = {};
        setDragging(null);
        return;
      }
      if (dragging.mode === 'cluster') {
        const settled = pendingClusterLogicalRef.current || dragging.originLogical;
        const next = { ...customPositionsRef.current, ...settled };
        pendingClusterLogicalRef.current = null;
        customPositionsRef.current = next;
        setCustomPositions(next);
        pendingReleaseIdsRef.current = new Set(Object.keys(dragging.originDisplayed));
        setDragging(null);
        if (selectedTopicId) {
          try { window.localStorage.setItem(`desktop-task-network:v7:${selectedTopicId}:${focusedRootId || 'radial'}`, JSON.stringify(next)); } catch { /* optional */ }
        }
        return;
      }
      let settled = pendingDragLogicalRef.current;
      if (settled) {
        let nextSettled: NodePosition = settled;
        const otherPositions = Object.entries(layoutPositionsRef.current).filter(([id]) => id !== dragging.id);
        for (let pass = 0; pass < 8; pass += 1) {
          otherPositions.forEach(([id, layoutPosition]) => {
            const other = customPositionsRef.current[id] || layoutPosition;
            const dx = nextSettled.x - other.x;
            const dy = nextSettled.y - other.y;
            const rawDistance = Math.hypot(dx, dy);
            const distance = Math.max(1, rawDistance);
            const minimumDistance = id.startsWith('topic:') ? 128 : 92;
            if (distance >= minimumDistance) return;
            const push = minimumDistance - distance;
            const unitX = rawDistance < 1 ? 1 : dx / rawDistance;
            const unitY = rawDistance < 1 ? 0 : dy / rawDistance;
            nextSettled = { x: nextSettled.x + unitX * push, y: nextSettled.y + unitY * push };
          });
        }
        nextSettled = {
          x: Math.min(renderedStageSize.width - 110, Math.max(110, nextSettled.x)),
          y: Math.min(renderedStageSize.height - 110, Math.max(110, nextSettled.y)),
        };
        settled = nextSettled;
        const next = { ...customPositionsRef.current, [dragging.id]: nextSettled };
        customPositionsRef.current = next;
        setCustomPositions(next);
      }
      pendingDragLogicalRef.current = null;
      pendingReleaseIdsRef.current = new Set([dragging.id]);
      setDragging(null);
      if (selectedTopicId) {
        try { window.localStorage.setItem(`desktop-task-network:v7:${selectedTopicId}:${focusedRootId || 'radial'}`, JSON.stringify(customPositionsRef.current)); } catch { /* optional */ }
      }
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [dragging, focusedRootId, network.center.x, network.center.y, renderedStageSize.height, renderedStageSize.width, selectedTopicId, zoom]);

  const topicId = topicNodeId(selectedTopicId);
  const topicStoryActive = !focusedRootId && topicStoryPhase !== 'done';
  // In branch/focused mode a node only ever pops in the instant it leaves the
  // pending set (its timing already staggered by startBranchReveal), so it
  // always uses the "pop from nothing, no extra delay" treatment — same as
  // the topic-story reveal in global mode.
  const storyActive = Boolean(focusedRootId) || topicStoryActive;
  const clockwiseRootTasks = clockwiseRootIds.flatMap((taskId) => {
    const task = taskById.get(taskId);
    return task ? [task] : [];
  });
  const renderedTopicTasks = focusedRootId
    ? topicTasks.filter((task) => !branchPendingNodeIds.has(task.id))
    : clockwiseRootTasks.filter((task) => !topicStoryActive || storyVisibleNodeIds.has(task.id));
  const renderedNetworkEdges = topicRevealStage >= 2
    ? (focusedRootId
      ? network.edges.filter((edge) => !branchPendingEdgeIds.has(`${edge.from}:${edge.to}`))
      : network.edges.filter((edge) => !topicStoryActive || storyVisibleEdgeIds.has(`${edge.from}:${edge.to}`)))
    : [];
  const completionStoryVisible = focusedRootId
    ? true
    : topicStoryPhase === 'completion' || topicStoryPhase === 'done';
  const leafTasks = completeTopicTasks.filter((task) => (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId).length === 0);
  const completion = leafTasks.length ? Math.round(leafTasks.filter((task) => completionState.doneById.get(task.id)).length / leafTasks.length * 100) : 0;
  const hiddenRootCount = Math.max(0, availableRootTasks.length - rootLimit);
  const defaultNetworkZoom = focusedRootId
    ? viewportSize.width < 768 ? .54 : .74
    : viewportSize.width < 768 ? .48 : .68;
  const updateNetworkZoom = (nextZoom: number) => {
    const clampedZoom = Math.min(1.5, Math.max(.35, nextZoom));
    setZoom(clampedZoom);
    try {
      window.localStorage.setItem(`desktop-task-network-view:v6:${selectedTopicId}:${focusedRootId || 'radial'}`, JSON.stringify({ ...viewportOffsetRef.current, zoom: clampedZoom }));
      window.localStorage.setItem(`desktop-task-network-zoom:v2:${selectedTopicId}:${focusedRootId || 'radial'}`, JSON.stringify(clampedZoom));
    } catch { /* optional */ }
  };

  return (
    <section className="desktop-task-network" data-dive-active={divePhase !== 'idle' ? 'true' : 'false'} data-drag-scope={focusedRootId ? 'branch' : 'network'} data-topic-story-phase={topicStoryPhase} data-fullscreen={isNetworkFullscreen ? 'true' : 'false'}>
      <header className="desktop-network-toolbar">
        <div className="desktop-network-root-select">
          <span><GitBranch /></span>
          <label><small>Hierarchy root · Topic</small><select value={selectedTopicId} onChange={(event) => selectTopicWithStory(event.target.value)} disabled={!topics.length}>{!topics.length && <option value="">No topics yet</option>}{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
          {selectedTopic && <button type="button" onClick={onEditTopic} title="Rename topic"><Pencil /></button>}
        </div>
        <div className="desktop-network-stats"><span><strong>{topicTasks.length}/{completeTopicTasks.length}</strong> visible</span><span><strong>{network.roots.length}/{availableRootTasks.length}</strong> level 1</span>{completionStoryVisible && <span><strong>{completion}%</strong> complete</span>}{searchTerm.trim() && <span><Search /> Filtered</span>}</div>
        <div className="desktop-network-controls">
          <button type="button" onClick={() => updateNetworkZoom(zoom - .1)} aria-label="Zoom out">−</button><strong>{Math.round(zoom * 100)}%</strong><button type="button" onClick={() => updateNetworkZoom(zoom + .1)} aria-label="Zoom in">+</button>
          {topicRevealStage > 0 && <button type="button" className="is-portal" onClick={replayCurrentTopicStory}><ChevronRight /> Topic orbit</button>}
          <button type="button" className="is-fullscreen" onClick={() => setIsNetworkFullscreen((current) => !current)} aria-label={isNetworkFullscreen ? 'Exit fullscreen task tree' : 'Open fullscreen task tree'}>{isNetworkFullscreen ? <Minimize2 /> : <Maximize2 />}</button>
          <button type="button" className="is-reflow" onClick={() => {
            customPositionsRef.current = {};
            setCustomPositions({});
            viewportOffsetRef.current = { x: 0, y: 0 };
            setViewportOffset({ x: 0, y: 0 });
            updateNetworkZoom(defaultNetworkZoom);
            savePositions({});
            try { window.localStorage.setItem(`desktop-task-network-view:v6:${selectedTopicId}:${focusedRootId || 'radial'}`, JSON.stringify({ x: 0, y: 0, zoom: defaultNetworkZoom })); } catch { /* optional */ }
            window.requestAnimationFrame(() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const centerX = focusedRootId ? network.focusPosition.x : stageSize.width * .5;
              viewport.scrollTo({
                left: Math.max(0, centerX - viewport.clientWidth * .5),
                top: Math.max(0, stageSize.height * .5 - viewport.clientHeight * .5),
                behavior: 'auto',
              });
            });
          }}><LocateFixed /> Reflow</button>
        </div>
      </header>

      <div className="desktop-network-main">
        <div ref={diveShellRef} className="desktop-network-canvas-shell" data-world-ready={diveSnapshots?.to ? 'true' : 'false'}>
        <div ref={viewportRef} className="desktop-network-scrollport">
          <div
            ref={stageRef}
            className="desktop-network-stage"
            data-dragging={dragging ? 'true' : 'false'}
            data-density={topicTasks.length > 10 ? 'compact' : 'comfortable'}
            data-layout={focusedRootId ? 'focused' : 'radial'}
            onPointerDown={startCanvasPan}
            style={{
              '--network-pan-x': `${viewportOffset.x}px`,
              '--network-pan-y': `${viewportOffset.y}px`,
              width: `${renderedStageSize.width}px`,
              height: `${renderedStageSize.height}px`,
            } as CSSProperties}
          >
        <div className="desktop-network-legend">
          <strong>Task network</strong>
          <span><i className="is-parent" /> Branch · click to reveal</span>
          <span><i className="is-leaf" /> Leaf task</span>
          {completionStoryVisible && <span><i className="is-complete" /> Completed</span>}
          <small>{focusedRootId ? 'Drag a parent to move its subtree · drag a leaf independently' : 'Drag any level-1 node to pull the whole network'}</small>
        </div>
        <div className="desktop-network-live-world">
        <div className="desktop-network-atmosphere" aria-hidden="true"><i /><i /><i /></div>
        <svg className="desktop-network-edges" width={renderedStageSize.width} height={renderedStageSize.height} aria-hidden="true">
          <defs><filter id="network-edge-glow"><feGaussianBlur stdDeviation="2.4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <AnimatePresence initial={false}>
          {topicRevealStage >= 2 && renderedNetworkEdges.map((edge) => {
            const from = network.positions[edge.from];
            const to = network.positions[edge.to];
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const bend = Math.min(38, Math.hypot(dx, dy) * .12);
            const controlX = (from.x + to.x) / 2 - (dy / Math.max(1, Math.hypot(dx, dy))) * bend;
            const controlY = (from.y + to.y) / 2 + (dx / Math.max(1, Math.hypot(dx, dy))) * bend;
            const active = (edge.from === topicId && selectedBranchIds.has(edge.to)) || (selectedBranchIds.has(edge.from) && selectedBranchIds.has(edge.to));
            const hovered = Boolean(hoveredNodeId && (edge.from === hoveredNodeId || edge.to === hoveredNodeId));
            const path = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
            // Gate the green completion edge with the same reveal rules as the
            // node's green tick, so during the topic/branch reveal the green
            // connector never shows before the "reveal completion" phase.
            const childComplete = completionState.doneById.get(edge.to) === true
              && !branchPendingCompletionIds.has(edge.to)
              && (!topicStoryActive || storyCompletedNodeIds.has(edge.to));
            // A completed node resolves first, then its connector carries the result
            // back to the parent. Each higher level waits for the previous burn to land.
            const burnDelay = 320 + (completionState.waveLevelById.get(edge.to) || 0) * 1180;
            const reversePath = `M ${to.x} ${to.y} Q ${controlX} ${controlY} ${from.x} ${from.y}`;
            const burnHeadPoints = Array.from({ length: 20 }, (_, pointIndex) => {
              const progress = pointIndex / 19;
              const inverse = 1 - progress;
              return {
                x: inverse * inverse * to.x + 2 * inverse * progress * controlX + progress * progress * from.x,
                y: inverse * inverse * to.y + 2 * inverse * progress * controlY + progress * progress * from.y,
              };
            });
            const edgeKey = `${edge.from}:${edge.to}`;
            const replayCompletion = completionReplayIds.has(edge.to);
            // The burst overlay below is a decorative extra layered ON TOP —
            // the base green line must NEVER depend on the burst/replay phase
            // machine to be visible (that state can end up invisible mid-cycle
            // or get remounted away by an unrelated nonce bump). So the forward
            // connector goes green the instant the child is complete, full stop.
            const completionBurnActive = childComplete && replayCompletion && completionReplayPhase !== 'idle';
            const edgeComplete = childComplete && !completionBurnActive;
            const edgeOpacity = active || hovered ? .92 : .62;
            return (
              <g key={edgeKey}>
                <path
                  ref={getTopologyEdgeRef(edgeKey)}
                  d={path}
                  className={`${active ? 'is-active' : ''} ${hovered ? 'is-hovered' : ''} ${edgeComplete ? 'is-complete' : ''}`}
                  style={{ '--edge-opacity': edgeOpacity } as CSSProperties}
                />
                {/* Decorative burst overlay — ONLY mounted while actively bursting.
                    It never needs to represent the "settled" state (the base
                    line above already went green), so there is no invisible
                    "primed" limbo to get stuck in.
                    Deliberately NOT gated by reducedMotion (see registerEdge's
                    comment) — measured ON by default in this deployment's
                    environment, which silently killed this whole effect. */}
                {childComplete && replayCompletion && completionReplayPhase === 'playing' && (
                  <path ref={getTopologyEdgeRef(edgeKey, true)} key={`${edgeKey}:${completionReplayNonce}`} d={reversePath} pathLength={1} data-completion-child={edge.to} data-completion-wave={completionState.waveLevelById.get(edge.to) || 0} className="desktop-network-completion-burn is-replaying" style={{ '--burn-delay': `${burnDelay}ms` } as CSSProperties} />
                )}
                {childComplete && replayCompletion && completionReplayPhase === 'playing' && (
                  <motion.circle
                    key={`${edgeKey}:head:${completionReplayNonce}`}
                    className="desktop-network-completion-head"
                    initial={{ cx: to.x, cy: to.y, r: 4, opacity: 0 }}
                    animate={{
                      cx: burnHeadPoints.map((point) => point.x),
                      cy: burnHeadPoints.map((point) => point.y),
                      r: [4, 9, 7, 5],
                      opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                      cx: { duration: 1.05, delay: burnDelay / 1000, ease: 'easeInOut' },
                      cy: { duration: 1.05, delay: burnDelay / 1000, ease: 'easeInOut' },
                      r: { duration: 1.05, delay: burnDelay / 1000, times: [0, .08, .72, 1] },
                      opacity: { duration: 1.05, delay: burnDelay / 1000, times: [0, .06, .88, 1] },
                    }}
                  />
                )}
              </g>
            );
          })}
          </AnimatePresence>
        </svg>

        {selectedTopic && network.positions[topicId] && (
          <div
            ref={getTopologyNodeRef(topicId)}
            className="desktop-network-node-anchor is-topic"
            style={{ transform: `translate3d(${network.positions[topicId].x}px,${network.positions[topicId].y}px,0)` }}
          >
            <motion.button
              type="button"
              className="desktop-network-node is-topic"
              onPointerDown={(event) => startNodeDrag(event, topicId)}
              onPointerEnter={() => setHoveredNodeId(topicId)}
              onPointerLeave={() => setHoveredNodeId((current) => current === topicId ? null : current)}
              onClick={() => { if (!didDragRef.current) replayCurrentTopicStory(); }}
              animate={{ scale: dragging?.mode === 'graph' ? 1.08 : 1 }}
              transition={{ scale: reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 30 } }}
            ><span><GitBranch /></span><strong>{selectedTopic.name}</strong><small>Topic root</small></motion.button>
          </div>
        )}

        <AnimatePresence initial={false}>
        {topicRevealStage >= 1 && renderedTopicTasks.map((task, taskIndex) => {
          const position = network.positions[task.id];
          if (!position) return null;
          const directChildren = (childrenByParent.get(task.id) || []).filter((child) => child.topic_id === selectedTopicId && visibleTaskIds.has(child.id));
          const childCount = directChildren.length;
          const expanded = expandedTaskIds.has(task.id) || Boolean(searchTerm.trim());
          const selected = selectedTaskId === task.id;
          const branch = selectedBranchIds.has(task.id);
          const hoverRelated = !hoveredNodeId || hoverNeighborIds.has(task.id);
          const actualComplete = completionState.doneById.get(task.id) === true;
          const complete = actualComplete && !branchPendingCompletionIds.has(task.id) && (!topicStoryActive || storyCompletedNodeIds.has(task.id));
          const tone = complete ? 'complete' : !focusedRootId ? 'open' : isTaskOverdue(task) ? 'overdue' : isTaskInProgress(task) ? 'progress' : 'open';
          const visualStatus: ApiTaskStatus = actualComplete && !complete && !focusedRootId ? 'not_completed' : complete ? 'completed' : task.status;
          const nodeDepth = network.depths[task.id] || 1;
          const revealDelay = storyActive ? 0 : Math.min(1280, (nodeDepth - 1) * 150 + Math.min(taskIndex, 18) * 42);
          const completionDelay = 220 + (completionState.waveLevelById.get(task.id) || 0) * 1180;
          const size = childCount ? Math.min(70, 50 + Math.log2(childCount + 1) * 9) : 38;
          return (
            <div
              key={task.id}
              ref={getTopologyNodeRef(task.id)}
              className="desktop-network-node-anchor is-task"
              style={{ transform: `translate3d(${position.x}px,${position.y}px,0)` }}
            >
            <motion.button
              type="button"
              className="desktop-network-node is-task"
              data-task-id={task.id}
              data-tone={tone}
              data-selected={selected ? 'true' : 'false'}
              data-branch={branch ? 'true' : 'false'}
              data-completion-replay={complete && completionReplayIds.has(task.id) ? 'true' : 'false'}
              data-completion-armed={complete && completionReplayIds.has(task.id) && completionReplayPhase !== 'idle' ? 'true' : 'false'}
              data-completion-phase={complete && completionReplayIds.has(task.id) ? completionReplayPhase : 'idle'}
              data-completion-wave={completionState.waveLevelById.get(task.id) || 0}
              data-story-completion={complete ? 'true' : 'false'}
              data-dimmed={!hoverRelated ? 'true' : 'false'}
              data-expansion-pulse={expansionPulseId === task.id ? 'true' : 'false'}
              style={{ '--node-size': `${size}px`, '--node-offset': `${-size / 2}px`, '--completion-delay': `${completionDelay}ms` } as CSSProperties}
              onPointerDown={(event) => startNodeDrag(event, task.id)}
              onPointerEnter={() => setHoveredNodeId(task.id)}
              onPointerLeave={() => setHoveredNodeId((current) => current === task.id ? null : current)}
              onClick={() => {
                if (didDragRef.current) return;
                enterTaskBranch(task, childCount);
              }}
              onContextMenu={(event) => onContextMenu(event, task.id)}
              onDoubleClick={() => onOpenTask(task.id)}
              initial={reducedMotion && !storyActive ? false : { opacity: 0, scale: storyActive ? 0 : .35 }}
              animate={{ opacity: 1, scale: draggedNodeId === task.id ? 1.13 : selected ? 1.08 : 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: .35 }}
              transition={{ opacity: { duration: reducedMotion && !storyActive ? 0 : .34, delay: reducedMotion && !storyActive ? 0 : revealDelay / 1000 }, scale: reducedMotion && !storyActive ? { duration: 0 } : { type: 'spring', stiffness: 270, damping: 22, mass: .82, delay: revealDelay / 1000 } }}
              title={`${task.title} · double-click for full details`}
            ><span
                key={`${task.id}:${completionReplayNonce}`}
                className="desktop-network-node-toggle"
                onPointerDown={(event) => {
                  // Without this, the pointerdown bubbles to the button's
                  // startNodeDrag handler first, which calls
                  // setPointerCapture — that hijacks the matching click's
                  // effective target away from this span entirely, so the
                  // tick never fires (only the button's onClick/enterTaskBranch
                  // does). Only leaf tasks (no children) use this as a real
                  // toggle button; parent tasks keep the chevron drag-friendly.
                  if (!childCount) event.stopPropagation();
                }}
                onClick={(event) => {
                  if (childCount) return;
                  event.stopPropagation();
                  if (didDragRef.current) return;
                  onToggleTask(task, event);
                }}
              >{complete ? <CheckCircle2 /> : childCount ? expanded ? <ChevronDown /> : <ChevronRight /> : <Circle />}</span><strong>{task.title}</strong><small>{childCount ? `${expanded ? 'Collapse' : 'Reveal'} ${childCount} children` : getTaskStatusLabel(visualStatus)}</small></motion.button>
            </div>
          );
        })}
        </AnimatePresence>
        </div>

            {!selectedTopic && <div className="desktop-network-empty"><GitBranch /><strong>Create a topic to become the hierarchy root.</strong></div>}
            {hiddenRootCount > 0 && <button type="button" className="desktop-network-show-more" onClick={() => setRootLimit((current) => current + 10)}><Plus /> Show {Math.min(10, hiddenRootCount)} more level 1 tasks <span>{hiddenRootCount} hidden</span></button>}
            <div className="desktop-network-hint"><Move /> {focusedRootId ? 'Branch mode · parent carries descendants · leaf moves independently' : 'Global mode · every level-1 drag pulls the whole network'} · Double-click for details</div>
          </div>
        </div>
        {diveSnapshots && (
          <div className="semantic-dive-overlay" aria-hidden="true">
            <svg width="100%" height="100%" preserveAspectRatio="none">
              {diveSnapshots.from.edges.map((edge) => <path key={edge.key} d={edge.d} data-from={edge.from} data-to={edge.to} data-active={edge.active ? 'true' : 'false'} />)}
            </svg>
            {diveSnapshots.from.nodes.map((node, index) => (
              <div
                key={node.id}
                className="semantic-dive-node"
                data-node-id={node.id}
                data-kind={node.kind}
                data-tone={node.tone}
                style={{ '--snapshot-x': `${node.x}px`, '--snapshot-y': `${node.y}px`, '--snapshot-radius': `${node.radius}px`, '--snapshot-orbit': `${(index % 2 ? -1 : 1) * (28 + index % 5 * 11)}px` } as CSSProperties}
              ><i>{node.kind === 'topic' ? <GitBranch /> : node.tone === 'complete' ? <CheckCircle2 /> : <Circle />}</i><span>{node.label}</span></div>
            ))}
            <div className="semantic-dive-portal" style={{ '--snapshot-x': `${diveSnapshots.from.portal.x}px`, '--snapshot-y': `${diveSnapshots.from.portal.y}px` } as CSSProperties} />
          </div>
        )}
        {diveSnapshots?.to && (
          <div className="semantic-dive-reconstruction" aria-hidden="true">
            <svg width="100%" height="100%" preserveAspectRatio="none">
              {diveSnapshots.to.edges.map((edge) => <path key={edge.key} d={edge.d} pathLength={1} data-active={edge.active ? 'true' : 'false'} />)}
            </svg>
            {diveSnapshots.to.nodes.map((node) => {
              const previous = node.kind === 'topic'
                ? diveSnapshots.from.nodes.find((candidate) => candidate.id === node.id)
                : undefined;
              const origin = previous || { x: diveSnapshots.from.portal.x, y: diveSnapshots.from.portal.y };
              return (
                <div
                  key={node.id}
                  className="semantic-dive-reconstruction-node"
                  data-from-x={origin.x}
                  data-from-y={origin.y}
                  data-to-x={node.x}
                  data-to-y={node.y}
                  data-radius={node.radius}
                  data-kind={node.kind}
                  data-tone={node.tone}
                  style={{ width: node.radius * 2, height: node.radius * 2, opacity: 0 }}
                ><i>{node.kind === 'topic' ? <GitBranch /> : node.tone === 'complete' ? <CheckCircle2 /> : <Circle />}</i><span>{node.label}</span></div>
              );
            })}
          </div>
        )}
        </div>

      </div>
    </section>
  );
}

const getTreeAccent = (tone: keyof typeof taskThemes) => {
  if (tone === 'completed') return '#34d399';
  if (tone === 'overdue') return '#fb7185';
  if (tone === 'inProgress') return '#38bdf8';
  return '#94a3b8';
};

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

function DesktopTreeConnectors({
  canvasSize,
  connectorGroups,
  diagramNodeById,
  nodePositions,
  visibleNodeIds,
  selectedBranchIds,
  selectedTaskId,
  draggedTaskId,
  motionMode,
}: {
  canvasSize: { width: number; height: number };
  connectorGroups: Array<{ parentId: string; childIds: string[] }>;
  diagramNodeById: Map<string, DiagramNode>;
  nodePositions: Record<string, NodePosition>;
  visibleNodeIds: Set<string>;
  selectedBranchIds: Set<string>;
  selectedTaskId: string | null;
  draggedTaskId: string | null;
  motionMode: TreeMotionMode;
}) {
  const markerTones: Array<[keyof typeof taskThemes, string]> = [
    ['incomplete', getTreeAccent('incomplete')],
    ['inProgress', getTreeAccent('inProgress')],
    ['completed', getTreeAccent('completed')],
    ['overdue', getTreeAccent('overdue')],
  ];
  let animatedEdgeCount = 0;

  return (
    <svg
      className="desktop-task-tree-edges pointer-events-none absolute inset-0 z-0"
      width={canvasSize.width}
      height={canvasSize.height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {markerTones.map(([tone, color]) => (
          <marker
            key={tone}
            id={`desktop-task-chevron-${tone}`}
            markerWidth="11"
            markerHeight="11"
            refX="8.5"
            refY="5.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d="M 1.5 1.5 L 8 5.5 L 1.5 9.5"
              fill="none"
              stroke={color}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        ))}
      </defs>

      {connectorGroups.map((group) => {
        const parentNode = diagramNodeById.get(group.parentId);
        const parentPosition = nodePositions[group.parentId];
        if (!parentNode || !parentPosition) return null;
        const parentSize = getNodeSize(parentNode, true);
        const startX = parentPosition.x + parentSize.width + 4;
        const startY = parentPosition.y + parentSize.height / 2;
        const renderedChildIds = group.childIds.filter((childId) => {
          const active = Boolean(selectedTaskId && selectedBranchIds.has(group.parentId) && selectedBranchIds.has(childId));
          const dragAdjacent = draggedTaskId === group.parentId || draggedTaskId === childId;
          return visibleNodeIds.has(childId) || active || dragAdjacent;
        });
        if (renderedChildIds.length === 0) return null;

        return (
          <g key={group.parentId}>
            {renderedChildIds.map((childId) => {
              const childNode = diagramNodeById.get(childId);
              const childPosition = nodePositions[childId];
              if (!childNode || !childPosition) return null;
              const childSize = getNodeSize(childNode, true);
              const endX = childPosition.x - 11;
              const endY = childPosition.y + childSize.height / 2;
              const curve = Math.min(104, Math.max(44, (endX - startX) * 0.43));
              const d = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
              const tone = childNode.kind === 'task' && childNode.task ? getTaskTone(childNode.task) : 'incomplete';
              const color = getTreeAccent(tone);
              const active = Boolean(selectedTaskId && selectedBranchIds.has(group.parentId) && selectedBranchIds.has(childId));
              const dragAdjacent = draggedTaskId === group.parentId || draggedTaskId === childId;
              const muted = Boolean(selectedTaskId && !active && !dragAdjacent);
              const animateFlow = motionMode === 'cinematic' && (active || dragAdjacent) && animatedEdgeCount < 24;
              if (animateFlow) animatedEdgeCount += 1;

              return (
                <g key={childId} className={muted ? 'desktop-task-tree-edge-muted' : undefined}>
                  <path d={d} className="desktop-task-tree-edge-rail" vectorEffect="non-scaling-stroke" />
                  {(active || dragAdjacent) && motionMode !== 'minimal' && (
                    <path d={d} className="desktop-task-tree-edge-glow" stroke={color} vectorEffect="non-scaling-stroke" />
                  )}
                  <motion.path
                    d={d}
                    className={`desktop-task-tree-edge-signal ${active ? 'is-active' : ''} ${dragAdjacent ? 'is-dragging' : ''}`}
                    stroke={color}
                    markerEnd={`url(#desktop-task-chevron-${tone})`}
                    vectorEffect="non-scaling-stroke"
                    initial={motionMode === 'cinematic' ? { pathLength: 0, opacity: 0 } : false}
                    animate={{ pathLength: 1, opacity: muted ? 0.28 : active || dragAdjacent ? 1 : 0.64 }}
                    transition={motionMode === 'cinematic' ? { pathLength: { duration: 0.46, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.18 } } : { duration: 0 }}
                  />
                  {animateFlow && (
                    <path d={d} className="desktop-task-tree-edge-flow" stroke={color} vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              );
            })}
            <circle className="desktop-task-tree-port" cx={startX - 4} cy={startY} r="4" />
          </g>
        );
      })}
    </svg>
  );
}

function TopicDiagramNode({
  node,
  position,
  nodeSize,
  variant,
  isSelected,
  isBranchActive,
  taskCount,
  onSelect,
  onDragStart,
  onEditTopic,
  onAddTask,
}: {
  node: DiagramNode;
  position: NodePosition;
  nodeSize: { width: number; height: number };
  variant: TaskWorkspaceVariant;
  isSelected: boolean;
  isBranchActive: boolean;
  taskCount: number;
  onSelect: () => void;
  onDragStart?: (event: ReactPointerEvent<HTMLElement>) => void;
  onEditTopic?: () => void;
  onAddTask?: () => void;
}) {
  const color = node.topic ? getTopicColorByName(node.topic.topic_color, 0).text : '#2563eb';
  const background = '#FFFFFF';
  const borderColor = isSelected ? '#2563EB' : '#E2E8F0';

  if (variant === 'desktop-cinematic') {
    return (
      <motion.div
        className={`desktop-task-tree-node desktop-task-tree-root-node group absolute z-10 ${isSelected || isBranchActive ? 'is-active' : ''}`}
        data-tree-node-id={node.id}
        style={{
          width: nodeSize.width,
          height: nodeSize.height,
          '--tree-node-accent': color,
        } as CSSProperties}
        initial={{ opacity: 0, x: position.x - 14, y: position.y, scale: 0.96 }}
        animate={{ opacity: 1, x: position.x, y: position.y, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onPointerDown={onSelect}
        role="treeitem"
        aria-level={1}
        aria-selected={isSelected}
        tabIndex={isSelected ? 0 : -1}
      >
        <div className="desktop-task-tree-node-surface relative h-full overflow-hidden rounded-[22px] text-left">
          <span className="desktop-task-tree-node-light" />
          <span className="desktop-task-tree-node-port is-output" aria-hidden="true" />
          <div className="relative flex h-full items-center gap-3 px-4">
            <span className="desktop-task-tree-root-orbit grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <GitBranch className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-100/55">Life root</p>
              <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.2] text-white">{node.title}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">{taskCount} tasks in this constellation</p>
            </div>
            <div className="desktop-task-tree-node-actions flex shrink-0 items-center gap-1">
              {onAddTask && (
                <button type="button" onClick={(event) => { event.stopPropagation(); onAddTask(); }} className="desktop-task-tree-node-action" aria-label="Add task to this life root" title="Add task">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              {onEditTopic && (
                <button type="button" onClick={(event) => { event.stopPropagation(); onEditTopic(); }} className="desktop-task-tree-node-action" aria-label="Edit life root" title="Edit root">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

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
            {onDragStart && <button
              type="button"
              onPointerDown={onDragStart}
              className="grid h-5 w-5 cursor-grab touch-none place-items-center rounded-md border border-slate-200/80 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-900 active:cursor-grabbing"
              title="Drag node"
            >
              <Move className="h-2.5 w-2.5" />
            </button>}
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
  nodeSize,
  variant,
  isSelected,
  isDragging,
  isMuted,
  isBranchActive,
  motionMode,
  feedbackTone,
  completionPulse,
  hasChildren,
  onSelect,
  onContextMenu,
  onDragStart,
  onToggle,
  onAddChild,
  onOpen,
}: {
  task: ApiTask;
  visualDepth: number;
  position: NodePosition;
  nodeSize: { width: number; height: number };
  variant: TaskWorkspaceVariant;
  isSelected: boolean;
  isDragging: boolean;
  isMuted: boolean;
  isBranchActive: boolean;
  motionMode: TreeMotionMode;
  feedbackTone: DropFeedback['tone'] | null;
  completionPulse: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onToggle: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
  onAddChild: () => void;
  onOpen: () => void;
}) {
  const taskDone = isTaskDone(task);
  const taskOverdue = isTaskOverdue(task);
  const theme = taskThemes[getTaskTone(task)];
  const isCompact = visualDepth >= 2;
  const isLevelTwo = visualDepth === 1;
  const completion = (task.leaf_count || 0) > 0
    ? Math.round(((task.completed_leaf_count || 0) / Math.max(1, task.leaf_count || 1)) * 100)
    : taskDone ? 100 : 0;

  if (variant === 'desktop-cinematic') {
    const tone = getTaskTone(task);
    const accent = getTreeAccent(tone);
    const motionDisabled = motionMode === 'minimal';
    const statusLabel = taskDone ? 'Done' : taskOverdue ? 'Overdue' : isTaskInProgress(task) ? 'In progress' : 'Open';

    return (
      <motion.div
        className={`desktop-task-tree-node desktop-task-tree-task-node group absolute ${isSelected ? 'is-selected' : ''} ${isBranchActive ? 'is-branch-active' : ''} ${isDragging ? 'is-dragging' : ''} ${isMuted ? 'is-muted' : ''} ${feedbackTone ? `has-${feedbackTone}` : ''} ${completionPulse ? 'has-completion-pulse' : ''}`}
        data-tone={tone}
        data-tree-node-id={task.id}
        style={{
          width: nodeSize.width,
          height: nodeSize.height,
          zIndex: isDragging ? 60 : isSelected ? 20 : 10,
          '--tree-node-accent': accent,
          '--tree-node-progress': `${completion}%`,
        } as CSSProperties}
        initial={motionMode === 'cinematic' ? { opacity: 0, x: position.x - 12, y: position.y, scale: 0.965 } : false}
        animate={{
          opacity: isMuted ? 0.66 : 1,
          x: position.x,
          y: position.y + (isDragging && !motionDisabled ? -2 : 0),
          scale: isDragging && !motionDisabled ? 1.028 : 1,
          rotate: isDragging && !motionDisabled ? -0.32 : 0,
        }}
        transition={isDragging || motionDisabled ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
        onPointerDown={onSelect}
        onDoubleClick={(event) => { event.stopPropagation(); onOpen(); }}
        onContextMenu={onContextMenu}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onOpen();
          }
          if (event.key === ' ' && !hasChildren) {
            event.preventDefault();
            onToggle();
          }
        }}
        role="treeitem"
        aria-level={visualDepth + 1}
        aria-selected={isSelected}
        aria-label={`${task.title}, ${statusLabel}`}
        tabIndex={isSelected ? 0 : -1}
      >
        <div className="desktop-task-tree-node-surface relative h-full overflow-hidden rounded-[18px] text-left">
          <span className="desktop-task-tree-node-light" aria-hidden="true" />
          <span className="desktop-task-tree-node-status-rail" aria-hidden="true" />
          <span className="desktop-task-tree-node-port is-input" aria-hidden="true" />
          {hasChildren && <span className="desktop-task-tree-node-port is-output" aria-hidden="true" />}
          {feedbackTone && <span key={`${task.id}-${feedbackTone}`} className={`desktop-task-tree-drop-feedback is-${feedbackTone}`} aria-hidden="true" />}
          {completionPulse && <span className="desktop-task-tree-completion-wave" aria-hidden="true" />}

          <div className="relative flex h-full flex-col px-3.5 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              {!hasChildren ? (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onToggle(event); }}
                  className="desktop-task-tree-checkbox mt-0.5 shrink-0"
                  aria-label={taskDone ? `Mark ${task.title} as open` : `Complete ${task.title}`}
                  aria-pressed={taskDone}
                >
                  {taskDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </button>
              ) : (
                <span className="desktop-task-tree-branch-icon mt-0.5 grid shrink-0 place-items-center" title={`${completion}% complete`}>
                  <GitBranch className="h-3.5 w-3.5" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[8px] font-bold uppercase tracking-[.18em] text-slate-500">
                    {hasChildren ? 'Project' : `Task · L${visualDepth}`}
                  </span>
                  <span className="desktop-task-tree-status-chip" data-tone={tone}>{statusLabel}</span>
                </div>
                <p className="line-clamp-2 text-[13px] font-semibold leading-[1.25] text-slate-100">{task.title}</p>
              </div>

              <div className="desktop-task-tree-node-actions flex shrink-0 items-center gap-1">
                <button type="button" onClick={(event) => { event.stopPropagation(); onAddChild(); }} className="desktop-task-tree-node-action" aria-label={`Add a child under ${task.title}`} title="Add child">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="desktop-task-tree-node-action" aria-label={`Open details for ${task.title}`} title="Details">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={onContextMenu} className="desktop-task-tree-node-action" aria-label={`Open actions for ${task.title}`} title="More actions">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                <button type="button" onPointerDown={onDragStart} className="desktop-task-tree-node-action desktop-task-tree-drag-handle" aria-label={`Reorder ${task.title} within its branch`} title="Drag to reorder">
                  <Move className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pl-7">
              <span className={`truncate text-[9px] font-medium ${taskOverdue ? 'text-rose-300' : 'text-slate-500'}`}>
                {task.deadline ? `Due ${formatDate(task.deadline)}` : hasChildren ? `${task.completed_leaf_count || 0}/${task.leaf_count || 0} leaf tasks` : 'No deadline'}
              </span>
              {hasChildren && <span className="text-[9px] font-semibold tabular-nums" style={{ color: accent }}>{completion}%</span>}
            </div>
            {hasChildren && <span className="desktop-task-tree-progress" aria-hidden="true"><span /></span>}
          </div>
        </div>
      </motion.div>
    );
  }

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
  // Keep the latest onClose in a ref so the setup effect can run exactly ONCE
  // on mount. Previously the effect depended on `onClose` (a fresh closure each
  // render), so every keystroke re-ran it and called firstFocusable.focus(),
  // which interrupts IME composition — Vietnamese/Telex typing would stop after
  // a single character.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); previouslyFocused?.focus(); };
  }, []);
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
