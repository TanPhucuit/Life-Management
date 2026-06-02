import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Trash2, Timer, Trophy, X } from 'lucide-react';
import { ApiSession } from '@/app/lib/api';

interface SessionItemProps {
  session: ApiSession;
  onUpdate: (id: string, updates: Partial<ApiSession>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function SessionItem({ session, onUpdate, onDelete }: SessionItemProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const defaultMinutes =
    session.focused_minutes ?? Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000);

  const [editSessionName, setEditSessionName] = useState(session.session_name || '');
  const [editDate, setEditDate] = useState(session.session_date);
  const [editStartTime, setEditStartTime] = useState(new Date(session.start_time).toTimeString().slice(0, 5));
  const [editEndTime, setEditEndTime] = useState(new Date(session.end_time).toTimeString().slice(0, 5));
  const [editStatus, setEditStatus] = useState<'in_time' | 'out_time'>(session.in_time_status);

  const handleUpdate = async () => {
    setIsUpdating(true);
    const newStart = `${editDate}T${editStartTime}:00`;
    const newEnd = `${editDate}T${editEndTime}:00`;

    await onUpdate(session.id, {
      session_name: editSessionName.trim() || null,
      session_date: editDate,
      start_time: newStart,
      end_time: newEnd,
      in_time_status: editStatus,
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
  const endTime = new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const statusLabel = session.in_time_status === 'in_time' ? 'Đúng giờ' : 'Trễ giờ';

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{session.session_name || 'Session chưa đặt tên'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {startTime} - {endTime}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
              session.in_time_status === 'in_time' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-slate-50 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Timer className="h-3.5 w-3.5 text-blue-600" />
              Thời lượng
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-950">{defaultMinutes} phút</p>
          </div>
          <div className="rounded-md bg-slate-50 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Trophy className="h-3.5 w-3.5 text-orange-500" />
              Chất lượng
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-950">Level {session.key_of_success || 0}</p>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
          >
            <Pencil className="h-3.5 w-3.5" />
            Sửa
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteAlertOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {isEditModalOpen && (
          <ModalShell onClose={() => setIsEditModalOpen(false)}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-950">Sửa session</h3>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <Field label="Tên session">
                <input
                  type="text"
                  value={editSessionName}
                  onChange={(event) => setEditSessionName(event.target.value)}
                  placeholder="Tên session"
                  className={inputClass}
                />
              </Field>

              <Field label="Ngày">
                <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} className={inputClass} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Bắt đầu">
                  <input type="time" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} className={inputClass} />
                </Field>
                <Field label="Kết thúc">
                  <input type="time" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} className={inputClass} />
                </Field>
              </div>

              <Field label="Trạng thái">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus('in_time')}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                      editStatus === 'in_time'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Đúng giờ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStatus('out_time')}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                      editStatus === 'out_time'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Trễ giờ
                  </button>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-xs text-slate-500">Phút</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{defaultMinutes}m</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Chất lượng</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">Level {session.key_of_success || 0}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleUpdate}
                disabled={isUpdating}
                className="w-full rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteAlertOpen && (
          <ModalShell onClose={() => setIsDeleteAlertOpen(false)} size="sm">
            <div className="p-5">
              <h3 className="text-lg font-semibold text-slate-950">Xóa session</h3>
              <p className="mt-2 text-sm text-slate-500">Bạn có chắc chắn muốn xóa session này? Hành động này không thể hoàn tác.</p>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteAlertOpen(false)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? 'Đang xóa...' : 'Xóa'}
                </button>
              </div>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({ children, onClose, size = 'md' }: { children: React.ReactNode; onClose: () => void; size?: 'sm' | 'md' }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        className={`relative z-10 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ${size === 'sm' ? 'max-w-sm' : 'max-w-md'}`}
      >
        {children}
      </motion.div>
    </div>
  );
}
