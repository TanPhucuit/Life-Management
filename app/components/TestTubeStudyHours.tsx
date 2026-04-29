'use client';

import { motion } from 'framer-motion';
import { useMemo, useState, useEffect } from 'react';

interface TestTubeStudyHoursProps {
  currentHours: number;
  targetHours: number;
  isRunning?: boolean;
  sunMood?: 'sad' | 'happy' | 'celebrate';
}

// Single liquid entity with proper physics
const TUBE_HEIGHT = 320; // pixels
const TUBE_MAX_HOURS = 12; // 0-12h scale

export function TestTubeStudyHours({
  currentHours,
  targetHours,
  isRunning = false,
  sunMood = 'sad',
}: TestTubeStudyHoursProps) {
  const [liquidHeight, setLiquidHeight] = useState(0);
  
  // Calculate liquid height as percentage (capped at 100%)
  const currentPercent = Math.min((currentHours / TUBE_MAX_HOURS) * 100, 100);
  const targetPercent = Math.min((targetHours / TUBE_MAX_HOURS) * 100, 100);
  const isCelebrating = sunMood === 'celebrate';
  const isOverflowing = currentHours > TUBE_MAX_HOURS;

  // Smooth liquid height update
  useEffect(() => {
    setLiquidHeight(currentPercent);
  }, [currentPercent]);

  // Generate graduation marks (0-12h only)
  const marks = useMemo(
    () =>
      Array.from({ length: 13 }).map((_, i) => ({
        hour: i,
        y: ((12 - i) / 12) * 100, // From bottom to top
      })),
    []
  );

  // Generate water droplets with collision detection
  const droplets = useMemo(
    () =>
      isRunning
        ? Array.from({ length: 5 }).map((_, i) => ({
            id: i,
            delay: (i % 3) * 0.4,
            randomX: Math.random() * 8 - 4, // -4 to +4 offset
            collisionY: TUBE_HEIGHT - (liquidHeight / 100) * TUBE_HEIGHT, // Liquid surface Y
          }))
        : [],
    [isRunning, liquidHeight]
  );

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6">
      {/* Header with Sun Icon */}
      <div className="w-full text-center mb-4">
        <motion.svg
          width="64"
          height="64"
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
            const x2 = 40 + Math.cos(rad) * 30;
            const y2 = 40 + Math.sin(rad) * 30;
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

          {/* Sun body */}
          <circle cx="40" cy="40" r="14" fill="url(#sunGrad)" />

          {/* Sun shine (3D effect) */}
          <circle cx="33" cy="31" r="3.5" fill="rgba(255, 255, 255, 0.5)" />

          {/* Face */}
          <circle cx="34" cy="37" r="1.5" fill="rgba(50, 50, 50, 0.9)" />
          <circle cx="46" cy="37" r="1.5" fill="rgba(50, 50, 50, 0.9)" />

          {/* Mouth - Dynamic */}
          {sunMood === 'sad' ? (
            <path
              d="M 35,42 Q 40,40 45,42"
              stroke="rgba(100, 100, 100, 0.7)"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M 35,42 Q 40,44 45,42"
              stroke="rgba(50, 50, 50, 0.8)"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Tears - Show when sad */}
          {sunMood === 'sad' && (
            <>
              <motion.circle
                cx="34"
                cy="40"
                r="0.8"
                fill="rgba(100, 150, 255, 0.6)"
                animate={{ y: [0, 5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.circle
                cx="46"
                cy="40"
                r="0.8"
                fill="rgba(100, 150, 255, 0.6)"
                animate={{ y: [0, 5] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
            </>
          )}
        </motion.svg>
      </div>

      {/* Tubes Container - Horizontal layout */}
      <div className="flex gap-8 items-end justify-center flex-1">
        {/* Current Hours Tube */}
        <div className="relative flex flex-col items-center">
          {/* Cloud Icon - Source of Water Droplets */}
          {isRunning && (
            <motion.svg
              width="28"
              height="20"
              viewBox="0 0 32 24"
              className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6 z-20"
              animate={{ y: [0, 2] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <path
                d="M 4,16 Q 2,12 6,8 Q 4,4 10,3 Q 12,1 16,2 Q 20,1 22,4 Q 28,5 28,12 Q 28,18 20,20 L 6,20 Q 2,18 4,16 Z"
                fill="rgba(150, 200, 255, 0.55)"
                stroke="rgba(100, 150, 255, 0.5)"
                strokeWidth="0.5"
              />
            </motion.svg>
          )}

          {/* Tube Glass Container */}
          <div
            className="relative rounded-b-[18px] rounded-t-2xl overflow-hidden border-2 border-white/20 bg-white/5 backdrop-blur-sm"
            style={{ width: '72px', height: `${TUBE_HEIGHT}px` }}
          >
            {/* Graduation Marks */}
            {marks.map((mark) => (
              <div
                key={`mark-current-${mark.hour}`}
                className="absolute left-0 right-0 flex items-center pointer-events-none"
                style={{ top: `${mark.y}%` }}
              >
                <div className="w-1 h-px bg-white/20" />
                <span className="text-[9px] text-white/40 ml-0.5 w-8">
                  {mark.hour}h
                </span>
              </div>
            ))}

            {/* Water Droplets Stream with Collision Detection */}
            {droplets.map((droplet) => {
              // Only show glow for droplets that haven't reached liquid yet
              const showGlow = droplet.delay < 1.0;
              return (
                <motion.div
                  key={`droplet-${droplet.id}`}
                  className="absolute w-1.5 h-2 rounded-full pointer-events-none"
                  style={{
                    left: `calc(50% + ${droplet.randomX}px)`,
                    top: '-16px',
                    background: 'rgba(34, 211, 238, 0.7)',
                    boxShadow: showGlow ? '0 0 5px rgba(34, 211, 238, 0.8)' : 'none',
                  }}
                  animate={{
                    y: droplet.collisionY + 8, // Stop at liquid surface
                    opacity: [1, 1, 0],
                    x: [0, Math.sin(droplet.id * 0.5) * 6],
                  }}
                  transition={{
                    duration: 2.2,
                    delay: droplet.delay,
                    ease: 'easeIn',
                    repeat: Infinity,
                  }}
                />
              );
            })}

            {/* SINGLE LIQUID ENTITY - Using clip-path for clean rendering */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 w-full"
              style={{
                height: `${liquidHeight}%`,
                background: 'linear-gradient(to top, rgba(139, 92, 246, 0.8), rgba(168, 85, 247, 0.6))',
                clipPath: 'inset(0 0 0 0)', // Ensures clean clipping
              }}
              animate={{ height: `${liquidHeight}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {/* Wave animation on liquid surface */}
              {liquidHeight > 0 && (
                <motion.svg
                  className="absolute -top-1 left-0 right-0 w-full overflow-visible"
                  height="16"
                  viewBox="0 0 100 16"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <filter id="liquidWave">
                      <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.02"
                        numOctaves="1"
                        result="noise"
                        seed="2"
                      />
                      <feDisplacementMap
                        in="SourceGraphic"
                        in2="noise"
                        scale="3"
                        xChannelSelector="R"
                        yChannelSelector="G"
                      />
                    </filter>
                  </defs>

                  <motion.path
                    d="M0,8 Q25,4 50,8 T100,8 L100,16 L0,16 Z"
                    fill="rgba(168, 85, 247, 0.9)"
                    filter="url(#liquidWave)"
                    animate={{
                      d: isRunning
                        ? [
                            'M0,8 Q25,4 50,8 T100,8 L100,16 L0,16 Z',
                            'M0,8 Q25,12 50,8 T100,8 L100,16 L0,16 Z',
                            'M0,8 Q25,4 50,8 T100,8 L100,16 L0,16 Z',
                          ]
                        : 'M0,8 Q25,6 50,8 T100,8 L100,16 L0,16 Z',
                    }}
                    transition={
                      isRunning
                        ? {
                            duration: 2.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }
                        : { duration: 0.3 }
                    }
                  />
                </motion.svg>
              )}
            </motion.div>

            {/* Overflow Glow - When exceeding 12h */}
            {isOverflowing && (
              <motion.div
                className="absolute inset-0 rounded-b-[18px] rounded-t-2xl pointer-events-none"
                animate={{ boxShadow: ['0 0 8px rgba(168, 85, 247, 0.4)', '0 0 16px rgba(168, 85, 247, 0.8)', '0 0 8px rgba(168, 85, 247, 0.4)'] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>

          {/* Current Hours Label */}
          <div className="text-center mt-2">
            <motion.div className="text-xl font-bold text-white">
              {currentHours.toFixed(1)}h
            </motion.div>
            <div className="text-[11px] text-white/50">Current</div>
          </div>
        </div>

        {/* Target Hours Tube */}
        <div className="relative flex flex-col items-center">
          {/* Tube Glass Container */}
          <div
            className="relative rounded-b-[18px] rounded-t-2xl overflow-hidden border-2 border-white/30 bg-white/8 backdrop-blur-sm"
            style={{ width: '72px', height: `${TUBE_HEIGHT}px` }}
          >
            {/* Graduation Marks */}
            {marks.map((mark) => (
              <div
                key={`mark-target-${mark.hour}`}
                className="absolute left-0 right-0 flex items-center pointer-events-none"
                style={{ top: `${mark.y}%` }}
              >
                <div className="w-1 h-px bg-white/30" />
                <span className="text-[9px] text-white/50 ml-0.5 w-8">
                  {mark.hour}h
                </span>
              </div>
            ))}

            {/* Target Marker Line */}
            <motion.div
              className="absolute left-0 right-0 border-t-2 border-dashed border-cyan-400/70 z-10 pointer-events-none"
              style={{ bottom: `calc(${targetPercent}% - 1px)` }}
            >
              <span className="absolute right-full mr-2 text-[10px] text-cyan-400/80 font-semibold whitespace-nowrap leading-none">
                {targetHours}h
              </span>
            </motion.div>

            {/* SINGLE LIQUID ENTITY for Target (Static, Reference) */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 w-full"
              style={{
                height: `${targetPercent}%`,
                background: 'linear-gradient(to top, rgba(59, 130, 246, 0.65), rgba(96, 165, 250, 0.45))',
              }}
            />

            {/* Static wave surface for target */}
            {targetPercent > 0 && (
              <svg
                className="absolute bottom-0 left-0 right-0 w-full pointer-events-none"
                height="14"
                viewBox="0 0 100 14"
                preserveAspectRatio="none"
                style={{ bottom: `${targetPercent}%` }}
              >
                <path
                  d="M0,7 Q25,3 50,7 T100,7 L100,14 L0,14 Z"
                  fill="rgba(96, 165, 250, 0.8)"
                />
              </svg>
            )}
          </div>

          {/* Target Hours Label */}
          <div className="text-center mt-2">
            <motion.div className="text-xl font-bold text-cyan-400">
              {targetHours}h
            </motion.div>
            <div className="text-[11px] text-white/50">Target</div>
          </div>
        </div>
      </div>

      {/* Progress Information */}
      <div className="w-full text-center mt-4">
        <div className="text-sm text-white/70">
          <span className="text-white font-bold">{currentPercent.toFixed(0)}%</span>
          {isCelebrating && (
            <span className="ml-2">🎉 Target Reached!</span>
          )}
          {isOverflowing && (
            <span className="ml-2 text-purple-300">✨ Exceeding Limit!</span>
          )}
        </div>
      </div>
    </div>
  );
}
