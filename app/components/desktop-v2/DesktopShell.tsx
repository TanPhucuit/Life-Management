'use client';

import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from 'framer-motion';
import {
  BarChart3,
  CalendarDays,
  Command,
  Home,
  Languages,
  ListTodo,
  LogOut,
  Repeat2,
  Settings,
  Sparkles,
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
  { id: 'overview', commandId: 'navigate-today', href: '/overview', label: 'Overview', icon: Home },
  { id: 'tasks', commandId: 'navigate-plan', href: '/tasks', label: 'Tasks', icon: ListTodo },
  { id: 'calendar', commandId: 'open-calendar', href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'focus', commandId: 'navigate-focus', href: '/cycles', label: 'Cycles', icon: Repeat2 },
  { id: 'ielts', commandId: 'open-ielts', href: '/ielts', label: 'IELTS', icon: Languages },
  { id: 'analytics', commandId: 'navigate-insights', href: '/analytics', label: 'Analytics', icon: BarChart3 },
] as const;

const routeMetadata = {
  overview: {
    eyebrow: 'Workspace',
    title: 'Overview',
    description: 'Your day, priorities, and progress at a glance.',
  },
  tasks: {
    eyebrow: 'Workspace',
    title: 'Tasks',
    description: 'Organize projects, task trees, and next actions.',
  },
  calendar: {
    eyebrow: 'Planning',
    title: 'Calendar',
    description: 'Place tasks on the days that matter.',
  },
  focus: {
    eyebrow: 'Consistency',
    title: 'Cycles',
    description: 'Track the same 14 daily focus blocks across every date.',
  },
  ielts: {
    eyebrow: 'Learning',
    title: 'IELTS',
    description: 'Track practice across all four IELTS skills.',
  },
  analytics: {
    eyebrow: 'Progress',
    title: 'Analytics',
    description: 'Review study time, consistency, and outcomes.',
  },
  settings: {
    eyebrow: 'Account',
    title: 'Settings',
    description: 'Tune appearance, motion, and experience quality.',
  },
  fallback: {
    eyebrow: 'Life Management',
    title: 'Workspace',
    description: 'Manage the details of your life system.',
  },
} as const;

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
  const currentLocation = search ? `${pathname}?${search}` : pathname;
  const page = getRouteMetadata(pathname);

  const navigate = useCallback(
    (href: string) => {
      if (href === currentLocation) return;
      pulseActivity('transition', 260);
      router.push(href);
    },
    [currentLocation, pulseActivity, router],
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

  const allCommands = useMemo<readonly DesktopCommand[]>(() => {
    const defaults: DesktopCommand[] = [
      ...navigation.map(({ id, commandId, href, label, icon: Icon }) => ({
        id: commandId,
        label: `Open ${label}`,
        description: `Navigate to ${label.toLowerCase()}`,
        keywords: ['navigate', label, id],
        group: 'Navigation',
        icon: <Icon className="h-4 w-4" />,
        onSelect: () => navigate(href),
      })),
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
      <Atmosphere />
      {sceneLayer && (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-70" aria-hidden="true">
          {sceneLayer}
        </div>
      )}

      <SidebarNavigation
        pathname={pathname}
        username={username}
        onNavigate={navigate}
        onOpenCommand={() => setCommandOpen(true)}
        onSignOut={onSignOut}
      />

      <header className="fixed left-[248px] right-0 top-0 z-30 flex h-[88px] items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_82%,transparent)] px-8 backdrop-blur-2xl">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground-subtle)]">
            {page.eyebrow}
          </p>
          <div className="mt-1 flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 text-xl font-semibold tracking-[-0.035em]">
              {page.title}
            </h1>
            <p className="truncate text-sm text-[var(--foreground-muted)]">
              {page.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="ml-6 flex min-h-11 shrink-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--foreground-muted)] shadow-[var(--shadow-sm)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          <Command className="h-4 w-4 text-[var(--primary)]" />
          Search or run a command
          <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-[10px] text-[var(--foreground-subtle)]">
            {commandKey}
          </kbd>
        </button>
      </header>

      <AnimatePresence initial={false} mode="popLayout">
        <motion.main
          id="main-content"
          key={pathname}
          className="relative z-10 h-dvh overflow-y-auto pl-[272px] pr-6 pt-[108px] [scrollbar-gutter:stable]"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
          animate={{ opacity: commandOpen ? 0.72 : 1, x: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
          transition={
            reducedMotion
              ? { duration: 0.08 }
              : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }
          }
        >
          <div className="mx-auto min-h-[calc(100dvh-6.75rem)] max-w-[1760px] pb-8">
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

interface SidebarNavigationProps {
  pathname: string;
  username: string;
  onNavigate: (href: string) => void;
  onOpenCommand: () => void;
  onSignOut?: () => void;
}

function SidebarNavigation({
  pathname,
  username,
  onNavigate,
  onOpenCommand,
  onSignOut,
}: SidebarNavigationProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-[248px] border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--glass-strong)_92%,var(--background))] p-4 shadow-[12px_0_48px_rgba(0,0,0,.08)] backdrop-blur-3xl">
      <div className="flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={onOpenCommand}
          className="flex min-h-[58px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors duration-150 hover:bg-[var(--surface-soft)]"
          aria-label="Open command menu"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border-strong)] bg-gradient-to-br from-[var(--primary-soft)] to-[var(--secondary-soft)] text-[var(--primary)] shadow-[var(--shadow-sm)]">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[-0.02em]">
              Life Management
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--foreground-muted)]">
              Personal workspace
            </span>
          </span>
        </button>

        <div className="mx-3 my-4 h-px bg-[var(--border)]" />

        <nav className="space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => (
            <SidebarNavItem
              key={item.id}
              item={item}
              active={isNavigationActive(item.id, pathname)}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="mt-auto space-y-2 pt-5">
          <SidebarUtilityLink
            href="/settings"
            label="Settings"
            icon={<Settings className="h-[18px] w-[18px]" />}
            active={pathname === '/settings'}
            onNavigate={onNavigate}
          />

          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow-sm)]">
            <Link
              href="/settings"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/settings');
              }}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1"
              aria-label={`Open account settings for ${username}`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-sm font-bold text-[var(--primary)]">
                {username.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{username}</span>
                <span className="block text-[10px] text-[var(--foreground-muted)]">Account</span>
              </span>
            </Link>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--foreground-subtle)] transition-colors duration-150 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

