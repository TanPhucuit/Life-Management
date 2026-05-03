'use client';

import { motion } from 'framer-motion';
import { CSSProperties, ReactNode } from 'react';

// Shimmer effect for progress bars
export function ShimmerProgressBar({
  percentage,
  className = 'h-3',
  color = 'from-blue-500 to-cyan-500',
}: {
  percentage: number;
  className?: string;
  color?: string;
}) {
  return (
    <div className={`w-full bg-white/5 rounded-full overflow-hidden ${className}`}>
      <motion.div
        className={`h-full bg-gradient-to-r ${color} rounded-full relative overflow-hidden`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
        animate={{
          backgroundPosition: ['0%', '100%'],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <div
          className="absolute inset-0 bg-white/20"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`,
            backgroundSize: '100% 100%',
            animation: 'shimmer 2s infinite',
          }}
        />
      </motion.div>
    </div>
  );
}

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glowing?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  title?: string;
  description?: string;
  style?: CSSProperties;
}

export function BentoCard({
  children,
  className = '',
  hover = true,
  glowing = false,
  onClick,
  icon,
  title,
  description,
  style,
}: BentoCardProps) {
  return (
    <motion.div
      className={`
        relative rounded-[32px] overflow-hidden
        backdrop-blur-sm
        ${hover ? 'cursor-pointer' : ''}
        ${className}
      `}
      style={{
        border: '0.5px solid rgba(255, 255, 255, 0.05)',
        background: `linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)`,
        boxShadow: glowing 
          ? '0 0 32px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        ...style,
      }}
      whileHover={
        hover
          ? {
              boxShadow: '0 0 40px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }
          : undefined
      }
      whileTap={hover ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
    >
      {/* Gradient background layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, transparent 100%)`,
        }}
      />

      {/* Noise overlay for texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='200' height='200' fill='white' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {(icon || title || description) && (
          <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/5">
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-bold text-white mb-1">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-zinc-500">
                  {description}
                </p>
              )}
            </div>
            {icon && (
              <div className="ml-4 text-white/40 flex-shrink-0">
                {icon}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </motion.div>
  );
}

interface BentoCard3DProps extends BentoCardProps {
}

export function BentoCard3D({
  children,
  className = '',
  hover = true,
  glowing = false,
  onClick,
  icon,
  title,
  description,
  style,
}: BentoCard3DProps) {

  return (
    <motion.div
      className={`
        relative rounded-[32px] overflow-hidden
        backdrop-blur-sm
        ${hover ? 'cursor-pointer' : ''}
        ${className}
      `}
      style={{
        border: '0.5px solid rgba(255, 255, 255, 0.05)',
        background: `linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)`,
        boxShadow: glowing
          ? '0 0 32px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        ...style,
      }}
      animate={{
        boxShadow: glowing
          ? '0 0 32px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
      whileHover={
        hover
          ? {
              boxShadow: '0 0 40px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }
          : undefined
      }
      whileTap={hover ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
    >
      {/* Gradient background layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, transparent 100%)`,
        }}
      />

      {/* Noise overlay for texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='200' height='200' fill='white' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {(icon || title || description) && (
          <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/5">
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-bold text-white mb-1">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-zinc-500">
                  {description}
                </p>
              )}
            </div>
            {icon && (
              <div className="ml-4 text-white/40 flex-shrink-0">
                {icon}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </motion.div>
  );
}
