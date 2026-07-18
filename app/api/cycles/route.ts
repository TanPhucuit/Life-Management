import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const firstCycleHour = 8;
const lastCycleHour = 21;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: corsHeaders });
}

function isValidDatePart(day: number, month: number, year: number) {
  const date = new Date(year, month - 1, day);
  return (
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    Number.isInteger(year) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const month = Number(request.nextUrl.searchParams.get('month'));
    const year = Number(request.nextUrl.searchParams.get('year'));

    if (!userId) return jsonError('userId is required', 400);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      return jsonError('Valid month and year are required', 400);
    }

    const { data, error } = await supabase
      .from('cycle_ticks')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .order('day', { ascending: true })
      .order('hour', { ascending: true });

    if (error) return jsonError(error.message, 400);
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch {
    return jsonError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, day, month, year, hour, checked } = body;
    const numericDay = Number(day);
    const numericMonth = Number(month);
    const numericYear = Number(year);
    const numericHour = Number(hour);

    if (!userId || !isValidDatePart(numericDay, numericMonth, numericYear)) {
      return jsonError('Valid userId and date are required', 400);
    }
    if (!Number.isInteger(numericHour) || numericHour < firstCycleHour || numericHour > lastCycleHour) {
      return jsonError('Valid hour is required', 400);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('cycle_ticks')
      .upsert(
        {
          user_id: userId,
          day: numericDay,
          month: numericMonth,
          year: numericYear,
          hour: numericHour,
          is_checked: Boolean(checked),
          updated_at: now,
        },
        { onConflict: 'user_id,day,month,year,hour' }
      )
      .select()
      .single();

    if (error) return jsonError(error.message, 400);
    return NextResponse.json(data, { headers: corsHeaders });
  } catch {
    return jsonError('Internal server error', 500);
  }
}

export const PUT = POST;
