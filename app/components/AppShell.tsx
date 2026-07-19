'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, CalendarDays, CheckCircle2, ChevronRight, Home, Languages, Menu, Repeat2, Settings, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/app/lib/store';
import { ThemeToggle } from './ThemeToggle';

const navItems = [
  { href: '/overview', label: 'Overview', icon: Home, mobile: true },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, mobile: true },
  { href: '/tasks', label: 'Tasks', icon: CheckCircle2, mobile: true },
  { href: '/cycles', label: 'Cycles', icon: Repeat2, mobile: false },
  { href: '/ielts', label: 'IELTS', icon: Languages, mobile: false },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, mobile: true },
  { href: '/settings', label: 'Settings', icon: Settings, mobile: false },
];

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Your day, in one beautifully focused view.' },
  calendar: { title: 'Calendar', subtitle: 'See starts, deadlines, and daily progress.' },
  tasks: { title: 'Tasks', subtitle: 'Turn every life area into a clear path forward.' },
  cycles: { title: 'Cycles', subtitle: 'Build consistency one focused hour at a time.' },
  ielts: { title: 'IELTS', subtitle: 'Balance practice across all four skills.' },
  analytics: { title: 'Analytics', subtitle: 'Find the patterns behind your progress.' },
  settings: { title: 'Settings', subtitle: 'Personalize your workspace and account.' },
};

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, sessionReady, sessionError } = useAppStore();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const section = pathname.split('/').filter(Boolean)[0] || 'overview';
  const meta = pageMeta[section] || pageMeta.overview;

  useEffect(() => setMounted(true), []);
  useEffect(() => setMoreOpen(false), [pathname]);

  const today = useMemo(() => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date()), []);
  if (!mounted || !sessionReady || (!user && !sessionError)) {
    return <div className="grid min-h-dvh place-items-center bg-[var(--background)]"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" aria-label="Loading workspace" /></div>;
  }
  if (!user) return <div className="grid min-h-dvh place-items-center bg-[var(--background)] p-6 text-center"><p className="text-sm text-[var(--danger)]">{sessionError || 'Workspace unavailable'}</p></div>;

  return (
    <div className="aurora-stage min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-dvh max-w-[1920px] lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="glass-panel fixed inset-y-3 left-3 z-40 hidden w-[248px] flex-col rounded-[28px] p-3 lg:flex">
          <Link href="/overview" className="mb-5 flex min-h-14 items-center gap-3 rounded-2xl px-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] text-white shadow-lg"><Sparkles className="h-5 w-5" /></div>
            <div><p className="font-semibold tracking-[-0.02em]">Life Management</p><p className="text-xs text-[var(--foreground-muted)]">Personal OS</p></div>
          </Link>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navItems.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />)}
          </nav>
          <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary-soft)] font-semibold text-[var(--primary)]">{user.username.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.username}</p><p className="text-xs text-[var(--foreground-muted)]">Personal workspace</p></div>
            </div>
          </div>
        </aside>

        <main id="main-content" className="min-w-0 pb-[calc(82px+env(safe-area-inset-bottom))] lg:col-start-2 lg:pb-0">
          <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 lg:px-7">
            <div className="glass-panel flex min-h-[72px] items-center justify-between gap-4 rounded-[24px] px-4 sm:px-5">
              <div className="min-w-0"><p className="text-xs font-medium text-[var(--foreground-muted)]">{today}</p><h1 className="truncate text-lg font-semibold tracking-[-0.025em] sm:text-xl">{meta.title}</h1></div>
              <div className="flex items-center gap-2"><ThemeToggle compact /><div className="hidden h-10 items-center rounded-2xl bg-[var(--surface-soft)] px-3 text-sm text-[var(--foreground-muted)] sm:flex">{meta.subtitle}</div></div>
            </div>
          </header>
          <AnimatePresence mode="wait">
            <motion.div key={pathname} initial={{ opacity: 0, y: 14, scale: .995 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .34, ease: [.16, 1, .3, 1] }} className="mx-auto max-w-[1640px] p-3 sm:p-5 lg:p-7">
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="glass-panel fixed bottom-2 left-2 right-2 z-50 grid grid-cols-5 rounded-[24px] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile navigation">
        {navItems.filter((item) => item.mobile).map((item) => <MobileNavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />)}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium text-[var(--foreground-muted)]" aria-label="More destinations"><Menu className="h-5 w-5" />More</button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.button aria-label="Close menu" className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="More destinations" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="glass-panel absolute bottom-0 left-0 right-0 rounded-t-[30px] p-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
              <div className="mb-4 flex items-center justify-between"><div><p className="text-lg font-semibold">More</p><p className="text-sm text-[var(--foreground-muted)]">Learning, habits, and preferences</p></div><button type="button" onClick={() => setMoreOpen(false)} className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--surface-soft)]" aria-label="Close"><X className="h-5 w-5" /></button></div>
              <div className="space-y-2">
                {navItems.filter((item) => !item.mobile).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 font-medium"><Icon className="h-5 w-5 text-[var(--primary)]" /><span>{label}</span><ChevronRight className="ml-auto h-4 w-4 text-[var(--foreground-subtle)]" /></Link>)}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

type NavItem = (typeof navItems)[number];
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return <Link href={item.href} className={`relative flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition ${active ? 'text-[var(--primary)]' : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]'}`}>{active && <motion.span layoutId="desktop-nav" className="absolute inset-0 rounded-2xl bg-[var(--primary-soft)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}<Icon className="relative h-5 w-5" /><span className="relative">{item.label}</span></Link>;
}
function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return <Link href={item.href} className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium transition ${active ? 'text-[var(--primary)]' : 'text-[var(--foreground-muted)]'}`}>{active && <motion.span layoutId="mobile-nav" className="absolute inset-x-2 inset-y-1 rounded-2xl bg-[var(--primary-soft)]" />}<Icon className="relative h-5 w-5" /><span className="relative">{item.label}</span></Link>;
}
