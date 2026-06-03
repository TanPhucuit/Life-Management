'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Calendar, CheckCircle2, ChevronLeft, Home, LogOut, Settings, UserCircle } from 'lucide-react';
import { useAppStore } from '@/app/lib/store';
import CalendarView from './CalendarView';
import TaskManager from './TaskManager';
import Analytics from './Analytics';
import DayDetailsPage from './DayDetailsPage';

type TabType = 'overview' | 'calendar' | 'tasks' | 'analytics' | 'settings';

interface SelectedDay {
  day: number;
  month: number;
  year: number;
}

const navItems = [
  { id: 'overview' as TabType, label: 'Tổng quan', icon: Home },
  { id: 'calendar' as TabType, label: 'Lịch', icon: Calendar },
  { id: 'tasks' as TabType, label: 'Nhiệm vụ', icon: CheckCircle2 },
  { id: 'analytics' as TabType, label: 'Phân tích', icon: BarChart3 },
  { id: 'settings' as TabType, label: 'Cài đặt', icon: Settings },
];

export default function Dashboard() {
  const { user, logout, currentMonth, currentYear, setCurrentMonth } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);

  const title = useMemo(() => {
    if (selectedDay) return 'Chi tiết ngày';
    return navItems.find((item) => item.id === activeTab)?.label || 'Life Manager';
  }, [activeTab, selectedDay]);

  const handleMonthChange = (month: number, year: number) => {
    setCurrentMonth(month, year);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white p-4 lg:block">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">Life Manager</h1>
              <p className="text-xs text-slate-500">Productivity OS</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = !selectedDay && activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedDay(null);
                    setActiveTab(item.id);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <UserCircle className="h-8 w-8 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.username}</p>
                <p className="text-xs text-slate-500">Đang đăng nhập</p>
              </div>
            </div>
            <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {selectedDay && (
                  <button onClick={() => setSelectedDay(null)} className="rounded-md border border-slate-200 p-2 hover:bg-slate-50">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{title}</h2>
                  <p className="text-sm text-slate-500">Xin chào, {user?.username}. Task hoạt động độc lập với tháng.</p>
                </div>
              </div>
              <button onClick={logout} className="hidden rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 sm:block lg:hidden">
                Đăng xuất
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] p-3 sm:p-4">
            {selectedDay ? (
              <DayDetailsPage day={selectedDay.day} month={selectedDay.month} year={selectedDay.year} />
            ) : activeTab === 'overview' ? (
              <Overview onOpenTasks={() => setActiveTab('tasks')} onOpenCalendar={() => setActiveTab('calendar')} />
            ) : activeTab === 'calendar' ? (
              <CalendarView
                month={currentMonth}
                year={currentYear}
                onMonthChange={handleMonthChange}
                onSelectDay={(day, month, year) => setSelectedDay({ day, month, year })}
              />
            ) : activeTab === 'tasks' ? (
              <TaskManager />
            ) : activeTab === 'analytics' ? (
              <Analytics />
            ) : (
              <SettingsPanel username={user?.username || ''} onLogout={logout} />
            )}
          </div>

          <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedDay(null);
                    setActiveTab(item.id);
                  }}
                  className={`flex flex-col items-center gap-1 px-1 py-2 text-[11px] ${activeTab === item.id ? 'text-blue-700' : 'text-slate-500'}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </main>
      </div>
    </div>
  );
}

function Overview({ onOpenTasks, onOpenCalendar }: { onOpenTasks: () => void; onOpenCalendar: () => void }) {
  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <OverviewCard label="Task hôm nay" value="12" hint="4 task cần xử lý" />
        <OverviewCard label="Root task đang chạy" value="15" hint="5 topic đang hoạt động" />
        <OverviewCard label="Task hoàn thành" value="84%" hint="Theo cây hiện tại" />
        <OverviewCard label="Leaf quá hạn" value="3" hint="Cần xử lý sớm" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Nhiệm vụ đang ưu tiên</h3>
              <p className="text-sm text-slate-500">Mở workspace để xem cây task theo chiều ngang.</p>
            </div>
            <button onClick={onOpenTasks} className="rounded-md bg-slate-950 px-3 py-2 text-sm text-white">Mở task</button>
          </div>
          <div className="space-y-2">
            {['Xây dựng hệ thống task tree', 'Hoàn thiện giao diện calendar', 'Chuẩn hóa analytics task'].map((item, index) => (
              <div key={item} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium">{item}</p>
                  <p className="text-xs text-slate-500">Root task #{index + 1}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{70 - index * 15}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Lịch hôm nay</h3>
              <p className="text-sm text-slate-500">Deadline gần nhất.</p>
            </div>
            <button onClick={onOpenCalendar} className="rounded-md border border-slate-200 px-3 py-2 text-sm">Mở lịch</button>
          </div>
          <div className="space-y-2">
            {['Hạn: Thiết kế UI task', 'Hạn: Review schema', 'Hạn: Tổng kết ngày'].map((item) => (
              <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{item}</div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function OverviewCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function SettingsPanel({ username, onLogout }: { username: string; onLogout: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold">Cài đặt</h3>
      <p className="mt-1 text-sm text-slate-500">Thông tin tài khoản và tuỳ chọn ứng dụng.</p>
      <div className="mt-5 max-w-md space-y-3">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Username</p>
          <p className="font-medium">{username}</p>
        </div>
        <button onClick={onLogout} className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
