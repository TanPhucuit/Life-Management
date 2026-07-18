'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Gauge,
  Headphones,
  Loader2,
  MessageCircle,
  PenLine,
  Save,
  Sparkles,
  Waves,
} from 'lucide-react';
import { api, ApiIeltsHours } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { useMotionDirector } from '@/app/components/desktop-v2/core/MotionDirector';

type IeltsSkill = 'reading' | 'listening' | 'writing' | 'speaking';
type HourDraft = Record<IeltsSkill, string>;

export type IeltsScenePulse =
  | { type: 'ielts-saved'; totalHours: number; strongestSkill: IeltsSkill }
  | { type: 'ielts-skill-selected'; skill: IeltsSkill; hours: number };

export interface DesktopIeltsProps {
  onScenePulse?: (pulse: IeltsScenePulse) => void;
}

const skills = [
  { key: 'reading' as const, label: 'Reading', icon: BookOpen, color: '#5b9cff', deep: '#2559d9', glow: 'rgba(91,156,255,.34)', cue: 'Comprehension & speed' },
  { key: 'listening' as const, label: 'Listening', icon: Headphones, color: '#42d9b1', deep: '#087d6a', glow: 'rgba(66,217,177,.32)', cue: 'Attention & detail' },
  { key: 'writing' as const, label: 'Writing', icon: PenLine, color: '#f8b34d', deep: '#b76012', glow: 'rgba(248,179,77,.32)', cue: 'Structure & clarity' },
  { key: 'speaking' as const, label: 'Speaking', icon: MessageCircle, color: '#ef72b8', deep: '#a92870', glow: 'rgba(239,114,184,.32)', cue: 'Fluency & confidence' },
];

const emptyDraft: HourDraft = { reading: '0', listening: '0', writing: '0', speaking: '0' };
const prismSpring = { type: 'spring' as const, stiffness: 380, damping: 34 };

