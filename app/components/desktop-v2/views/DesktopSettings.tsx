'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  CircleGauge,
  Laptop,
  LogOut,
  Moon,
  MousePointer2,
  PartyPopper,
  Palette,
  ShieldCheck,
  Sun,
  UserCircle,
  Waves,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/app/lib/store';
import { ThemeMode, useTheme } from '@/app/components/ThemeProvider';
import { useMotionDirector } from '@/app/components/desktop-v2/core/MotionDirector';
import type { EffectQuality, ExperiencePreferences } from '@/app/lib/desktopExperience';

export type DesktopEffectQuality = EffectQuality;
export type DesktopExperiencePreferences = ExperiencePreferences;

export interface DesktopSettingsProps {
  preferences?: DesktopExperiencePreferences;
  onPreferencesChange?: (preferences: DesktopExperiencePreferences) => void;
}

const settingsSpring = { type: 'spring' as const, stiffness: 500, damping: 38 };

const qualityOptions: Array<{ value: DesktopEffectQuality; label: string; description: string; accent: string }> = [
  { value: 'auto', label: 'Auto', description: 'Adapts continuously to frame time.', accent: 'var(--accent)' },
  { value: 'ultra', label: 'Ultra', description: 'Full refraction, bloom, and trails.', accent: 'var(--secondary)' },
  { value: 'cinematic', label: 'Cinematic', description: 'Rich effects with a balanced GPU load.', accent: 'var(--primary)' },
  { value: 'balanced', label: 'Balanced', description: 'Stable motion with lighter atmosphere.', accent: 'var(--warning)' },
  { value: 'safe', label: 'Safe', description: 'DOM motion and a minimal scene.', accent: 'var(--foreground-muted)' },
];

const themeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export default function DesktopSettings({ preferences, onPreferencesChange }: DesktopSettingsProps) {
  const router = useRouter();
  const { user, logout } = useAppStore();
  const { theme, setTheme } = useTheme();
  const motionDirector = useMotionDirector();
  const activePreferences = preferences || motionDirector.preferences;

  const updatePreferences = (patch: Partial<DesktopExperiencePreferences>) => {
    const next = { ...activePreferences, ...patch };
    if (onPreferencesChange) onPreferencesChange(next);
    else motionDirector.setPreferences(next);
  };

  const motionDisabled = motionDirector.systemReducedMotion || activePreferences.reducedMotion;
  const activeQuality = qualityOptions.find((option) => option.value === activePreferences.quality) || qualityOptions[0];
  const statusItems = useMemo(() => [
    { label: 'Motion profile', value: motionDisabled ? 'Reduced' : 'Motion-Max', color: motionDisabled ? 'var(--warning)' : 'var(--accent)' },
    { label: 'Scene quality', value: activeQuality.label, color: activeQuality.accent },
    { label: 'Celebrations', value: activePreferences.celebrations ? 'On' : 'Off', color: activePreferences.celebrations ? 'var(--secondary)' : 'var(--foreground-muted)' },
  ], [activePreferences.celebrations, activeQuality, motionDisabled]);

  const signOut = () => {
    logout();
    router.replace('/');
  };

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden px-2 pb-8 text-[var(--foreground)]">
      <motion.div aria-hidden className="pointer-events-none absolute right-[8%] top-[8%] h-[460px] w-[460px] rounded-full bg-[var(--secondary)] opacity-[.075] blur-[120px]" animate={motionDisabled ? undefined : { x: [0, -80, 20, 0], y: [0, 60, -10, 0], scale: [1, 1.2, .94, 1] }} transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }} />
      <header className="relative z-10 mb-7"><p className="text-[11px] font-semibold uppercase tracking-[.28em] text-[var(--secondary)]">Experience controls · desktop only</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">Tune your atmosphere.</h1><p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">Control the cinematic layer without changing your tasks, dates, or mobile and tablet experience.</p></header>

      <main className="relative z-10 grid min-h-[660px] grid-cols-[minmax(560px,1.15fr)_minmax(390px,.82fr)] gap-5">
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-5">
          <section className="rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--secondary-soft)] text-[var(--secondary)]"><Palette className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold">Appearance</h2><p className="text-xs text-[var(--foreground-muted)]">Light, dark, or synchronized with your system.</p></div></div><span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--foreground-subtle)]">Live preview</span></div>
            <div className="relative mt-5 grid grid-cols-3 rounded-2xl bg-[var(--surface-soft)] p-1.5">
              {themeOptions.map((option) => <button key={option.value} type="button" onClick={() => setTheme(option.value)} className="relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[var(--foreground-muted)]">{theme === option.value && <motion.span layoutId="desktop-theme-pill" className="absolute inset-0 -z-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm" transition={settingsSpring} />}<option.icon className="h-4 w-4" /><span className={theme === option.value ? 'text-[var(--foreground)]' : ''}>{option.label}</span></button>)}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-md)] backdrop-blur-xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><CircleGauge className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold">Effect quality</h2><p className="text-xs text-[var(--foreground-muted)]">Auto is recommended for consistent frame pacing.</p></div></div><Zap className="h-5 w-5 text-[var(--warning)]" /></div>
            <div className="mt-5 grid flex-1 grid-cols-5 gap-3">
              {qualityOptions.map((option, index) => {
                const active = activePreferences.quality === option.value;
                return <motion.button key={option.value} type="button" onClick={() => updatePreferences({ quality: option.value })} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...settingsSpring, delay: index * .035 }} whileHover={{ y: -6, rotateX: 2 }} whileTap={{ scale: .96 }} className={`relative flex min-h-[210px] flex-col overflow-hidden rounded-[24px] border p-4 text-left ${active ? 'border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]' : 'border-[var(--border)] bg-[var(--surface)]/55 hover:border-[var(--border-strong)]'}`}>
                  {active && <motion.span layoutId="quality-selection" className="absolute inset-0 rounded-[24px] border" style={{ borderColor: option.accent, boxShadow: `inset 0 0 28px color-mix(in srgb, ${option.accent} 10%, transparent)` }} transition={settingsSpring} />}
                  <div className="relative flex items-center justify-between"><motion.span className="h-3 w-3 rounded-full" style={{ background: option.accent, boxShadow: `0 0 14px ${option.accent}` }} animate={motionDisabled ? undefined : { scale: [1, 1.35, 1], opacity: [.7, 1, .7] }} transition={{ duration: 2.2 + index * .2, repeat: Infinity }} />{active && <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-white"><Check className="h-3.5 w-3.5 stroke-[3]" /></span>}</div>
                  <p className="relative mt-auto text-base font-semibold">{option.label}</p><p className="relative mt-2 text-[11px] leading-5 text-[var(--foreground-muted)]">{option.description}</p>
                  <div className="relative mt-4 flex h-12 items-end gap-1">{Array.from({ length: 7 }, (_, bar) => <motion.span key={bar} className="min-w-0 flex-1 rounded-full" style={{ background: option.accent }} animate={motionDisabled ? { height: `${20 + bar * 7}%`, opacity: .45 } : { height: [`${18 + bar * 6}%`, `${50 + ((bar * 13) % 48)}%`, `${18 + bar * 6}%`], opacity: [.35, .75, .35] }} transition={{ duration: 2.4 + bar * .12, repeat: Infinity, delay: bar * .06 }} />)}</div>
                </motion.button>;
              })}
            </div>
          </section>
        </div>

        <aside className="grid min-h-0 grid-rows-[1fr_auto] gap-5">
          <section className="relative overflow-hidden rounded-[32px] border border-[var(--border)] bg-[radial-gradient(circle_at_50%_38%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_48%),linear-gradient(150deg,color-mix(in_srgb,var(--surface)_85%,transparent),color-mix(in_srgb,var(--surface-soft)_72%,transparent))] p-5 shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--primary)]">Interaction layer</p><h2 className="mt-1 text-xl font-semibold tracking-[-.035em]">Motion behavior</h2></div><Waves className="h-5 w-5 text-[var(--primary)]" /></div>
            <div className="relative my-6 grid h-[210px] place-items-center">
              {[0, 1, 2].map((ring) => <motion.div key={ring} aria-hidden className="absolute rounded-full border border-[color:var(--border-strong)]" style={{ inset: 20 + ring * 24 }} animate={motionDisabled ? undefined : { rotate: ring % 2 ? -360 : 360, scale: [1, 1.02 + ring * .008, 1] }} transition={{ rotate: { duration: 7 + ring * 5, repeat: Infinity, ease: 'linear' }, scale: { duration: 3 + ring, repeat: Infinity } }}><span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary)] shadow-[0_0_14px_var(--primary)]" /></motion.div>)}
              <motion.div className="relative h-20 w-20 rounded-full border border-white/20 bg-[radial-gradient(circle_at_32%_24%,white,var(--primary)_23%,var(--secondary)_68%,#080817)] shadow-[0_0_44px_color-mix(in_srgb,var(--primary)_35%,transparent)]" animate={motionDisabled ? undefined : { y: [-4, 5, -4], scale: [1, 1.045, 1], rotate: [0, 8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
            </div>
            <div className="space-y-3">
              <PreferenceToggle icon={<Waves className="h-4 w-4" />} title="Reduced motion" description="Stop ambient drift, trails, and celebrations." checked={activePreferences.reducedMotion} onChange={(checked) => updatePreferences({ reducedMotion: checked })} />
              <PreferenceToggle icon={<PartyPopper className="h-4 w-4" />} title="Celebrations" description="Show completion particles and energy releases." checked={activePreferences.celebrations} onChange={(checked) => updatePreferences({ celebrations: checked })} />
              <PreferenceToggle icon={<MousePointer2 className="h-4 w-4" />} title="Cursor effects" description="Enable magnetic controls and specular cursor light." checked={activePreferences.cursorEffects} onChange={(checked) => updatePreferences({ cursorEffects: checked })} />
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><UserCircle className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold">{user?.username || 'Local account'}</p><p className="truncate text-xs text-[var(--foreground-muted)]">Your session is stored on this device.</p></div><ShieldCheck className="h-5 w-5 text-[var(--accent)]" /></div>
            <button type="button" onClick={signOut} className="group mt-4 flex min-h-11 w-full items-center justify-between rounded-2xl border border-[var(--danger)] px-4 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"><span className="flex items-center gap-2"><LogOut className="h-4 w-4" />Sign out</span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></button>
          </section>
        </aside>
      </main>

      <section className="relative z-10 mt-5 grid grid-cols-3 gap-4">{statusItems.map((item, index) => <motion.div key={item.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 + index * .05 }} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)]/55 px-4 py-3"><span className="text-xs text-[var(--foreground-muted)]">{item.label}</span><span className="flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: item.color, boxShadow: `0 0 10px ${item.color}` }} />{item.value}</span></motion.div>)}</section>
    </div>
  );
}

function PreferenceToggle({ icon, title, description, checked, onChange }: { icon: React.ReactNode; title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <motion.button type="button" onClick={() => onChange(!checked)} whileHover={{ x: 3 }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-3 text-left"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${checked ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--surface-soft)] text-[var(--foreground-subtle)]'}`}>{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block truncate text-[10px] text-[var(--foreground-muted)]">{description}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-strong)] bg-[var(--surface-soft)]'}`}><motion.span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm" animate={{ x: checked ? 22 : 3 }} transition={settingsSpring} /></span></motion.button>;
}
