'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { api, ApiDate, ApiSession } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { Play, Pause, RotateCcw, Save, ChevronLeft } from 'lucide-react';
import { UnifiedDashboardShell } from './UnifiedDashboardShell';
import { StudyTubeVisual } from './StudyTubeVisual';
import { RainbowCelebration } from './RainbowCelebration';
import { useRouter } from 'next/navigation';
import { SessionItem } from './SessionItem';
import { AnimatePresence } from 'framer-motion';

interface DayDetailsPageProps {
  day: number;
  month: number;
  year: number;
}

export default function DayDetailsPage({ day, month, year }: DayDetailsPageProps) {
  const router = useRouter();
  const { user } = useAppStore();
  const [focusedMinutes, setFocusedMinutes] = useState(0);
  const [keyOfSuccess, setKeyOfSuccess] = useState(0);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [targetHours, setTargetHours] = useState(8);
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [dateRecordId, setDateRecordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load sessions for this date
  useEffect(() => {
    if (!user?.id) return;

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const loadDateData = async () => {
      try {
        const [dateRows, daySessions] = await Promise.all([
          api.getDates(user.id, month, year),
          api.getSessions(user.id, { date: dateStr }),
        ]);

        const matchedDate = dateRows.find((item: ApiDate) => item.day === day && item.month === month && item.year === year);

        setDateRecordId(matchedDate?.id || null);
        setFocusedMinutes(matchedDate?.focused_minutes || 0);
        setKeyOfSuccess(matchedDate?.key_of_success || 0);
        setSessions(daySessions as ApiSession[]);
      } catch (error) {
        console.error('Error loading day details:', error);
      }
    };

    void loadDateData();
  }, [day, month, year, user?.id]);

  // Stopwatch interval
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setStopwatchTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
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

  const handlePlayPause = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setStopwatchTime(0);
    setIsRunning(false);
  };

  const handleSaveStopwatch = async () => {
    const newMinutes = Math.floor(stopwatchTime / 60);
    const updatedMinutes = focusedMinutes + newMinutes;
    setFocusedMinutes(updatedMinutes);
    setStopwatchTime(0);
    setIsRunning(false);
    setShowStopwatch(false);

    if (!user?.id) return;

    if (dateRecordId) {
      await api.updateDate({
        id: dateRecordId,
        focusedMinutes: updatedMinutes,
        keyOfSuccess,
      });
      return;
    }

    try {
      const created = await api.createDate({
        userId: user.id,
        day,
        month,
        year,
        focusedMinutes: updatedMinutes,
        keyOfSuccess,
      });
      setDateRecordId(created.id);
    } catch (error) {
      console.error('Error creating date record:', error);
    }
  };

  const handleSaveDayDetails = async () => {
    if (!user?.id) return;
    setIsSaving(true);

    try {
      if (dateRecordId) {
        await api.updateDate({
          id: dateRecordId,
          focusedMinutes,
          keyOfSuccess,
        });
      } else {
        const created = await api.createDate({
          userId: user.id,
          day,
          month,
          year,
          focusedMinutes,
          keyOfSuccess,
        });
        setDateRecordId(created.id);
      }
    } catch (error) {
      console.error('Error saving day details:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSession = async (id: string, updates: Partial<ApiSession>) => {
    try {
      await api.updateSession({
        id,
        sessionName: updates.session_name,
        focusedMinutes: updates.focused_minutes,
        keyOfSuccess: updates.key_of_success,
        startTime: updates.start_time,
        endTime: updates.end_time,
        sessionDate: updates.session_date,
        inTimeStatus: updates.in_time_status,
      });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const isToday = (): boolean => {
    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() + 1 &&
      year === today.getFullYear()
    );
  };

  const focusedHours = (focusedMinutes / 60).toFixed(1);
  const progressPercent = (focusedMinutes / (targetHours * 60)) * 100;
  const isCelebrating = progressPercent >= 100;
  const sunMood = progressPercent > 50 ? 'happy' : 'sad';

  // Format date display
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[new Date(year, month - 1, day).getDay()];

  return (
    <div className="flex min-h-screen w-full flex-col bg-black">
      {/* Header - 8% of viewport */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-white/10 px-3 py-3 sm:px-6"
      >
        <div className="mb-1 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-2 transition hover:bg-white/10"
          >
            <ChevronLeft className="w-5 h-5 text-white/60" />
          </button>
          <h1 className="min-w-0 text-lg font-bold leading-tight text-white sm:text-2xl">
            {dayName}, {monthNames[month - 1]} {day}, {year}
          </h1>
        </div>
        <p className="ml-11 text-xs text-white/60">
          {isToday() && '🎯 Today • '}{focusedHours}h / {targetHours}h focused
        </p>
      </motion.div>

      {/* Main Container */}
      <div className="flex-1 overflow-visible pb-4">
        <UnifiedDashboardShell
          visual={
            <div className="h-full w-full flex flex-col items-center justify-center relative">
              <RainbowCelebration isActive={isCelebrating} />
              <StudyTubeVisual
                currentHours={parseFloat(focusedHours)}
                targetHours={targetHours}
                isRunning={isRunning}
                sunMood={isCelebrating ? 'celebrate' : sunMood}
              />
            </div>
          }
          stopwatch={
            !showStopwatch ? (
                <button onClick={() => setShowStopwatch(true)} className="w-full h-full min-h-[80px] rounded-xl bg-gradient-to-r from-blue-600/10 to-blue-500/10 hover:from-blue-600/20 hover:to-blue-500/20 text-blue-400 font-bold transition-all border border-blue-500/20 flex flex-col items-center justify-center gap-2">
                  <Play className="w-6 h-6" />
                  <span className="text-[10px] uppercase tracking-wider">Start Stopwatch</span>
                </button>
            ) : (
                <div className="flex flex-col h-full justify-between">
                  <div className="text-center my-auto">
                    <div className="text-4xl font-mono font-bold text-blue-400 tracking-tighter drop-shadow-[0_0_15px_rgba(96,165,250,0.3)]">
                      {formatTime(stopwatchTime)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 grid-rows-2 gap-2 mt-4">
                    <button onClick={handlePlayPause} className="py-2.5 rounded-xl bg-[#161616] hover:bg-[#222] text-white font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition border border-[#333]">
                      {isRunning ? <Pause size={14} /> : <Play size={14} />}
                      {isRunning ? 'Pause' : 'Play'}
                    </button>
                    <button onClick={handleReset} className="py-2.5 rounded-xl bg-[#161616] hover:bg-[#222] text-white font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition border border-[#333]">
                      <RotateCcw size={14} />
                      Reset
                    </button>
                    <button onClick={handleSaveStopwatch} className="py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition border border-blue-500/30">
                      <Save size={14} />
                      Save
                    </button>
                    <button onClick={() => { setShowStopwatch(false); setStopwatchTime(0); setIsRunning(false); }} className="py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-[10px] uppercase tracking-wider transition border border-red-500/20">
                      Close
                    </button>
                  </div>
                </div>
            )
          }
          target={
            <div className="flex flex-col h-full justify-center gap-5">
              <div className="flex justify-between items-end px-2">
                <div className="text-4xl font-bold text-cyan-400 tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.2)]">{targetHours}h</div>
                <div className="text-right">
                  <div className="text-[9px] text-white/40 uppercase tracking-wider font-bold mb-1">Status</div>
                  <div className="text-xs font-bold text-white">
                    {focusedHours}h / <span className="text-orange-400">{Math.max(0, (targetHours - parseFloat(focusedHours))).toFixed(1)}h left</span>
                  </div>
                </div>
              </div>
              <input
                type="range" min="1" max="12" step="0.5"
                value={targetHours}
                onChange={(e) => setTargetHours(Number(e.target.value))}
                className="w-full h-1.5 bg-[#222] rounded-full appearance-none cursor-pointer accent-cyan-400 outline-none"
              />
            </div>
          }
          quality={
            <div className="flex flex-col h-full justify-center items-center gap-5">
              <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-pink-500 drop-shadow-[0_0_15px_rgba(192,132,252,0.3)]">
                {keyOfSuccess}
              </div>
              <div className="flex gap-3 justify-center">
                {[0, 1, 2, 3].map((num) => (
                  <button
                    key={num}
                    onClick={() => setKeyOfSuccess(num)}
                    className={`w-10 h-10 rounded-[12px] font-bold transition-all flex items-center justify-center border text-sm ${
                      keyOfSuccess === num
                        ? 'bg-gradient-to-br from-purple-600/80 to-pink-600/80 text-white border-white/20 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                        : 'bg-[#161616] text-white/50 hover:bg-[#222] hover:text-white/80 border-[#333]'
                    }`}
                  >
                    {num === 0 ? 'X' : num === 1 ? '😔' : num === 2 ? '😐' : '😊'}
                  </button>
                ))}
              </div>
            </div>
          }
          input={
            <div className="flex flex-col h-full justify-center gap-4">
              <div className="flex justify-between items-center px-1">
                <label className="text-white/80 font-bold text-sm">
                  {focusedMinutes}m <span className="text-white/40 text-xs font-medium ml-1">({focusedHours}h)</span>
                </label>
                <input
                  type="number" min="0"
                  value={focusedMinutes}
                  onChange={(e) => setFocusedMinutes(Math.max(0, Number(e.target.value)))}
                  className="w-16 px-2 py-1.5 bg-[#161616] border border-[#333] rounded-[8px] text-white text-xs font-mono font-bold text-center focus:outline-none focus:border-white/50 transition-colors"
                />
              </div>
              <input
                type="range" min="0" max="720" step="15"
                value={focusedMinutes}
                onChange={(e) => setFocusedMinutes(Number(e.target.value))}
                className="w-full h-1.5 bg-[#222] rounded-full appearance-none cursor-pointer accent-blue-500 outline-none"
              />
              <button
                onClick={handleSaveDayDetails} disabled={isSaving}
                className="w-full mt-2 py-3 rounded-xl bg-white hover:bg-gray-200 text-black text-[10px] uppercase tracking-wider font-bold transition-all disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Day Details'}
              </button>
            </div>
          }
          sessions={
            <div className="flex h-full w-full flex-col gap-3 overflow-y-auto px-1 pb-2 pt-2 sm:flex-row sm:items-center sm:overflow-x-auto sm:overflow-y-hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              {sessions.length === 0 ? (
                <div className="flex items-center justify-center w-full h-full text-white/30 text-xs font-medium">
                  Chưa có dữ liệu học tập cho ngày này
                </div>
              ) : (
                <AnimatePresence>
                  {sessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      onUpdate={handleUpdateSession}
                      onDelete={handleDeleteSession}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
