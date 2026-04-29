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
    <div className="min-h-screen bg-black p-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full h-full flex flex-col max-w-[1920px] mx-auto"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-1">Life Manager</h1>
            <p className="text-white/60">Welcome, {user?.username}! • {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selectedMonth! - 1]} 2026</p>
          </div>
          <div className="flex gap-3">
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-lg border border-white/10 transition-all duration-300 hover:border-white/20"
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </button>
            )}
            {!selectedDay && (
              <button
                onClick={handleBackToMonthSelect}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-lg border border-white/10 transition-all duration-300 hover:border-white/20"
              >
                <ChevronLeft className="w-5 h-5" />
                Change Month
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 px-4 py-2 rounded-lg border border-red-500/30 transition-all duration-300"
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
            className="flex gap-4 mb-8 flex-wrap"
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
                  className={`flex items-center gap-2 px-6 py-3 rounded-[24px] font-medium transition-all duration-300 border border-white/10 ${
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
        <motion.div variants={itemVariants} className="w-full flex-1 overflow-auto">
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
