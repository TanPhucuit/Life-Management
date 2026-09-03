'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowRight, Clock3, Play, Square } from 'lucide-react';
import { useAppStore } from '@/app/lib/store';
import { formatStopwatch, useFocusTimerStore } from '@/app/lib/timerStore';
import { StopwatchDigits } from '@/app/components/StopwatchDigits';

const easeOut = [0.16, 1, 0.3, 1] as const;
const UNASSIGNED_LABEL = 'Không thuộc task nào';

export default function FocusTimerLanding() {
  const { user, sessionReady, sessionError } = useAppStore();
  const { timer, ready, busy, hydrate, start, stop, error: timerError } = useFocusTimerStore();
  const [, setTick] = useState(0);
  const reducedMotion = Boolean(useReducedMotion());

  // Chặn lệch giữa bản vẽ trên server và trên trình duyệt.
  //
  // `useAppStore`/`useFocusTimerStore` đọc localStorage ngay khi module chạy,
  // nên trên TRÌNH DUYỆT, y hệt lần vẽ đầu tiên (chưa qua useEffect nào) đã có
  // thể thấy user khác null — trong khi trên SERVER (không có localStorage)
  // user luôn là null. Hai lần vẽ đầu cho ra hai giá trị `disabled` khác nhau
  // ngay trên cùng một nút, và vì layout.tsx đặt suppressHydrationWarning ở
  // <html>/<body>, React coi đây là hydration nên bỏ qua việc á lại DOM cho
  // khớp — nút kẹt ở trạng thái của lần vẽ SERVER (disabled=true) vĩnh viễn,
  // dù chính React đang giữ đúng giá trị false trong bộ nhớ của nó.
  //
  // `mounted` bắt đầu là false ở CẢ HAI phía nên lần vẽ đầu tiên luôn khớp
  // nhau tuyệt đối (không có gì để hydrate-mismatch); chỉ sau khi mount xong,
  // một lần vẽ lại BÌNH THƯỜNG (không phải hydrate) mới bật nút lên — và lần
  // vẽ lại đó React chắc chắn ghi xuống DOM thật.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!user?.id) return;
    void hydrate(user.id);
  }, [hydrate, user?.id]);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const elapsed = timer ? Date.now() - timer.startedAtMs : 0;
  // Timer session là một giá trị độc lập, không thuộc về bất kì task nào —
  // không còn lựa chọn gắn task nữa, mọi phiên đều ghi taskId = null.
  const canStart = Boolean(mounted && user?.id && !timer);
  const statusText = timer ? `Đang chạy: ${timer.taskTitle}` : 'Sẵn sàng';
  const displayStatus = mounted && sessionReady && ready ? statusText : 'Đang mở workspace...';

  const handleStart = async () => {
    if (!user?.id) return;
    await start(user.id, null, UNASSIGNED_LABEL);
  };

  const handleStop = async () => {
    if (!user?.id) return;
    await stop(user.id);
  };

  if (mounted && sessionReady && sessionError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--background)] p-6 text-center text-[var(--foreground)]">
        <div>
          <p className="font-semibold">Workspace unavailable</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">{sessionError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Ambient drift: two soft blurred blobs that breathe slowly in the
          background. Purely decorative, so they sit still under reduced motion
          instead of being removed outright — the page keeps its mood. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -left-1/4 -top-1/4 h-[60vmax] w-[60vmax] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 70%)' }}
          animate={reducedMotion ? undefined : { x: [0, 40, -20, 0], y: [0, 30, -10, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 h-[55vmax] w-[55vmax] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)' }}
          animate={reducedMotion ? undefined : { x: [0, -30, 20, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: easeOut }}
        className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-6 px-4 py-5 sm:px-6 lg:px-8"
      >
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl sm:p-7 lg:p-8">
          <div className="mb-6 flex items-center gap-3">
            <motion.span
              animate={!reducedMotion && timer ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: 2.4, repeat: timer ? Infinity : 0, ease: 'easeInOut' }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"
            >
              <Clock3 className="h-5 w-5" />
            </motion.span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground-muted)]">Focus timer</p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Bộ đếm thời gian</h1>
            </div>
          </div>

          <div
            className="relative grid min-h-[220px] place-items-center rounded-3xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:min-h-[300px] sm:py-12"
            style={{ containerType: 'inline-size' }}
          >
            {/* A faint static glow sits behind the digits at rest so the box
                never reads as flat/empty; the running state layers a brighter
                breathing halo on top of it. Both are sized in % of THIS box
                (not the viewport), so they can never bleed past its rounded
                corners — no overflow-hidden needed to contain them. */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-[65%] w-[65%] rounded-full transition-opacity duration-700"
              style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 72%)', opacity: timer ? 0 : 0.35 }}
            />
            {timer && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute h-[65%] w-[65%] rounded-full"
                style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 72%)' }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.05, 0.95] }}
                transition={reducedMotion ? { duration: 0 } : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            <div className="relative flex flex-col items-center">
              {/* Deliberately no AnimatePresence/exit here: this line can change
                  twice in a row inside one second (loading -> ready -> task
                  switched), and an exit animation that has to fully finish
                  before the next enter starts is exactly what can leave stale
                  text on screen if a browser tab throttles it mid-transition.
                  Keying by the text itself still gives every change its own
                  fade-in; the old text is simply gone the instant React swaps
                  the keyed node, which can never get stuck. */}
              <motion.p
                key={displayStatus}
                initial={reducedMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: easeOut }}
                className="mb-4 max-w-full truncate rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--foreground-muted)] sm:text-sm"
              >
                {displayStatus}
              </motion.p>

              {/* Font-size is driven by cqw (this box's own rendered width via
                  container-type: inline-size above), never vw — vw sizes off
                  the FULL viewport, which is what let the digits render wider
                  than this card and get clipped on a two-column desktop
                  layout. cqw is always correctly scoped to this box, so the
                  row can never outgrow it regardless of column width. */}
              <StopwatchDigits
                value={formatStopwatch(elapsed)}
                className="font-mono text-[clamp(2.75rem,17cqw,7rem)] font-semibold leading-none tracking-normal"
              />

              <div className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-muted)] sm:text-sm">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {timer && !reducedMotion && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  )}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-300 ${timer ? 'bg-red-500' : 'bg-[var(--foreground-subtle)]'}`} />
                </span>
                {timer ? 'Đang tự tính thời gian ngầm' : 'Chỉ lưu thành một focus time khi bấm dừng'}
              </div>
            </div>
          </div>

          {/* Không còn lựa chọn task: timer session luôn là một giá trị độc
              lập, không gắn với bất kì task nào. */}
          <button
            type="button"
            onClick={() => void (timer ? handleStop() : handleStart())}
            disabled={timer ? busy || !user?.id : busy || !canStart}
            className={`mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 ${
              timer ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
            }`}
          >
            {timer ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            {timer ? 'Dừng và lưu' : 'Chạy'}
          </button>

          {timerError && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: easeOut }}
              className="mt-4 flex gap-2 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{timerError}</p>
            </motion.div>
          )}

          <Link
            href="/overview"
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-5 text-sm font-semibold transition hover:bg-[var(--surface-soft)]"
          >
            Tiếp theo · Vào giao diện chính
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </motion.div>
    </main>
  );
}
