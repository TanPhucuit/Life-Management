import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, Timer, Trophy, X } from 'lucide-react';
import { ApiSession } from '@/app/lib/api';

interface SessionItemProps {
  session: ApiSession;
  onUpdate: (id: string, updates: Partial<ApiSession>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function SessionItem({ session, onUpdate, onDelete }: SessionItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  
  const defaultMinutes = session.focused_minutes ?? Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000);
  
  // Edit State
  const [editDate, setEditDate] = useState(session.session_date);
  const [editStartTime, setEditStartTime] = useState(new Date(session.start_time).toTimeString().slice(0, 5));
  const [editEndTime, setEditEndTime] = useState(new Date(session.end_time).toTimeString().slice(0, 5));
  const [editStatus, setEditStatus] = useState<'in_time'|'out_time'>(session.in_time_status);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const kosColors = {
    0: 'text-gray-400',
    1: 'text-[#CD7F32]', // Bronze
    2: 'text-[#C0C0C0]', // Silver
    3: 'text-[#FFD700]', // Gold
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    const newStart = `${editDate}T${editStartTime}:00`;
    const newEnd = `${editDate}T${editEndTime}:00`;
    
    await onUpdate(session.id, { 
      session_date: editDate,
      start_time: newStart,
      end_time: newEnd,
      in_time_status: editStatus 
    });
    setIsUpdating(false);
    setIsEditModalOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(session.id);
    setIsDeleting(false);
    setIsDeleteAlertOpen(false);
  };

  const startTime = new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, x: -20, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
        whileHover={{ scale: 0.98 }}
        whileTap={{ scale: 0.95 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative min-w-[140px] flex flex-col p-3 rounded-[16px] bg-[#161616] border border-[#222] overflow-hidden shrink-0 cursor-pointer"
      >
        <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        
        <div className="text-xs font-bold text-white mb-2">{startTime}</div>
        
        <div className="flex items-center gap-1.5 text-xs text-white/70 mb-1.5 font-medium">
          <Timer size={14} className="text-blue-400" />
          <span>{defaultMinutes} min</span>
        </div>
        
        <div className="flex items-center gap-1.5 text-xs text-white/70 font-medium">
          <Trophy size={14} className={kosColors[(session.key_of_success || 0) as keyof typeof kosColors]} />
          <span>Level {session.key_of_success || 0}</span>
        </div>

        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center gap-3 z-10"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setIsEditModalOpen(true); }}
                className="p-2 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 transition-colors"
                title="Sửa"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setIsDeleteAlertOpen(true); }}
                className="p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                title="Xóa"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[#161616] border border-[#333] p-6 rounded-[16px] w-full max-w-xs z-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Edit Session</h3>
                <button onClick={() => setIsEditModalOpen(false)} className="text-white/50 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-[#222] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">Status</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditStatus('in_time')}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                        editStatus === 'in_time'
                          ? 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-[#222] border-[#333] text-white/50 hover:bg-[#2a2a2a]'
                      }`}
                    >
                      On Time
                    </button>
                    <button
                      onClick={() => setEditStatus('out_time')}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                        editStatus === 'out_time'
                          ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                          : 'bg-[#222] border-[#333] text-white/50 hover:bg-[#2a2a2a]'
                      }`}
                    >
                      Out Time
                    </button>
                  </div>
                </div>
                
                {/* Disabled reference fields */}
                <div className="grid grid-cols-2 gap-3 opacity-50 pointer-events-none mt-2 pt-4 border-t border-[#333]">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1">Minutes</label>
                    <div className="text-sm font-medium text-white">{defaultMinutes}m</div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1">Quality</label>
                    <div className="text-sm font-medium text-white">Level {session.key_of_success || 0}</div>
                  </div>
                </div>
                
                <button
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="w-full mt-4 bg-white text-black py-2.5 rounded-lg font-bold hover:bg-white/90 transition-all disabled:opacity-50 text-sm"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Alert Dialog */}
      <AnimatePresence>
        {isDeleteAlertOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsDeleteAlertOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[#161616] border border-white/10 p-6 rounded-[16px] w-full max-w-sm z-10 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-white mb-2">Delete Session</h3>
              <p className="text-sm text-white/60 mb-6 font-medium">Bạn có chắc chắn muốn xóa session này? Hành động này không thể hoàn tác.</p>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setIsDeleteAlertOpen(false)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-white hover:bg-white/10 font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
