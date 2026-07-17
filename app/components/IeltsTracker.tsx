'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Headphones, Loader2, MessageCircle, Save, BookOpen, PenLine } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiIeltsHours } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';

type IeltsSkill = 'reading' | 'listening' | 'writing' | 'speaking';
type HourDraft = Record<IeltsSkill, string>;

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

export default function IeltsTracker() {
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
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
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
            <BarChart data={chartData} margin={{ top: 28, right: 10, left: -18, bottom: 4 }} barCategoryGap="24%">
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

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
