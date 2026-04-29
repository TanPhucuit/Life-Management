import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const envFilePath = resolve(process.cwd(), '.env.local');
const loadedEnv = { ...process.env };

if (existsSync(envFilePath)) {
  const envFile = readFileSync(envFilePath, 'utf-8');
  envFile.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) return;
    const value = rest.join('=').trim();
    if (!loadedEnv[key]) {
      loadedEnv[key] = value;
    }
  });
}

const supabaseUrl =
  loadedEnv.NEXT_PUBLIC_SUPABASE_URL || loadedEnv.SUPABASE_URL;
const supabaseAnonKey =
  loadedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  loadedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  loadedEnv.SUPABASE_ANON_KEY;

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
