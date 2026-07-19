import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET() {
  try {
    const preferredUsername = process.env.LIFE_MANAGER_DEFAULT_USERNAME
      || process.env.NEXT_PUBLIC_DEFAULT_USERNAME
      || 'tanphucuit';
    const preferred = await supabase
      .from('users')
      .select('id, username')
      .eq('username', preferredUsername)
      .maybeSingle();

    if (preferred.data) return NextResponse.json(preferred.data, { headers: corsHeaders });

    const fallback = await supabase
      .from('users')
      .select('id, username')
      .order('username', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fallback.error || !fallback.data) {
      return NextResponse.json({ error: 'No workspace owner exists.' }, { status: 404, headers: corsHeaders });
    }
    return NextResponse.json(fallback.data, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Unable to open the personal workspace.' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  // CORS headers
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { action, username, password } = body;

    if (action === 'login') {
      const { data, error } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401, headers: corsHeaders }
        );
      }

      return NextResponse.json(data, { headers: corsHeaders });
    } else if (action === 'register') {
      // Check if user exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 400, headers: corsHeaders }
        );
      }

      // Create new user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{ username, password }])
        .select('id, username')
        .single();

      if (error || !newUser) {
        return NextResponse.json(
          { error: error?.message || 'Unable to create user' },
          { status: 400, headers: corsHeaders }
        );
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // April 2026 = 4

      // Create months from current month (April) to December 2026
      const monthsToCreate = [];
      for (let month = currentMonth; month <= 12; month++) {
        const daysInMonth = new Date(currentYear, month, 0).getDate();
        monthsToCreate.push({
          user_id: newUser.id,
          month: month,
          year: currentYear,
          total_hours: 0,
          days_in_month: daysInMonth,
        });
      }

      const { data: monthsData, error: monthsError } = await supabase
        .from('months')
        .insert(monthsToCreate)
        .select('id, month, year');

      if (monthsError || !monthsData) {
        return NextResponse.json(
          { error: monthsError?.message || 'Unable to initialize months data' },
          { status: 500, headers: corsHeaders }
        );
      }

      // Create weeks and dates for each month
      for (const monthData of monthsData) {
        const monthId = monthData.id;
        const month = monthData.month;
        const year = monthData.year;
        const daysInMonth = new Date(year, month, 0).getDate();

        // Calculate weeks for this month (capped at 5 to match database constraint)
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const firstDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0, Sunday = 6
        const weeksCount = Math.min(Math.ceil((daysInMonth + firstDayOfWeek) / 7), 5);

        const weekRows = Array.from({ length: weeksCount }, (_, index) => ({
          user_id: newUser.id,
          month_id: monthId,
          week_order: index + 1,
          total_hours: 0,
        }));

        const dateRows = Array.from({ length: daysInMonth }, (_, index) => ({
          user_id: newUser.id,
          month_id: monthId,
          day: index + 1,
          month: month,
          year: year,
          focused_minutes: 0,
          key_of_success: 0,
        }));

        const { error: weekError } = await supabase.from('weeks').insert(weekRows);
        if (weekError) {
          return NextResponse.json(
            { error: weekError.message || `Unable to initialize weeks for month ${month}` },
            { status: 500, headers: corsHeaders }
          );
        }

        const { error: dateError } = await supabase.from('dates').insert(dateRows);
        if (dateError) {
          return NextResponse.json(
            { error: dateError.message || `Unable to initialize dates for month ${month}` },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      return NextResponse.json(newUser, { status: 201, headers: corsHeaders });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400, headers: corsHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
