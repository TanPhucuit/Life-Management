'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Target, Play, Pause, RotateCcw, Save, X, ChevronLeft } from 'lucide-react';
import { TestTubeStudyHours } from './TestTubeStudyHours';
import { RainbowCelebration } from './RainbowCelebration';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Session {
  id: string;
  task_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  session_date: string;
  in_time_status: 'in_time' | 'out_time';
  focused_minutes: number;
}

interface UnifiedBentoControlCenterProps {
  day: number;
  month: number;
  year: number;
  sessions: Session[];
}

// ── Inner tile (no scaling, spotlight + glow only) ─────────────────────────────
function BentoTile({
  children,
  className = '',
  variant = 'default',
  glowing = false,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'accent' | 'glass';
  glowing?: boolean;
}) {
  const [spotPos, setSpotPos] = useState({ x: 0, y: 0 });
  const [isOver, setIsOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const bg = {
    default: 'rgba(255,255,255,0.04)',
    accent:  'rgba(109,40,217,0.10)',
    glass:   'rgba(255,255,255,0.02)',
  }[variant];

  return (
    <div
      ref={ref}
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: bg,
        border: '0.5px solid rgba(255,255,255,0.07)',
        boxShadow: glowing
          ? '0 0 28px rgba(139,92,246,0.28), inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
      onMouseEnter={() => setIsOver(true)}
      onMouseLeave={() => setIsOver(false)}
      onMouseMove={(e) => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setSpotPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      {/* Spotlight */}
      {isOver && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle 120px at ${spotPos.x}px ${spotPos.y}px, rgba(255,255,255,0.06), transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

// ── Physical key button (3D piano key feel) ────────────────────────────────────
function PhysKey({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji: string;
  active: boolean;
  onClick: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <motion.button
      animate={{ scale: pressed ? 0.94 : 1, y: pressed ? 2 : 0 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl transition-colors duration-150 select-none"
      style={{
        background: active
          ? 'linear-gradient(180deg, rgba(168,85,247,0.6) 0%, rgba(109,40,217,0.8) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
        border: active
          ? '1px solid rgba(168,85,247,0.5)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: active
          ? '0 0 18px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
          : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.4)',
      }}
    >
      <span className="text-xl leading-none">{emoji}</span>
      <span className={`text-[9px] font-semibold tracking-wide ${active ? 'text-white' : 'text-white/40'}`}>
        {label}
      </span>
    </motion.button>
  );
}

// ── Compact action button ──────────────────────────────────────────────────────
function ActionBtn({
  icon: Icon,
  label,
  onClick,
  color = 'default',
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  color?: 'default' | 'green' | 'red' | 'purple';
}) {
  const [pressed, setPressed] = useState(false);
  const bg = {
    default: 'rgba(255,255,255,0.08)',
    green:   'rgba(16,185,129,0.25)',
    red:     'rgba(239,68,68,0.25)',
    purple:  'rgba(139,92,246,0.35)',
  }[color];

  return (
    <motion.button
      animate={{ scale: pressed ? 0.95 : 1, y: pressed ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-white text-xs font-medium transition-colors"
      style={{
        background: bg,
        border: '0.5px solid rgba(255,255,255,0.1)',
        boxShadow: pressed ? 'inset 0 2px 6px rgba(0,0,0,0.5)' : 'inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {label}
    </motion.button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function UnifiedBentoControlCenter({
  day, month, year, sessions,
}: UnifiedBentoControlCenterProps) {
  const router = useRouter();

  // State
  const [focusedMinutes, setFocusedMinutes] = useState(0);
  const [keyOfSuccess, setKeyOfSuccess] = useState(0);
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [targetHours, setTargetHours] = useState(8);
  const [swVisible, setSwVisible] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stopwatch
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setStopwatchTime(p => p + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const saveStopwatch = () => {
    setFocusedMinutes(p => p + Math.floor(stopwatchTime / 60));
    setStopwatchTime(0); setIsRunning(false); setSwVisible(false);
  };

  // Derived
  const focusedHours    = (focusedMinutes / 60).toFixed(1);
  const progressPercent = Math.min((focusedMinutes / (targetHours * 60)) * 100, 100);
  const isCelebrating   = progressPercent >= 100;
  const sunMood         = isCelebrating ? 'celebrate' : progressPercent > 50 ? 'happy' : 'sad';
  const leftHours       = Math.max(0, targetHours - parseFloat(focusedHours)).toFixed(1);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayName    = new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long' });
  const isToday    = () => {
    const t = new Date();
    return day === t.getDate() && month === t.getMonth() + 1 && year === t.getFullYear();
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col gap-0">

      {/* ── HEADER BAR ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0 border border-white/8"
        >
          <ChevronLeft className="w-4 h-4 text-white/50" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white leading-tight truncate">
            {dayName}, {monthNames[month - 1]} {day}, {year}
          </h1>
          <p className="text-white/40 text-[11px] mt-0.5">
            {isToday() && '🎯 Today · '}{focusedHours}h / {targetHours}h focused · {progressPercent.toFixed(0)}%
          </p>
        </div>
        {/* Rainbow badge */}
        {isCelebrating && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: 'linear-gradient(90deg,#f472b6,#fb923c,#facc15,#4ade80,#60a5fa,#a78bfa)', color: '#000' }}
          >
            🎉 Goal!
          </motion.div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          UNIFIED BENTO SHELL — one big card
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="flex-1 min-h-0 rounded-[32px] overflow-hidden relative"
        style={{
          background: 'linear-gradient(160deg, rgba(15,10,25,0.98) 0%, rgba(8,8,18,0.99) 100%)',
          border: '0.5px solid rgba(255,255,255,0.07)',
          boxShadow: isCelebrating
            ? '0 0 60px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Rainbow overlay (absolute, behind grid) */}
        <RainbowCelebration isActive={isCelebrating} />

        {/* ── INNER GRID ──────────────────────────────────────────────────── */}
        <div className="relative z-10 h-full grid grid-cols-4 grid-rows-[1fr_auto_auto] gap-3 p-3">

          {/* ════════════ ROW 1 — Visual Stage ════════════════════════════ */}

          {/* [A] Test Tubes — col 1-2 (2 cols) */}
          <BentoTile
            className="col-span-2 row-span-1 p-3 flex flex-col"
            variant={isCelebrating ? 'accent' : 'default'}
            glowing={isCelebrating}
          >
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-2 font-medium">Study Hours</div>
            <div className="flex-1 min-h-0">
              <TestTubeStudyHours
                currentHours={parseFloat(focusedHours)}
                targetHours={targetHours}
                isRunning={isRunning}
                sunMood={sunMood}
              />
            </div>
          </BentoTile>

          {/* [B] Key of Success — col 3 (1 col) */}
          <BentoTile className="col-span-1 row-span-1 p-4 flex flex-col gap-3" variant="glass">
            <div className="text-[10px] text-white/35 uppercase tracking-widest font-medium">Key of Success</div>

            {/* Score display */}
            <div
              className="rounded-xl py-3 text-center flex-shrink-0"
              style={{
                background: keyOfSuccess > 0
                  ? 'linear-gradient(180deg,rgba(168,85,247,0.15),rgba(109,40,217,0.1))'
                  : 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(168,85,247,0.2)',
              }}
            >
              <div className="text-3xl font-black text-purple-300 leading-none">{keyOfSuccess}</div>
              <div className="text-[9px] text-white/30 mt-1">/ 3</div>
            </div>

            {/* Piano keys */}
            <div className="grid grid-cols-3 gap-1.5 flex-1">
              {[0,1,2,3].slice(1).map((num) => (
                <PhysKey
                  key={num}
                  emoji={num === 1 ? '😔' : num === 2 ? '😐' : '😊'}
                  label={num === 1 ? 'Hard' : num === 2 ? 'Avg' : 'Great'}
                  active={keyOfSuccess === num}
                  onClick={() => setKeyOfSuccess(num)}
                />
              ))}
            </div>

            <div className="text-center text-[10px] min-h-[14px]"
              style={{ color: keyOfSuccess === 3 ? '#a78bfa' : 'rgba(255,255,255,0.35)' }}>
              {keyOfSuccess === 0 && 'Not rated'}
              {keyOfSuccess === 1 && 'Struggled today'}
              {keyOfSuccess === 2 && 'Average day'}
              {keyOfSuccess === 3 && '🌟 Excellent!'}
            </div>
          </BentoTile>

          {/* [C] Stopwatch Panel — col 4 (1 col) */}
          <BentoTile className="col-span-1 row-span-1 p-4 flex flex-col gap-3" variant="glass">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-white/35 uppercase tracking-widest font-medium">Stopwatch</div>
              <Clock size={13} className="text-white/25" />
            </div>

            {!swVisible ? (
              <div className="flex-1 flex items-center justify-center">
                <ActionBtn icon={Play} label="Start" onClick={() => setSwVisible(true)} color="green" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2">
                {/* Timer */}
                <div
                  className="text-center rounded-xl py-4 border"
                  style={{
                    background: 'rgba(0,0,0,0.35)',
                    borderColor: isRunning ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.06)',
                    boxShadow: isRunning ? '0 0 20px rgba(52,211,153,0.1)' : 'none',
                  }}
                >
                  <div
                    className="font-mono font-bold tabular-nums text-2xl"
                    style={{ color: isRunning ? '#6ee7b7' : '#93c5fd' }}
                  >
                    {fmtTime(stopwatchTime)}
                  </div>
                  <div className="text-[9px] text-white/30 mt-0.5">
                    {Math.floor(stopwatchTime / 60)}m recorded
                  </div>
                </div>

                {/* 2×2 controls */}
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionBtn
                    icon={isRunning ? Pause : Play}
                    label={isRunning ? 'Pause' : 'Play'}
                    onClick={() => setIsRunning(p => !p)}
                    color="green"
                  />
                  <ActionBtn icon={RotateCcw} label="Reset" onClick={() => { setStopwatchTime(0); setIsRunning(false); }} color="red" />
                  <ActionBtn icon={Save} label="Save" onClick={saveStopwatch} color="purple" />
                  <ActionBtn icon={X} label="Close" onClick={() => { setSwVisible(false); setStopwatchTime(0); setIsRunning(false); }} />
                </div>
              </div>
            )}
          </BentoTile>

          {/* ════════════ ROW 2 — Controls ════════════════════════════════ */}

          {/* [D] Daily Target — col 1-2 */}
          <BentoTile className="col-span-2 p-4 flex flex-col gap-3" variant="default">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-white/35 uppercase tracking-widest font-medium">Daily Target</div>
              <Target size={13} className="text-white/25" />
            </div>

            {/* Stat chips */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Target', val: `${targetHours}h`,   color: '#22d3ee' },
                { label: 'Done',   val: `${focusedHours}h`,  color: '#60a5fa' },
                { label: 'Left',   val: `${leftHours}h`,     color: '#fb923c' },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center rounded-xl py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-sm font-bold" style={{ color }}>{val}</div>
                  <div className="text-[9px] text-white/35 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[9px] text-white/30">
                <span>0%</span>
                <span className="font-semibold" style={{ color: progressPercent >= 100 ? '#a78bfa' : 'rgba(255,255,255,0.4)' }}>
                  {progressPercent.toFixed(0)}%
                </span>
                <span>100%</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: isCelebrating ? 'linear-gradient(90deg,#f472b6,#fb923c,#facc15,#4ade80,#60a5fa,#a78bfa)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Target slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[9px] text-white/30">
                <span>1h</span>
                <span className="text-white/50 font-medium">adjust target</span>
                <span>12h</span>
              </div>
              <input
                type="range" min="1" max="12" step="0.5"
                value={targetHours}
                onChange={(e) => setTargetHours(Number(e.target.value))}
                className="w-full h-1 appearance-none cursor-pointer rounded-full accent-cyan-500"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              />
            </div>
          </BentoTile>

          {/* [E] Manual Input — col 3-4 */}
          <BentoTile className="col-span-2 p-4 flex flex-col gap-3" variant="glass">
            <div className="text-[10px] text-white/35 uppercase tracking-widest font-medium">Manual Input</div>

            {/* Display */}
            <div className="text-center rounded-xl py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.06)' }}>
              <div className="text-2xl font-bold text-white">{focusedHours}h</div>
              <div className="text-[9px] text-white/30 mt-0.5">{focusedMinutes} minutes</div>
            </div>

            {/* Slider */}
            <div className="flex flex-col gap-1">
              <input
                type="range" min="0" max="720" step="15"
                value={focusedMinutes}
                onChange={(e) => setFocusedMinutes(Number(e.target.value))}
                className="w-full h-1 appearance-none cursor-pointer rounded-full accent-purple-500"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              />
              <div className="flex justify-between text-[9px] text-white/25">
                <span>0h</span><span>6h</span><span>12h</span>
              </div>
            </div>

            {/* Number input */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/35 flex-shrink-0">Min:</span>
              <input
                type="number" min="0"
                value={focusedMinutes}
                onChange={(e) => setFocusedMinutes(Math.max(0, Number(e.target.value)))}
                className="flex-1 text-center py-1.5 rounded-lg text-white text-sm font-bold focus:outline-none transition"
                style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </BentoTile>

          {/* ════════════ ROW 3 — Data ════════════════════════════════════ */}

          {/* [F] Sessions — col 1-3 */}
          <BentoTile className="col-span-3 p-4 flex flex-col gap-2" variant="glass">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] text-white/35 uppercase tracking-widest font-medium">Sessions</div>
              <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
                {sessions.length} recorded
              </span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-1 max-h-28 pr-1">
              {sessions.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/20 text-xs">
                  No sessions yet
                </div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                    <div className="font-mono text-[10px] text-white/50">
                      {new Date(s.start_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      {' – '}
                      {new Date(s.end_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={s.in_time_status === 'in_time'
                          ? { background:'rgba(16,185,129,0.15)', color:'#6ee7b7' }
                          : { background:'rgba(251,146,60,0.15)', color:'#fdba74' }}>
                        {s.in_time_status === 'in_time' ? 'On' : 'Late'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </BentoTile>

          {/* [G] Quick stats — col 4 */}
          <BentoTile className="col-span-1 p-4 flex flex-col gap-3 justify-center" variant="glass">
            <div className="text-[10px] text-white/35 uppercase tracking-widest font-medium mb-1">Summary</div>
            {[
              { label: 'Focused', val: `${focusedHours}h`, color: '#60a5fa' },
              { label: 'Sessions', val: `${sessions.length}`, color: '#a78bfa' },
              { label: 'Rating', val: keyOfSuccess > 0 ? `${keyOfSuccess}/3` : '—', color: '#f472b6' },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[10px] text-white/30">{label}</span>
                <span className="text-sm font-bold" style={{ color }}>{val}</span>
              </div>
            ))}
          </BentoTile>

        </div>
      </div>
    </div>
  );
}
