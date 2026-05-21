import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Agents from './pages/Agents';
import Workflows from './pages/Workflows';
import WorkflowEditor from './pages/WorkflowEditor';
import Tasks from './pages/Tasks';
import Alerts from './pages/Alerts';
import AlertMappings from './pages/AlertMappings';
import Knowledge from './pages/Knowledge';
import Scripts from './pages/Scripts';
import ScheduledTasks from './pages/ScheduledTasks';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import AlertNoiseManagement from './pages/AlertNoiseManagement';
import RootCauseAnalysis from './pages/RootCauseAnalysis';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  // 初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
              <Route path="agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
              <Route path="workflows" element={<ProtectedRoute><Workflows /></ProtectedRoute>} />
              <Route path="workflows/:id" element={<ProtectedRoute><WorkflowEditor /></ProtectedRoute>} />
              <Route path="tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
              <Route path="alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
              <Route path="alert-mappings" element={<ProtectedRoute><AlertMappings /></ProtectedRoute>} />
              <Route path="knowledge" element={<ProtectedRoute><Knowledge /></ProtectedRoute>} />
              <Route path="scripts" element={<ProtectedRoute><Scripts /></ProtectedRoute>} />
              <Route path="scheduled-tasks" element={<ProtectedRoute><ScheduledTasks /></ProtectedRoute>} />
              <Route path="audit" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
              <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="alert-noise" element={<ProtectedRoute><AlertNoiseManagement /></ProtectedRoute>} />
              <Route path="root-cause-analysis" element={<ProtectedRoute><RootCauseAnalysis /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
