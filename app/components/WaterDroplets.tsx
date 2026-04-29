'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface WaterDropletsProps {
  isActive: boolean;
  count?: number;
}

export function WaterDroplets({ isActive, count = 8 }: WaterDropletsProps) {
  const droplets = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      delay: i * 0.15,
      left: Math.random() * 80 + 10, // 10-90% left position
    }));
  }, [count]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {droplets.map((droplet) => (
        <motion.div
          key={droplet.id}
          className="absolute w-3 h-3 rounded-full bg-cyan-400/40"
          style={{
            left: `${droplet.left}%`,
            top: '-12px',
            boxShadow: '0 0 8px rgba(34, 211, 238, 0.6)',
          }}
          animate={{
            y: 400,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 2.5,
            delay: droplet.delay,
            ease: 'easeIn',
            repeat: Infinity,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Enhanced water droplet effect with blur and splash animation
 */
export function WaterDropletsAdvanced({ isActive, count = 12 }: WaterDropletsProps) {
  const droplets = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      delay: (i % 4) * 0.3, // 4 droplets per wave
      left: Math.random() * 70 + 15,
      size: Math.random() * 4 + 2, // 2-6px
    }));
  }, [count]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {droplets.map((droplet) => (
        <motion.div
          key={droplet.id}
          className="absolute rounded-full blur-sm"
          style={{
            left: `${droplet.left}%`,
            top: '-20px',
            width: `${droplet.size}px`,
            height: `${droplet.size}px`,
            background: `radial-gradient(circle, rgba(34, 211, 238, 0.8), rgba(34, 211, 238, 0.2))`,
            boxShadow: `0 0 ${droplet.size * 2}px rgba(34, 211, 238, 0.7)`,
          }}
          animate={{
            y: 420,
            x: Math.sin(droplet.id) * 20, // Slight horizontal sway
            opacity: [0.8, 0.8, 0],
            scale: [1, 1, 0.5],
          }}
          transition={{
            duration: 2.8,
            delay: droplet.delay,
            ease: 'easeIn',
            repeat: Infinity,
          }}
        />
      ))}

      {/* Splash effect at bottom */}
      {droplets.map((droplet) => (
        <motion.div
          key={`splash-${droplet.id}`}
          className="absolute w-8 h-1 rounded-full"
          style={{
            left: `${droplet.left - 2}%`,
            bottom: '0',
            background: `linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.6), transparent)`,
          }}
          animate={{
            opacity: [0, 0.5, 0],
            scaleX: [0, 1, 0],
          }}
          transition={{
            duration: 0.6,
            delay: droplet.delay + 2.8,
            repeat: Infinity,
          }}
        />
      ))}
    </div>
  );
}
