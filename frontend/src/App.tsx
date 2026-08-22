import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import AtendimentoPage from './pages/AtendimentoPage';
import DashboardPage from './pages/DashboardPage';
import FlowBuilderPage from './pages/FlowBuilderPage';
import KanbanPage from './pages/KanbanPage';
import LeadsPage from './pages/LeadsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import QueuesPage from './pages/QueuesPage';
import TasksPage from './pages/TasksPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="leads" element={<ProtectedRoute permission="lead:read"><LeadsPage /></ProtectedRoute>} />
          <Route path="atendimento" element={<ProtectedRoute permission="whatsapp:read"><AtendimentoPage /></ProtectedRoute>} />
          <Route path="kanban" element={<ProtectedRoute permission="lead:read"><KanbanPage /></ProtectedRoute>} />
          <Route path="tasks" element={<ProtectedRoute permission="task:read"><TasksPage /></ProtectedRoute>} />
          <Route path="queues" element={<ProtectedRoute permission="queue:read"><QueuesPage /></ProtectedRoute>} />
          <Route path="flows" element={<ProtectedRoute permission="distribution:configure"><FlowBuilderPage /></ProtectedRoute>} />
          <Route path="admin" element={<ProtectedRoute permission="user:read"><AdminPage /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
