import { createContext, useState, useEffect, useCallback } from 'react';
import { auth } from './index';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const loginWithGoogle = useCallback(async (id_token) => {
    setLoading(true);
    try {
      const data = await auth.google(id_token);
      // Backend returns: { access_token, user: { id, email, name, avatar } }
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await auth.logout(); } catch { /* ok — still clear local state */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  // Listen for 401 events fired by the API layer
  useEffect(() => {
    const handle = () => logout();
    window.addEventListener('auth:logout', handle);
    return () => window.removeEventListener('auth:logout', handle);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
