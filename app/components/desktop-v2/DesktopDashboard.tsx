'use client';

import { ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
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
import DesktopClassicWorkspace from './views/DesktopClassicWorkspace';

const viewLoading = () => <DesktopViewLoading />;
const DesktopSettings = dynamic(() => import('./views/DesktopSettings'), { loading: viewLoading });
const TaskManager = dynamic(() => import('@/app/components/TaskManager'), { loading: viewLoading });
const IeltsTracker = dynamic(() => import('@/app/components/IeltsTracker'), { loading: viewLoading });
const Analytics = dynamic(() => import('@/app/components/Analytics'), { loading: viewLoading });

export interface DesktopDashboardProps {
  /** Raw route content used for legacy workflows such as Calendar/detail pages. */
  children?: ReactNode;
}

export default function DesktopDashboard({ children }: DesktopDashboardProps) {
  const { user, sessionReady, sessionError } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted || !sessionReady || (!user && !sessionError)) return <DesktopBootState />;
  if (!user) return <DesktopBootState error={sessionError || 'Workspace unavailable'} />;

  return (
    <MotionDirectorProvider>
      <DesktopRuntime
        username={user.username}
        legacyRoute={children}
      />
    </MotionDirectorProvider>
  );
}

function DesktopRuntime({
  username,
  legacyRoute,
}: {
  username: string;
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
  const { updateSnapshot, triggerPulse } = useSceneActions();
  const { preferences, setPreferences, pulseActivity } = useMotionDirector();
  const route = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;

  useEffect(() => {
    updateSnapshot({ route });
    triggerPulse('route');
    return pulseActivity('transition', 420);
  }, [pulseActivity, route, triggerPulse, updateSnapshot]);

  if (pathname === '/overview') {
    return <DesktopClassicWorkspace kind="overview">{legacyRoute}</DesktopClassicWorkspace>;
  }
  if (pathname === '/tasks') {
    return (
      <DesktopClassicWorkspace kind="tasks">
        <TaskManager
          variant="desktop-cinematic"
          initialView={searchParams.get('mode') === 'spaces' ? 'tree' : undefined}
        />
      </DesktopClassicWorkspace>
    );
  }
  if (pathname.startsWith('/calendar')) {
    return <DesktopClassicWorkspace kind="calendar">{legacyRoute}</DesktopClassicWorkspace>;
  }
  if (pathname === '/cycles') {
    return <DesktopClassicWorkspace kind="cycles">{legacyRoute}</DesktopClassicWorkspace>;
  }
  if (pathname === '/ielts') {
    return (
      <DesktopClassicWorkspace kind="ielts">
        <IeltsTracker variant="desktop-cinematic" />
      </DesktopClassicWorkspace>
    );
  }
  if (pathname === '/analytics') {
    return (
      <DesktopClassicWorkspace kind="analytics">
        <Analytics variant="desktop-cinematic" />
      </DesktopClassicWorkspace>
    );
  }
  if (pathname === '/settings') {
    return (
      <DesktopSettings
        preferences={preferences}
        onPreferencesChange={setPreferences}
      />
    );
  }

  // Unknown/detail routes retain their existing controller and receive only
  // the desktop visual surface. The cinematic layer never replaces business logic.
  return <DesktopClassicWorkspace kind="detail">{legacyRoute}</DesktopClassicWorkspace>;
}

function DesktopBootState({ error }: { error?: string }) {
  return (
    <div className="experience-v2 grid min-h-dvh place-items-center bg-[#050914] text-white" role="status" aria-label="Loading your workspace">
      {error ? <div className="max-w-md px-6 text-center"><p className="font-semibold">Workspace unavailable</p><p className="mt-2 text-sm text-white/55">{error}</p></div> : (
      <div className="relative grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/20" />
        <span className="absolute inset-3 animate-spin rounded-full border border-violet-300/20 border-t-violet-300" />
        <span className="h-4 w-4 rounded-full bg-cyan-200 shadow-[0_0_38px_rgba(103,232,249,.9)]" />
      </div>
      )}
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
