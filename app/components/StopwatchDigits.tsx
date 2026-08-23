'use client';

import { motion, useReducedMotion } from 'framer-motion';

// A per-character rolling-odometer effect for a monospaced stopwatch string
// like "01:42:07": each character slot is keyed by its own value, so only the
// digits that actually changed roll — the colons and untouched leading digits
// just sit still instead of the whole string re-rendering as flat text.
//
// Deliberately NOT wrapped in AnimatePresence: this string ticks every second,
// for however many hours a focus session runs, including while the tab sits
// backgrounded (the whole point of the timer). AnimatePresence keeps an
// exiting node mounted until its exit animation reports completion, and a
// throttled/backgrounded tab can simply never fire that — one node leaking
// per second is a real memory/DOM-bloat problem over a multi-hour session.
// Skipping exit entirely means React unmounts the old character synchronously
// every tick; the new one still gets its own roll-in via Framer's normal
// animate-on-mount, so the visual effect is the same without the risk.
export function StopwatchDigits({ value, className = '' }: { value: string; className?: string }) {
  const reducedMotion = Boolean(useReducedMotion());

  return (
    <span className={`inline-flex ${className}`}>
      {value.split('').map((char, index) => {
        const isDigit = char >= '0' && char <= '9';
        return (
          <span
            key={index}
            className="relative inline-block h-[1em] shrink-0 overflow-hidden text-center"
            style={{ width: isDigit ? '0.62em' : '0.34em', marginInline: isDigit ? undefined : '0.03em' }}
          >
            <motion.span
              key={`${index}-${char}`}
              initial={reducedMotion ? false : { y: '65%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-center justify-center tabular-nums"
            >
              {char}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
