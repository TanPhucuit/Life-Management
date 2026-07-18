'use client';

import {
  CSSProperties,
  PointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import {
  BarChart3,
  CalendarDays,
  Command,
  Home,
  ListTodo,
  Languages,
  LogOut,
  Orbit,
  Plus,
  Settings,
  Sparkles,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CommandMenu, DesktopCommand } from './core/CommandMenu';
import {
  MOTION_SPRINGS,
  MotionDirectorProvider,
  useMotionDirector,
} from './core/MotionDirector';

const navigation = [
  { id: 'today', href: '/overview', label: 'Today', icon: Home },
  { id: 'plan', href: '/tasks', label: 'Plan', icon: ListTodo },
  {
    id: 'spaces',
    href: '/tasks?mode=spaces',
    label: 'Spaces',
    icon: Orbit,
  },
  { id: 'focus', href: '/cycles', label: 'Focus', icon: Timer },
  { id: 'insights', href: '/analytics', label: 'Insights', icon: BarChart3 },
] as const;

export interface DesktopShellProps {
  children: ReactNode;
  username?: string;
  onSignOut?: () => void;
  commands?: readonly DesktopCommand[];
  sceneLayer?: ReactNode;
}

export default function DesktopShell(props: DesktopShellProps) {
  return (
    <MotionDirectorProvider>
      <DesktopShellFrame {...props} />
    </MotionDirectorProvider>
  );
}

export function DesktopShellFrame({
  children,
  username = 'Explorer',
  onSignOut,
  commands = [],
  sceneLayer,
}: DesktopShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { reducedMotion, pulseActivity } = useMotionDirector();
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandKey, setCommandKey] = useState('Ctrl K');
  const search = searchParams.toString();
  const routeKey = search ? `${pathname}?${search}` : pathname;

  const navigate = useCallback(
    (href: string) => {
      if (href === routeKey) return;
      pulseActivity('transition', 760);
      router.push(href);
    },
    [pulseActivity, routeKey, router],
  );

  useEffect(() => {
    setCommandKey(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => pulseActivity('transition', 680), [pulseActivity, routeKey]);

  const allCommands = useMemo<readonly DesktopCommand[]>(() => {
    const defaults: DesktopCommand[] = [
      ...navigation.map(({ id, href, label, icon: Icon }) => ({
        id: `navigate-${id}`,
        label: `Open ${label}`,
        description: `Navigate to the ${label.toLowerCase()} workspace`,
        keywords: ['navigate', label, id],
        group: 'Navigation',
        icon: <Icon className="h-4 w-4" />,
        onSelect: () => navigate(href),
      })),
      {
        id: 'open-calendar',
        label: 'Open Calendar',
        description: 'Plan tasks on the calendar canvas',
        keywords: ['date', 'month', 'week', 'schedule'],
        group: 'Navigation',
        icon: <CalendarDays className="h-4 w-4" />,
        onSelect: () => navigate('/calendar'),
      },
      {
        id: 'open-ielts',
        label: 'Open IELTS Lab',
        description: 'Explore all four learning-skill prisms',
        keywords: ['reading', 'listening', 'writing', 'speaking', 'space'],
        group: 'Navigation',
        icon: <Languages className="h-4 w-4" />,
        onSelect: () => navigate('/ielts'),
      },
      {
        id: 'create-task',
        label: 'Create a task',
        description: 'Capture a new task in your plan',
        keywords: ['new', 'quick capture', 'inbox'],
        group: 'Actions',
        shortcut: 'N',
        icon: <Plus className="h-4 w-4" />,
        onSelect: () => navigate('/tasks?intent=create'),
      },
      {
        id: 'start-focus',
        label: 'Start a focus session',
        description: 'Enter the full-screen Focus Reactor',
        keywords: ['timer', 'deep work', 'cycle'],
        group: 'Actions',
        shortcut: 'F',
        icon: <Timer className="h-4 w-4" />,
        onSelect: () => navigate('/cycles?intent=start'),
      },
      {
        id: 'open-settings',
        label: 'Experience settings',
        description: 'Tune theme, motion, celebrations, and visual quality',
        keywords: ['quality', 'effects', 'theme', 'preferences'],
        group: 'System',
        icon: <Settings className="h-4 w-4" />,
        onSelect: () => navigate('/settings'),
      },
    ];

    if (onSignOut) {
      defaults.push({
        id: 'sign-out',
        label: 'Sign out',
        description: 'End this Life OS session',
        keywords: ['logout', 'account'],
        group: 'System',
        icon: <LogOut className="h-4 w-4" />,
        onSelect: onSignOut,
      });
    }

    const merged = new Map(defaults.map((command) => [command.id, command]));
    commands.forEach((command) => merged.set(command.id, command));
    return [...merged.values()];
  }, [commands, navigate, onSignOut]);

  return (
    <div className="experience-v2 relative min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Atmosphere commandOpen={commandOpen} />
      {sceneLayer && (
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
          {sceneLayer}
        </div>
      )}

      <OrbitalNavigation
        pathname={pathname}
        search={search}
        onNavigate={navigate}
        onOpenCommand={() => setCommandOpen(true)}
        username={username}
      />

      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-24 items-center justify-between pl-[132px] pr-8">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--glass)] px-4 py-2 shadow-[var(--shadow-sm)] backdrop-blur-2xl">
          <span className="relative flex h-2 w-2">
            {!reducedMotion && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[var(--foreground-muted)]">
            Aurora Life OS
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="pointer-events-auto flex min-h-11 items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--glass)] px-4 text-xs font-medium text-[var(--foreground-muted)] shadow-[var(--shadow-sm)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:text-[var(--foreground)]"
        >
          <Command className="h-4 w-4 text-cyan-400" />
          Search or run a command
          <kbd className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-[10px] text-[var(--foreground-subtle)]">
            {commandKey}
          </kbd>
        </button>
      </header>

      <AnimatePresence initial={false} mode="popLayout">
        <motion.main
          id="main-content"
          key={routeKey}
          className="relative z-10 h-dvh overflow-y-auto pl-[116px] pr-4 pt-24 [scrollbar-gutter:stable]"
          initial={
            reducedMotion
            ? { opacity: 0 }
              : { opacity: 0, y: 22, scale: 0.994 }
          }
          animate={{
            opacity: commandOpen ? 0.62 : 1,
            y: 0,
            scale: commandOpen ? 0.985 : 1,
          }}
          exit={
            reducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -14, scale: 1.006 }
          }
          transition={
            reducedMotion
              ? { duration: 0.1 }
              : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
          }
        >
          <div className="mx-auto min-h-[calc(100dvh-6rem)] max-w-[1840px] pb-8">
            {children}
          </div>
        </motion.main>
      </AnimatePresence>

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        commands={allCommands}
      />
    </div>
  );
}

interface OrbitalNavigationProps {
  pathname: string;
  search: string;
  username: string;
  onNavigate: (href: string) => void;
  onOpenCommand: () => void;
}

function OrbitalNavigation({
  pathname,
  search,
  username,
  onNavigate,
  onOpenCommand,
}: OrbitalNavigationProps) {
  const { reducedMotion } = useMotionDirector();
  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[108px] items-center justify-center py-6">
      <div className="relative flex max-h-[760px] min-h-[590px] w-[76px] flex-col items-center rounded-[38px] border border-[var(--border)] bg-[var(--glass)] px-2 py-3 shadow-[0_28px_90px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-3xl">
        <span className="pointer-events-none absolute -inset-3 -z-10 rounded-[48px] border border-cyan-300/[0.06]" />
        <span className="pointer-events-none absolute -left-4 top-24 h-44 w-px bg-gradient-to-b from-transparent via-violet-400/30 to-transparent" />

        <button
          type="button"
          onClick={onOpenCommand}
          className="group relative grid h-12 w-12 place-items-center rounded-full border border-cyan-200/20 bg-gradient-to-br from-cyan-300/20 via-violet-500/20 to-fuchsia-400/20 text-[var(--foreground)] shadow-[0_0_32px_rgba(103,232,249,.13)]"
          aria-label="Open command menu"
        >
          <motion.span
            className="absolute inset-1 rounded-full border border-dashed border-cyan-200/30"
            animate={reducedMotion ? undefined : { rotate: 360 }}
            transition={
              reducedMotion
                ? undefined
                : { duration: 14, ease: 'linear', repeat: Infinity }
            }
          />
          <Sparkles className="relative h-5 w-5" />
        </button>

        <nav className="my-auto flex flex-col items-center gap-3" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = isNavigationActive(item.id, pathname, search);
            return (
              <OrbitalNavItem
                key={item.id}
                item={item}
                active={active}
                onNavigate={onNavigate}
              />
            );
          })}
        </nav>

        <Link
          href="/settings"
          aria-label={`Open settings for ${username}`}
          title="Experience settings"
          className="group relative grid h-12 w-12 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] text-sm font-bold text-[var(--foreground)] transition hover:border-violet-400/30"
        >
          {username.slice(0, 1).toUpperCase()}
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)]">
            <Settings className="h-2.5 w-2.5" />
          </span>
        </Link>
      </div>
    </aside>
  );
}

