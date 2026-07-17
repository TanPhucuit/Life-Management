'use client';

import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Inbox } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--foreground)] sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)] sm:text-base">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Surface({ className = '', interactive = false, children, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={`premium-card ${interactive ? 'premium-card-interactive' : ''} ${className}`} {...props}>{children}</div>;
}

export function GlassPanel({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass-panel ${className}`} {...props}>{children}</div>;
}

export function Pressable({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn-secondary ${className}`} {...props}>{children}</button>;
}

export function PrimaryButton({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn-primary ${className}`} {...props}>{children}</button>;
}

export function StatCard({ label, value, hint, icon, tone = 'primary' }: { label: string; value: ReactNode; hint?: string; icon: ReactNode; tone?: 'primary' | 'secondary' | 'accent' | 'warning' }) {
  const colors = {
    primary: ['var(--primary-soft)', 'var(--primary)'],
    secondary: ['var(--secondary-soft)', 'var(--secondary)'],
    accent: ['var(--accent-soft)', 'var(--accent)'],
    warning: ['var(--warning-soft)', 'var(--warning)'],
  }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="premium-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] tabular-nums text-[var(--foreground)]">{value}</p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: colors[0], color: colors[1] }}>{icon}</div>
      </div>
      {hint && <p className="mt-2 text-xs text-[var(--foreground-subtle)]">{hint}</p>}
    </motion.div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`relative overflow-hidden rounded-xl bg-[var(--surface-soft)] ${className}`}><div className="shimmer absolute inset-0" /></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><Inbox className="h-5 w-5" /></div>
      <h3 className="font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--foreground-muted)]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
      <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="min-h-11 rounded-xl px-3 font-semibold hover:bg-black/5">Retry</button>}
    </div>
  );
}
