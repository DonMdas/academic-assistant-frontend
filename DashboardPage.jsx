import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { schedules as schedulesApi, plan as planApi } from './index';
import { useAuth } from './useAuth';
import {
  BookOpen, CheckCircle2, Clock, Play,
  Pause, ChevronRight, Plus, RefreshCw,
} from 'lucide-react';

// ── Stat card (matches screenshot top row) ────────────────────
function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl px-6 py-5 flex-1 shadow-sm dark:shadow-none dark:border dark:border-slate-700">
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-400 text-xs mb-3">
        <Icon size={13} />
        {label}
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value ?? <span className="text-gray-300 dark:text-gray-500">—</span>}</p>
      <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

// ── Session timeline card ─────────────────────────────────────
function SessionCard({ session, onStart }) {
  const status = session.status === 'completed' ? 'done'
    : session.status === 'active'    ? 'active'
    : 'pending';

  const styles = {
    done:    'bg-white border border-gray-100 dark:bg-slate-800 dark:border-slate-700',
    active:  'bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-400/30',
    pending: 'bg-white border border-gray-100 dark:bg-slate-800 dark:border-slate-700',
  };
  const dot = {
    done:    'bg-green-400',
    active:  'bg-amber-400',
    pending: 'bg-gray-300',
  };
  const label = {
    done:    'Done',
    active:  'Start Learning',
    pending: 'Upcoming',
  };
  const labelColor = {
    done:    'text-green-500',
    active:  'text-amber-600 dark:text-amber-300',
    pending: 'text-gray-400 dark:text-gray-500',
  };

  return (
    <div
      onClick={() => status !== 'done' && onStart(session)}
      className={`flex-shrink-0 w-44 rounded-xl px-3 py-3 cursor-pointer transition-shadow hover:shadow-md ${styles[status]}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot[status]}`} />
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{session.title}</p>
      </div>
      <p className={`text-[10px] font-semibold pl-3.5 ${labelColor[status]}`}>{label[status]}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [scheduleList, setScheduleList] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Timer (local — no backend endpoint for this)
  const [timerSec, setTimerSec] = useState(1);
  const [timerOn, setTimerOn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // GET /schedules
      const list = await schedulesApi.list();
      setScheduleList(list || []);

      // GET /schedules/{id}/plan/sessions for each schedule (up to 4)
      const sessionBuckets = await Promise.allSettled(
        (list || []).slice(0, 4).map((s) =>
          planApi.sessions(s.id).then((sess) =>
            (sess || []).map((se) => ({ ...se, scheduleName: s.name, scheduleId: s.id }))
          )
        )
      );

      const flat = sessionBuckets
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);

      setAllSessions(flat);
      setCompletedCount(flat.filter((s) => s.status === 'completed').length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let t;
    if (timerOn) t = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerOn]);

  const fmt = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const toLocalDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getSessionDateKey = (session) => {
    const rawDate = session?.scheduled_date || session?.date || session?.scheduled_for || null;
    if (typeof rawDate === 'string' && rawDate.trim()) return rawDate.slice(0, 10);

    const rawDateTime = session?.date_time || session?.start_time || session?.starts_at || session?.scheduled_at || null;
    if (typeof rawDateTime === 'string' && rawDateTime.trim()) {
      const parsed = new Date(rawDateTime);
      if (!Number.isNaN(parsed.getTime())) return toLocalDateKey(parsed);
    }
    return null;
  };

  const parseTimeToMinutes = (value) => {
    if (typeof value !== 'string' || !value.trim()) return Number.POSITIVE_INFINITY;
    const [h, m] = value.split(':').map((part) => Number(part));
    if (Number.isNaN(h) || Number.isNaN(m)) return Number.POSITIVE_INFINITY;
    return (h * 60) + m;
  };

  const todayKey = toLocalDateKey(new Date());
  const todaySessions = allSessions
    .filter((s) => getSessionDateKey(s) === todayKey)
    .sort((a, b) => {
      const timeDelta = parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
      if (timeDelta !== 0) return timeDelta;
      return (a.session_number ?? Number.MAX_SAFE_INTEGER) - (b.session_number ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 8);
  const recentCompleted = allSessions
    .filter((s) => s.status === 'completed')
    .slice(0, 5);

  return (
    <div>
      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          👋 Welcome back, {user?.name?.split(' ')[0] || 'Student'}! Ready to level up your skills today?
        </p>
      </div>

      {/* ── Row 1: Stats ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-4">
        <StatCard
          label="Schedules"
          value={scheduleList.length}
          sub="Active study plans"
          icon={BookOpen}
        />
        <StatCard
          label="Sessions Completed"
          value={completedCount}
          sub="Keep it up!"
          icon={CheckCircle2}
        />
        <StatCard
          label="Total Sessions"
          value={allSessions.length}
          sub="Across all schedules"
          icon={Clock}
        />
      </div>

      {/* ── Row 2: Today's schedule ────────────────────────────── */}
      <div className="flex mb-4">
        {/* Today's Schedule — sessions timeline */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl px-5 py-5 flex-1 shadow-sm dark:shadow-none dark:border dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Today's Schedule</span>
            <button
              onClick={() => navigate('/schedules')}
              className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>

          {loading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-44 h-16 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse flex-shrink-0" />
              ))}
            </div>
          ) : todaySessions.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {todaySessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onStart={(session) => navigate(`/sessions/${session.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-20 text-gray-400 dark:text-gray-400 text-sm gap-2">
              <p>No sessions scheduled for today.</p>
              <button
                onClick={() => navigate('/schedules')}
                className="text-indigo-500 hover:underline text-xs flex items-center gap-1"
              >
                <Plus size={12} /> Create a schedule &amp; generate a plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Completed sessions table + Timer widget ────── */}
      <div className="flex gap-4">
        {/* Completed sessions */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl px-6 py-5 flex-1 shadow-sm dark:shadow-none dark:border dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Recently Completed</h3>
          {recentCompleted.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 dark:text-gray-400 text-xs border-b border-gray-100 dark:border-slate-700">
                  <th className="text-left pb-2 font-normal">Session</th>
                  <th className="text-left pb-2 font-normal">Schedule</th>
                  <th className="text-left pb-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentCompleted.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                    className="border-b border-gray-50 dark:border-slate-700 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-700/70 cursor-pointer transition-colors"
                  >
                    <td className="py-3 text-gray-800 dark:text-gray-100 font-medium text-sm">{s.title}</td>
                    <td className="py-3 text-gray-400 dark:text-gray-400 text-xs">{s.scheduleName}</td>
                    <td className="py-3">
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        Completed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-400 py-4 text-center">
              Complete study sessions to see them here
            </p>
          )}
        </div>

        {/* Time tracker widget */}
        <div
          className="w-56 flex-shrink-0 rounded-2xl flex flex-col items-center justify-center py-8 gap-4 shadow-sm"
          style={{ background: 'linear-gradient(140deg, #1e1b4b 0%, #4338ca 60%, #f59e0b 100%)' }}
        >
          <div className="flex items-center gap-1.5 text-white/70 text-xs">
            <Clock size={13} />
            Time Tracker
          </div>
          <button
            onClick={() => setTimerOn((o) => !o)}
            className="w-14 h-14 rounded-full border-2 border-white/30 hover:border-white/60 flex items-center justify-center transition-colors"
          >
            {timerOn
              ? <Pause size={20} className="text-white" fill="white" />
              : <Play  size={20} className="text-white ml-0.5" fill="white" />
            }
          </button>
          <p className="text-3xl font-mono font-bold text-white tracking-widest">{fmt(timerSec)}</p>
          <p className="text-white/40 text-xs">Session timer</p>
        </div>
      </div>
    </div>
  );
}
