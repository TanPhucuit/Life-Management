'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { api, ApiDate } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type AnalyticsView = 'month_overview' | 'week_daily' | 'weekly_progress' | 'key_of_success';

export default function Analytics() {
  const { selectedMonth, selectedYear, user } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || 4);
  const [currentYear, setCurrentYear] = useState(selectedYear || 2026);
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>('month_overview');
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [allDates, setAllDates] = useState<ApiDate[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    const loadDates = async () => {
      try {
        const dates = await api.getDates(user.id);
        setAllDates(dates);
      } catch (error) {
        console.error('Error loading analytics dates:', error);
      }
    };

    void loadDates();
  }, [user?.id]);

  // Calculate study hours by date
  const getStudyHoursByDate = () => {
    const hoursByDate: { [key: string]: number } = {};
    allDates.forEach((date) => {
      const dateStr = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
      hoursByDate[dateStr] = (hoursByDate[dateStr] || 0) + date.focused_minutes / 60;
    });
    return hoursByDate;
  };

  // Get weeks in month
  const getWeeksInMonth = (month: number, year: number) => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const adjustedFirstDay = (firstDay.getDay() + 6) % 7; // 0 for Monday, 6 for Sunday
    return Math.ceil((lastDay.getDate() + adjustedFirstDay) / 7);
  };

  // Get days in specific week
  const getDaysInWeek = (month: number, year: number, weekNum: number) => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const adjustedFirstDay = (firstDay.getDay() + 6) % 7; // 0 for Monday, 6 for Sunday
    let dayCounter = 1 - adjustedFirstDay;
    let currentWeek = 1;
    const weekDays: Array<{ day: number; date: string; month: number; year: number }> = [];

    for (let i = 0; i < 42; i++) {
      const d = dayCounter + i;
      if (d >= 1 && d <= daysInMonth && currentWeek === weekNum) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        weekDays.push({ day: d, date, month, year });
      }
      if ((i + 1) % 7 === 0) currentWeek++;
    }
    return weekDays;
  };

  // Get weekly study hours for month
  const getWeeklyStudyHours = (month: number, year: number) => {
    const studyByDate = getStudyHoursByDate();
    const weeksCount = getWeeksInMonth(month, year);
    const weekData = [];

    for (let week = 1; week <= weeksCount; week++) {
      const days = getDaysInWeek(month, year, week);
      let weekHours = 0;
      days.forEach((d) => {
        weekHours += studyByDate[d.date] || 0;
      });
      if (days.length > 0) {
        weekData.push({ name: `W${week}`, hours: Math.round(weekHours * 10) / 10 });
      }
    }
    return weekData;
  };

  // Get daily study hours for specific week
  const getDailyStudyHours = (month: number, year: number, weekNum: number) => {
    const studyByDate = getStudyHoursByDate();
    const days = getDaysInWeek(month, year, weekNum);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return days.map((d) => {
      const dayOfWeek = new Date(d.year, d.month - 1, d.day).getDay();
      return {
        name: `${dayNames[dayOfWeek]} ${d.day}`,
        hours: studyByDate[d.date] || 0,
      };
    });
  };

  // Get key of success distribution
  const getKeyOfSuccessDistribution = (month: number, year: number) => {
    const data = allDates.filter((d) => d.year === year && d.month === month);

    const successDays = data.filter((d) => d.key_of_success > 0).length;
    const failDays = data.filter((d) => d.key_of_success === 0).length;

    return [
      { name: 'Success (KOS > 0)', value: successDays, color: '#ef4444' },
      { name: 'No Success (KOS = 0)', value: failDays, color: '#22c55e' },
    ];
  };

  // Find max day with actual positive data in current month
  const getMaxDayWithActualData = (month: number, year: number, field: 'focused_minutes' | 'key_of_success') => {
    const monthData = allDates.filter((d) => d.year === year && d.month === month && d[field] > 0);
    if (monthData.length === 0) return 0;
    return Math.max(...monthData.map((d) => d.day));
  };

  // Get key of success trend for current month (cumulative over days)
  const getKeyOfSuccessTrend = () => {
    const monthData = allDates.filter((d) => d.year === currentYear && d.month === currentMonth);
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    const limitDay = getMaxDayWithActualData(currentMonth, currentYear, 'key_of_success');

    const trendData = [];
    let cumulativeSum = 0;
    
    // Start from 0 before Day 1
    trendData.push({ name: 'Start', value: 0 });

    for (let day = 1; day <= daysInMonth; day++) {
      if (day > limitDay) break; // Không vẽ trước nếu chưa tới ngày hoặc chưa có data

      const dayData = monthData.find((d) => d.day === day);
      if (dayData) {
        cumulativeSum += dayData.key_of_success;
      }
      trendData.push({
        name: `Day ${day}`,
        value: cumulativeSum
      });
    }

    return trendData;
  };



  // Get cumulative daily study hours for a specific week
  const getCumulativeDailyStudyHoursForWeek = (month: number, year: number, weekNum: number) => {
    const studyByDate = getStudyHoursByDate();
    const days = getDaysInWeek(month, year, weekNum);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const limitDay = getMaxDayWithActualData(month, year, 'focused_minutes');

    const trendData = [];
    let cumulativeSum = 0;
    
    trendData.push({ name: 'Start', value: 0 });

    for (const d of days) {
      // If it's the current month, stop drawing if the day is in the future relative to our actual data
      if (d.month === month && d.day > limitDay) break;
      
      cumulativeSum += studyByDate[d.date] || 0;
      const dayOfWeek = new Date(d.year, d.month - 1, d.day).getDay();
      trendData.push({
        name: `${dayNames[dayOfWeek]} ${d.day}`,
        value: Math.round(cumulativeSum * 10) / 10
      });
    }

    return trendData;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const weeksCount = getWeeksInMonth(currentMonth, currentYear);
  const weeklyData = getWeeklyStudyHours(currentMonth, currentYear);
  const kosDistribution = getKeyOfSuccessDistribution(currentMonth, currentYear);
  const kosTrend = getKeyOfSuccessTrend();
  const dailyData = getDailyStudyHours(currentMonth, currentYear, selectedWeek);
  



  return (
    <div className="w-full space-y-8">
      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-white/10 rounded-xl p-4">
        <button
          onClick={() => {
            setCurrentMonth(currentMonth === 1 ? 12 : currentMonth - 1);
            setCurrentYear(currentMonth === 1 ? currentYear - 1 : currentYear);
            setSelectedWeek(1);
          }}
          className="p-2 hover:bg-white/20 rounded-lg transition"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h2 className="text-2xl font-bold text-white">
          {monthNames[currentMonth - 1]} {currentYear}
        </h2>
        <button
          onClick={() => {
            setCurrentMonth(currentMonth === 12 ? 1 : currentMonth + 1);
            setCurrentYear(currentMonth === 12 ? currentYear + 1 : currentYear);
            setSelectedWeek(1);
          }}
          className="p-2 hover:bg-white/20 rounded-lg transition"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Analytics View Selector */}
      <div className="flex gap-3 bg-white/10 rounded-xl p-4">
        <button
          onClick={() => setAnalyticsView('month_overview')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${analyticsView === 'month_overview' ? 'bg-white text-purple-600' : 'text-white/70 hover:text-white'}`}
        >
          Monthly Overview
        </button>
        <button
          onClick={() => setAnalyticsView('week_daily')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${analyticsView === 'week_daily' ? 'bg-white text-purple-600' : 'text-white/70 hover:text-white'}`}
        >
          Weekly Details
        </button>
        <button
          onClick={() => setAnalyticsView('weekly_progress')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${analyticsView === 'weekly_progress' ? 'bg-white text-purple-600' : 'text-white/70 hover:text-white'}`}
        >
          Weekly Progress
        </button>
        <button
          onClick={() => setAnalyticsView('key_of_success')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${analyticsView === 'key_of_success' ? 'bg-white text-purple-600' : 'text-white/70 hover:text-white'}`}
        >
          Key of Success
        </button>
      </div>

      {/* Monthly Overview: Weekly Study Hours + KOS Pie */}
      {analyticsView === 'month_overview' && (
        <div className="grid grid-cols-2 gap-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/10 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Weekly Study Hours - {monthNames[currentMonth - 1]}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: 'none' }} />
                <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/10 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Key of Success Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={kosDistribution} cx="50%" cy="50%" labelLine={false} label={{ fill: 'white' }} outerRadius={80} dataKey="value">
                  {kosDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

        </div>
      )}

      {/* Weekly Details: Daily Study Hours for Selected Week */}
      {analyticsView === 'week_daily' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Week Selector */}
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-white/70 text-sm mb-3">Select Week:</p>
            <div className="flex gap-2">
              {Array.from({ length: weeksCount }, (_, i) => i + 1).map((week) => (
                <button
                  key={week}
                  onClick={() => setSelectedWeek(week)}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${selectedWeek === week ? 'bg-white text-purple-600' : 'bg-white/20 text-white hover:bg-white/30'}`}
                >
                  W{week}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Study Hours Chart */}
          <div className="bg-white/10 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Daily Study Hours - Week {selectedWeek}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: 'none' }} />
                <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Weekly Progress: Cumulative Study Hours Chart for Selected Week */}
      {analyticsView === 'weekly_progress' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Week Selector */}
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-white/70 text-sm mb-3">Select Week Progress:</p>
            <div className="flex gap-2">
              {Array.from({ length: weeksCount }, (_, i) => i + 1).map((week) => (
                <button
                  key={week}
                  onClick={() => setSelectedWeek(week)}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${selectedWeek === week ? 'bg-white text-blue-600' : 'bg-white/20 text-white hover:bg-white/30'}`}
                >
                  W{week}
                </button>
              ))}
            </div>
          </div>

          {/* Cumulative Chart */}
          <div className="bg-white/10 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Cumulative Study Hours - Week {selectedWeek}</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={getCumulativeDailyStudyHoursForWeek(currentMonth, currentYear, selectedWeek)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="rgba(255,255,255,0.6)" domain={[0, (dataMax: number) => Math.max(dataMax + 2, 85)]} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: 'none' }} />
                <ReferenceLine y={40} label={{ value: '40h', fill: 'orange', fontSize: 12 }} stroke="orange" strokeDasharray="3 3" />
                <ReferenceLine y={80} label={{ value: '80h', fill: '#ef4444', fontSize: 12 }} stroke="#ef4444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Key of Success Trend */}
      {analyticsView === 'key_of_success' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/10 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Key of Success Progress - {monthNames[currentMonth - 1]} {currentYear}</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={kosTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" domain={[0, 'dataMax + 5']} />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: 'none' }} />
              <Line type="monotone" dataKey="value" stroke="#ec4899" strokeWidth={3} dot={{ fill: '#ec4899', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </div>
  );
}
