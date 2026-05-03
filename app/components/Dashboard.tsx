'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/app/lib/store';
import { LogOut, Calendar, BarChart3, CheckCircle, ChevronLeft } from 'lucide-react';
import MonthSelector from './MonthSelector';
import CalendarView from './CalendarView';
import TaskManager from './TaskManager';
import Analytics from './Analytics';
import DayDetailsPage from './DayDetailsPage';

type TabType = 'calendar' | 'tasks' | 'analytics';

interface SelectedDay {
  day: number;
  month: number;
  year: number;
}

export default function Dashboard() {
  const { user, logout, selectedMonth, setSelectedMonth, resetSelectedMonth, currentMonth, currentYear, setCurrentMonth } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);

  const handleLogout = () => {
    logout();
  };

  const handleMonthSelect = (month: number) => {
    setSelectedMonth(month, 2026);
  };

  const handleBackToMonthSelect = () => {
    resetSelectedMonth();
    setActiveTab('calendar');
  };

  const handleMonthChange = (month: number, year: number) => {
    setCurrentMonth(month, year);
  };

  // If no month selected, show month selector
  if (selectedMonth === null) {
    return <MonthSelector onMonthSelect={handleMonthSelect} />;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-black px-4 py-5 sm:p-6 lg:p-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full h-full flex flex-col max-w-[1920px] mx-auto"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-6 flex flex-col gap-5 lg:mb-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1 text-3xl font-bold leading-tight text-white sm:text-4xl">Life Manager</h1>
            <p className="text-sm leading-relaxed text-white/60 sm:text-base">Welcome, {user?.username}! • {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selectedMonth! - 1]} 2026</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-end">
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white transition-all duration-300 hover:border-white/20 hover:bg-white/15 sm:px-4 sm:text-base"
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </button>
            )}
            {!selectedDay && (
              <button
                onClick={handleBackToMonthSelect}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white transition-all duration-300 hover:border-white/20 hover:bg-white/15 sm:px-4 sm:text-base"
              >
                <ChevronLeft className="w-5 h-5" />
                Change Month
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-2 text-sm text-red-200 transition-all duration-300 hover:bg-red-500/30 sm:px-4 sm:text-base"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </motion.div>

        {/* Tabs - Hidden when viewing day details */}
        {!selectedDay && (
          <motion.div
            variants={itemVariants}
            className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap lg:mb-8"
          >
            {[
              { id: 'calendar' as TabType, label: 'Calendar', icon: Calendar },
              { id: 'tasks' as TabType, label: 'Tasks', icon: CheckCircle },
              { id: 'analytics' as TabType, label: 'Analytics', icon: BarChart3 },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-[24px] border border-white/10 px-4 py-3 text-sm font-medium transition-all duration-300 sm:px-6 sm:text-base ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white border-purple-500/50 shadow-lg shadow-purple-600/50'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </motion.div>
        )}

        {/* Content */}
        <motion.div variants={itemVariants} className="w-full flex-1 overflow-visible">
          {selectedDay ? (
            <DayDetailsPage 
              day={selectedDay.day}
              month={selectedDay.month}
              year={selectedDay.year}
            />
          ) : activeTab === 'calendar' ? (
            <CalendarView 
              month={currentMonth} 
              year={currentYear} 
              onMonthChange={handleMonthChange}
              onSelectDay={(day, month, year) => setSelectedDay({ day, month, year })}
            />
          ) : activeTab === 'tasks' ? (
            <TaskManager />
          ) : (
            <Analytics />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
