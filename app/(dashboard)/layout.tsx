import { ReactNode } from 'react';
import AppShell from '@/app/components/AppShell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