type NavigationItem = (typeof navigation)[number];

function OrbitalNavItem({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  const { reducedMotion, preferences } = useMotionDirector();
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, MOTION_SPRINGS.magnetic);
  const y = useSpring(targetY, MOTION_SPRINGS.magnetic);
  const Icon = item.icon;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || !preferences.cursorEffects) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    targetX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 11);
    targetY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 11);
  };

  const reset = () => {
    targetX.set(0);
    targetY.set(0);
  };

  return (
    <motion.div
      className="group relative"
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{ x, y }}
      whileHover={reducedMotion ? undefined : { scale: 1.08 }}
      transition={MOTION_SPRINGS.magnetic}
    >
      <Link
        href={item.href}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(item.href);
        }}
        aria-current={active ? 'page' : undefined}
        className={`relative grid h-12 w-12 place-items-center rounded-2xl border transition-colors duration-200 ${
          active
            ? 'border-cyan-200/25 text-cyan-300'
            : 'border-transparent text-[var(--foreground-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]'
        }`}
      >
        {active && (
          <motion.span
            layoutId="desktop-orbital-nav-active"
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-300/15 via-violet-400/10 to-fuchsia-400/10 shadow-[0_0_28px_rgba(103,232,249,.12)]"
            transition={MOTION_SPRINGS.sharedLayout}
          >
            <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_13px_rgba(103,232,249,.9)]" />
            <span className="absolute inset-x-2 -bottom-1 h-2 rounded-full bg-violet-400/20 blur-md" />
          </motion.span>
        )}
        <Icon className="relative h-[19px] w-[19px]" />
      </Link>
      <span className="pointer-events-none absolute left-[58px] top-1/2 z-50 -translate-y-1/2 translate-x-2 whitespace-nowrap rounded-xl border border-white/10 bg-[#080b16]/95 px-3 py-2 text-[11px] font-semibold text-white opacity-0 shadow-xl backdrop-blur-xl transition duration-150 group-hover:translate-x-0 group-hover:opacity-100">
        {item.label}
      </span>
    </motion.div>
  );
}

