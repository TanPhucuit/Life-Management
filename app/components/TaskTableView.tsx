'use client';

import { useEffect, useMemo, useState } from 'react';
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
}: TaskTableViewProps) {
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
  const levelOneSheets = activeRoot ? childrenByParent.get(activeRoot.id) || [] : [];
  const activeLevelOne = activeLevelOneId ? taskById.get(activeLevelOneId) || null : null;
  const levelTwoTasks = activeLevelOne ? childrenByParent.get(activeLevelOne.id) || [] : [];
  const levelTwoSheets = levelTwoTasks.filter((task) => (childrenByParent.get(task.id) || []).length > 0);
  const directLevelTwoTasks = levelTwoTasks.filter((task) => (childrenByParent.get(task.id) || []).length === 0);
  const activeLevelTwoSheet = activeLevelTwoSheetId ? taskById.get(activeLevelTwoSheetId) || null : null;

  useEffect(() => {
    if (rootTasks.length === 0) {
      setActiveRootId(null);
      return;
    }
    if (!activeRootId || !rootTasks.some((task) => task.id === activeRootId)) setActiveRootId(rootTasks[0].id);
  }, [activeRootId, rootTasks]);

  useEffect(() => {
    if (levelOneSheets.length === 0) {
      setActiveLevelOneId(null);
      setActiveLevelTwoSheetId(null);
      return;
    }
    if (!activeLevelOneId || !levelOneSheets.some((task) => task.id === activeLevelOneId)) {
      setActiveLevelOneId(levelOneSheets[0].id);
      setActiveLevelTwoSheetId(null);
    }
  }, [activeLevelOneId, levelOneSheets]);

  useEffect(() => {
    if (activeLevelTwoSheetId && !levelTwoSheets.some((task) => task.id === activeLevelTwoSheetId)) {
      setActiveLevelTwoSheetId(null);
    }
  }, [activeLevelTwoSheetId, levelTwoSheets]);

  const baseTableTasks = activeLevelTwoSheet ? childrenByParent.get(activeLevelTwoSheet.id) || [] : directLevelTwoTasks;
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

  const tableContext = activeLevelTwoSheet || activeLevelOne;
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

  const selectRoot = (rootId: string) => {
    setActiveRootId(rootId);
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
      <section className="flex min-h-[420px] flex-1 items-center justify-center bg-slate-50 p-4">
        <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Table2 className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">Chưa có root task để hiển thị.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[520px] flex-1 flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white p-3 sm:p-4">
        <label className="block max-w-xl">
          <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">Root task</span>
          <select
            value={activeRootId || ''}
            onChange={(event) => selectRoot(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {rootTasks.map((rootTask) => {
              const topic = topicById.get(rootTask.topic_id);
              return <option key={rootTask.id} value={rootTask.id}>{topic ? `${topic.name} / ` : ''}{rootTask.title}</option>;
            })}
          </select>
        </label>
      </div>

      {levelOneSheets.length > 0 ? (
        <>
          <SheetTabs
            label="Sheet cấp 1"
            tasks={levelOneSheets}
            activeTaskId={activeLevelOneId}
            topics={topics}
            onSelect={selectLevelOne}
          />

          {activeLevelOne && levelTwoSheets.length > 0 && (
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
              <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">Sheet cấp 2</p>
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
                    Task trực tiếp ({directLevelTwoTasks.length})
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
            <SheetMetric label="Đang xem" value={activeLevelTwoSheet ? activeLevelTwoSheet.title : 'Task trực tiếp'} />
            <SheetMetric label="Số task" value={tableTasks.length} />
            <SheetMetric label="Tiến độ" value={tableContext ? `${getCompletionPercent(tableContext)}%` : '0%'} />
            <SheetMetric label="Quá hạn" value={overdueCount} danger={overdueCount > 0} />
          </div>

          <TaskRowsTable
            rows={visibleRows}
            childrenByParent={childrenByParent}
            collapsedTaskIds={collapsedTaskIds}
            searchTerm={searchTerm}
            onToggleCollapsed={toggleCollapsed}
            onToggleTask={onToggleTask}
            onOpenTask={onOpenTask}
            onAddChild={onAddChild}
          />

          {isLoading && <div className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Đang cập nhật dữ liệu task...</div>}
        </>
      ) : (
        <div className="flex min-h-[360px] flex-1 items-center justify-center p-4">
          <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Root task này chưa có task cấp 1.</p>
            <button type="button" onClick={() => activeRoot && onAddChild(activeRoot.id)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" />Thêm task cấp 1
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
}: {
  label: string;
  tasks: ApiTask[];
  activeTaskId: string | null;
  topics: ApiTopic[];
  onSelect: (taskId: string) => void;
}) {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  return (
    <div className="border-b border-slate-200 bg-white px-3 pt-3 sm:px-4">
      <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">{label}</p>
      <div className="overflow-x-auto" role="tablist" aria-label={label}>
        <div className="flex min-w-max items-end gap-1">
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
  onToggleCollapsed,
  onToggleTask,
  onOpenTask,
  onAddChild,
}: {
  rows: TaskRow[];
  childrenByParent: Map<string | null, ApiTask[]>;
  collapsedTaskIds: Set<string>;
  searchTerm: string;
  onToggleCollapsed: (taskId: string) => void;
  onToggleTask: (task: ApiTask) => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
  onAddChild: (taskId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="min-w-[940px] w-full border-collapse bg-white text-sm">
        <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="sticky left-0 z-30 w-[42%] min-w-[360px] border-b border-r border-slate-200 bg-slate-100 px-3 py-2.5 text-left">Nhiệm vụ</th>
            <th className="w-32 border-b border-r border-slate-200 px-3 py-2.5 text-left">Trạng thái</th>
            <th className="w-28 border-b border-r border-slate-200 px-3 py-2.5 text-left">Bắt đầu</th>
            <th className="w-28 border-b border-r border-slate-200 px-3 py-2.5 text-left">Deadline</th>
            <th className="w-32 border-b border-r border-slate-200 px-3 py-2.5 text-left">Tiến độ</th>
            <th className="w-24 border-b border-slate-200 px-3 py-2.5 text-center">Thao tác</th>
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
              <tr key={task.id} className={`group ${rowBackground} transition hover:bg-blue-50/70`}>
                <td className={`sticky left-0 z-10 border-b border-r border-slate-200 p-0 ${rowBackground} group-hover:bg-blue-50/70`}>
                  <div className="flex min-h-12 items-center gap-2 px-3 py-2" style={{ paddingLeft: 12 + Math.min(depth, 8) * 24 }}>
                    {hasChildren ? (
                      <button type="button" onClick={() => onToggleCollapsed(task.id)} className="grid h-6 w-6 shrink-0 place-items-center text-slate-500 hover:text-slate-950" aria-label={collapsed ? 'Mở task con' : 'Thu gọn task con'}>
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void onToggleTask(task)} className={`grid h-5 w-5 shrink-0 place-items-center border transition ${completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500'}`} aria-label={completed ? 'Mở lại task' : 'Đánh dấu hoàn thành'}>
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
                    <div className="h-1.5 flex-1 overflow-hidden bg-slate-200"><div className={`h-full ${completion === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${completion}%` }} /></div>
                    <span className="w-8 text-right font-mono text-xs font-medium text-slate-600">{completion}%</span>
                  </div>
                </td>
                <td className="border-b border-slate-200 px-2 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" onClick={() => onOpenTask(task.id)} className="grid h-8 w-8 place-items-center border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700" title="Chỉnh sửa task"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => onAddChild(task.id)} className="grid h-8 w-8 place-items-center border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700" title="Thêm task con"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex min-h-56 items-center justify-center bg-white px-4 text-center text-sm text-slate-500">
          {searchTerm.trim() ? 'Không có task nào khớp với từ khóa tìm kiếm.' : 'Sheet này chưa có task dạng list.'}
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
  if (overdue) return <span className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"><AlertCircle className="h-3 w-3" />Quá hạn</span>;
  if (isTaskDone(task)) return <span className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><Check className="h-3 w-3" />Hoàn thành</span>;
  if (task.status === 'in_progress' || task.effective_status === 'in_progress') return <span className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"><GitBranch className="h-3 w-3" />Đang làm</span>;
  return <span className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"><Circle className="h-3 w-3" />Chưa làm</span>;
}
