import { ReactNode } from 'react';
import AppShell from '@/app/components/AppShell';
import DesktopDashboardGate from '@/app/components/desktop-v2/DesktopDashboardGate';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DesktopDashboardGate
      legacy={<AppShell>{children}</AppShell>}
      desktopContent={children}
    />
  );
}
