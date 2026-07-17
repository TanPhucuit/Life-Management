'use client';
import { useParams } from 'next/navigation';
import DayDetailsPage from '@/app/components/DayDetailsPage';
export default function DatePage() { const params = useParams<{ date: string }>(); const [year, month, day] = params.date.split('-').map(Number); if (!year || !month || !day) return <div className="rounded-3xl bg-[var(--danger-soft)] p-6 text-[var(--danger)]">Invalid calendar date.</div>; return <DayDetailsPage day={day} month={month} year={year} />; }
