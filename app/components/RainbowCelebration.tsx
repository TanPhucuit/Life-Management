'use client';

import { motion } from 'framer-motion';

interface RainbowCelebrationProps {
  isActive: boolean;
}

export function RainbowCelebration({ isActive }: RainbowCelebrationProps) {
  if (!isActive) return null;

  return (
    <>
      {/* Main rainbow arc behind the card */}
      <motion.div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Gradient rainbow effect */}
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(
              ellipse 800px 400px at 50% 100%,
              rgba(255, 0, 128, 0.15) 0%,
              rgba(255, 100, 0, 0.12) 14%,
              rgba(255, 200, 0, 0.1) 28%,
              rgba(0, 200, 0, 0.1) 42%,
              rgba(0, 100, 255, 0.12) 56%,
              rgba(100, 0, 255, 0.15) 70%,
              transparent 100%
            )`,
            filter: 'blur(40px)',
          }}
          animate={{
            opacity: [0.6, 0.8, 0.6],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.div>

      {/* Rainbow particles radiating outward */}
      {[...Array(6)].map((_, i) => {
        const colors = [
          'from-pink-500 to-pink-400',
          'from-orange-500 to-orange-400',
          'from-yellow-500 to-yellow-400',
          'from-green-500 to-green-400',
          'from-blue-500 to-blue-400',
          'from-purple-500 to-purple-400',
        ];

        const angle = (i / 6) * Math.PI * 2;
        const distance = 300;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;

        return (
          <motion.div
            key={`particle-${i}`}
            className={`absolute w-4 h-4 rounded-full bg-gradient-to-br ${colors[i]} pointer-events-none`}
            style={{
              left: '50%',
              top: '50%',
              marginLeft: '-8px',
              marginTop: '-8px',
              boxShadow: `0 0 16px rgba(${[255, 100, 0][i % 3]}, ${[0, 150, 255][i % 3]}, 200, 0.8)`,
            }}
            animate={{
              x: [0, x],
              y: [0, y],
              opacity: [1, 0],
              scale: [1, 0],
            }}
            transition={{
              duration: 2,
              delay: i * 0.1,
              ease: 'easeOut',
              repeat: Infinity,
              repeatDelay: 1,
            }}
          />
        );
      })}

      {/* Pulsing glow effect at center */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(
            circle 600px at 50% 50%,
            rgba(255, 200, 100, 0.2),
            transparent 70%
          )`,
        }}
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </>
  );
}

/**
 * Simpler rainbow celebration with just the arc effect
 */
export function RainbowCelebrationSimple({ isActive }: RainbowCelebrationProps) {
  if (!isActive) return null;

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute inset-x-0 bottom-0 h-96"
        style={{
          background: `conic-gradient(
            from 0deg,
            rgba(255, 0, 128, 0.2),
            rgba(255, 100, 0, 0.15),
            rgba(255, 200, 0, 0.12),
            rgba(0, 200, 0, 0.15),
            rgba(0, 100, 255, 0.15),
            rgba(100, 0, 255, 0.2)
          )`,
          filter: 'blur(35px)',
          clipPath: 'ellipse(800px 400px at 50% 100%)',
        }}
        animate={{
          opacity: [0.5, 0.7, 0.5],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </motion.div>
  );
}
