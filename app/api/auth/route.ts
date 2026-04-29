import { supabase } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

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

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400, headers: corsHeaders }
        );
      }

      return NextResponse.json(newUser, { status: 201, headers: corsHeaders });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
