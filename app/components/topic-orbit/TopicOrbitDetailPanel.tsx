'use client';

import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

// Slides in over the still-running orbit scene. It owns no tree logic at all —
// whatever the caller renders as `children` is the existing 2D Tree View.
export function TopicOrbitDetailPanel({
  open,
  title,
  subtitle,
  reducedMotion,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  reducedMotion: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="topic-orbit-detail"
          className="topic-orbit-detail"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 48, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.985 }}
          transition={reducedMotion ? { duration: 0.12 } : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          aria-label={`${title} task tree`}
        >
          <header className="topic-orbit-detail-head">
            <div className="min-w-0">
              <span className="topic-orbit-detail-eyebrow">Landed on</span>
              <h2 className="topic-orbit-detail-title">{title}</h2>
              {subtitle && <p className="topic-orbit-detail-sub">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Back to orbit" className="topic-orbit-detail-close">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="topic-orbit-detail-body">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
