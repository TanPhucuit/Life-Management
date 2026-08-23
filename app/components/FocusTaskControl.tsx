'use client';

import { useEffect, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { formatStopwatch, useFocusTimerStore } from '@/app/lib/timerStore';
import { StopwatchDigits } from '@/app/components/StopwatchDigits';

// Drop this next to any single task's UI to give it a Start/Stop control that
// stays in sync with the one global focus timer (see FocusTimerWidget, which
// shows the same running state everywhere else in the app).
export function FocusTaskControl({
  userId,
  taskId,
  taskTitle,
}: {
  userId: string;
  taskId: string;
  taskTitle: string;
}) {
  const { timer, start, stop } = useFocusTimerStore();
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const isRunningThis = timer?.taskId === taskId;

  useEffect(() => {
    if (!isRunningThis) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRunningThis]);

  const handleClick = async () => {
    setBusy(true);
    try {
      if (isRunningThis) await stop(userId);
      else await start(userId, taskId, taskTitle);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition disabled:opacity-60 ${
        isRunningThis
          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
      title={isRunningThis ? 'Dừng và lưu focus time' : 'Bắt đầu đếm giờ cho task này'}
    >
      {isRunningThis ? (
        <>
          <Square className="h-3.5 w-3.5 fill-current" />
          <StopwatchDigits value={formatStopwatch(Date.now() - (timer?.startedAtMs || Date.now()))} className="font-mono" />
        </>
      ) : (
        <>
          <Play className="h-3.5 w-3.5" />
          Bắt đầu đếm giờ
        </>
      )}
    </button>
  );
}
