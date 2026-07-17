'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, Sparkles, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { GlassPanel, PageHeader, StatCard, Surface } from './ui';

export function BentoPreview() {
  const router = useRouter();
  return (
    <main className="aurora-stage min-h-dvh bg-[var(--background)] p-4 text-[var(--foreground)] sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between"><button type="button" onClick={() => router.back()} className="btn-secondary"><ArrowLeft className="h-4 w-4" />Back</button><ThemeToggle /></div>
        <PageHeader eyebrow="Internal design system" title="Life Management UI Gallery" description="Apple-inspired bento, selective liquid glass, semantic color, and natural motion." />
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Today tasks" value="8" hint="Three high priority" icon={<Target className="h-5 w-5" />} /><StatCard label="Completion" value="84%" hint="Up 12% this month" icon={<CheckCircle2 className="h-5 w-5" />} tone="accent" /><StatCard label="Focus" value="5.2h" hint="Daily goal: 8h" icon={<Sparkles className="h-5 w-5" />} tone="secondary" /><StatCard label="Upcoming" value="4" hint="Next seven days" icon={<CalendarDays className="h-5 w-5" />} tone="warning" /></section>
        <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <Surface interactive className="relative min-h-80 overflow-hidden p-6"><div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--primary)] opacity-20 blur-3xl" /><div className="relative"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--primary)]">Premium surface</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Clear hierarchy.<br />Quiet confidence.</h2><p className="mt-3 max-w-md text-[var(--foreground-muted)]">Solid content surfaces keep data readable while ambient color and motion create depth around the edges.</p><motion.div className="mt-10 h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]"><motion.div initial={{ width: 0 }} animate={{ width: '76%' }} transition={{ duration: 1, ease: [.16,1,.3,1] }} className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)]" /></motion.div></div></Surface>
          <GlassPanel className="rounded-[24px] p-6"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--secondary-soft)] text-[var(--secondary)]"><BarChart3 className="h-5 w-5" /></div><h2 className="text-xl font-semibold">Liquid glass, selectively.</h2><p className="mt-2 text-sm text-[var(--foreground-muted)]">Navigation, floating controls, dialogs, and hero moments use blur. Dense tables and charts stay solid.</p><div className="mt-6 space-y-3">{['44px touch targets','Visible keyboard focus','Reduced motion support','Light and dark parity'].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl bg-[var(--glass-strong)] p-3 text-sm"><CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />{item}</div>)}</div></GlassPanel>
        </section>
      </div>
    </main>
  );
}
