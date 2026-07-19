'use client';

import { ReactNode, useEffect } from 'react';
import { useAppStore } from '@/app/lib/store';

export default function SessionBootstrap({ children }: { children: ReactNode }) {
  const { user, sessionReady, setUser, setSessionState } = useAppStore();

  useEffect(() => {
    if (user || sessionReady) return;
    const controller = new AbortController();

    void fetch('/api/auth', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { id?: string; username?: string; error?: string };
        if (!response.ok || !payload.id || !payload.username) {
          throw new Error(payload.error || 'The personal workspace owner could not be resolved.');
        }
        const nextUser = { id: payload.id, username: payload.username };
        localStorage.setItem('user', JSON.stringify(nextUser));
        setUser(nextUser);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSessionState(true, error instanceof Error ? error.message : 'The workspace could not be opened.');
      });

    return () => controller.abort();
  }, [sessionReady, setSessionState, setUser, user]);

  return children;
}
