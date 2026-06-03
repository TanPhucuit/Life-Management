'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Clock3, Pause, Play, RotateCcw, Save, SlidersHorizontal, Target, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiDate } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';

interface DayDetailsPageProps {
  day: number;
  month: number;
  year: number;
}

const monthNames = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const dayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export default function DayDetailsPage({ day, month, year }: DayDetailsPageProps) {
  const router = useRouter();
  const { user } = useAppStore();
  const [focusedMinutes, setFocusedMinutes] = useState(0);
  const [keyOfSuccess, setKeyOfSuccess] = useState(0);
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [targetHours, setTargetHours] = useState(8);
  const [dateRecordId, setDateRecordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const loadDateData = async () => {
      try {
        const dateRows = await api.getDates(user.id, month, year);

        const matchedDate = dateRows.find((item: ApiDate) => item.day === day && item.month === month && item.year === year);
        setDateRecordId(matchedDate?.id || null);
        setFocusedMinutes(matchedDate?.focused_minutes || 0);
        setKeyOfSuccess(matchedDate?.key_of_success || 0);
      } catch (error) {
        console.error('Error loading day details:', error);
      }
    };

    void loadDateData();
  }, [day, month, year, user?.id]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setStopwatchTime((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const saveDateRecord = async (nextFocusedMinutes = focusedMinutes, nextKeyOfSuccess = keyOfSuccess) => {
    if (!user?.id) return;

    if (dateRecordId) {
      await api.updateDate({
        id: dateRecordId,
        focusedMinutes: nextFocusedMinutes,
        keyOfSuccess: nextKeyOfSuccess,
      });
      return;
    }

    const created = await api.createDate({
      userId: user.id,
      day,
      month,
      year,
      focusedMinutes: nextFocusedMinutes,
      keyOfSuccess: nextKeyOfSuccess,
    });
    setDateRecordId(created.id);
  };

  const handleSaveStopwatch = async () => {
    const newMinutes = Math.floor(stopwatchTime / 60);
    const updatedMinutes = focusedMinutes + newMinutes;
    setFocusedMinutes(updatedMinutes);
    setStopwatchTime(0);
    setIsRunning(false);

    try {
      await saveDateRecord(updatedMinutes, keyOfSuccess);
    } catch (error) {
      console.error('Error saving stopwatch:', error);
    }
  };

  const handleSaveDayDetails = async () => {
    setIsSaving(true);
    try {
      await saveDateRecord(focusedMinutes, keyOfSuccess);
    } catch (error) {
      console.error('Error saving day details:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const isToday = () => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
  };

  const focusedHoursNumber = focusedMinutes / 60;
  const focusedHours = focusedHoursNumber.toFixed(1);
  const progressPercent = Math.min((focusedMinutes / (targetHours * 60)) * 100, 100);
  const remainingHours = Math.max(0, targetHours - focusedHoursNumber).toFixed(1);
  const dayName = dayNames[new Date(year, month - 1, day).getDay()];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-4"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                aria-label="Quay lại"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold text-slate-950 sm:text-2xl">
                    {dayName}, {day} {monthNames[month - 1]} {year}
                  </h1>
                  {isToday() && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Hôm nay</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {focusedHours}h / {targetHours}h tập trung
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:w-[420px]">
              <SummaryTile label="Hoàn thành" value={`${progressPercent.toFixed(0)}%`} />
              <SummaryTile label="Còn lại" value={`${remainingHours}h`} />
              <SummaryTile label="Key" value={keyOfSuccess} />
            </div>
          </div>
        </motion.header>

        <main className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-950">Tiến độ ngày</h2>
                <p className="text-sm text-slate-500">Mục tiêu tập trung và chất lượng trong ngày.</p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-600">
                <Target className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">Đã tập trung</p>
                  <p className="text-4xl font-semibold tracking-tight text-slate-950">{focusedHours}h</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Mục tiêu</p>
                  <p className="text-2xl font-semibold text-blue-600">{targetHours}h</p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{focusedMinutes} phút</span>
                <span>{remainingHours}h còn lại</span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <ControlPanel title="Mục tiêu ngày" icon={<Target className="h-4 w-4" />}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Target</span>
                    <span className="text-lg font-semibold text-blue-600">{targetHours}h</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    value={targetHours}
                    onChange={(event) => setTargetHours(Number(event.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>
              </ControlPanel>

              <ControlPanel title="Key of Success" icon={<Trophy className="h-4 w-4" />}>
                <div className="space-y-3">
                  <div className="text-center text-3xl font-semibold text-slate-950">{keyOfSuccess}</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setKeyOfSuccess(num)}
                        className={`h-10 rounded-md border text-sm font-semibold transition ${
                          keyOfSuccess === num
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </ControlPanel>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ControlPanel title="Stopwatch" icon={<Clock3 className="h-4 w-4" />}>
              <div className="flex min-h-[220px] flex-col justify-between rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-blue-700">Thời gian đang đo</p>
                  <p className="mt-4 font-mono text-5xl font-semibold tracking-tight text-blue-700">{formatTime(stopwatchTime)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setIsRunning((value) => !value)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isRunning ? 'Tạm dừng' : 'Bắt đầu'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStopwatchTime(0);
                      setIsRunning(false);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStopwatch}
                    className="col-span-2 inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 sm:col-span-2 lg:col-span-2 2xl:col-span-2"
                  >
                    <Save className="h-4 w-4" />
                    Lưu stopwatch
                  </button>
                </div>
              </div>
            </ControlPanel>

            <ControlPanel title="Điều chỉnh thủ công" icon={<SlidersHorizontal className="h-4 w-4" />}>
              <div className="flex min-h-[220px] flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-slate-700">Phút tập trung</label>
                    <input
                      type="number"
                      min="0"
                      value={focusedMinutes}
                      onChange={(event) => setFocusedMinutes(Math.max(0, Number(event.target.value)))}
                      className="h-9 w-24 rounded-md border border-slate-200 bg-white px-3 text-right text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="720"
                    step="15"
                    value={focusedMinutes}
                    onChange={(event) => setFocusedMinutes(Number(event.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>0m</span>
                    <span>720m</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveDayDetails}
                  disabled={isSaving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Đang lưu...' : 'Lưu chi tiết ngày'}
                </button>
              </div>
            </ControlPanel>
          </section>
        </main>

      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ControlPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-600">{icon}</div>
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}