function parseHours(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toDraft(record: ApiIeltsHours): HourDraft {
  return {
    reading: String(Number(record.reading_hours) || 0),
    listening: String(Number(record.listening_hours) || 0),
    writing: String(Number(record.writing_hours) || 0),
    speaking: String(Number(record.speaking_hours) || 0),
  };
}

export default function DesktopIelts({ onScenePulse }: DesktopIeltsProps) {
  const { reducedMotion: reduceMotion, pulseActivity } = useMotionDirector();
  const { user } = useAppStore();
  const [draft, setDraft] = useState<HourDraft>(emptyDraft);
  const [selectedSkill, setSelectedSkill] = useState<IeltsSkill>('reading');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const record = await api.getIeltsHours(user.id);
        if (active) setDraft(toDraft(record));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'IELTS practice data could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [user?.id]);

  const values = useMemo(() => skills.map((skill) => ({ ...skill, hours: parseHours(draft[skill.key]) })), [draft]);
  const totalHours = values.reduce((sum, skill) => sum + skill.hours, 0);
  const maxHours = Math.max(1, ...values.map((skill) => skill.hours));
  const strongest = values.reduce((best, skill) => skill.hours > best.hours ? skill : best, values[0]);
  const balance = totalHours ? Math.round((Math.min(...values.map((skill) => skill.hours)) / Math.max(...values.map((skill) => skill.hours), 1)) * 100) : 0;

  const updateDraft = (skill: IeltsSkill, next: string) => {
    if (next !== '' && (!Number.isFinite(Number(next)) || Number(next) < 0)) return;
    setDraft((current) => ({ ...current, [skill]: next }));
    setSuccess(false);
  };

  const selectSkill = (skill: IeltsSkill) => {
    pulseActivity('interaction', 500);
    setSelectedSkill(skill);
    onScenePulse?.({ type: 'ielts-skill-selected', skill, hours: parseHours(draft[skill]) });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || saving) return;
    const numericValues = Object.values(draft).map(Number);
    if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Practice hours must be non-negative numbers.');
      return;
    }
    setSaving(true);
    pulseActivity('interaction', 900);
    setError('');
    setSuccess(false);
    try {
      const saved = await api.setIeltsHours({
        userId: user.id,
        readingHours: Number(draft.reading),
        listeningHours: Number(draft.listening),
        writingHours: Number(draft.writing),
        speakingHours: Number(draft.speaking),
      });
      const nextDraft = toDraft(saved);
      setDraft(nextDraft);
      setSuccess(true);
      const nextValues = skills.map((skill) => ({ key: skill.key, hours: parseHours(nextDraft[skill.key]) }));
      const nextStrongest = nextValues.reduce((best, skill) => skill.hours > best.hours ? skill : best, nextValues[0]);
      onScenePulse?.({ type: 'ielts-saved', totalHours: nextValues.reduce((sum, skill) => sum + skill.hours, 0), strongestSkill: nextStrongest.key });
      window.setTimeout(() => setSuccess(false), 3600);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'IELTS practice hours could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <IeltsSkeleton />;

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden px-2 pb-8 text-[var(--foreground)]">
      <motion.div aria-hidden className="pointer-events-none absolute left-[18%] top-[12%] h-[480px] w-[480px] rounded-full bg-[var(--secondary)] opacity-[.08] blur-[120px]" animate={reduceMotion ? undefined : { x: [0, 120, -20, 0], y: [0, 60, -20, 0], scale: [1, 1.2, .94, 1] }} transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }} />
      <header className="relative z-10 mb-6 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.28em] text-[var(--secondary)]">IELTS lab · four-skill spectrum</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">Practice, refracted.</h1>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">Four living prisms reveal where your preparation is concentrated.</p>
        </div>
        <div className="flex gap-3">
          <Metric label="Total practice" value={`${formatHours(totalHours)}h`} icon={<Sparkles className="h-4 w-4" />} />
          <Metric label="Skill balance" value={`${balance}%`} icon={<Gauge className="h-4 w-4" />} />
        </div>
      </header>

      <AnimatePresence mode="popLayout">
        {error && <motion.div key="error" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="relative z-20 mb-4 flex items-center gap-2 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"><AlertTriangle className="h-4 w-4" />{error}</motion.div>}
        {success && <motion.div key="success" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -8 }} className="relative z-20 mb-4 flex items-center gap-2 overflow-hidden rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent)]"><motion.span aria-hidden className="absolute inset-y-0 -left-24 w-20 skew-x-[-18deg] bg-white/35" animate={{ x: [0, 900] }} transition={{ duration: 1.15 }} /><CheckCircle2 className="h-4 w-4" />Practice spectrum saved. The lab has rebalanced.</motion.div>}
      </AnimatePresence>

      <main className="relative z-10 grid min-h-[680px] grid-cols-[minmax(670px,1.55fr)_minmax(360px,.8fr)] gap-5">
        <section className="relative isolate overflow-hidden rounded-[38px] border border-[var(--border)] bg-[radial-gradient(circle_at_50%_78%,color-mix(in_srgb,var(--primary)_15%,transparent),transparent_48%),linear-gradient(150deg,color-mix(in_srgb,var(--surface)_84%,transparent),color-mix(in_srgb,var(--surface-soft)_72%,transparent))] p-7 shadow-[var(--shadow-lg)]">
          <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(color-mix(in srgb, var(--border) 50%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--border) 50%, transparent) 1px, transparent 1px)', backgroundSize: '36px 36px', maskImage: 'linear-gradient(to bottom, transparent, black 45%, black)' }} />
          <div className="relative flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--foreground-subtle)]">Practice distribution</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">Spectrum chamber</h2></div><div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--glass)] px-3 py-1.5 text-xs text-[var(--foreground-muted)]"><Waves className="h-3.5 w-3.5 text-[var(--primary)]" />Live from saved totals</div></div>

          <div className="relative mt-8 grid h-[510px] grid-cols-4 items-end gap-5 px-4">
            {values.map((skill, index) => (
              <Prism
                key={skill.key}
                skill={skill}
                relativeFill={skill.hours / maxHours}
                selected={selectedSkill === skill.key}
                index={index}
                reduceMotion={Boolean(reduceMotion)}
                onSelect={() => selectSkill(skill.key)}
              />
            ))}
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-[auto_1fr] gap-5">
          <motion.section layout className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl">
            <motion.div aria-hidden className="absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-[.14] blur-3xl" style={{ background: strongest.color }} animate={reduceMotion ? undefined : { scale: [1, 1.25, 1] }} transition={{ duration: 7, repeat: Infinity }} />
            <p className="relative text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--foreground-subtle)]">Dominant wavelength</p>
            <div className="relative mt-3 flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(145deg, ${strongest.color}, ${strongest.deep})`, boxShadow: `0 12px 28px ${strongest.glow}` }}><strongest.icon className="h-5 w-5" /></div><div><h2 className="text-2xl font-semibold tracking-[-.04em]">{strongest.label}</h2><p className="text-sm text-[var(--foreground-muted)]">{formatHours(strongest.hours)} hours · {strongest.cue}</p></div></div>
          </motion.section>

          <form onSubmit={save} className="flex min-h-0 flex-col rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-md)] backdrop-blur-xl">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[var(--primary)]">Calibrate totals</p><h2 className="mt-1 text-xl font-semibold tracking-[-.035em]">Practice input</h2></div><Save className="h-5 w-5 text-[var(--primary)]" /></div>
            <p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">Saved values replace current totals, matching the existing IELTS tracker behavior.</p>

            <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {skills.map((skill, index) => {
                const Icon = skill.icon;
                const active = selectedSkill === skill.key;
                return (
                  <motion.label key={skill.key} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .12 + index * .05 }} onFocus={() => selectSkill(skill.key)} className={`group block rounded-2xl border p-3 transition-colors ${active ? 'border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]' : 'border-[var(--border)] bg-[var(--surface)]/55 hover:border-[var(--border-strong)]'}`}>
                    <span className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(145deg, ${skill.color}, ${skill.deep})` }}><Icon className="h-3.5 w-3.5" /></span>{skill.label}</span><span className="text-[10px] text-[var(--foreground-subtle)]">hours</span></span>
                    <span className="mt-3 flex h-11 items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] transition focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-soft)]">
                      <input type="number" min="0" step="0.25" inputMode="decimal" value={draft[skill.key]} onChange={(event) => updateDraft(skill.key, event.target.value)} onBlur={() => { if (draft[skill.key] === '') updateDraft(skill.key, '0'); }} className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold tabular-nums outline-none" aria-label={`Total ${skill.label} hours`} />
                      <span className="border-l border-[var(--border)] px-3 text-xs text-[var(--foreground-muted)]">h</span>
                    </span>
                  </motion.label>
                );
              })}
            </div>
            <motion.button type="submit" disabled={saving} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: .97 }} transition={prismSpring} className="relative mt-5 flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] shadow-[var(--shadow-md)] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving spectrum…' : 'Save practice spectrum'}
            </motion.button>
          </form>
        </aside>
      </main>
    </div>
  );
}

function Prism({ skill, relativeFill, selected, index, reduceMotion, onSelect }: { skill: (typeof skills)[number] & { hours: number }; relativeFill: number; selected: boolean; index: number; reduceMotion: boolean; onSelect: () => void }) {
  const Icon = skill.icon;
  const fill = skill.hours === 0 ? 7 : 18 + relativeFill * 72;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 30, scaleY: .82 }}
      animate={{ opacity: 1, y: selected ? -10 : 0, scaleY: 1 }}
      whileHover={{ y: -14, scale: 1.025 }}
      transition={{ ...prismSpring, delay: index * .06 }}
      className="group relative flex h-[470px] min-w-0 flex-col items-center justify-end rounded-[28px] border border-[var(--border)] bg-[var(--glass)] px-3 pb-5 pt-3 shadow-[var(--shadow-sm)] backdrop-blur-xl"
      aria-pressed={selected}
    >
      {selected && <motion.span layoutId="ielts-prism-selection" className="absolute inset-0 rounded-[28px] border" style={{ borderColor: skill.color, boxShadow: `0 0 42px ${skill.glow}, inset 0 0 28px ${skill.glow}` }} transition={prismSpring} />}
      <div className="absolute inset-x-4 top-5 text-center"><div className="mx-auto grid h-10 w-10 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(145deg, ${skill.color}, ${skill.deep})`, boxShadow: `0 10px 24px ${skill.glow}` }}><Icon className="h-4 w-4" /></div><p className="mt-2 truncate text-sm font-semibold">{skill.label}</p><p className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{skill.cue}</p></div>
      <div className="relative h-[310px] w-[88%] overflow-hidden rounded-t-[48px] rounded-b-[22px] border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.03))] shadow-[inset_8px_0_16px_rgba(255,255,255,.08),inset_-10px_-10px_20px_rgba(0,0,0,.13)]">
        <motion.div className="absolute inset-x-0 bottom-0" initial={{ height: 0 }} animate={{ height: `${fill}%` }} transition={{ ...prismSpring, delay: .18 + index * .07 }} style={{ background: `linear-gradient(to top, ${skill.deep}, ${skill.color} 70%, rgba(255,255,255,.82))`, boxShadow: `0 -8px 24px ${skill.glow}` }}>
          <motion.span aria-hidden className="absolute -left-[15%] top-[-9px] h-5 w-[130%] rounded-[50%] bg-white/35 blur-[2px]" animate={reduceMotion ? undefined : { x: [-8, 8, -8], scaleY: [.8, 1.1, .8] }} transition={{ duration: 2.6 + index * .3, repeat: Infinity, ease: 'easeInOut' }} />
          {!reduceMotion && Array.from({ length: 4 }, (_, bubble) => <motion.span key={bubble} aria-hidden className="absolute bottom-3 h-2 w-2 rounded-full bg-white/35" style={{ left: `${18 + bubble * 19}%` }} animate={{ y: [0, -120 - bubble * 18], x: [0, bubble % 2 ? 8 : -7], opacity: [0, .8, 0], scale: [.5, 1, .4] }} transition={{ duration: 3.2 + bubble * .35, repeat: Infinity, delay: bubble * .6 + index * .2, ease: 'easeOut' }} />)}
        </motion.div>
        <span className="absolute left-[18%] top-[8%] h-[46%] w-[10%] -rotate-6 rounded-full bg-white/18 blur-[3px]" />
      </div>
      <motion.p className="relative mt-4 text-3xl font-semibold tracking-[-.05em] tabular-nums" animate={{ color: selected ? skill.color : 'var(--foreground)' }}>{formatHours(skill.hours)}<span className="ml-1 text-sm font-medium text-[var(--foreground-muted)]">h</span></motion.p>
    </motion.button>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <motion.div whileHover={{ y: -3 }} transition={prismSpring} className="flex min-w-[150px] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--glass)] px-4 py-3 shadow-[var(--shadow-sm)] backdrop-blur-xl"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">{icon}</div><div><p className="text-[10px] uppercase tracking-[.14em] text-[var(--foreground-subtle)]">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div></motion.div>;
}

function IeltsSkeleton() {
  return <div className="grid min-h-[680px] animate-pulse grid-cols-[1.55fr_.8fr] gap-5"><div className="rounded-[38px] bg-[var(--surface-soft)]" /><div className="rounded-[30px] bg-[var(--surface-soft)]" /></div>;
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
