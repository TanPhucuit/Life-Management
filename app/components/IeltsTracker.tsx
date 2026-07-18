'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BarChart3, CheckCircle2, Headphones, Loader2, MessageCircle, Save, BookOpen, PenLine } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiIeltsHours } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';

type IeltsSkill = 'reading' | 'listening' | 'writing' | 'speaking';
type HourDraft = Record<IeltsSkill, string>;

export type IeltsTrackerVariant = 'legacy' | 'desktop-cinematic';

interface IeltsTrackerProps {
  variant?: IeltsTrackerVariant;
}

const skillConfigs = [
  { key: 'reading' as const, label: 'Reading', color: '#2563eb', softColor: '#eff6ff', icon: BookOpen },
  { key: 'listening' as const, label: 'Listening', color: '#0f766e', softColor: '#f0fdfa', icon: Headphones },
  { key: 'writing' as const, label: 'Writing', color: '#d97706', softColor: '#fffbeb', icon: PenLine },
  { key: 'speaking' as const, label: 'Speaking', color: '#e11d48', softColor: '#fff1f2', icon: MessageCircle },
];

const emptyDraft: HourDraft = {
  reading: '0',
  listening: '0',
  writing: '0',
  speaking: '0',
};

const toDraft = (record: ApiIeltsHours): HourDraft => ({
  reading: String(Number(record.reading_hours) || 0),
  listening: String(Number(record.listening_hours) || 0),
  writing: String(Number(record.writing_hours) || 0),
  speaking: String(Number(record.speaking_hours) || 0),
});

const parseDraftValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export default function IeltsTracker({ variant = 'legacy' }: IeltsTrackerProps) {
  const { user } = useAppStore();
  const [draft, setDraft] = useState<HourDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!user?.id) return;

    const loadHours = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const record = await api.getIeltsHours(user.id);
        setDraft(toDraft(record));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load IELTS data.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadHours();
  }, [user?.id]);

  const chartData = useMemo(
    () => skillConfigs.map((skill) => ({ ...skill, hours: parseDraftValue(draft[skill.key]) })),
    [draft]
  );
  const totalHours = chartData.reduce((sum, item) => sum + item.hours, 0);
  const highestSkill = chartData.reduce((highest, item) => (item.hours > highest.hours ? item : highest), chartData[0]);

  const updateDraft = (skill: IeltsSkill, value: string) => {
    if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    setDraft((current) => ({ ...current, [skill]: value }));
    setSuccessMessage('');
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id) return;

    const values = Object.values(draft).map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      setErrorMessage('Practice hours must be a non-negative number.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');
      const saved = await api.setIeltsHours({
        userId: user.id,
        readingHours: Number(draft.reading),
        listeningHours: Number(draft.listening),
        writingHours: Number(draft.writing),
        speakingHours: Number(draft.speaking),
      });
      setDraft(toDraft(saved));
      setSuccessMessage('IELTS practice hours saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save IELTS data.');
    } finally {
      setIsSaving(false);
    }
  };

  if (variant === 'desktop-cinematic') {
    return (
      <DesktopCinematicIelts
        chartData={chartData}
        draft={draft}
        errorMessage={errorMessage}
        highestSkill={highestSkill}
        isLoading={isLoading}
        isSaving={isSaving}
        onSave={handleSave}
        successMessage={successMessage}
        totalHours={totalHours}
        updateDraft={updateDraft}
      />
    );
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <section className="premium-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">IELTS</h2>
              <p className="mt-1 text-sm text-slate-500">Total practice time across all four skills.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 border-l-0 border-slate-200 sm:border-l sm:pl-4">
            <div>
              <p className="text-xs text-slate-500">Total time</p>
              <p className="mt-0.5 text-2xl font-semibold text-slate-950">{formatHours(totalHours)}h</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Strongest skill</p>
              <p className="mt-0.5 text-sm font-semibold" style={{ color: highestSkill.color }}>{highestSkill.label}</p>
            </div>
          </div>
        </div>

        {errorMessage && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>}
        {successMessage && (
          <div role="status" aria-live="polite" className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {successMessage}
          </div>
        )}
      </section>

      <section className="premium-card p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-950">Practice distribution</h3>
          <p className="text-sm text-slate-500">Measured in hours</p>
        </div>
        <div className="h-[320px] w-full sm:h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 28, right: 10, left: -18, bottom: 4 }} barCategoryGap="24%" accessibilityLayer>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis stroke="#64748b" tickLine={false} axisLine={false} allowDecimals />
              <Tooltip formatter={(value) => [`${formatHours(Number(value))} hours`, 'Practice']} cursor={{ fill: 'var(--surface-soft)' }} contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--foreground)' }} />
              <Bar dataKey="hours" maxBarSize={104} radius={[5, 5, 0, 0]}>
                {chartData.map((item) => <Cell key={item.key} fill={item.color} />)}
                <LabelList dataKey="hours" position="top" formatter={(value: unknown) => `${formatHours(Number(value))}h`} className="fill-slate-600 text-xs" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <form onSubmit={handleSave} className="premium-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">Update total hours</h3>
            <p className="text-sm text-slate-500">Saved values replace the current totals.</p>
          </div>
          <button
            type="submit"
            disabled={isLoading || isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving…' : 'Save hours'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {skillConfigs.map((skill) => {
            const Icon = skill.icon;
            return (
              <label key={skill.key} className="block rounded-md border border-slate-200 p-3" style={{ background: skill.softColor }}>
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: skill.color }}>
                  <Icon className="h-4 w-4" />
                  {skill.label}
                </span>
                <span className="mt-3 flex h-11 items-center overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    inputMode="decimal"
                    value={draft[skill.key]}
                    onChange={(event) => updateDraft(skill.key, event.target.value)}
                    onBlur={() => {
                      if (draft[skill.key] === '') updateDraft(skill.key, '0');
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold text-slate-950 outline-none"
                    aria-label={`Total ${skill.label} hours`}
                  />
                  <span className="border-l border-slate-200 px-3 text-sm text-slate-500">hours</span>
                </span>
              </label>
            );
          })}
        </div>
      </form>
    </div>
  );
}

