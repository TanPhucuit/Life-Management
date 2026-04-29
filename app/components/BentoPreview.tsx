'use client';

import { BentoCard, BentoCard3D, ShimmerProgressBar } from './BentoCard';
import { ArrowLeft, Calendar, ListChecks, BarChart3, Zap, Target, Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function BentoPreview() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-12">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <h1 className="text-4xl font-bold text-white mb-2">BentoCard Premium Preview</h1>
        <p className="text-white/50 max-w-2xl">
          Enhanced cards with thinner borders, gradient backgrounds, icons, spotlight effects, and shimmer progress bars
        </p>
      </div>

      {/* Basic Cards with Icons */}
      <div className="max-w-6xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-white mb-6">Premium Cards with Icons & Typography</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <BentoCard 
            className="p-6 h-56"
            icon={<Calendar size={24} />}
            title="Calendar View"
            description="Monthly study overview"
          >
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/70">April 2026</span>
                <span className="text-white/40">28 days</span>
              </div>
              <ShimmerProgressBar percentage={75} color="from-blue-500 to-cyan-500" />
            </div>
          </BentoCard>

          <BentoCard 
            className="p-6 h-56"
            glowing
            icon={<ListChecks size={24} />}
            title="Task Manager"
            description="Track your objectives"
          >
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Completed</span>
                <span className="text-purple-400 font-semibold">12/18</span>
              </div>
              <ShimmerProgressBar percentage={67} color="from-purple-500 to-pink-500" />
            </div>
          </BentoCard>

          <BentoCard 
            className="p-6 h-56"
            icon={<BarChart3 size={24} />}
            title="Analytics"
            description="Performance insights"
          >
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/70">This Month</span>
                <span className="text-green-400 font-semibold">↑ 18%</span>
              </div>
              <ShimmerProgressBar percentage={82} color="from-green-500 to-emerald-500" />
            </div>
          </BentoCard>
        </div>
      </div>

      {/* 3D Cards with Spotlight */}
      <div className="max-w-6xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-white mb-6">3D Cards with Spotlight Effect</h2>
        <p className="text-white/50 mb-6 text-sm">
          Hover over the cards to see the mouse-tracking 3D tilt and spotlight light effect
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BentoCard3D 
            className="p-6 h-64"
            icon={<Zap size={24} />}
            title="Focus Session"
            description="Active study tracking"
            enablePerspectiveTilt
            enableSpotlight
          >
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white/70">Focus Time Today</span>
                  <span className="text-cyan-400 font-semibold">4h 32m</span>
                </div>
                <ShimmerProgressBar percentage={65} color="from-cyan-500 to-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-sm text-white/50">Sessions</div>
                  <div className="text-lg font-bold text-white">8</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-sm text-white/50">Breaks</div>
                  <div className="text-lg font-bold text-white">4</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-sm text-white/50">KOS</div>
                  <div className="text-lg font-bold text-purple-400">2.5</div>
                </div>
              </div>
            </div>
          </BentoCard3D>

          <BentoCard3D 
            className="p-6 h-64"
            glowing
            icon={<Flame size={24} />}
            title="Achievement Streak"
            description="Consistency tracker"
            enablePerspectiveTilt
            enableSpotlight
          >
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white/70">Continuous Streak</span>
                  <span className="text-orange-400 font-semibold">18 days</span>
                </div>
                <ShimmerProgressBar percentage={90} color="from-orange-500 to-red-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-white/50 mb-1">Best Streak</div>
                  <div className="text-2xl font-bold text-orange-400">32 days</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-white/50 mb-1">Total Points</div>
                  <div className="text-2xl font-bold text-white">284</div>
                </div>
              </div>
            </div>
          </BentoCard3D>
        </div>
      </div>

      {/* Large Feature Cards (2x2) */}
      <div className="max-w-6xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-white mb-6">Large Feature Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BentoCard3D 
            className="p-8 h-96"
            icon={<Target size={28} />}
            title="Weekly Progress"
            description="Detailed insights"
            enablePerspectiveTilt
            enableSpotlight
          >
            <div className="space-y-6 mt-6">
              {['Monday', 'Wednesday', 'Friday'].map((day, idx) => (
                <div key={day}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white/70">{day}</span>
                    <span className="text-white/40">{2 + idx}h 15m</span>
                  </div>
                  <ShimmerProgressBar 
                    percentage={45 + idx * 15} 
                    color="from-blue-500 to-cyan-500"
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </BentoCard3D>

          <BentoCard3D 
            className="p-8 h-96"
            glowing
            title="Statistics"
            description="Key metrics overview"
            enablePerspectiveTilt
            enableSpotlight
          >
            <div className="space-y-6 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-transparent rounded-2xl p-4 border border-blue-500/20">
                  <div className="text-xs text-white/50 mb-2">Total Hours</div>
                  <div className="text-3xl font-bold text-blue-400">86.5</div>
                </div>
                <div className="bg-gradient-to-br from-purple-500/20 to-transparent rounded-2xl p-4 border border-purple-500/20">
                  <div className="text-xs text-white/50 mb-2">Avg KOS</div>
                  <div className="text-3xl font-bold text-purple-400">2.3</div>
                </div>
              </div>
              <ShimmerProgressBar percentage={72} color="from-green-500 to-emerald-500" className="h-2" />
              <p className="text-sm text-white/50">Performance: <span className="text-green-400 font-semibold">Excellent</span></p>
            </div>
          </BentoCard3D>
        </div>
      </div>

      {/* Feature Summary */}
      <div className="max-w-6xl mx-auto">
        <BentoCard className="p-8 bg-white/5 border border-white/10">
          <h3 className="text-xl font-bold text-white mb-4">Premium Bento Features Applied</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Thinner borders (0.5px rgba)</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Subtle gradient backgrounds</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Icons with typography</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Mouse-follow Spotlight effect</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Animated Shimmer progress bars</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">3D perspective tilt hover</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Spring physics animations</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">16-20px card gaps</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-purple-400 font-semibold flex-shrink-0">✓</span>
              <span className="text-white/70">Max-width 6xl containers</span>
            </div>
          </div>
          
          {/* Application Status */}
          <div className="mt-8 pt-8 border-t border-white/10">
            <h4 className="text-white font-semibold mb-4">Applied to Components:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex gap-2 items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span className="text-white/70">CalendarView with DayCard Bento cards</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span className="text-white/70">MonthSelector with premium styling</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span className="text-white/70">TaskManager with Bento containers</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span className="text-white/70">Dashboard max-width layout</span>
              </div>
            </div>
          </div>
        </BentoCard>
      </div>
    </div>
  );
}
