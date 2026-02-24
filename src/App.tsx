import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboard from '@/pages/AdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
