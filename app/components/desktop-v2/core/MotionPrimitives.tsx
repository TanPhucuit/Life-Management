'use client';

import {
  HTMLAttributes,
  MouseEvent,
  PointerEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  HTMLMotionProps,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from 'framer-motion';
import { MOTION_SPRINGS, useMotionDirector } from './MotionDirector';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export interface MagneticButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  strength?: number;
  glow?: boolean;
}

export function MagneticButton({
  children,
  className = '',
  strength = 11,
  glow = true,
  disabled,
  onPointerMove,
  onPointerLeave,
  onClick,
  style,
  ...props
}: MagneticButtonProps) {
  const { reducedMotion, preferences, pulseActivity } = useMotionDirector();
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const x = useSpring(offsetX, MOTION_SPRINGS.magnetic);
  const y = useSpring(offsetY, MOTION_SPRINGS.magnetic);
  const nextRippleId = useRef(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const resetPosition = () => {
    offsetX.set(0);
    offsetY.set(0);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(event);
    if (disabled || reducedMotion || !preferences.cursorEffects) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const localY = (event.clientY - bounds.top) / bounds.height - 0.5;
    offsetX.set(localX * strength * 2);
    offsetY.set(localY * strength * 2);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(event);
    resetPosition();
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (disabled || event.defaultPrevented || reducedMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ripple: Ripple = {
      id: nextRippleId.current++,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    setRipples((current) => [...current.slice(-2), ripple]);
    pulseActivity('feedback', 360);
  };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      className={`group relative isolate inline-flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-sm font-semibold text-white shadow-[0_12px_38px_rgba(0,0,0,.28)] backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      whileTap={reducedMotion || disabled ? undefined : { scale: 0.96, y: 1 }}
      transition={MOTION_SPRINGS.magnetic}
      style={{ ...style, x, y }}
      {...props}
    >
      {glow && (
        <span className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-cyan-300/0 via-violet-400/0 to-fuchsia-400/0 opacity-0 transition-opacity duration-200 group-hover:from-cyan-300/15 group-hover:via-violet-400/10 group-hover:to-fuchsia-400/15 group-hover:opacity-100" />
      )}
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-60" />
      <span className="relative z-10 contents">{children}</span>
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="pointer-events-none absolute z-0 h-12 w-12 rounded-full border border-cyan-200/60 bg-cyan-200/15"
            style={{ left: ripple.x - 24, top: ripple.y - 24 }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 4.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() =>
              setRipples((current) =>
                current.filter((item) => item.id !== ripple.id),
              )
            }
          />
        ))}
      </AnimatePresence>
    </motion.button>
  );
}

export interface TiltCardProps
  extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  maxTilt?: number;
  lift?: number;
  spotlight?: boolean;
}

export function TiltCard({
  children,
  className = '',
  maxTilt = 4.5,
  lift = 5,
  spotlight = true,
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: TiltCardProps) {
  const { reducedMotion, preferences } = useMotionDirector();
  const targetRotateX = useMotionValue(0);
  const targetRotateY = useMotionValue(0);
  const targetX = useMotionValue(50);
  const targetY = useMotionValue(50);
  const rotateX = useSpring(targetRotateX, MOTION_SPRINGS.magnetic);
  const rotateY = useSpring(targetRotateY, MOTION_SPRINGS.magnetic);
  const spotlightX = useSpring(targetX, MOTION_SPRINGS.magnetic);
  const spotlightY = useSpring(targetY, MOTION_SPRINGS.magnetic);
  const spotlightBackground = useMotionTemplate`radial-gradient(420px circle at ${spotlightX}% ${spotlightY}%, rgba(165, 243, 252, .16), rgba(139, 92, 246, .055) 34%, transparent 68%)`;

  const reset = () => {
    targetRotateX.set(0);
    targetRotateY.set(0);
    targetX.set(50);
    targetY.set(50);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    if (reducedMotion || !preferences.cursorEffects) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const xRatio = (event.clientX - bounds.left) / bounds.width;
    const yRatio = (event.clientY - bounds.top) / bounds.height;
    targetRotateY.set((xRatio - 0.5) * maxTilt * 2);
    targetRotateX.set((0.5 - yRatio) * maxTilt * 2);
    targetX.set(xRatio * 100);
    targetY.set(yRatio * 100);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    reset();
  };

  return (
    <div className="[perspective:1200px]">
      <motion.div
        className={`group relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0b1020]/75 shadow-[0_24px_70px_rgba(0,0,0,.34)] backdrop-blur-2xl ${className}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        whileHover={reducedMotion ? undefined : { y: -lift }}
        transition={MOTION_SPRINGS.magnetic}
        style={{
          ...style,
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        {...props}
      >
        {spotlight && (
          <motion.span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ background: spotlightBackground }}
          />
        )}
        <span className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent" />
        <div className="relative" style={{ transform: 'translateZ(18px)' }}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export interface GlowBorderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  active?: boolean;
  radiusClassName?: string;
}

export function GlowBorder({
  children,
  active = false,
  radiusClassName = 'rounded-[28px]',
  className = '',
  ...props
}: GlowBorderProps) {
  const { shouldAnimate, ambientIntensity } = useMotionDirector();
  const animate = shouldAnimate('ambient');

  return (
    <div
      className={`relative isolate overflow-hidden p-px ${radiusClassName} ${className}`}
      {...props}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[80%] -z-10"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(103,232,249,.9) 54deg, rgba(139,92,246,.88) 108deg, transparent 170deg, rgba(244,114,182,.68) 260deg, transparent 330deg)',
        }}
        animate={
          animate
            ? { rotate: 360, opacity: active ? 0.9 : 0.28 + ambientIntensity * 0.2 }
            : { opacity: active ? 0.8 : 0.3 }
        }
        transition={
          animate
            ? { rotate: { duration: 9, ease: 'linear', repeat: Infinity }, opacity: { duration: 0.2 } }
            : { duration: 0.2 }
        }
      />
      <div className={`relative h-full bg-[#080b16]/95 ${radiusClassName}`}>
        {children}
      </div>
    </div>
  );
}

export interface RollingNumberProps {
  value: number;
  formatter?: (value: number) => string;
  className?: string;
  suffix?: string;
}

export function RollingNumber({
  value,
  formatter = defaultNumberFormatter,
  className = '',
  suffix = '',
}: RollingNumberProps) {
  const { reducedMotion } = useMotionDirector();
  const previousValue = useRef(value);
  const direction = value >= previousValue.current ? 1 : -1;
  const displayValue = formatter(value);

  useEffect(() => {
    previousValue.current = value;
  }, [value]);

  return (
    <span
      className={`inline-flex overflow-hidden tabular-nums ${className}`}
      aria-label={`${displayValue}${suffix}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={`${displayValue}-${suffix}`}
          aria-hidden="true"
          className="inline-block whitespace-nowrap"
          initial={reducedMotion ? false : { y: direction * 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reducedMotion ? undefined : { y: direction * -22, opacity: 0 }}
          transition={MOTION_SPRINGS.sharedLayout}
        >
          {displayValue}
          {suffix}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function defaultNumberFormatter(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
}
