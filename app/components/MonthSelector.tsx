'use client';

import { motion } from 'framer-motion';
import { Calendar, Wind, Leaf, Sun, Snowflake } from 'lucide-react';
import { BentoCard3D } from './BentoCard';

interface MonthSelectorProps {
  onMonthSelect: (month: number) => void;
}

const monthData = [
  { name: 'January', icon: Snowflake, color: 'from-blue-600 to-cyan-600' },
  { name: 'February', icon: Wind, color: 'from-blue-500 to-purple-500' },
  { name: 'March', icon: Leaf, color: 'from-green-500 to-emerald-500' },
  { name: 'April', icon: Sun, color: 'from-yellow-500 to-orange-500' },
  { name: 'May', icon: Leaf, color: 'from-green-600 to-lime-500' },
  { name: 'June', icon: Sun, color: 'from-orange-500 to-red-500' },
  { name: 'July', icon: Sun, color: 'from-red-500 to-pink-500' },
  { name: 'August', icon: Sun, color: 'from-orange-500 to-yellow-500' },
  { name: 'September', icon: Leaf, color: 'from-yellow-600 to-orange-600' },
  { name: 'October', icon: Wind, color: 'from-orange-600 to-red-600' },
  { name: 'November', icon: Wind, color: 'from-gray-600 to-slate-600' },
  { name: 'December', icon: Snowflake, color: 'from-cyan-600 to-blue-600' }
];

export default function MonthSelector({ onMonthSelect }: MonthSelectorProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  };

  return (
    <div className="flex min-h-screen items-center justify-center overflow-x-hidden bg-black px-4 py-8 sm:p-8">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
          animate={{ x: [0, 100, 0], y: [0, 50, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
          style={{ top: '10%', left: '-5%' }}
        />
        <motion.div
          className="absolute w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{ x: [0, -100, 0], y: [0, -50, 0] }}
          transition={{ duration: 25, repeat: Infinity }}
          style={{ bottom: '10%', right: '-5%' }}
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-6xl"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-8 text-center sm:mb-16">
          <div className="mb-4 flex items-center justify-center gap-3 sm:mb-6 sm:gap-4">
            <Calendar className="h-9 w-9 text-purple-400 sm:h-12 sm:w-12" />
            <h1 className="text-3xl font-bold text-white sm:text-5xl">Life Manager</h1>
          </div>
          <p className="text-sm text-white/60 sm:text-lg">Select a month from 2026 to begin your journey</p>
        </motion.div>

        {/* Month Grid */}
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 xl:gap-8"
          variants={containerVariants}
        >
          {monthData.map((monthItem, index) => {
            const IconComponent = monthItem.icon;
            return (
              <motion.div
                key={monthItem.name}
                variants={itemVariants}
              >
                <BentoCard3D
                  className="flex h-full min-h-44 flex-col rounded-[24px] p-4 sm:min-h-56 sm:p-6 lg:rounded-[32px]"
                  onClick={() => onMonthSelect(index + 1)}
                  icon={<IconComponent size={24} className="text-white/60" />}
                  title={monthItem.name}
                  description={`Month ${String(index + 1).padStart(2, '0')} • 2026`}
                >
                  <div className="flex-1 flex flex-col justify-between">
                    {/* Large month number */}
                    <div className="my-3 sm:my-4">
                      <div className={`text-6xl font-bold bg-gradient-to-br ${monthItem.color} bg-clip-text text-transparent`}>
                        {String(index + 1).padStart(2, '0')}
                      </div>
                    </div>

                    {/* Action indicator */}
                    <div className="text-xs text-white/40">
                      Click to explore
                    </div>
                  </div>
                </BentoCard3D>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Footer */}
        <motion.p
          variants={itemVariants}
          className="mt-8 text-center text-xs text-white/50 sm:mt-16 sm:text-sm"
        >
          Each month is carefully crafted with premium Bento design aesthetic
        </motion.p>
      </motion.div>
    </div>
  );
}
