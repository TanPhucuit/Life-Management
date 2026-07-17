'use client';
import dynamic from 'next/dynamic';
const Analytics = dynamic(() => import('@/app/components/Analytics'), { loading: () => <div className="h-[520px] animate-pulse rounded-3xl bg-[var(--surface-soft)]" /> });
export default function AnalyticsPage() { return <Analytics />; }
