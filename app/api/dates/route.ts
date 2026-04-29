import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const month = request.nextUrl.searchParams.get('month');
    const year = request.nextUrl.searchParams.get('year');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
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
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, monthId, day, month, year, focusedMinutes, keyOfSuccess } = body;

    if (!userId || !day || !month || !year) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('dates')
      .insert([
        {
          user_id: userId,
          month_id: monthId || null,
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
        { status: 400 }
      );
    }

    return NextResponse.json(data?.[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, focusedMinutes, keyOfSuccess } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Date id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
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
        { status: 400 }
      );
    }

    return NextResponse.json(data?.[0]);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
