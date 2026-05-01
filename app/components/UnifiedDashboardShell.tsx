import { ReactNode } from 'react';

interface UnifiedDashboardShellProps {
  visual: ReactNode;
  stopwatch: ReactNode;
  target: ReactNode;
  quality: ReactNode;
  input: ReactNode;
  sessions: ReactNode;
}

export function UnifiedDashboardShell({
  visual,
  stopwatch,
  target,
  quality,
  input,
  sessions,
}: UnifiedDashboardShellProps) {
  return (
    <div className="w-full h-full max-w-[1600px] mx-auto p-2 flex flex-col">
      <div 
        className="flex-1 bg-[#0a0a0a] rounded-[16px] border border-[#333] overflow-hidden shadow-2xl flex flex-col"
        style={{
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}
      >
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] grid-rows-[auto_auto_1fr] md:grid-rows-[1fr_1fr_minmax(100px,auto)] h-full">
          
          {/* Visual Area - Spans 2 rows on Desktop */}
          <div className="md:row-span-2 border-b md:border-b-0 md:border-r border-[#222] p-4 flex flex-col relative overflow-hidden bg-gradient-to-br from-[#0f0f0f] to-[#050505]">
            {visual}
          </div>

          {/* Stopwatch Area */}
          <div className="border-b md:border-r border-[#222] p-4 flex flex-col bg-[#0c0c0c] relative">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Stopwatch Control</div>
            <div className="flex-1 mt-3 relative z-20">{stopwatch}</div>
          </div>

          {/* Target Area */}
          <div className="border-b border-[#222] p-4 flex flex-col bg-[#0c0c0c] relative">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Daily Target</div>
            <div className="flex-1 mt-3 relative z-20">{target}</div>
          </div>

          {/* Quality Area */}
          <div className="border-b md:border-r border-[#222] p-4 flex flex-col bg-[#0c0c0c] relative">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Quality Rating</div>
            <div className="flex-1 mt-3 relative z-20">{quality}</div>
          </div>

          {/* Manual Input Area */}
          <div className="border-b border-[#222] p-4 flex flex-col bg-[#0c0c0c] relative">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Manual Adjustment</div>
            <div className="flex-1 mt-3 relative z-20">{input}</div>
          </div>

          {/* Sessions Area - Full Width Bottom */}
          <div className="md:col-span-3 p-3 flex flex-col bg-[#0a0a0a] overflow-hidden border-t border-[#111]">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 ml-1">Sessions Log</div>
            <div className="flex-1 overflow-hidden relative">
              {sessions}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
