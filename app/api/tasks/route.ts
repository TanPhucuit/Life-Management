import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type TaskRow = {
  id: string;
  user_id: string;
  topic_id: string;
  parent_task_id?: string | null;
  title: string;
  description?: string | null;
  deadline?: string | null;
  status: 'completed' | 'not_completed';
  sort_order?: number | null;
  task_color_start?: string | null;
  task_color_end?: string | null;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type EnrichedTask = TaskRow & {
  root_task_id: string;
  depth: number;
  child_count: number;
  descendant_count: number;
  completed_leaf_count: number;
  leaf_count: number;
  effective_status: 'completed' | 'not_completed';
};

function enrichTasks(rows: TaskRow[]): EnrichedTask[] {
  const byId = new Map(rows.map((task) => [task.id, task]));
  const childrenByParent = new Map<string | null, TaskRow[]>();

  rows.forEach((task) => {
    const parentId = task.parent_task_id || null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), task]);
  });

  childrenByParent.forEach((children) => {
    children.sort((a, b) => {
      const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });
  });

  const memo = new Map<string, EnrichedTask>();

  const getRootId = (task: TaskRow): string => {
    let current = task;
    const visited = new Set<string>();

    while (current.parent_task_id && byId.has(current.parent_task_id) && !visited.has(current.id)) {
      visited.add(current.id);
      current = byId.get(current.parent_task_id)!;
    }

    return current.id;
  };

  const getDepth = (task: TaskRow): number => {
    let depth = 0;
    let current = task;
    const visited = new Set<string>();

    while (current.parent_task_id && byId.has(current.parent_task_id) && !visited.has(current.id)) {
      visited.add(current.id);
      depth += 1;
      current = byId.get(current.parent_task_id)!;
    }

    return depth;
  };

  const build = (task: TaskRow): EnrichedTask => {
    const cached = memo.get(task.id);
    if (cached) return cached;

    const children = childrenByParent.get(task.id) || [];
    const childStats = children.map(build);
    const isLeaf = children.length === 0;
    const completedLeafCount = isLeaf
      ? task.status === 'completed' ? 1 : 0
      : childStats.reduce((sum, child) => sum + child.completed_leaf_count, 0);
    const leafCount = isLeaf ? 1 : childStats.reduce((sum, child) => sum + child.leaf_count, 0);
    const descendantCount = childStats.reduce((sum, child) => sum + 1 + child.descendant_count, 0);
    const effectiveStatus = isLeaf
      ? task.status
      : childStats.length > 0 && childStats.every((child) => child.effective_status === 'completed')
        ? 'completed'
        : 'not_completed';

    const enriched: EnrichedTask = {
      ...task,
      parent_task_id: task.parent_task_id || null,
      sort_order: task.sort_order || 0,
      root_task_id: getRootId(task),
      depth: getDepth(task),
      child_count: children.length,
      descendant_count: descendantCount,
      completed_leaf_count: completedLeafCount,
      leaf_count: leafCount,
      effective_status: effectiveStatus,
    };

    memo.set(task.id, enriched);
    return enriched;
  };

  return rows.map(build).sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const topicId = request.nextUrl.searchParams.get('topicId');
    const parentTaskId = request.nextUrl.searchParams.get('parentTaskId');
    const rootId = request.nextUrl.searchParams.get('rootId');
    const includeArchived = request.nextUrl.searchParams.get('includeArchived') === 'true';

    if (!userId) return jsonError('userId is required', 400);

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId);

    if (!includeArchived) query = query.is('archived_at', null);
    if (topicId) query = query.eq('topic_id', topicId);

    const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) return jsonError(error.message, 400);

    let tasks = enrichTasks((data || []) as TaskRow[]);

    if (parentTaskId) {
      tasks = parentTaskId === 'root'
        ? tasks.filter((task) => !task.parent_task_id)
        : tasks.filter((task) => task.parent_task_id === parentTaskId);
    }

    if (rootId) {
      tasks = tasks.filter((task) => task.root_task_id === rootId || task.id === rootId);
    }

    return NextResponse.json(tasks, { headers: corsHeaders });
  } catch (error) {
    return jsonError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, topicId, parentTaskId, title, description, deadline, taskColorStart, taskColorEnd } = body;

    if (!userId || !topicId || !title?.trim()) {
      return jsonError('Missing required fields', 400);
    }

    if (parentTaskId) {
      const { data: parent, error: parentError } = await supabase
        .from('tasks')
        .select('id, user_id, topic_id, archived_at')
        .eq('id', parentTaskId)
        .eq('user_id', userId)
        .is('archived_at', null)
        .single();

      if (parentError || !parent) return jsonError('Parent task not found', 404);
      if (parent.topic_id !== topicId) return jsonError('Child task must use the same topic as its parent', 400);
    }

    let siblingQuery = supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .is('archived_at', null);

    siblingQuery = parentTaskId
      ? siblingQuery.eq('parent_task_id', parentTaskId)
      : siblingQuery.is('parent_task_id', null);

    const { count } = await siblingQuery;

    const { data, error } = await supabase
      .from('tasks')
      .insert([
        {
          user_id: userId,
          topic_id: topicId,
          parent_task_id: parentTaskId || null,
          title: title.trim(),
          description: description?.trim() || null,
          deadline: deadline || null,
          status: 'not_completed',
          sort_order: count || 0,
          task_color_start: taskColorStart || null,
          task_color_end: taskColorEnd || null,
        },
      ])
      .select()
      .single();

    if (error) return jsonError(error.message, 400);
    return NextResponse.json(enrichTasks([data as TaskRow])[0], { status: 201, headers: corsHeaders });
  } catch (error) {
    return jsonError('Internal server error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, title, description, deadline, sortOrder, taskColorStart, taskColorEnd } = body;

    if (!id) return jsonError('Task id is required', 400);

    if (status) {
      const { count, error: childError } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('parent_task_id', id)
        .is('archived_at', null);

      if (childError) return jsonError(childError.message, 400);
      if ((count || 0) > 0) return jsonError('Parent task status is computed from child tasks', 400);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (deadline !== undefined) updateData.deadline = deadline || null;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;
    if (taskColorStart !== undefined) updateData.task_color_start = taskColorStart || null;
    if (taskColorEnd !== undefined) updateData.task_color_end = taskColorEnd || null;

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return jsonError(error.message, 400);
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    return jsonError('Internal server error', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return jsonError('Task id is required', 400);

    const { error } = await supabase
      .from('tasks')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return jsonError(error.message, 400);
    return NextResponse.json({ success: true, archived: true }, { headers: corsHeaders });
  } catch (error) {
    return jsonError('Internal server error', 500);
  }
}
