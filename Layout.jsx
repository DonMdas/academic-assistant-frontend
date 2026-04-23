import { Outlet, NavLink,useNavigate, Link} from 'react-router-dom';
import { useAuth } from './useAuth';
import { useTheme } from './ThemeContext';
import {
  LayoutDashboard,
  BookOpen,
  LogOut,
  ChevronDown,
  GraduationCap,
  Moon,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth } from './index';
import { connectCalendarWithPopup } from './calendarConnect';

// Only nav items that correspond to real backend features
const navItems = [
  { label: 'Dashboard',   icon: LayoutDashboard, to: '/dashboard' },
  { label: 'My Schedules', icon: BookOpen,        to: '/schedules' },
];


function NavItem({ icon: Icon, label, to }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-500/20 dark:text-indigo-200'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
        }`
      }
    >
      <Icon size={17} />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState('');
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  useEffect(() => {
    if (!profileOpen) return;

    let active = true;
    setCalendarStatusLoading(true);
    setCalendarError('');

    auth.calendarStatus()
      .then((status) => {
        if (!active) return;
        setCalendarConnected(Boolean(status?.connected));
        setCalendarEmail(String(status?.email || ''));
      })
      .catch((e) => {
        if (!active) return;
        setCalendarError(e.message || 'Unable to load calendar status');
      })
      .finally(() => {
        if (!active) return;
        setCalendarStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [profileOpen]);

  const connectCalendar = async () => {
    setCalendarBusy(true);
    setCalendarError('');
    try {
      const result = await connectCalendarWithPopup(auth);
      setCalendarConnected(Boolean(result?.connected));
      setCalendarEmail(String(result?.email || ''));
      alert('Google Calendar connected successfully.');
    } catch (e) {
      setCalendarError(e.message || 'Failed to connect Google Calendar');
    } finally {
      setCalendarBusy(false);
    }
  };

  const disconnectCalendar = async () => {
    setCalendarBusy(true);
    setCalendarError('');
    try {
      await auth.calendarDisconnect();
      setCalendarConnected(false);
      setCalendarEmail('');
      alert('Google Calendar disconnected.');
    } catch (e) {
      setCalendarError(e.message || 'Failed to disconnect Google Calendar');
    } finally {
      setCalendarBusy(false);
    }
  };

  const initials = user?.name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  return (
    <div className="flex h-screen bg-[#f0ede8] dark:bg-slate-900 overflow-hidden transition-colors">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 bg-white dark:bg-slate-800 rounded-2xl m-3 mr-0 flex flex-col shadow-sm dark:shadow-none dark:border dark:border-slate-700">
        {/* Logo */}
        {/* Logo */}
        <Link 
          to="/dashboard" 
          className="px-5 py-5 flex items-center gap-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer block"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <GraduationCap size={17} className="text-white" />
            </div>
            <div className="leading-none">
              <span className="font-bold text-gray-900 text-sm tracking-tight">Acad</span>
              <span className="font-bold text-indigo-600 text-sm tracking-tight"> Assist</span>
            </div>
          </div>
        </Link>

        {/* Nav */}
        <div className="px-3 pt-4 flex-1 space-y-0.5">
          {navItems.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100 dark:border-slate-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors dark:text-gray-300 dark:hover:bg-red-500/15"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-end gap-3 px-6 pt-5 pb-3">
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-600 dark:bg-slate-800 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-2 pr-3 py-1.5 shadow-sm hover:bg-gray-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                  {initials}
                </div>
              )}
              <div className="text-left leading-none">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{user?.name || 'Student'}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-400 mt-0.5">Student</p>
              </div>
              <ChevronDown size={13} className="text-gray-400 dark:text-gray-500 ml-1" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 dark:bg-slate-800 dark:border-slate-700">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{user?.email}</p>
                </div>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Google Calendar</p>
                  {calendarStatusLoading ? (
                    <p className="text-xs text-gray-400 mt-1">Checking status...</p>
                  ) : calendarConnected ? (
                    <p className="text-xs text-green-600 mt-1 truncate">Connected{calendarEmail ? `: ${calendarEmail}` : ''}</p>
                  ) : (
                    <p className="text-xs text-amber-600 mt-1">Not connected</p>
                  )}
                  {calendarError && (
                    <p className="text-xs text-red-500 mt-1">{calendarError}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={connectCalendar}
                      disabled={calendarBusy}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 dark:text-gray-100 transition-colors"
                    >
                      {calendarBusy ? 'Please wait...' : 'Connect'}
                    </button>
                    <button
                      onClick={disconnectCalendar}
                      disabled={calendarBusy || !calendarConnected}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setProfileOpen(false); logout(); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