interface DesktopCinematicIeltsProps {
  chartData: Array<(typeof skillConfigs)[number] & { hours: number }>;
  draft: HourDraft;
  errorMessage: string;
  highestSkill: (typeof skillConfigs)[number] & { hours: number };
  isLoading: boolean;
  isSaving: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  successMessage: string;
  totalHours: number;
  updateDraft: (skill: IeltsSkill, value: string) => void;
}

const cinematicIeltsTooltipStyle = {
  background: 'var(--glass-strong)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-md)',
  color: 'var(--foreground)',
};

function DesktopCinematicIelts({
  chartData,
  draft,
  errorMessage,
  highestSkill,
  isLoading,
  isSaving,
  onSave,
  successMessage,
  totalHours,
  updateDraft,
}: DesktopCinematicIeltsProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const HighestIcon = highestSkill.icon;

  return (
    <div className="desktop-cinematic-ielts relative space-y-5 pb-10 text-[var(--foreground)]">
      <header className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-md)] backdrop-blur-xl">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[var(--secondary)] opacity-[.09] blur-3xl" />
        <div className="relative flex items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-sm)]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[var(--secondary)]">IELTS practice</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-.045em]">Four skills, one clear measure.</h1>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">Absolute practice hours, using the original tracker calculation.</p>
            </div>
          </div>
          <div className="grid min-w-[360px] grid-cols-2 gap-3">
            <motion.div initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/75 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[.16em] text-[var(--foreground-subtle)]">Total time</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatHours(totalHours)}h</p>
            </motion.div>
            <motion.div initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : .05 }} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/75 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[.16em] text-[var(--foreground-subtle)]">Strongest skill</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold" style={{ color: highestSkill.color }}><HighestIcon className="h-4 w-4" />{highestSkill.label}</p>
            </motion.div>
          </div>
        </div>
      </header>

      <AnimatePresence mode="popLayout" initial={false}>
        {errorMessage && (
          <motion.div key="ielts-error" initial={reducedMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -8 }} role="alert" className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {errorMessage}
          </motion.div>
        )}
        {successMessage && (
          <motion.div key="ielts-success" initial={reducedMotion ? false : { opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={reducedMotion ? undefined : { opacity: 0, y: -6 }} role="status" aria-live="polite" className="relative overflow-hidden rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent)]">
            {!reducedMotion && <motion.span aria-hidden className="absolute inset-y-0 -left-20 w-16 skew-x-[-18deg] bg-white/35" animate={{ x: 900 }} transition={{ duration: .9, ease: 'easeOut' }} />}
            <span className="relative flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="grid min-h-[610px] grid-cols-[minmax(0,1.45fr)_minmax(360px,.72fr)] gap-5">
        <section className="relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-md)] backdrop-blur-xl">
          {!reducedMotion && (
            <motion.span aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" initial={{ x: '-120%', opacity: 0 }} animate={{ x: '420%', opacity: [0, .9, 0] }} transition={{ duration: .95, ease: 'easeOut' }} />
          )}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--foreground-subtle)]">Practice distribution</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">Hours by skill</h2>
            </div>
            <p className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs text-[var(--foreground-muted)]">
              Absolute hours · live preview
            </p>
          </div>

          <div className="mt-5 h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 34, right: 18, left: -10, bottom: 8 }} barCategoryGap="24%" accessibilityLayer>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" stroke="var(--foreground-subtle)" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} />
                <YAxis stroke="var(--foreground-subtle)" tickLine={false} axisLine={false} allowDecimals />
                <Tooltip formatter={(value) => [`${formatHours(Number(value))} hours`, 'Practice']} cursor={{ fill: 'var(--surface-soft)' }} contentStyle={cinematicIeltsTooltipStyle} />
                <Bar dataKey="hours" maxBarSize={104} radius={[10, 10, 3, 3]} isAnimationActive={!reducedMotion} animationDuration={reducedMotion ? 0 : 760} animationEasing="ease-out">
                  {chartData.map((item) => <Cell key={item.key} fill={item.color} />)}
                  <LabelList dataKey="hours" position="top" formatter={(value: unknown) => `${formatHours(Number(value))}h`} fill="var(--foreground-muted)" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <form onSubmit={onSave} className="flex min-h-0 flex-col rounded-[30px] border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-md)] backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--primary)]">Update totals</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-.025em]">Practice hours</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">Saved values replace the current totals.</p>
          </div>

          <div className="mt-5 flex-1 space-y-3">
            {skillConfigs.map((skill, index) => {
              const Icon = skill.icon;
              return (
                <motion.label key={skill.key} initial={reducedMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reducedMotion ? 0 : .06 + index * .045 }} className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)]/65 p-3 transition-colors focus-within:border-[var(--border-strong)] focus-within:bg-[var(--surface-raised)]">
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: skill.color }}><span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: skill.softColor }}><Icon className="h-4 w-4" /></span>{skill.label}</span>
                    <span className="text-[10px] text-[var(--foreground-subtle)]">hours</span>
                  </span>
                  <span className="mt-3 flex h-11 items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] transition focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-soft)]">
                    <input type="number" min="0" step="0.25" inputMode="decimal" value={draft[skill.key]} onChange={(event) => updateDraft(skill.key, event.target.value)} onBlur={() => { if (draft[skill.key] === '') updateDraft(skill.key, '0'); }} className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold tabular-nums outline-none" aria-label={`Total ${skill.label} hours`} />
                    <span className="border-l border-[var(--border)] px-3 text-xs text-[var(--foreground-muted)]">h</span>
                  </span>
                </motion.label>
              );
            })}
          </div>

          <motion.button type="submit" disabled={isLoading || isSaving} whileHover={reducedMotion ? undefined : { y: -2 }} whileTap={reducedMotion ? undefined : { scale: .98 }} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] shadow-[var(--shadow-md)] disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving…' : 'Save hours'}
          </motion.button>
        </form>
      </main>
    </div>
  );
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
