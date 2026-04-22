import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useTheme } from './ThemeContext';
import { GraduationCap } from 'lucide-react';
import { Moon, Sun } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function LoginPage() {
  const { loginWithGoogle, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const btnRef = useRef(null);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (user) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            await loginWithGoogle(credential);
            navigate('/', { replace: true });
          } catch (e) {
            console.error('Login failed', e);
          }
        },
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
        text: 'signin_with',
        shape: 'pill',
      });
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [loginWithGoogle, navigate, user]);

  return (
    <div className="min-h-screen bg-[#f0ede8] dark:bg-slate-900 flex items-center justify-center p-4 transition-colors">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-600 dark:bg-slate-800 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl dark:shadow-none dark:border dark:border-slate-700 p-10 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div className="leading-none text-left">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-xl tracking-tight">Acad</span>
            <span className="font-bold text-indigo-600 text-xl tracking-tight"> Assist</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Welcome back</h1>
        <p className="text-sm text-gray-400 dark:text-gray-400 mb-8">
          Sign in to continue your learning journey
        </p>

        {/* Google Sign-In button rendered by GSI SDK */}
        <div className="flex justify-center" ref={btnRef} />

        <p className="text-xs text-gray-400 dark:text-gray-400 mt-6">
          By signing in you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    </div>
  );
}
