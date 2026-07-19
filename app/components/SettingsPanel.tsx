'use client';

import { Palette, ShieldCheck, UserCircle } from 'lucide-react';
import { useAppStore } from '@/app/lib/store';
import { PageHeader, Surface } from './ui';
import { ThemeToggle } from './ThemeToggle';

export default function SettingsPanel() {
  const { user } = useAppStore();
  return <div><PageHeader eyebrow="Preferences" title="Settings" description="Choose how Life Management looks and manage your personal workspace." /><div className="grid gap-4 lg:grid-cols-2"><Surface className="p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--secondary-soft)] text-[var(--secondary)]"><Palette className="h-5 w-5" /></div><div><h2 className="font-semibold">Appearance</h2><p className="text-sm text-[var(--foreground-muted)]">Light, dark, or your system setting.</p></div></div><ThemeToggle /></Surface><Surface className="p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><UserCircle className="h-5 w-5" /></div><div className="min-w-0"><h2 className="font-semibold">Workspace owner</h2><p className="truncate text-sm text-[var(--foreground-muted)]">{user?.username}</p></div></div><div className="flex items-center gap-2 rounded-2xl bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent)]"><ShieldCheck className="h-4 w-4" />This personal dashboard opens automatically.</div></Surface></div></div>;
}
