'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  GitBranch,
  Layers,
  ListTree,
  Pencil,
  Plus,
  Table2,
} from 'lucide-react';
import { ApiTask, ApiTopic } from '@/app/lib/api';
import { getTopicColorByName } from '@/app/lib/topicColors';

type TaskTableViewProps = {
  tasks: ApiTask[];
  topics: ApiTopic[];
  searchTerm: string;
  isLoading: boolean;
  onToggleTask: (task: ApiTask) => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
  onAddChild: (taskId: string) => void;
  variant?: 'legacy' | 'desktop-cinematic';
};

type TaskRow = { task: ApiTask; depth: number };

const formatTableDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const isTaskDone = (task: ApiTask) => task.effective_status === 'completed' || task.status === 'completed';

const isTaskOverdue = (task: ApiTask) => {
  if (!task.deadline || isTaskDone(task)) return false;
  return new Date(task.deadline) < new Date();
};

const getCompletionPercent = (task: ApiTask) => {
  if ((task.leaf_count || 0) > 0) {
    return Math.round(((task.completed_leaf_count || 0) / (task.leaf_count || 1)) * 100);
  }
  return task.status === 'completed' ? 100 : 0;
};

export default function TaskTableView({
  tasks,
  topics,
  searchTerm,
  isLoading,
  onToggleTask,
  onOpenTask,
  onAddChild,
  variant = 'legacy',
}: TaskTableViewProps) {
  const isDesktopCinematic = variant === 'desktop-cinematic';
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [activeLevelOneId, setActiveLevelOneId] = useState<string | null>(null);
  const [activeLevelTwoSheetId, setActiveLevelTwoSheetId] = useState<string | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ApiTask[]>();
    tasks.forEach((task) => {
      const parentId = task.parent_task_id || null;
      map.set(parentId, [...(map.get(parentId) || []), task]);
    });
    map.forEach((items) => {
      items.sort((a, b) => {
        const orderDifference = (a.sort_order || 0) - (b.sort_order || 0);
        if (orderDifference !== 0) return orderDifference;
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });
    });
    return map;
  }, [tasks]);

  const rootTasks = useMemo(() => {
    const topicOrder = new Map(topics.map((topic, index) => [topic.id, index]));
    return [...(childrenByParent.get(null) || [])].sort((a, b) => {
      const topicDifference = (topicOrder.get(a.topic_id) ?? Number.MAX_SAFE_INTEGER) - (topicOrder.get(b.topic_id) ?? Number.MAX_SAFE_INTEGER);
      if (topicDifference !== 0) return topicDifference;
      const orderDifference = (a.sort_order || 0) - (b.sort_order || 0);
      if (orderDifference !== 0) return orderDifference;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });
  }, [childrenByParent, topics]);

  const activeRoot = activeRootId ? taskById.get(activeRootId) || null : null;
  const levelOneSheets = useMemo(
    () => activeRoot ? childrenByParent.get(activeRoot.id) || [] : [],
    [activeRoot, childrenByParent],
  );
  const activeLevelOne = activeLevelOneId ? taskById.get(activeLevelOneId) || null : null;
  const levelTwoTasks = useMemo(
    () => activeLevelOne ? childrenByParent.get(activeLevelOne.id) || [] : [],
    [activeLevelOne, childrenByParent],
  );
  const levelTwoSheets = useMemo(
    () => levelTwoTasks.filter((task) => (childrenByParent.get(task.id) || []).length > 0),
    [childrenByParent, levelTwoTasks],
  );
  const directLevelTwoTasks = useMemo(
    () => levelTwoTasks.filter((task) => (childrenByParent.get(task.id) || []).length === 0),
    [childrenByParent, levelTwoTasks],
  );
  const activeLevelTwoSheet = activeLevelTwoSheetId ? taskById.get(activeLevelTwoSheetId) || null : null;

  useEffect(() => {
    if (rootTasks.length === 0) {
      setActiveRootId(null);
      return;
    }
    const selectionIsInvalid = Boolean(activeRootId) && !rootTasks.some((task) => task.id === activeRootId);
    if (isDesktopCinematic) {
      if (selectionIsInvalid) setActiveRootId(null);
      return;
    }
    if (!activeRootId || selectionIsInvalid) setActiveRootId(rootTasks[0].id);
  }, [activeRootId, isDesktopCinematic, rootTasks]);

  useEffect(() => {
    if (levelOneSheets.length === 0) {
      setActiveLevelOneId(null);
      setActiveLevelTwoSheetId(null);
      return;
    }
    const selectionIsInvalid = Boolean(activeLevelOneId) && !levelOneSheets.some((task) => task.id === activeLevelOneId);
    if (isDesktopCinematic && selectionIsInvalid) {
      setActiveLevelOneId(null);
      setActiveLevelTwoSheetId(null);
      return;
    }
    if (!isDesktopCinematic && (!activeLevelOneId || selectionIsInvalid)) {
      setActiveLevelOneId(levelOneSheets[0].id);
      setActiveLevelTwoSheetId(null);
    }
  }, [activeLevelOneId, isDesktopCinematic, levelOneSheets]);

  useEffect(() => {
    if (activeLevelTwoSheetId && !levelTwoSheets.some((task) => task.id === activeLevelTwoSheetId)) {
      setActiveLevelTwoSheetId(null);
    }
  }, [activeLevelTwoSheetId, levelTwoSheets]);

  const baseTableTasks = useMemo(
    () => activeLevelTwoSheet
      ? childrenByParent.get(activeLevelTwoSheet.id) || []
      : isDesktopCinematic && !activeLevelOne
        ? activeRoot
          ? levelOneSheets.length > 0 ? levelOneSheets : [activeRoot]
          : rootTasks
        : directLevelTwoTasks,
    [activeLevelOne, activeLevelTwoSheet, activeRoot, childrenByParent, directLevelTwoTasks, isDesktopCinematic, levelOneSheets, rootTasks],
  );
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi-VN');

  const visibleRows = useMemo<TaskRow[]>(() => {
    const matchMemo = new Map<string, boolean>();
    const taskMatches = (task: ApiTask) => {
      if (!normalizedSearch) return true;
      const topicName = topicById.get(task.topic_id)?.name || '';
      return `${task.title} ${task.description || ''} ${topicName}`.toLocaleLowerCase('vi-VN').includes(normalizedSearch);
    };
    const subtreeMatches = (task: ApiTask): boolean => {
      const cached = matchMemo.get(task.id);
      if (cached !== undefined) return cached;
      const matches = taskMatches(task) || (childrenByParent.get(task.id) || []).some(subtreeMatches);
      matchMemo.set(task.id, matches);
      return matches;
    };

    const rows: TaskRow[] = [];
    const visit = (task: ApiTask, depth: number) => {
      if (normalizedSearch && !subtreeMatches(task)) return;
      rows.push({ task, depth });
      if (!normalizedSearch && collapsedTaskIds.has(task.id)) return;
      (childrenByParent.get(task.id) || []).forEach((child) => visit(child, depth + 1));
    };
    baseTableTasks.forEach((task) => visit(task, 0));
    return rows;
  }, [baseTableTasks, childrenByParent, collapsedTaskIds, normalizedSearch, topicById]);

  const tableContext = activeLevelTwoSheet || activeLevelOne || (isDesktopCinematic ? activeRoot : null);
  const tableTaskIds = useMemo(() => {
    const ids = new Set<string>();
    const collect = (task: ApiTask) => {
      ids.add(task.id);
      (childrenByParent.get(task.id) || []).forEach(collect);
    };
    baseTableTasks.forEach(collect);
    return ids;
  }, [baseTableTasks, childrenByParent]);
  const tableTasks = tasks.filter((task) => tableTaskIds.has(task.id));
  const overdueCount = tableTasks.filter(isTaskOverdue).length;
  const scopeLeafTasks = tableTasks.filter((task) => (childrenByParent.get(task.id) || []).length === 0);
  const scopeCompletionPercent = scopeLeafTasks.length > 0
    ? Math.round((scopeLeafTasks.filter(isTaskDone).length / scopeLeafTasks.length) * 100)
    : 0;

  const selectRoot = (rootId: string) => {
    setActiveRootId(rootId || null);
    setActiveLevelOneId(null);
    setActiveLevelTwoSheetId(null);
    setCollapsedTaskIds(new Set());
  };

  const selectLevelOne = (taskId: string) => {
    setActiveLevelOneId(taskId);
    setActiveLevelTwoSheetId(null);
    setCollapsedTaskIds(new Set());
  };

  const toggleCollapsed = (taskId: string) => {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  if (rootTasks.length === 0) {
    return (
      <section
        className={`flex min-h-[420px] flex-1 items-center justify-center bg-slate-50 p-4 ${isDesktopCinematic ? 'desktop-task-table' : ''}`}
        data-task-table-variant={variant}
      >
        <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Table2 className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">No root tasks to display.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`flex min-h-[520px] flex-1 flex-col bg-slate-50 ${isDesktopCinematic ? 'desktop-task-table overflow-hidden' : ''}`}
      data-task-table-variant={variant}
      data-active-root-id={activeRootId || undefined}
      data-active-sheet-id={activeLevelTwoSheetId || activeLevelOneId || (isDesktopCinematic ? 'all' : undefined)}
    >
      <div className={`border-b border-slate-200 bg-white p-3 sm:p-4 ${isDesktopCinematic ? 'shadow-[0_8px_24px_rgba(15,23,42,.035)]' : ''}`}>
        <label className="block max-w-xl">
          <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">Root task</span>
          <select
            value={activeRootId || ''}
            onChange={(event) => selectRoot(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {isDesktopCinematic && <option value="">All roots · {tasks.length} tasks</option>}
            {rootTasks.map((rootTask) => {
              const topic = topicById.get(rootTask.topic_id);
              const taskCount = rootTask.descendant_count ?? (childrenByParent.get(rootTask.id) || []).length;
              const countLabel = isDesktopCinematic ? ` · ${taskCount} nested ${taskCount === 1 ? 'task' : 'tasks'}` : '';
              return <option key={rootTask.id} value={rootTask.id}>{topic ? `${topic.name} / ` : ''}{rootTask.title}{countLabel}</option>;
            })}
          </select>
        </label>
      </div>

      {isDesktopCinematic || levelOneSheets.length > 0 ? (
        <>
          {levelOneSheets.length > 0 && (
            <SheetTabs
              label={isDesktopCinematic ? 'Branches' : 'Level 1 sheet'}
              tasks={levelOneSheets}
              activeTaskId={activeLevelOneId}
              topics={topics}
              onSelect={selectLevelOne}
              showAll={isDesktopCinematic}
              onSelectAll={() => {
                setActiveLevelOneId(null);
                setActiveLevelTwoSheetId(null);
                setCollapsedTaskIds(new Set());
              }}
            />
          )}

          {activeLevelOne && levelTwoSheets.length > 0 && (
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
              <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">Level 2 sheet</p>
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveLevelTwoSheetId(null)}
                    className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                      !activeLevelTwoSheetId ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ListTree className="h-4 w-4" />
                    Direct tasks ({directLevelTwoTasks.length})
                  </button>
                  {levelTwoSheets.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setActiveLevelTwoSheetId(task.id);
                        setCollapsedTaskIds(new Set());
                      }}
                      className={`inline-flex h-9 max-w-[240px] items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                        activeLevelTwoSheetId === task.id
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Layers className="h-4 w-4 shrink-0" />
                      <span className="truncate">{task.title}</span>
                      <span className="text-[10px] text-slate-400">{getCompletionPercent(task)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 border-b border-slate-200 bg-white sm:grid-cols-4">
            <SheetMetric
              label="Viewing"
              value={!activeRoot
                ? 'All roots'
                : activeLevelTwoSheet
                  ? activeLevelTwoSheet.title
                  : activeLevelOne
                    ? 'Direct tasks'
                    : levelOneSheets.length > 0 ? 'Full hierarchy' : activeRoot.title}
            />
            <SheetMetric label="Tasks" value={tableTasks.length} />
            <SheetMetric label="Progress" value={`${tableContext ? getCompletionPercent(tableContext) : scopeCompletionPercent}%`} />
            <SheetMetric label="Overdue" value={overdueCount} danger={overdueCount > 0} />
          </div>

          <TaskRowsTable
            rows={visibleRows}
            childrenByParent={childrenByParent}
            collapsedTaskIds={collapsedTaskIds}
            searchTerm={searchTerm}
            variant={variant}
            onToggleCollapsed={toggleCollapsed}
            onToggleTask={onToggleTask}
            onOpenTask={onOpenTask}
            onAddChild={onAddChild}
          />

          {isLoading && <div className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Updating task data…</div>}
        </>
      ) : (
        <div className="flex min-h-[360px] flex-1 items-center justify-center p-4">
          <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">This root does not have any level 1 tasks yet.</p>
            <button type="button" onClick={() => activeRoot && onAddChild(activeRoot.id)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" />Add level 1 task
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SheetTabs({
  label,
  tasks,
  activeTaskId,
  topics,
  onSelect,
  showAll = false,
  onSelectAll,
}: {
  label: string;
  tasks: ApiTask[];
  activeTaskId: string | null;
  topics: ApiTopic[];
  onSelect: (taskId: string) => void;
  showAll?: boolean;
  onSelectAll?: () => void;
}) {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  return (
    <div className="border-b border-slate-200 bg-white px-3 pt-3 sm:px-4">
      <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">{label}</p>
      <div className="overflow-x-auto" role="tablist" aria-label={label}>
        <div className="flex min-w-max items-end gap-1">
          {showAll && (
            <button
              type="button"
              role="tab"
              aria-selected={!activeTaskId}
              onClick={onSelectAll}
              className={`relative flex h-10 items-center gap-2 border px-3 text-left text-sm transition ${
                !activeTaskId
                  ? 'z-10 border-b-white border-slate-300 bg-white font-semibold text-slate-950'
                  : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              <ListTree className="h-4 w-4" />
              <span>All tasks</span>
              <span className="text-[10px] text-slate-400">{tasks.length}</span>
              {!activeTaskId && <span className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
            </button>
          )}
          {tasks.map((task, index) => {
            const topic = topicById.get(task.topic_id);
            const topicColor = getTopicColorByName(topic?.topic_color, index);
            const active = task.id === activeTaskId;
            return (
              <button
                key={task.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(task.id)}
                className={`group relative flex h-10 max-w-[240px] items-center gap-2 border px-3 text-left text-sm transition ${
                  active
                    ? 'z-10 border-b-white border-slate-300 bg-white font-semibold text-slate-950'
                    : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: topicColor.text }} />
                <span className="truncate">{task.title}</span>
                <span className={`shrink-0 text-[10px] ${active ? 'text-blue-600' : 'text-slate-400'}`}>{getCompletionPercent(task)}%</span>
                {active && <span className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TaskRowsTable({
  rows,
  childrenByParent,
  collapsedTaskIds,
  searchTerm,
  variant,
  onToggleCollapsed,
  onToggleTask,
  onOpenTask,
  onAddChild,
}: {
  rows: TaskRow[];
  childrenByParent: Map<string | null, ApiTask[]>;
  collapsedTaskIds: Set<string>;
  searchTerm: string;
  variant: 'legacy' | 'desktop-cinematic';
  onToggleCollapsed: (taskId: string) => void;
  onToggleTask: (task: ApiTask) => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
  onAddChild: (taskId: string) => void;
}) {
  const isDesktopCinematic = variant === 'desktop-cinematic';
  const reducedMotion = Boolean(useReducedMotion());
  const animateRows = isDesktopCinematic && !reducedMotion && rows.length <= 60;
  const TableRow = animateRows ? motion.tr : 'tr';
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="space-y-2 p-3 md:hidden">
        {rows.map(({ task, depth }) => {
          const hasChildren = (childrenByParent.get(task.id) || []).length > 0;
          const completed = isTaskDone(task);
          const overdue = isTaskOverdue(task);
          return (
            <div key={task.id} className="rounded-2xl border border-slate-200 bg-white p-3" style={{ marginLeft: Math.min(depth, 3) * 8 }}>
              <div className="flex items-start gap-2">
                {hasChildren ? <button type="button" onClick={() => onToggleCollapsed(task.id)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50" aria-label={collapsedTaskIds.has(task.id) ? 'Expand children' : 'Collapse children'}>{collapsedTaskIds.has(task.id) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : <button type="button" onClick={() => void onToggleTask(task)} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200'}`} aria-label={completed ? 'Reopen task' : 'Mark completed'}><Check className="h-4 w-4" /></button>}
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 py-1 text-left"><p className={`font-semibold ${completed ? 'text-slate-500 line-through' : ''}`}>{task.title}</p>{task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</p>}</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge task={task} overdue={overdue} /><span className="text-xs text-slate-500">Due {formatTableDate(task.deadline)}</span><button type="button" onClick={() => onAddChild(task.id)} className="ml-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-50" aria-label="Add child task"><Plus className="h-4 w-4" /></button></div>
            </div>
          );
        })}
      </div>
      <table className="hidden min-w-[940px] w-full border-collapse bg-white text-sm md:table">
        <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="sticky left-0 z-30 w-[42%] min-w-[360px] border-b border-r border-slate-200 bg-slate-100 px-3 py-2.5 text-left">Task</th>
            <th className="w-32 border-b border-r border-slate-200 px-3 py-2.5 text-left">Status</th>
            <th className="w-28 border-b border-r border-slate-200 px-3 py-2.5 text-left">Start</th>
            <th className="w-28 border-b border-r border-slate-200 px-3 py-2.5 text-left">Deadline</th>
            <th className="w-32 border-b border-r border-slate-200 px-3 py-2.5 text-left">Progress</th>
            <th className="w-24 border-b border-slate-200 px-3 py-2.5 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, depth }, rowIndex) => {
            const hasChildren = (childrenByParent.get(task.id) || []).length > 0;
            const completed = isTaskDone(task);
            const overdue = isTaskOverdue(task);
            const completion = getCompletionPercent(task);
            const collapsed = collapsedTaskIds.has(task.id);
            const rowBackground = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
            return (
              <TableRow
                key={task.id}
                className={`group ${rowBackground} transition hover:bg-blue-50/70`}
                data-task-depth={isDesktopCinematic ? depth : undefined}
                {...(animateRows ? {
                  layout: 'position' as const,
                  initial: { opacity: 0, y: -6 },
                  animate: { opacity: 1, y: 0 },
                  transition: { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.75, delay: Math.min(depth * 0.018, 0.09) },
                } : {})}
              >
                <td className={`sticky left-0 z-10 border-b border-r border-slate-200 p-0 ${rowBackground} group-hover:bg-blue-50/70`}>
                  <div className="flex min-h-12 items-center gap-2 px-3 py-2" style={{ paddingLeft: 12 + Math.min(depth, 8) * 24 }}>
                    {hasChildren ? (
                      <button type="button" onClick={() => onToggleCollapsed(task.id)} className="grid h-8 w-8 shrink-0 place-items-center text-slate-500 hover:text-slate-950" aria-label={collapsed ? 'Expand children' : 'Collapse children'}>
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void onToggleTask(task)} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition ${completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500'}`} aria-label={completed ? 'Reopen task' : 'Mark completed'}>
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </button>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {hasChildren && <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <button type="button" onClick={() => onOpenTask(task.id)} className={`truncate text-left font-medium hover:text-blue-700 ${completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{task.title}</button>
                      </div>
                      {task.description && <p className="mt-0.5 truncate text-xs text-slate-500">{task.description}</p>}
                    </div>
                  </div>
                </td>
                <td className="border-b border-r border-slate-200 px-3 py-2"><StatusBadge task={task} overdue={overdue} /></td>
                <td className="border-b border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-600">{formatTableDate(task.start_date)}</td>
                <td className={`border-b border-r border-slate-200 px-3 py-2 font-mono text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-600'}`}>{formatTableDate(task.deadline)}</td>
                <td className="border-b border-r border-slate-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden bg-slate-200">
                      {animateRows ? (
                        <motion.div
                          initial={false}
                          animate={{ scaleX: completion / 100 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                          style={{ transformOrigin: 'left center' }}
                          className={`h-full w-full ${completion === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                        />
                      ) : (
                        <div className={`h-full ${completion === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${completion}%` }} />
                      )}
                    </div>
                    <span className="w-8 text-right font-mono text-xs font-medium text-slate-600">{completion}%</span>
                  </div>
                </td>
                <td className="border-b border-slate-200 px-2 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" onClick={() => onOpenTask(task.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700" title="Edit task"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => onAddChild(task.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700" title="Add child task"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </TableRow>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex min-h-56 items-center justify-center bg-white px-4 text-center text-sm text-slate-500">
          {searchTerm.trim() ? 'No tasks match your search.' : 'This sheet does not have list tasks yet.'}
        </div>
      )}
    </div>
  );
}

function SheetMetric({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="min-h-[68px] border-b border-r border-slate-200 px-3 py-2.5 sm:border-b-0">
      <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
      <p className={`mt-1.5 truncate text-base font-semibold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ task, overdue }: { task: ApiTask; overdue: boolean }) {
  if (overdue) return <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"><AlertCircle className="h-3 w-3" />Overdue</span>;
  if (isTaskDone(task)) return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><Check className="h-3 w-3" />Completed</span>;
  if (task.status === 'in_progress' || task.effective_status === 'in_progress') return <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"><GitBranch className="h-3 w-3" />In progress</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"><Circle className="h-3 w-3" />Not started</span>;
}
