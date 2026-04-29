'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface WaterDropletStreamProps {
  isActive: boolean;
  count?: number;
  sourceX?: number; // Percentage position from left (default center)
  duration?: number;
  color?: string; // Tailwind color class
}

/**
 * Enhanced water droplet stream with physics-based animation
 */
export function WaterDropletStream({
  isActive,
  count = 8,
  sourceX = 50,
  duration = 3,
  color = 'cyan',
}: WaterDropletStreamProps) {
  const droplets = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        delay: (i * duration) / count, // Evenly spaced timing
        xOffset: Math.sin(i * 0.5) * 8, // Slight horizontal variation
        size: Math.random() * 2 + 1.5, // 1.5-3.5px
      })),
    [count, duration]
  );

  if (!isActive) return null;

  const colorMap: Record<string, string> = {
    cyan: 'rgba(34, 211, 238, 0.7)',
    blue: 'rgba(59, 130, 246, 0.7)',
    purple: 'rgba(168, 85, 247, 0.7)',
    pink: 'rgba(236, 72, 153, 0.7)',
  };

  const dropletColor = colorMap[color] || colorMap.cyan;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {droplets.map((droplet) => (
        <motion.div
          key={droplet.id}
          className="absolute rounded-full"
          style={{
            left: `calc(${sourceX}% + ${droplet.xOffset}px)`,
            top: '-20px',
            width: `${droplet.size}px`,
            height: `${droplet.size * 1.3}px`,
            backgroundColor: dropletColor,
            boxShadow: `0 0 ${droplet.size + 2}px ${dropletColor}`,
            filter: 'blur(0.5px)',
          }}
          animate={{
            y: 400,
            x: Math.sin(droplet.delay * 2) * 12,
            opacity: [0.8, 0.8, 0],
            scale: [1, 1, 0.7],
          }}
          transition={{
            duration,
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
          className="absolute h-1 rounded-full pointer-events-none"
          style={{
            left: `calc(${sourceX - 2}% + ${droplet.xOffset}px)`,
            bottom: '0',
            width: `${droplet.size * 4}px`,
            background: `linear-gradient(90deg, transparent, ${dropletColor}, transparent)`,
          }}
          animate={{
            opacity: [0, 0.6, 0],
            scaleX: [0, 1, 0],
            width: `${droplet.size * 6}px`,
          }}
          transition={{
            duration: 0.4,
            delay: droplet.delay + duration - 0.5,
            repeat: Infinity,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Simple particle-based water droplet effect
 */
export function WaterDropletParticles({
  isActive,
  count = 12,
  position = { x: '50%', y: '0%' },
}: {
  isActive: boolean;
  count?: number;
  position?: { x: string; y: string };
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        angle: (i / count) * Math.PI * 2,
        velocity: 2 + Math.random() * 3,
      })),
    [count]
  );

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-1 h-1 rounded-full bg-cyan-400"
          style={{
            left: position.x,
            top: position.y,
            boxShadow: '0 0 6px rgba(34, 211, 238, 0.8)',
          }}
          animate={{
            x: Math.cos(particle.angle) * 80 * particle.velocity,
            y: Math.sin(particle.angle) * 80 * particle.velocity,
            opacity: [1, 0],
          }}
          transition={{
            duration: 1.5,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}
