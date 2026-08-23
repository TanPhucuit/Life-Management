import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// The one running focus timer for a user. Its row IS the "counting" state —
// started_at is a real instant (timestamptz), so any device that reads it can
// compute the correct elapsed time from `Date.now() - started_at`, which is
// what lets the counter survive a reload or the browser being closed entirely:
// nothing needs to keep running while it's gone, the wall clock already did.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET(request: NextRequest) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400, headers: corsHeaders });

    const { data, error } = await supabase
      .from('active_timers')
      .select('*, tasks(title, topic_id, task_color)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    return NextResponse.json(data || null, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

// Start counting on a task. The server sets started_at (never trusts a client
// clock for the instant that all elapsed-time math is anchored to). One row
// per user: starting a second timer replaces whatever was running — the
// client is expected to have already finalized that one into a session first
// (see the timer store's stop-before-start), this upsert is the safety net so
// a stale row can never block a fresh start.
export async function POST(request: NextRequest) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await request.json();
    const { userId, taskId } = body;
    if (!userId || !taskId) return NextResponse.json({ error: 'userId and taskId are required' }, { status: 400, headers: corsHeaders });

    const { data, error } = await supabase
      .from('active_timers')
      .upsert({ user_id: userId, task_id: taskId, started_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('*, tasks(title, topic_id, task_color)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    return NextResponse.json(data, { status: 201, headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

// Stop counting. Only clears the running-timer row — the caller is expected to
// have already written the finished session (see the timer store), so the
// time is never lost even if this call fails.
export async function DELETE(request: NextRequest) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400, headers: corsHeaders });

    const { error } = await supabase.from('active_timers').delete().eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
