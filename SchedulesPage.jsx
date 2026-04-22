import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { schedules as schedulesApi } from './index';
import {
  Plus, BookOpen, ChevronRight, Trash2,
  Edit2, X, Check, RefreshCw, MessageSquare,
} from 'lucide-react';

function ScheduleCard({ schedule, onDelete, onSaveEdit }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(schedule.name);
  const [saving, setSaving] = useState(false);

  const statusStyle = {
    active:   'bg-green-100 text-green-600',
    archived: 'bg-gray-100 text-gray-500',
    draft:    'bg-amber-100 text-amber-700',
  };

  const handleSave = async () => {
    if (!name.trim() || name === schedule.name) { setEditing(false); return; }
    setSaving(true);
    try { await onSaveEdit(schedule.id, name.trim()); }
    finally { setSaving(false); setEditing(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <BookOpen size={18} className="text-indigo-500" />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => onDelete(schedule.id)}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Name */}
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
            className="flex-1 text-sm font-semibold border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button onClick={handleSave} disabled={saving} className="text-green-500 hover:bg-green-50 p-1 rounded">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button onClick={() => { setName(schedule.name); setEditing(false); }} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 p-1 rounded">
            <X size={13} />
          </button>
        </div>
      ) : (
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm leading-snug">{schedule.name}</h3>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-400 line-clamp-2 flex-1">
        {schedule.description || 'No description'}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50 dark:border-slate-700">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[schedule.status] || statusStyle.draft}`}>
          {schedule.status || 'draft'}
        </span>
        <div className="flex items-center gap-1">
          {/* Chat shortcut */}
          <button
            onClick={() => navigate(`/schedules/${schedule.id}/chat`)}
            title="AI Chat"
            className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded-lg text-gray-400 hover:text-indigo-500 transition-colors"
          >
            <MessageSquare size={14} />
          </button>
          <button
            onClick={() => navigate(`/schedules/${schedule.id}`)}
            className="flex items-center gap-0.5 text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            Open <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await schedulesApi.list() || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setCreating(true);
    setError('');
    try {
      await schedulesApi.create({ name: form.name.trim(), description: form.description.trim() });
      setForm({ name: '', description: '' });
      setShowModal(false);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Archive this schedule? It will be soft-deleted.')) return;
    try { await schedulesApi.delete(id); load(); }
    catch (e) { alert(e.message); }
  };

  const handleEdit = async (id, name) => {
    try { await schedulesApi.update(id, { name }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Schedules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create a schedule, upload documents, generate a plan</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-colors"
        >
          <Plus size={16} /> New Schedule
        </button>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl dark:border dark:border-slate-700">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">Create Schedule</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Name *</label>
                <input
                  autoFocus
                  placeholder="e.g. GATE 2025 — ML"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Description</label>
                <textarea
                  placeholder="Optional notes about this schedule"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowModal(false); setError(''); setForm({ name: '', description: '' }); }}
                className="flex-1 border border-gray-200 dark:border-slate-600 rounded-xl py-2.5 text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.name.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl h-44 animate-pulse" />
          ))}
        </div>
      ) : list.length > 0 ? (
        <div className="grid grid-cols-3 gap-4">
          {list.map((s) => (
            <ScheduleCard key={s.id} schedule={s} onDelete={handleDelete} onSaveEdit={handleEdit} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-2xl text-center shadow-sm dark:shadow-none dark:border dark:border-slate-700">
          <BookOpen size={36} className="text-gray-300 mb-3" />
          <p className="font-semibold text-gray-600 dark:text-gray-200">No schedules yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-1 mb-4">Create one to get started</p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-semibold"
          >
            <Plus size={15} /> New Schedule
          </button>
        </div>
      )}
    </div>
  );
}
