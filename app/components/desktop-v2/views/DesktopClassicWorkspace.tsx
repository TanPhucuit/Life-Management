'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useMotionDirector } from '../core/MotionDirector';

export type ClassicWorkspaceKind =
  | 'overview'
  | 'tasks'
  | 'calendar'
  | 'cycles'
  | 'ielts'
  | 'analytics'
  | 'detail';

export default function DesktopClassicWorkspace({
  kind,
  children,
}: {
  kind: ClassicWorkspaceKind;
  children: ReactNode;
}) {
  const { reducedMotion } = useMotionDirector();

  return (
    <section
      className={`desktop-classic-workspace desktop-classic-${kind} relative pb-8`}
      data-workspace={kind}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 -top-8 h-28 rounded-full bg-[var(--primary)] opacity-[.045] blur-[70px]"
      />
      <motion.div
        className="relative"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: .1 } : { duration: .42, ease: [.16, 1, .3, 1] }}
      >
        {children}
      </motion.div>
    </section>
  );
}
