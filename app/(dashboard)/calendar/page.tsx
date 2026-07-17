'use client';
import { useRouter } from 'next/navigation';
import CalendarView from '@/app/components/CalendarView';
import { useAppStore } from '@/app/lib/store';
export default function CalendarPage() { const { currentMonth, currentYear, setCurrentMonth } = useAppStore(); const router = useRouter(); return <CalendarView month={currentMonth} year={currentYear} onMonthChange={setCurrentMonth} onSelectDay={(day, month, year) => router.push(`/calendar/${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)} />; }
