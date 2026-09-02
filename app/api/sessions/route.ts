import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET(request: NextRequest) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const taskId = request.nextUrl.searchParams.get('taskId');
    const rootId = request.nextUrl.searchParams.get('rootId');
    const topicId = request.nextUrl.searchParams.get('topicId');
    const date = request.nextUrl.searchParams.get('date');
    const month = request.nextUrl.searchParams.get('month');
    const year = request.nextUrl.searchParams.get('year');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400, headers: corsHeaders });
    }

    let taskIds: string[] | null = null;

    if (rootId || topicId) {
      let taskQuery = supabase
        .from('tasks')
        .select('id, parent_task_id')
        .eq('user_id', userId)
        .is('archived_at', null);

      if (topicId) taskQuery = taskQuery.eq('topic_id', topicId);

      const { data: taskRows, error: taskError } = await taskQuery;
      if (taskError) {
        return NextResponse.json({ error: taskError.message }, { status: 400, headers: corsHeaders });
      }

      if (rootId) {
        const childrenByParent = new Map<string | null, Array<{ id: string; parent_task_id?: string | null }>>();
        (taskRows || []).forEach((task) => {
          const parentId = task.parent_task_id || null;
          childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), task]);
        });

        const collected = new Set<string>([rootId]);
        const queue = [rootId];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          (childrenByParent.get(currentId) || []).forEach((child) => {
            collected.add(child.id);
            queue.push(child.id);
          });
        }
        taskIds = Array.from(collected);
      } else {
        taskIds = (taskRows || []).map((task) => task.id);
      }
    }

    let query = supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false });

    if (taskId) {
      query = query.eq('task_id', taskId);
    }

    if (taskIds) {
      if (taskIds.length === 0) return NextResponse.json([], { headers: corsHeaders });
      query = query.in('task_id', taskIds);
    }

    if (date) {
      query = query.eq('session_date', date);
    } else if (month && year) {
      const yearNumber = parseInt(year, 10);
      const monthNumber = parseInt(month, 10);
      const startDate = `${yearNumber}-${String(monthNumber).padStart(2, '0')}-01`;
      const endDate = new Date(yearNumber, monthNumber, 0).toISOString().slice(0, 10);
      query = query.gte('session_date', startDate).lte('session_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json(data, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const {
      userId,
      taskId,
      sessionName,
      startTime,
      endTime,
      sessionDate,
      inTimeStatus,
      focusedMinutes,
    } = body;

    // taskId cố ý không nằm trong danh sách bắt buộc — phiên tập trung có thể
    // không gắn với task nào.
    if (!userId || !startTime || !endTime || !sessionDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert([
        {
          user_id: userId,
          task_id: taskId ?? null,
          session_name: sessionName?.trim() || null,
          start_time: startTime,
          end_time: endTime,
          session_date: sessionDate,
          in_time_status: inTimeStatus || 'in_time',
          ...(focusedMinutes !== undefined ? { focused_minutes: focusedMinutes } : {}),
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json(data, { status: 201, headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(request: NextRequest) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { id, startTime, endTime, sessionDate, sessionName, inTimeStatus, focusedMinutes, keyOfSuccess } = body;

    if (!id) {
      return NextResponse.json({ error: 'Session id is required' }, { status: 400, headers: corsHeaders });
    }

    const updateData: Record<string, unknown> = {};
    if (startTime) updateData.start_time = startTime;
    if (endTime) updateData.end_time = endTime;
    if (sessionDate) updateData.session_date = sessionDate;
    if (sessionName !== undefined) updateData.session_name = sessionName?.trim() || null;
    if (inTimeStatus) updateData.in_time_status = inTimeStatus;
    if (focusedMinutes !== undefined) updateData.focused_minutes = focusedMinutes;
    if (keyOfSuccess !== undefined) updateData.key_of_success = keyOfSuccess;

    const { data, error } = await supabase
      .from('sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json(data, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(request: NextRequest) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Session id is required' }, { status: 400, headers: corsHeaders });
    }

    const { error } = await supabase.from('sessions').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
