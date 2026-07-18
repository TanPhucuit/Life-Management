'use client';

import { ReactNode } from 'react';
import { DesktopExperienceGate } from './core';
import type { DesktopDashboardProps } from './DesktopDashboard';

export default function DesktopDashboardGate({
  legacy,
  desktopContent,
}: {
  legacy: ReactNode;
  desktopContent: ReactNode;
}) {
  return (
    <DesktopExperienceGate<DesktopDashboardProps>
      legacy={legacy}
      loadDesktop={() => import('./DesktopDashboard')}
      desktopProps={{ children: desktopContent }}
    />
  );
}
