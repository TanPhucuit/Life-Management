'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ApiTask } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { DesktopShellFrame } from './DesktopShell';
import {
  MotionDirectorProvider,
  useMotionDirector,
} from './core/MotionDirector';
import {
  SceneHost,
  SceneProvider,
  useSceneActions,
} from './scene';
import type { FocusScenePulse } from './views/DesktopFocus';
import type { IeltsScenePulse } from './views/DesktopIelts';
import type { TodayScenePulse } from './views/DesktopToday';

const viewLoading = () => <DesktopViewLoading />;
const DesktopToday = dynamic(() => import('./views/DesktopToday'), { loading: viewLoading });
const DesktopPlan = dynamic(() => import('./views/DesktopPlan'), { loading: viewLoading });
const DesktopFocus = dynamic(() => import('./views/DesktopFocus'), { loading: viewLoading });
const DesktopIelts = dynamic(() => import('./views/DesktopIelts'), { loading: viewLoading });
const DesktopInsights = dynamic(() => import('./views/DesktopInsights'), { loading: viewLoading });
const DesktopSettings = dynamic(() => import('./views/DesktopSettings'), { loading: viewLoading });

export interface DesktopDashboardProps {
  /** Used only as a compatibility fallback for routes not redesigned in V2. */
  children?: ReactNode;
}

export default function DesktopDashboard({ children }: DesktopDashboardProps) {
  const router = useRouter();
  const { user, logout } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !user) router.replace('/');
  }, [mounted, router, user]);

  const signOut = useCallback(() => {
    logout();
    router.replace('/');
  }, [logout, router]);

  if (!mounted || !user) return <DesktopBootState />;

  return (
    <MotionDirectorProvider>
      <DesktopRuntime
        username={user.username}
        onSignOut={signOut}
        legacyRoute={children}
      />
    </MotionDirectorProvider>
  );
}

function DesktopRuntime({
  username,
  onSignOut,
  legacyRoute,
}: {
  username: string;
  onSignOut: () => void;
  legacyRoute?: ReactNode;
}) {
  const motion = useMotionDirector();

  return (
    <SceneProvider
      preferences={motion.preferences}
      runtimeTier={motion.effectTier}
      onPreferencesChange={motion.setPreferences}
      onRuntimeTierChange={motion.setAutoTier}
    >
      <DesktopShellFrame
        username={username}
        onSignOut={onSignOut}
        sceneLayer={<SceneHost className="desktop-scene-host" />}
      >
        <DesktopRouteContent legacyRoute={legacyRoute} />
      </DesktopShellFrame>
    </SceneProvider>
  );
}

function DesktopRouteContent({
  legacyRoute,
}: {
  legacyRoute?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const scene = useSceneActions();
  const motion = useMotionDirector();
  const route = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;

  const feedback = useCallback(
    (kind: 'complete' | 'focus-complete' | 'save' | 'error' | 'route') => {
      scene.triggerPulse(kind);
      motion.pulseActivity(kind === 'route' ? 'transition' : 'feedback', 620);
    },
    [motion, scene],
  );

  useEffect(() => {
    scene.updateSnapshot({ route });
    scene.triggerPulse('route');
  }, [route, scene]);

  const todayPulse = useCallback(
    (pulse: TodayScenePulse) => {
      if (pulse.type === 'task-completed') {
        scene.updateSnapshot({ completion: pulse.completion });
        feedback('complete');
      } else if (pulse.type === 'task-reopened') {
        scene.updateSnapshot({ completion: pulse.completion });
        feedback('save');
      } else {
        feedback('route');
      }
    },
    [feedback, scene],
  );

  const focusPulse = useCallback(
    (pulse: FocusScenePulse) => {
      if (pulse.type === 'focus-saved') {
        scene.updateSnapshot({ focusedMinutes: pulse.totalFocusedMinutes });
        feedback('focus-complete');
      } else if (pulse.type === 'cycle-toggled' || pulse.type === 'success-key') {
        feedback('save');
      } else {
        motion.pulseActivity('interaction', 420);
      }
    },
    [feedback, motion, scene],
  );

  const ieltsPulse = useCallback(
    (pulse: IeltsScenePulse) => {
      if (pulse.type === 'ielts-saved') feedback('save');
      else motion.pulseActivity('interaction', 420);
    },
    [feedback, motion],
  );

  const insightsPulse = useCallback(
    () => feedback('route'),
    [feedback],
  );

  if (pathname === '/overview') {
    return (
      <DesktopToday
        onScenePulse={todayPulse}
        onSnapshotChange={scene.updateSnapshot}
        onStartFocus={(task: ApiTask) =>
          router.push(`/cycles?task=${encodeURIComponent(task.id)}`)
        }
      />
    );
  }
  if (pathname === '/tasks') {
    const mode = searchParams.get('mode') === 'spaces' ? 'spaces' : 'inbox';
    return (
      <DesktopPlan
        key={mode}
        initialMode={mode}
        onSnapshotChange={scene.updateSnapshot}
        onScenePulse={(kind) => feedback(kind === 'complete' ? 'complete' : kind === 'space' ? 'route' : 'save')}
      />
    );
  }
  if (pathname === '/calendar') {
    return <DesktopPlan initialMode="calendar" onSnapshotChange={scene.updateSnapshot} onScenePulse={(kind) => feedback(kind === 'complete' ? 'complete' : 'save')} />;
  }
  if (pathname === '/cycles') return <DesktopFocus onScenePulse={focusPulse} onSnapshotChange={scene.updateSnapshot} />;
  if (pathname === '/ielts') return <DesktopIelts onScenePulse={ieltsPulse} />;
  if (pathname === '/analytics') return <DesktopInsights onScenePulse={insightsPulse} onSnapshotChange={scene.updateSnapshot} />;
  if (pathname === '/settings') {
    return (
      <DesktopSettings
        preferences={motion.preferences}
        onPreferencesChange={motion.setPreferences}
      />
    );
  }

  // Detail routes keep their existing business component while still living
  // inside the desktop shell. This avoids silently removing legacy workflows.
  return <>{legacyRoute}</>;
}

function DesktopBootState() {
  return (
    <div className="experience-v2 grid min-h-dvh place-items-center bg-[#050914] text-white" role="status" aria-label="Loading your workspace">
      <div className="relative grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/20" />
        <span className="absolute inset-3 animate-spin rounded-full border border-violet-300/20 border-t-violet-300" />
        <span className="h-4 w-4 rounded-full bg-cyan-200 shadow-[0_0_38px_rgba(103,232,249,.9)]" />
      </div>
    </div>
  );
}

function DesktopViewLoading() {
  return (
    <div className="grid min-h-[680px] grid-cols-[.85fr_1.3fr_.85fr] gap-5 px-2 pb-8" role="status" aria-label="Loading desktop workspace">
      {[0, 1, 2].map((column) => (
        <div key={column} className="relative overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--glass)]">
          <div className="shimmer absolute inset-y-0 w-1/2 opacity-20" />
        </div>
      ))}
    </div>
  );
}
