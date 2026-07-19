'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/app/lib/store';

export default function Home() {
  const { user, sessionReady, sessionError } = useAppStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (mounted && user) router.replace('/overview'); }, [mounted, router, user]);
  if (sessionReady && sessionError) return <div className="grid min-h-dvh place-items-center bg-[var(--background)] p-6 text-center text-[var(--foreground)]"><div><p className="font-semibold">Workspace unavailable</p><p className="mt-2 text-sm text-[var(--foreground-muted)]">{sessionError}</p></div></div>;
  return <div className="grid min-h-dvh place-items-center bg-[var(--background)]"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" aria-label="Opening dashboard" /></div>;
}
