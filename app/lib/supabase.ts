import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && '(NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL)',
    !supabaseAnonKey &&
      '(NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY)',
  ]
    .filter(Boolean)
    .join(' and ');

  throw new Error(
    `Missing Supabase environment variable(s): ${missing}. Please check your .env.local or deployment environment.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
