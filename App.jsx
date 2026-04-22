import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import { ThemeProvider } from './ThemeContext';
import Layout from './Layout';
import LoginPage from './LoginPage';
import DashboardPage from './DashboardPage';
import SchedulesPage from './SchedulesPage';
import ScheduleDetailPage from './ScheduleDetailPage';
import PlanPage from './PlanPage';
import SessionPage from './SessionPage';
import ScheduleChatPage from './ScheduleChatPage';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              {/* Dashboard — aggregates schedules + sessions */}
              <Route path="dashboard" element={<DashboardPage />} />
              {/* Schedules CRUD */}
              <Route path="schedules" element={<SchedulesPage />} />
              {/* Schedule detail — doc upload + ingest polling */}
              <Route path="schedules/:id" element={<ScheduleDetailPage />} />
              {/* Plan generation → confirmation → sessions */}
              <Route path="schedules/:id/plan" element={<PlanPage />} />
              {/* Schedule-level RAG chat */}
              <Route path="schedules/:id/chat" element={<ScheduleChatPage />} />
              {/* Study session — briefing SSE + session RAG chat */}
              <Route path="sessions/:id" element={<SessionPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