function isNavigationActive(id: NavigationItem['id'], pathname: string, search: string) {
  const spacesMode = new URLSearchParams(search).get('mode') === 'spaces';
  if (id === 'today') return pathname === '/overview';
  if (id === 'plan') {
    return pathname.startsWith('/calendar') || (pathname === '/tasks' && !spacesMode);
  }
  if (id === 'spaces') {
    return pathname === '/ielts' || (pathname === '/tasks' && spacesMode);
  }
  if (id === 'focus') return pathname === '/cycles';
  return pathname === '/analytics';
}

function Atmosphere({ commandOpen }: { commandOpen: boolean }) {
  const { reducedMotion, ambientIntensity, preferences } = useMotionDirector();
  const targetX = useMotionValue(-600);
  const targetY = useMotionValue(-600);
  const normalizedX = useMotionValue(0);
  const normalizedY = useMotionValue(0);
  const cursorX = useSpring(targetX, { stiffness: 180, damping: 34, mass: 0.45 });
  const cursorY = useSpring(targetY, { stiffness: 180, damping: 34, mass: 0.45 });
  const layerX = useSpring(normalizedX, { stiffness: 80, damping: 30 });
  const layerY = useSpring(normalizedY, { stiffness: 80, damping: 30 });
  const cursorLight = useMotionTemplate`radial-gradient(560px circle at ${cursorX}px ${cursorY}px, rgba(103, 232, 249, .105), rgba(139, 92, 246, .045) 42%, transparent 72%)`;
  const animateAmbient = !reducedMotion && ambientIntensity > 0.2;

  useEffect(() => {
    if (!preferences.cursorEffects || reducedMotion) return;
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      targetX.set(event.clientX);
      targetY.set(event.clientY);
      normalizedX.set((event.clientX / window.innerWidth - 0.5) * 24);
      normalizedY.set((event.clientY / window.innerHeight - 0.5) * 18);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [normalizedX, normalizedY, preferences.cursorEffects, reducedMotion, targetX, targetY]);

  const noiseStyle: CSSProperties = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_38%,rgba(79,70,229,.10),transparent_34%),radial-gradient(circle_at_74%_70%,rgba(8,145,178,.08),transparent_31%)]" />
      <motion.div
        className="absolute -left-[12vw] -top-[32vh] h-[74vh] w-[72vw] rounded-full bg-[radial-gradient(ellipse,rgba(56,189,248,.14),rgba(99,102,241,.07)_38%,transparent_70%)] blur-3xl"
        style={{ x: layerX, y: layerY }}
        animate={
          animateAmbient
            ? { scale: [0.94, 1.08, 0.98], rotate: [-4, 5, -4] }
            : { scale: 1, rotate: 0 }
        }
        transition={
          animateAmbient
            ? { duration: 18, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.25 }
        }
      />
      <motion.div
        className="absolute -bottom-[42vh] right-[-12vw] h-[85vh] w-[70vw] rounded-full bg-[radial-gradient(ellipse,rgba(168,85,247,.13),rgba(236,72,153,.05)_42%,transparent_70%)] blur-3xl"
        style={{ x: layerX, y: layerY }}
        animate={
          animateAmbient
            ? { scale: [1.04, 0.92, 1.04], rotate: [5, -5, 5] }
            : { scale: 1, rotate: 0 }
        }
        transition={
          animateAmbient
            ? { duration: 23, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.25 }
        }
      />
      {preferences.cursorEffects && !reducedMotion && (
        <motion.div className="absolute inset-0" style={{ background: cursorLight }} />
      )}
      <motion.div
        className="absolute inset-0 bg-black/20"
        animate={{ opacity: commandOpen ? 0.58 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.22 }}
      />
      <div
        className="absolute inset-0 opacity-[0.022] mix-blend-overlay"
        style={noiseStyle}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_44%,rgba(0,0,0,.24)_100%)]" />
    </div>
  );
}
