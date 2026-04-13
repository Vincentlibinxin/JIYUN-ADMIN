import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboard from '@/pages/AdminDashboard';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';

function AuthSilentScreen() {
  return <div className="min-h-screen bg-[#0f1012]" />;
}

function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthSilentScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function GuestOnlyRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthSilentScreen />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<GuestOnlyRoute><AdminLoginPage /></GuestOnlyRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
