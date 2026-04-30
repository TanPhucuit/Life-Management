'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { api, ApiDate, ApiSession } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { Clock, Target, Play, Pause, RotateCcw, Save, ChevronLeft } from 'lucide-react';
import { BentoCard3D } from './BentoCard';
import { TestTubeStudyHours } from './TestTubeStudyHours';
import { RainbowCelebration } from './RainbowCelebration';
import { useRouter } from 'next/navigation';

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
    <div className="w-full h-screen flex flex-col bg-black">
      {/* Header - 8% of viewport */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="h-16 px-6 py-3 flex flex-col justify-center border-b border-white/10"
      >
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/10 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5 text-white/60" />
          </button>
          <h1 className="text-2xl font-bold text-white">
            {dayName}, {monthNames[month - 1]} {day}, {year}
          </h1>
        </div>
        <p className="text-white/60 ml-11 text-xs">
          {isToday() && '🎯 Today • '}{focusedHours}h / {targetHours}h focused
        </p>
      </motion.div>

      {/* Main Container - 92% of viewport (calc(100vh - 4rem)) */}
      <div className="flex-1 overflow-hidden">
        <div className="w-full h-full max-w-[1440px] mx-auto flex flex-col gap-0">
        <div 
          className="flex-1 grid gap-3 p-4 overflow-hidden"
          style={{
            gridTemplateColumns: '1.5fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr 0.8fr',
          }}
        >
          
          {/* ===== COLUMN 1: Visual Master (Test Tubes) ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="row-span-3"
            style={{ gridColumn: 1 }}
          >
            <BentoCard3D
              className="h-full p-6 flex flex-col items-center justify-center relative overflow-hidden"
              glowing={isCelebrating}
              enablePerspectiveTilt
              enableSpotlight
            >
              <RainbowCelebration isActive={isCelebrating} />
              <TestTubeStudyHours
                currentHours={parseFloat(focusedHours)}
                targetHours={targetHours}
                isRunning={isRunning}
                sunMood={isCelebrating ? 'celebrate' : sunMood}
              />
            </BentoCard3D>
          </motion.div>

          {/* ===== COLUMN 2: Stopwatch ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            style={{ gridColumn: 2 }}
          >
            <BentoCard3D
              className="h-full p-5 flex flex-col relative overflow-hidden"
              enablePerspectiveTilt
              enableSpotlight
              icon={<Clock size={16} />}
              title="Stopwatch"
            >
              {!showStopwatch ? (
                <button
                  onClick={() => setShowStopwatch(true)}
                  className="flex-1 flex items-center justify-center py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold transition-all border border-blue-500/30 text-sm"
                >
                  <Clock className="w-3 h-3 mr-1" />
                  Start
                </button>
              ) : (
                <div className="flex-1 flex flex-col justify-between gap-2">
                  <div className="text-center">
                    <div className="text-3xl font-mono font-bold text-blue-300 mb-1">
                      {formatTime(stopwatchTime)}
                    </div>
                    <div className="text-white/60 text-xs">{Math.floor(stopwatchTime / 60)}m</div>
                  </div>

                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={handlePlayPause}
                      className="py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium text-xs flex items-center justify-center gap-0.5 transition"
                    >
                      {isRunning ? <Pause size={12} /> : <Play size={12} />}
                      {isRunning ? 'Pause' : 'Play'}
                    </button>
                    <button
                      onClick={handleReset}
                      className="py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center justify-center gap-0.5 transition"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                    <button
                      onClick={handleSaveStopwatch}
                      className="py-1.5 rounded-md bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-bold text-xs flex items-center justify-center gap-0.5 transition border border-purple-500/30 col-span-2"
                    >
                      <Save size={12} />
                      Save
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setShowStopwatch(false);
                      setStopwatchTime(0);
                      setIsRunning(false);
                    }}
                    className="py-1 rounded-md bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition"
                  >
                    Close
                  </button>
                </div>
              )}
            </BentoCard3D>
          </motion.div>

          {/* ===== COLUMN 3: Daily Target ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            style={{ gridColumn: 3 }}
          >
            <BentoCard3D
              className="h-full p-5 flex flex-col"
              enablePerspectiveTilt
              enableSpotlight
              icon={<Target size={16} />}
              title="Daily Target"
            >
              <div className="flex-1 flex flex-col justify-between gap-2">
                <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center">
                  <div className="text-2xl font-bold text-cyan-400">{targetHours}h</div>
                  <div className="text-white/60 text-xs">target</div>
                </div>

                <input
                  type="range"
                  min="1"
                  max="12"
                  step="0.5"
                  value={targetHours}
                  onChange={(e) => setTargetHours(Number(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />

                <div className="grid grid-cols-2 gap-1 text-center">
                  <div className="bg-white/5 rounded-md p-1">
                    <div className="text-[9px] text-white/50">Focused</div>
                    <div className="text-sm font-bold text-blue-400">{focusedHours}h</div>
                  </div>
                  <div className="bg-white/5 rounded-md p-1">
                    <div className="text-[9px] text-white/50">Left</div>
                    <div className="text-sm font-bold text-orange-400">{Math.max(0, (targetHours - parseFloat(focusedHours))).toFixed(1)}h</div>
                  </div>
                </div>
              </div>
            </BentoCard3D>
          </motion.div>

          {/* ===== COLUMN 2: Key of Success ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            style={{ gridColumn: 2 }}
          >
            <BentoCard3D
              className="h-full p-5 flex flex-col"
              glowing
              enablePerspectiveTilt
              title="Quality"
            >
              <div className="flex-1 flex flex-col justify-between gap-2">
                <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-lg p-2 text-center">
                  <div className="text-2xl font-bold text-purple-300">{keyOfSuccess}</div>
                  <div className="text-white/60 text-xs">out of 3</div>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      onClick={() => setKeyOfSuccess(num)}
                      className={`py-1.5 px-0.5 rounded-md font-bold transition border text-xs ${
                        keyOfSuccess === num
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-500/50'
                          : 'bg-white/5 text-white/70 hover:bg-white/10 border-white/10'
                      }`}
                    >
                      {num === 1 ? '😔' : num === 2 ? '😐' : '😊'}
                    </button>
                  ))}
                </div>
              </div>
            </BentoCard3D>
          </motion.div>

          {/* ===== COLUMN 3: Manual Input ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            style={{ gridColumn: 3 }}
          >
            <BentoCard3D
              className="h-full p-5 flex flex-col"
              enablePerspectiveTilt
              title="Manual Input"
            >
              <div className="flex-1 flex flex-col justify-between gap-2">
                <label className="text-white/80 font-bold text-xs">
                  {focusedMinutes}m ({focusedHours}h)
                </label>
                <input
                  type="range"
                  min="0"
                  max="720"
                  step="15"
                  value={focusedMinutes}
                  onChange={(e) => setFocusedMinutes(Number(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  value={focusedMinutes}
                  onChange={(e) => setFocusedMinutes(Math.max(0, Number(e.target.value)))}
                  className="px-2 py-1 bg-white/10 border border-white/10 rounded-md text-white text-xs focus:outline-none focus:border-white/30"
                />
                <button
                  onClick={handleSaveDayDetails}
                  disabled={isSaving}
                  className="w-full mt-3 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Day Details'}
                </button>
              </div>
            </BentoCard3D>
          </motion.div>

          {/* ===== FULL WIDTH: Sessions List ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            style={{ gridColumn: '1 / -1' }}
            className="overflow-hidden"
          >
            <BentoCard3D
              className="h-full p-4 flex flex-col overflow-hidden"
              enablePerspectiveTilt
              title={`Sessions (${sessions.length})`}
            >
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(139, 92, 246, 0.4) rgba(10, 10, 10, 0.1)'
                }}
              >
                {sessions.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/50 text-xs">
                    No sessions recorded yet
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
                    {sessions.map((session) => (
                      <div key={session.id} className="bg-white/5 border border-white/10 rounded-md p-1.5 hover:bg-white/10 transition">
                        <div className="text-[8px] font-mono text-white/70 mb-0.5">
                          {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <span className={`text-[7px] px-1 py-0.5 rounded-full font-medium inline-block mt-0.5 ${session.in_time_status === 'in_time' ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/20 text-orange-300'}`}>
                          {session.in_time_status === 'in_time' ? 'OK' : 'Late'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </BentoCard3D>
          </motion.div>
        </div>
        </div>
      </div>
    </div>
  );
}
