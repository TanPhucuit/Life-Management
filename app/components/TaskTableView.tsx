'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  GitBranch,
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

type TaskRow = {
  task: ApiTask;
  depth: number;
};

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
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);

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

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi-VN');
  const matchingRootIds = useMemo(() => {
    const matches = new Set<string>();
    if (!normalizedSearch) return matches;

    const matchMemo = new Map<string, boolean>();
    const subtreeMatches = (task: ApiTask): boolean => {
      const cached = matchMemo.get(task.id);
      if (cached !== undefined) return cached;
      const topicName = topicById.get(task.topic_id)?.name || '';
      const taskMatches = `${task.title} ${task.description || ''} ${topicName}`.toLocaleLowerCase('vi-VN').includes(normalizedSearch);
      const result = taskMatches || (childrenByParent.get(task.id) || []).some(subtreeMatches);
      matchMemo.set(task.id, result);
      return result;
    };

    rootTasks.forEach((rootTask) => {
      if (subtreeMatches(rootTask)) matches.add(rootTask.id);
    });
    return matches;
  }, [childrenByParent, normalizedSearch, rootTasks, topicById]);

  useEffect(() => {
    if (rootTasks.length === 0) {
      setActiveRootId(null);
      return;
    }
    if (!activeRootId || !rootTasks.some((task) => task.id === activeRootId)) {
      setActiveRootId(rootTasks[0].id);
      return;
    }
    if (normalizedSearch && matchingRootIds.size > 0 && !matchingRootIds.has(activeRootId)) {
      setActiveRootId(rootTasks.find((task) => matchingRootIds.has(task.id))?.id || rootTasks[0].id);
    }
  }, [activeRootId, matchingRootIds, normalizedSearch, rootTasks]);

  const activeRoot = rootTasks.find((task) => task.id === activeRootId) || null;

  const visibleRows = useMemo<TaskRow[]>(() => {
    if (!activeRoot) return [];

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
    visit(activeRoot, 0);
    return rows;
  }, [activeRoot, childrenByParent, collapsedTaskIds, normalizedSearch, topicById]);

  const activeSheetTasks = activeRoot
    ? tasks.filter((task) => task.id === activeRoot.id || task.root_task_id === activeRoot.id)
    : [];
  const rootTaskCount = activeSheetTasks.length;
  const rootCompletion = activeRoot ? getCompletionPercent(activeRoot) : 0;
  const overdueCount = activeSheetTasks.filter(isTaskOverdue).length;
  const activeTopic = activeRoot ? topicById.get(activeRoot.topic_id) : null;

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
          <p className="text-sm font-medium text-slate-700">Chưa có root task để tạo sheet.</p>
          <p className="mt-1 text-xs text-slate-500">Hãy tạo root task trước, sheet tương ứng sẽ xuất hiện tại đây.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[520px] flex-1 flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-3 pt-3 sm:px-4">
        <div className="overflow-x-auto" role="tablist" aria-label="Root task sheets">
          <div className="flex min-w-max items-end gap-1">
            {rootTasks.map((rootTask, index) => {
              const topic = topicById.get(rootTask.topic_id);
              const topicColor = getTopicColorByName(topic?.topic_color, index);
              const active = rootTask.id === activeRootId;
              return (
                <button
                  key={rootTask.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveRootId(rootTask.id)}
                  title={`${topic?.name || 'Không có chủ đề'}: ${rootTask.title}`}
                  className={`group relative flex h-10 max-w-[240px] items-center gap-2 border px-3 text-left text-sm transition ${
                    active
                      ? 'z-10 border-b-white border-slate-300 bg-white font-semibold text-slate-950'
                      : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: topicColor.text }} />
                  <span className="truncate">{rootTask.title}</span>
                  <span className={`shrink-0 text-[10px] ${active ? 'text-blue-600' : 'text-slate-400'}`}>{getCompletionPercent(rootTask)}%</span>
                  {active && <span className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeRoot && (
        <>
          <div className="grid grid-cols-2 border-b border-slate-200 bg-white sm:grid-cols-4">
            <SheetMetric label="Chủ đề" value={activeTopic?.name || 'Không có'} />
            <SheetMetric label="Tổng task" value={rootTaskCount} />
            <SheetMetric label="Tiến độ" value={`${rootCompletion}%`} progress={rootCompletion} />
            <SheetMetric label="Quá hạn" value={overdueCount} tone={overdueCount > 0 ? 'danger' : 'default'} />
          </div>

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
                {visibleRows.map(({ task, depth }, rowIndex) => {
                  const children = childrenByParent.get(task.id) || [];
                  const hasChildren = children.length > 0;
                  const completed = isTaskDone(task);
                  const overdue = isTaskOverdue(task);
                  const completion = getCompletionPercent(task);
                  const collapsed = collapsedTaskIds.has(task.id);
                  const rowBackground = depth === 0 ? 'bg-blue-50/60' : rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';

                  return (
                    <tr key={task.id} className={`group ${rowBackground} transition hover:bg-blue-50/70`}>
                      <td className={`sticky left-0 z-10 border-b border-r border-slate-200 p-0 ${rowBackground} group-hover:bg-blue-50/70`}>
                        <div className="flex min-h-12 items-center gap-2 px-3 py-2" style={{ paddingLeft: 12 + Math.min(depth, 8) * 24 }}>
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(task.id)}
                              className="grid h-6 w-6 shrink-0 place-items-center text-slate-500 hover:text-slate-950"
                              aria-label={collapsed ? 'Mở task con' : 'Thu gọn task con'}
                            >
                              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onToggleTask(task)}
                              className={`grid h-5 w-5 shrink-0 place-items-center border transition ${
                                completed
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500'
                              }`}
                              aria-label={completed ? 'Mở lại task' : 'Đánh dấu hoàn thành'}
                            >
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {hasChildren && <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                              <button
                                type="button"
                                onClick={() => onOpenTask(task.id)}
                                className={`truncate text-left font-medium hover:text-blue-700 ${completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}
                              >
                                {task.title}
                              </button>
                              {depth === 0 && <span className="border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Root</span>}
                            </div>
                            {task.description && <p className="mt-0.5 truncate text-xs text-slate-500">{task.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2">
                        <StatusBadge task={task} overdue={overdue} />
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-600">
                        {formatTableDate(task.start_date)}
                      </td>
                      <td className={`border-b border-r border-slate-200 px-3 py-2 font-mono text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                        {formatTableDate(task.deadline)}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden bg-slate-200">
                            <div className={`h-full ${completion === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${completion}%` }} />
                          </div>
                          <span className="w-8 text-right font-mono text-xs font-medium text-slate-600">{completion}%</span>
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id)}
                            className="grid h-8 w-8 place-items-center border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
                            title="Chỉnh sửa task"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddChild(task.id)}
                            className="grid h-8 w-8 place-items-center border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
                            title="Thêm task con"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibleRows.length === 0 && (
              <div className="flex min-h-56 items-center justify-center bg-white px-4 text-center text-sm text-slate-500">
                Không có task nào trong sheet khớp với từ khóa tìm kiếm.
              </div>
            )}
          </div>

          {isLoading && (
            <div className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Đang cập nhật dữ liệu task...</div>
          )}
        </>
      )}
    </section>
  );
}

function SheetMetric({
  label,
  value,
  progress,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  progress?: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="min-h-[72px] border-b border-r border-slate-200 px-3 py-2.5 sm:border-b-0">
      <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {label === 'Quá hạn' && tone === 'danger' && <AlertCircle className="h-4 w-4 text-red-500" />}
        {label === 'Tiến độ' && <CalendarDays className="h-4 w-4 text-blue-600" />}
        <p className={`truncate text-base font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      </div>
      {progress !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden bg-slate-200">
          <div className="h-full bg-blue-600" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ task, overdue }: { task: ApiTask; overdue: boolean }) {
  if (overdue) {
    return <span className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"><AlertCircle className="h-3 w-3" />Quá hạn</span>;
  }
  if (isTaskDone(task)) {
    return <span className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><Check className="h-3 w-3" />Hoàn thành</span>;
  }
  if (task.status === 'in_progress' || task.effective_status === 'in_progress') {
    return <span className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"><GitBranch className="h-3 w-3" />Đang làm</span>;
  }
  return <span className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"><Circle className="h-3 w-3" />Chưa làm</span>;
}
