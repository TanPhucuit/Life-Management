'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Square } from 'lucide-react';
import { useAppStore } from '@/app/lib/store';
import { formatStopwatch, useFocusTimerStore } from '@/app/lib/timerStore';
import { StopwatchDigits } from '@/app/components/StopwatchDigits';

// Mounted once at the app root (see app/layout.tsx) so the running counter is
// visible on every page — tasks, calendar, the 3D view, anywhere — exactly
// like the requirement: leave, come back, it's still counting.
export default function FocusTimerWidget() {
  const { user } = useAppStore();
  const { timer, ready, hydrate, stop } = useFocusTimerStore();
  const pathname = usePathname();
  const [, setTick] = useState(0);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void hydrate(user.id);
    // Reconcile whenever the tab regains attention — catches a timer that was
    // started or stopped from another tab or device while this one was away.
    const onFocus = () => void hydrate(user.id);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [hydrate, user?.id]);

  useEffect(() => {
    if (!timer) return;
    // Recomputes from the absolute start time every tick, so a throttled
    // background tab catching up in one jump still lands on the right number.
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const visible = pathname !== '/' && ready && Boolean(timer);
  const elapsed = timer ? Date.now() - timer.startedAtMs : 0;

  const handleStop = async () => {
    if (!user?.id) return;
    setStopping(true);
    try {
      await stop(user.id);
    } finally {
      setStopping(false);
    }
  };

  // The condition lives INSIDE AnimatePresence (not an early `return null`
  // above it) so stopping the timer plays the exit transition instead of the
  // whole component just vanishing — AnimatePresence can only animate an
  // unmount it gets to see happen. This one is safe to key on: it only
  // toggles from a foreground click (Stop), never mid-tick in a backgrounded
  // tab, so it doesn't carry the same stuck-exit risk as the digits do.
  return (
    <AnimatePresence>
      {visible && timer && (
        <motion.div
          key="focus-timer-widget"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed bottom-4 right-4 z-[70] flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur-xl"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <div className="min-w-0">
            <p className="max-w-[10rem] truncate text-xs font-medium text-[var(--foreground-muted)]">{timer.taskTitle}</p>
            <StopwatchDigits value={formatStopwatch(elapsed)} className="font-mono text-base font-semibold text-[var(--foreground)]" />
          </div>
          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={stopping}
            title="Dừng và lưu focus time"
            aria-label="Dừng bộ đếm giờ"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
