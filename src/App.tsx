import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboard from '@/pages/AdminDashboard';
import { AuthProvider, useAuth } from '@/lib/auth';

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0f1012] text-white flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-white/70">
        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
        正在验证登录状态...
      </div>
    </div>
  );
}

function AuthSilentScreen() {
  return <div className="min-h-screen bg-[#0f1012]" />;
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function GuestOnlyRoute({ children }: { children: JSX.Element }) {
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<GuestOnlyRoute><AdminLoginPage /></GuestOnlyRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
