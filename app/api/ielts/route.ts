import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const hourFields = ['readingHours', 'listeningHours', 'writingHours', 'speakingHours'] as const;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: corsHeaders });
}

function parseHours(value: unknown) {
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return jsonError('userId is required', 400);

    const { data, error } = await supabase
      .from('ielts_hours')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return jsonError(error.message, 400);
    if (data) return NextResponse.json(data, { headers: corsHeaders });

    return NextResponse.json(
      {
        id: null,
        user_id: userId,
        reading_hours: 0,
        listening_hours: 0,
        writing_hours: 0,
        speaking_hours: 0,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return jsonError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;
    if (!userId) return jsonError('userId is required', 400);

    const parsedHours = hourFields.map((field) => parseHours(body[field]));
    if (parsedHours.some((hours) => hours === null)) {
      return jsonError('All IELTS hours must be non-negative numbers', 400);
    }

    const [readingHours, listeningHours, writingHours, speakingHours] = parsedHours as [number, number, number, number];
    const { data, error } = await supabase
      .from('ielts_hours')
      .upsert(
        {
          user_id: userId,
          reading_hours: readingHours,
          listening_hours: listeningHours,
          writing_hours: writingHours,
          speaking_hours: speakingHours,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) return jsonError(error.message, 400);
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    return jsonError('Internal server error', 500);
  }
}

export const PUT = POST;
