'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/app/lib/store';
import Login from '@/app/components/Login';

export default function Home() {
  const { user } = useAppStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (mounted && user) router.replace('/overview'); }, [mounted, router, user]);
  if (!mounted || user) return <div className="grid min-h-dvh place-items-center bg-[var(--background)]"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" aria-label="Loading" /></div>;
  return <Login />;
}
