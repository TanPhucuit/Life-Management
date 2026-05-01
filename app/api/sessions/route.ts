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
    const date = request.nextUrl.searchParams.get('date');
    const month = request.nextUrl.searchParams.get('month');
    const year = request.nextUrl.searchParams.get('year');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400, headers: corsHeaders });
    }

    let query = supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false });

    if (taskId) {
      query = query.eq('task_id', taskId);
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
  } catch (error) {
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
      startTime,
      endTime,
      sessionDate,
    } = body;

    if (!userId || !taskId || !startTime || !endTime || !sessionDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert([
        {
          user_id: userId,
          task_id: taskId,
          start_time: startTime,
          end_time: endTime,
          session_date: sessionDate,
          in_time_status: 'in_time',
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json(data, { status: 201, headers: corsHeaders });
  } catch (error) {
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
    const { id, startTime, endTime, sessionDate, inTimeStatus, focusedMinutes, keyOfSuccess } = body;

    if (!id) {
      return NextResponse.json({ error: 'Session id is required' }, { status: 400, headers: corsHeaders });
    }

    const updateData: Record<string, unknown> = {};
    if (startTime) updateData.start_time = startTime;
    if (endTime) updateData.end_time = endTime;
    if (sessionDate) updateData.session_date = sessionDate;
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
  } catch (error) {
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
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}