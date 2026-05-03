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
    <div className="mx-auto flex w-full max-w-[1600px] flex-col p-0 sm:p-2 lg:h-full">
      <div 
        className="flex flex-1 flex-col overflow-hidden rounded-[16px] border border-[#333] bg-[#0a0a0a] shadow-2xl"
        style={{
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}
      >
        <div className="grid flex-1 grid-cols-1 lg:h-full lg:grid-cols-[1.6fr_1fr_1fr] lg:grid-rows-[1fr_1fr_minmax(100px,auto)]">
          
          {/* Visual Area - Spans 2 rows on Desktop */}
          <div className="relative flex min-h-[260px] flex-col overflow-hidden border-b border-[#222] bg-gradient-to-br from-[#0f0f0f] to-[#050505] p-3 sm:min-h-[360px] sm:p-4 lg:row-span-2 lg:border-b-0 lg:border-r">
            {visual}
          </div>

          {/* Stopwatch Area */}
          <div className="relative flex min-h-[150px] flex-col border-b border-[#222] bg-[#0c0c0c] p-4 lg:border-r">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Stopwatch Control</div>
            <div className="flex-1 mt-3 relative z-20">{stopwatch}</div>
          </div>

          {/* Target Area */}
          <div className="relative flex min-h-[150px] flex-col border-b border-[#222] bg-[#0c0c0c] p-4">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Daily Target</div>
            <div className="flex-1 mt-3 relative z-20">{target}</div>
          </div>

          {/* Quality Area */}
          <div className="relative flex min-h-[150px] flex-col border-b border-[#222] bg-[#0c0c0c] p-4 lg:border-r">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Quality Rating</div>
            <div className="flex-1 mt-3 relative z-20">{quality}</div>
          </div>

          {/* Manual Input Area */}
          <div className="relative flex min-h-[150px] flex-col border-b border-[#222] bg-[#0c0c0c] p-4">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1 absolute top-2 left-3 z-10">Manual Adjustment</div>
            <div className="flex-1 mt-3 relative z-20">{input}</div>
          </div>

          {/* Sessions Area - Full Width Bottom */}
          <div className="flex min-h-[150px] flex-col overflow-hidden border-t border-[#111] bg-[#0a0a0a] p-3 lg:col-span-3">
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
