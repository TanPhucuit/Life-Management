'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useCallback } from 'react';

interface SplashEvent {
  id: number;
  x: number; // px from left of tube
  y: number; // px from top (liquid surface Y)
}

interface DropletSplashParticlesProps {
  /** Whether droplets are actively falling */
  isActive: boolean;
  /** Liquid surface Y position in px (from top of tube container) */
  liquidSurfaceY: number;
  /** Width of the tube in px */
  tubeWidth?: number;
}

let splashCounter = 0;

export function DropletSplashParticles({
  isActive,
  liquidSurfaceY,
  tubeWidth = 72,
}: DropletSplashParticlesProps) {
  const [splashes, setSplashes] = useState<SplashEvent[]>([]);

  // Trigger a new splash at a random X on the surface every ~1.5s when active
  const triggerSplash = useCallback(() => {
    if (!isActive) return;
    const id = splashCounter++;
    const x = tubeWidth * 0.25 + Math.random() * tubeWidth * 0.5; // center region
    setSplashes((prev) => [...prev.slice(-5), { id, x, y: liquidSurfaceY }]);
  }, [isActive, liquidSurfaceY, tubeWidth]);

  useEffect(() => {
    if (!isActive) return;
    // Stagger initial trigger
    const delays = [200, 800, 1400, 2000, 2600];
    const timers = delays.map((d) => setTimeout(triggerSplash, d));
    const interval = setInterval(triggerSplash, 1500);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [isActive, triggerSplash]);

  const removeSplash = (id: number) => {
    setSplashes((prev) => prev.filter((s) => s.id !== id));
  };

  // Particle directions: fan-out upward
  const particleAngles = [-70, -50, -30, 30, 50, 70];

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>
      <AnimatePresence>
        {splashes.map((splash) => (
          <div key={splash.id} style={{ position: 'absolute', left: splash.x, top: splash.y }}>
            {/* Ripple ring */}
            <motion.div
              style={{
                position: 'absolute',
                borderRadius: '50%',
                border: '1px solid rgba(34, 211, 238, 0.6)',
                width: 4,
                height: 4,
                transform: 'translate(-50%, -50%)',
              }}
              initial={{ width: 4, height: 4, opacity: 0.7 }}
              animate={{ width: 28, height: 10, opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              onAnimationComplete={() => removeSplash(splash.id)}
            />

            {/* Second ripple (delayed) */}
            <motion.div
              style={{
                position: 'absolute',
                borderRadius: '50%',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                width: 4,
                height: 4,
                transform: 'translate(-50%, -50%)',
              }}
              initial={{ width: 4, height: 4, opacity: 0.5 }}
              animate={{ width: 40, height: 14, opacity: 0 }}
              transition={{ duration: 0.75, delay: 0.08, ease: 'easeOut' }}
            />

            {/* Splash particles */}
            {particleAngles.map((angleDeg, idx) => {
              const rad = (angleDeg * Math.PI) / 180;
              const speed = 14 + Math.random() * 12;
              return (
                <motion.div
                  key={idx}
                  style={{
                    position: 'absolute',
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: idx % 2 === 0
                      ? 'rgba(34, 211, 238, 0.85)'
                      : 'rgba(168, 85, 247, 0.75)',
                    boxShadow: '0 0 4px rgba(34, 211, 238, 0.7)',
                    transform: 'translate(-50%, -50%)',
                  }}
                  initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                  animate={{
                    x: Math.cos(rad) * speed,
                    y: Math.sin(rad) * speed - 8, // arc upward
                    opacity: 0,
                    scale: 0.3,
                  }}
                  transition={{
                    duration: 0.45,
                    delay: idx * 0.02,
                    ease: [0.2, 0.8, 0.4, 1],
                  }}
                />
              );
            })}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
