'use client';

import { Laptop, Moon, Sun } from 'lucide-react';
import { ThemeMode, useTheme } from './ThemeProvider';

const options: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  if (compact) {
    const next: ThemeMode = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const active = options.find((option) => option.value === theme) || options[2];
    const Icon = active.icon;
    return (
      <button type="button" onClick={() => setTheme(next)} className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--glass)] text-[var(--foreground-muted)] transition hover:text-[var(--foreground)]" aria-label={`Theme: ${active.label}. Switch theme`} title={`Theme: ${active.label}`}>
        <Icon className="h-[18px] w-[18px]" />
      </button>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--surface-soft)] p-1" role="group" aria-label="Appearance">
      {options.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" onClick={() => setTheme(value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${theme === value ? 'bg-[var(--surface-raised)] text-[var(--foreground)] shadow-sm' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`} aria-pressed={theme === value}>
          <Icon className="h-4 w-4" />{label}
        </button>
      ))}
    </div>
  );
}
