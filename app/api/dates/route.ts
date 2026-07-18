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
    const month = request.nextUrl.searchParams.get('month');
    const year = request.nextUrl.searchParams.get('year');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    let query = supabase
      .from('dates')
      .select('*')
      .eq('user_id', userId);

    if (month && year) {
      query = query
        .eq('month', parseInt(month))
        .eq('year', parseInt(year));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json(data, { headers: corsHeaders });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { userId, monthId, day, month, year, focusedMinutes, keyOfSuccess } = body;

    if (!userId || !day || !month || !year) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Ensure we have a month_id
    let finalMonthId = monthId;
    
    if (!finalMonthId) {
      // Try to find existing month
      const { data: monthData } = await supabase
        .from('months')
        .select('id')
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year)
        .single();
        
      if (monthData) {
        finalMonthId = monthData.id;
      } else {
        // Create the month record if it doesn't exist
        const daysInMonth = new Date(year, month, 0).getDate();
        const { data: newMonth, error: createMonthError } = await supabase
          .from('months')
          .insert([
            {
              user_id: userId,
              month,
              year,
              days_in_month: daysInMonth,
              total_hours: 0,
            },
          ])
          .select()
          .single();
          
        if (createMonthError || !newMonth) {
          return NextResponse.json(
            { error: createMonthError?.message || 'Failed to create month record' },
            { status: 500, headers: corsHeaders }
          );
        }
        finalMonthId = newMonth.id;
      }
    }

    const { data, error } = await supabase
      .from('dates')
      .insert([
        {
          user_id: userId,
          month_id: finalMonthId,
          day,
          month,
          year,
          focused_minutes: focusedMinutes || 0,
          key_of_success: keyOfSuccess || 0,
        },
      ])
      .select();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json(data?.[0], { status: 201, headers: corsHeaders });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PUT(request: NextRequest) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { id, focusedMinutes, keyOfSuccess } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Date id is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const updateData: {
      focused_minutes?: number;
      key_of_success?: number;
    } = {};
    if (focusedMinutes !== undefined) updateData.focused_minutes = focusedMinutes;
    if (keyOfSuccess !== undefined) updateData.key_of_success = keyOfSuccess;

    const { data, error } = await supabase
      .from('dates')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json(data?.[0], { headers: corsHeaders });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
