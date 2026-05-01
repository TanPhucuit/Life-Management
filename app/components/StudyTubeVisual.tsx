'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useEffect } from 'react';

interface StudyTubeVisualProps {
  currentHours: number;
  targetHours: number;
  isRunning?: boolean;
  sunMood?: 'sad' | 'happy' | 'celebrate';
}

const TUBE_HEIGHT = 280; // slightly shorter for compact UI
const TUBE_MAX_HOURS = 12;

export function StudyTubeVisual({
  currentHours,
  targetHours,
  isRunning = false,
  sunMood = 'sad',
}: StudyTubeVisualProps) {
  const [liquidHeight, setLiquidHeight] = useState(0);
  const [splashes, setSplashes] = useState<{ id: number; x: number; y: number }[]>([]);

  // Calculate percentages
  const currentPercent = Math.min((currentHours / TUBE_MAX_HOURS) * 100, 100);
  const targetPercent = Math.min((targetHours / TUBE_MAX_HOURS) * 100, 100);
  const isCelebrating = sunMood === 'celebrate';

  useEffect(() => {
    setLiquidHeight(currentPercent);
  }, [currentPercent]);

  // Handle collision
  useEffect(() => {
    if (!isRunning) return;
    
    // Simulate droplets hitting the surface
    const interval = setInterval(() => {
      const dropY = TUBE_HEIGHT - (liquidHeight / 100) * TUBE_HEIGHT;
      const newSplash = {
        id: Date.now(),
        x: Math.random() * 40 - 20, // offset
        y: dropY,
      };
      
      setSplashes((prev) => [...prev.slice(-4), newSplash]); // keep last 5
      
      setTimeout(() => {
        setSplashes((prev) => prev.filter((s) => s.id !== newSplash.id));
      }, 600);
    }, 800); // one droplet every 800ms
    
    return () => clearInterval(interval);
  }, [isRunning, liquidHeight]);

  // Graduation marks
  const marks = useMemo(
    () =>
      Array.from({ length: 13 }).map((_, i) => ({
        hour: i,
        y: ((12 - i) / 12) * 100,
      })),
    []
  );

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-end pb-6 pt-16">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes wave {
          0% { transform: translateX(0) translateZ(0); }
          50% { transform: translateX(-25%) translateZ(0); }
          100% { transform: translateX(-50%) translateZ(0); }
        }
        .animate-wave-fast { animation: wave 3s infinite linear; }
        .animate-wave-slow { animation: wave 5s infinite linear; }
      `}} />
      
      {/* Absolute Cloud/Sun on top of the tube, perfectly centered, moved down */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
        <motion.svg
          width="60"
          height="60"
          viewBox="0 0 80 80"
          className="mx-auto"
          animate={isCelebrating ? { scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] } : {}}
          transition={isCelebrating ? { duration: 2, repeat: Infinity } : {}}
        >
          <defs>
            <radialGradient id="sunGrad" cx="35%" cy="35%">
              <stop offset="0%" stopColor="rgba(255, 200, 50, 1)" />
              <stop offset="70%" stopColor="rgba(255, 150, 20, 0.9)" />
              <stop offset="100%" stopColor="rgba(255, 100, 0, 0.7)" />
            </radialGradient>
          </defs>

          {/* Sun rays */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 40 + Math.cos(rad) * 22;
            const y1 = 40 + Math.sin(rad) * 22;
            const x2 = 40 + Math.cos(rad) * 28;
            const y2 = 40 + Math.sin(rad) * 28;
            return (
              <line
                key={`ray-${angle}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255, 200, 0, 0.7)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}

          <circle cx="40" cy="40" r="14" fill="url(#sunGrad)" />
          <circle cx="33" cy="31" r="3.5" fill="rgba(255, 255, 255, 0.5)" />
          <circle cx="34" cy="37" r="1.5" fill="rgba(50, 50, 50, 0.9)" />
          <circle cx="46" cy="37" r="1.5" fill="rgba(50, 50, 50, 0.9)" />

          {sunMood === 'sad' ? (
            <path d="M 35,42 Q 40,40 45,42" stroke="rgba(100, 100, 100, 0.7)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          ) : (
            <path d="M 35,42 Q 40,44 45,42" stroke="rgba(50, 50, 50, 0.8)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          )}

          {sunMood === 'sad' && (
            <>
              <motion.circle cx="34" cy="40" r="0.8" fill="rgba(100, 150, 255, 0.6)" animate={{ y: [0, 5] }} transition={{ duration: 1.5, repeat: Infinity }} />
              <motion.circle cx="46" cy="40" r="0.8" fill="rgba(100, 150, 255, 0.6)" animate={{ y: [0, 5] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }} />
            </>
          )}

          {/* Cloud source when running */}
          {isRunning && (
            <motion.path
              d="M 28,56 Q 24,52 32,48 Q 30,44 38,42 Q 42,40 46,42 Q 52,40 56,44 Q 64,45 64,52 Q 64,58 56,60 L 32,60 Q 24,58 28,56 Z"
              fill="rgba(200, 220, 255, 0.95)"
              animate={{ y: [0, 2, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          )}
        </motion.svg>
      </div>

      <div className="flex gap-8 items-end justify-center flex-1 w-full">
        {/* === CURRENT TUBE === */}
        <div className="relative flex flex-col items-center">
          <div
            className="relative rounded-b-[30px] rounded-t-[8px] overflow-hidden bg-gradient-to-b from-white/5 to-white/10 shadow-[inset_0_0_25px_rgba(255,255,255,0.05)] border-x-2 border-b-2 border-white/20 backdrop-blur-md"
            style={{ width: '84px', height: `${TUBE_HEIGHT}px` }}
          >
            {/* Glass refraction edges (Hyper-realistic) */}
            <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-white/40 via-white/10 to-transparent pointer-events-none z-40 opacity-70 mix-blend-overlay" />
            <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-white/30 via-white/5 to-transparent pointer-events-none z-40 opacity-60 mix-blend-overlay" />
            <div className="absolute inset-y-0 left-1 w-0.5 bg-white/50 pointer-events-none z-40 blur-[1px]" />
            <div className="absolute inset-y-0 right-2 w-1 bg-white/30 pointer-events-none z-40 blur-[2px]" />

            {/* Marks */}
            {marks.map((mark) => (
              <div key={`c-${mark.hour}`} className="absolute left-0 right-0 flex items-center pointer-events-none z-20" style={{ top: `${mark.y}%` }}>
                <div className="w-1.5 h-[1px] bg-white/40" />
                <span className="text-[8px] text-white/50 ml-1 font-mono tracking-tighter shadow-black drop-shadow-md">{mark.hour}h</span>
              </div>
            ))}

            {/* Droplets (only exist above the liquid) */}
            {isRunning && (
              <motion.div
                className="absolute w-1.5 h-2.5 rounded-full bg-cyan-300 pointer-events-none z-20 shadow-[0_0_8px_rgba(103,232,249,0.8)]"
                style={{ left: '50%', x: '-50%' }}
                animate={{
                  y: [-20, TUBE_HEIGHT - (liquidHeight / 100) * TUBE_HEIGHT],
                  opacity: [0, 1, 1, 0]
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: "easeIn"
                }}
              />
            )}

            {/* Splashes */}
            <AnimatePresence>
              {splashes.map((splash) => (
                <motion.div
                  key={splash.id}
                  className="absolute pointer-events-none z-30"
                  style={{ left: '50%', top: splash.y, x: '-50%', y: '-50%' }}
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                >
                  {/* Particles */}
                  <motion.div className="absolute w-1 h-1 bg-cyan-300 rounded-full" animate={{ x: -15, y: -15, opacity: 0 }} transition={{ duration: 0.4 }} />
                  <motion.div className="absolute w-1.5 h-1.5 bg-purple-300 rounded-full" animate={{ x: 15, y: -10, opacity: 0 }} transition={{ duration: 0.5 }} />
                  <motion.div className="absolute w-1 h-1 bg-cyan-200 rounded-full" animate={{ x: 0, y: -20, opacity: 0 }} transition={{ duration: 0.4 }} />
                  {/* Ripple */}
                  <div className="w-8 h-2 rounded-[100%] border border-cyan-300/50" />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Liquid Entity */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 w-full z-0 overflow-hidden"
              style={{
                height: `${liquidHeight}%`,
                background: 'linear-gradient(to top, #6d28d9, #c4b5fd)',
                boxShadow: 'inset 0 10px 20px rgba(167, 139, 250, 0.4)'
              }}
              animate={{ height: `${liquidHeight}%` }}
              transition={{ type: 'spring', stiffness: 50, damping: 15 }}
            >
              {/* Surface Wave using SVG & CSS Keyframes */}
              {liquidHeight > 0 && (
                <div className="absolute top-0 left-0 w-[200%] h-6 -translate-y-2 pointer-events-none z-10">
                  <svg className="w-full h-full animate-wave-slow opacity-80" viewBox="0 0 200 20" preserveAspectRatio="none">
                    <path d="M 0,10 Q 25,2 50,10 T 100,10 T 150,10 T 200,10 L 200,20 L 0,20 Z" fill="#a78bfa" />
                  </svg>
                  <svg className="absolute top-0 left-0 w-full h-full animate-wave-fast opacity-60" viewBox="0 0 200 20" preserveAspectRatio="none">
                    <path d="M 0,10 Q 25,18 50,10 T 100,10 T 150,10 T 200,10 L 200,20 L 0,20 Z" fill="#8b5cf6" />
                  </svg>
                </div>
              )}
            </motion.div>
          </div>
          
          <div className="text-center mt-3">
            <div className="text-xl font-bold text-white tracking-tight">{currentHours.toFixed(1)}h</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold mt-0.5">Current</div>
          </div>
        </div>

        {/* === TARGET TUBE === */}
        <div className="relative flex flex-col items-center">
          <div
            className="relative rounded-b-[20px] rounded-t-[4px] overflow-hidden bg-white/5 border border-white/20 backdrop-blur-sm shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]"
            style={{ width: '56px', height: `${TUBE_HEIGHT}px` }}
          >
            {/* Glass refraction edges (Hyper-realistic) */}
            <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-white/30 via-white/5 to-transparent pointer-events-none z-40 opacity-70 mix-blend-overlay" />
            <div className="absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-white/20 via-white/5 to-transparent pointer-events-none z-40 opacity-60 mix-blend-overlay" />

            {marks.map((mark) => (
              <div key={`t-${mark.hour}`} className="absolute left-0 right-0 flex items-center pointer-events-none z-20" style={{ top: `${mark.y}%` }}>
                <div className="w-1.5 h-[1px] bg-white/30" />
              </div>
            ))}

            <motion.div
              className="absolute left-0 right-0 border-t-2 border-dashed border-pink-400 z-30 pointer-events-none"
              style={{ bottom: `calc(${targetPercent}% - 1px)` }}
            />

            <motion.div
              className="absolute bottom-0 left-0 right-0 w-full z-10"
              style={{
                height: `${targetPercent}%`,
                background: 'linear-gradient(to top, #be185d, #f472b6)', // Neon Pink / Dark Magenta
                opacity: 0.9,
                boxShadow: 'inset 0 10px 20px rgba(244, 114, 182, 0.4)'
              }}
            >
              {/* Static Surface Wave */}
              {targetPercent > 0 && (
                <div className="absolute top-0 left-0 w-[200%] h-4 -translate-y-1.5 pointer-events-none">
                  <svg className="w-full h-full opacity-90" viewBox="0 0 200 20" preserveAspectRatio="none">
                    <path d="M 0,10 Q 25,6 50,10 T 100,10 T 150,10 T 200,10 L 200,20 L 0,20 Z" fill="#f472b6" />
                  </svg>
                </div>
              )}
            </motion.div>
          </div>
          
          <div className="text-center mt-3">
            <div className="text-lg font-bold text-pink-400 tracking-tight drop-shadow-[0_0_8px_rgba(244,114,182,0.4)]">{targetHours}h</div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mt-0.5">Target</div>
          </div>
        </div>
      </div>
    </div>
  );
}