type NavigationItem = (typeof navigation)[number];

function SidebarNavItem({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(item.href);
      }}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3 text-sm font-medium transition-colors duration-150 ${
        active
          ? 'text-[var(--foreground)]'
          : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]'
      }`}
    >
      {active && (
        <motion.span
          layoutId="desktop-sidebar-nav-active"
          className="absolute inset-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
          transition={MOTION_SPRINGS.sharedLayout}
        >
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--primary)]" />
        </motion.span>
      )}
      <Icon
        className={`relative h-[18px] w-[18px] shrink-0 ${
          active ? 'text-[var(--primary)]' : 'text-[var(--foreground-subtle)] group-hover:text-[var(--foreground)]'
        }`}
      />
      <span className="relative truncate">{item.label}</span>
    </Link>
  );
}

function SidebarUtilityLink({
  href,
  label,
  icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(href);
      }}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150 ${
        active
          ? 'bg-[var(--surface-raised)] text-[var(--foreground)] shadow-[var(--shadow-sm)]'
          : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]'
      }`}
    >
      <span className={active ? 'text-[var(--primary)]' : 'text-[var(--foreground-subtle)]'}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function isNavigationActive(id: NavigationItem['id'], pathname: string) {
  if (id === 'overview') return pathname === '/overview';
  if (id === 'tasks') return pathname === '/tasks';
  if (id === 'calendar') return pathname.startsWith('/calendar');
  if (id === 'focus') return pathname === '/cycles';
  if (id === 'ielts') return pathname === '/ielts';
  return pathname === '/analytics';
}

function getRouteMetadata(pathname: string) {
  if (pathname === '/overview') return routeMetadata.overview;
  if (pathname === '/tasks') return routeMetadata.tasks;
  if (pathname.startsWith('/calendar')) return routeMetadata.calendar;
  if (pathname === '/cycles') return routeMetadata.focus;
  if (pathname === '/ielts') return routeMetadata.ielts;
  if (pathname === '/analytics') return routeMetadata.analytics;
  if (pathname === '/settings') return routeMetadata.settings;
  return routeMetadata.fallback;
}

function Atmosphere() {
  const { reducedMotion, ambientIntensity, preferences } = useMotionDirector();
  const targetX = useMotionValue(-600);
  const targetY = useMotionValue(-600);
  const cursorX = useSpring(targetX, { stiffness: 170, damping: 36, mass: 0.5 });
  const cursorY = useSpring(targetY, { stiffness: 170, damping: 36, mass: 0.5 });
  const cursorLight = useMotionTemplate`radial-gradient(460px circle at ${cursorX}px ${cursorY}px, rgba(103, 232, 249, .055), rgba(139, 92, 246, .02) 42%, transparent 72%)`;
  const animateAmbient = !reducedMotion && ambientIntensity > 0.2;

  useEffect(() => {
    if (!preferences.cursorEffects || reducedMotion) return;
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      targetX.set(event.clientX);
      targetY.set(event.clientY);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [preferences.cursorEffects, reducedMotion, targetX, targetY]);

  const noiseStyle: CSSProperties = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(79,70,229,.065),transparent_38%),radial-gradient(circle_at_82%_74%,rgba(8,145,178,.045),transparent_30%)]" />
      <motion.div
        className="absolute -right-[16vw] -top-[30vh] h-[68vh] w-[58vw] rounded-full bg-[radial-gradient(ellipse,rgba(56,189,248,.075),rgba(99,102,241,.035)_42%,transparent_72%)] blur-3xl"
        animate={
          animateAmbient
            ? { x: [0, -18, 0], y: [0, 10, 0], scale: [1, 1.025, 1] }
            : { x: 0, y: 0, scale: 1 }
        }
        transition={
          animateAmbient
            ? { duration: 24, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      />
      {preferences.cursorEffects && !reducedMotion && (
        <motion.div className="absolute inset-0" style={{ background: cursorLight }} />
      )}
      <div className="absolute inset-0 opacity-[0.014] mix-blend-overlay" style={noiseStyle} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_58%,rgba(0,0,0,.12)_100%)]" />
    </div>
  );
}
