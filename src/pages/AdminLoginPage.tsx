import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/config';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const expired = sessionStorage.getItem('adminAuthExpired');
    if (expired === '1') {
      setError('登入狀態已過期，請重新登入');
      sessionStorage.removeItem('adminAuthExpired');
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('用户名和密码不能为空');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      const payload = data?.data ?? data;
      const token = payload?.token ?? payload?.accessToken;
      const admin = payload?.admin ?? payload?.user ?? null;

      if (response.ok) {
        if (!token) {
          setError('登入失敗：伺服器回應缺少憑證，請聯絡管理員');
          return;
        }

        localStorage.setItem('adminToken', token);
        localStorage.setItem('adminUser', JSON.stringify(admin));
        navigate('/dashboard');
      } else {
        setError(
          data.error ||
          data.message ||
          (response.status === 401 ? '用戶名或密碼錯誤' : '登入失敗')
        );
      }
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('failed to fetch') || message.includes('network') || message.includes('load failed')) {
        setError('無法連線後端服務，請確認 API 服務已啟動（預設 http://localhost:3001）');
      } else {
        setError(err.message || '請求失敗');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-black font-display antialiased overflow-hidden text-slate-200 relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1e293b] via-[#0f172a] to-[#020617]"></div>
        <div className="absolute inset-0 opacity-40 bg-[size:40px_40px] bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] [mask-image:radial-gradient(circle_at_center,black_40%,transparent_100%)]"></div>
        
        {/* Animated contours */}
        <div className="absolute w-[150%] h-[150%] rounded-[40%] border border-white/5 top-[-25%] left-[-25%] animate-[spin_60s_linear_infinite]"></div>
        <div className="absolute w-[140%] h-[140%] rounded-[40%] border border-white/5 top-[-20%] left-[-20%] animate-[spin_50s_linear_infinite_reverse]"></div>
        
        {/* Glowing dots */}
        <div className="absolute w-1 h-1 bg-[#f58220] rounded-full shadow-[0_0_8px_2px_rgba(245,130,32,0.4)] top-[20%] left-[15%] animate-pulse"></div>
        <div className="absolute w-1 h-1 bg-[#f58220] rounded-full shadow-[0_0_8px_2px_rgba(245,130,32,0.4)] top-[60%] right-[10%] animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 w-full max-w-[430px] px-8 flex flex-col h-full justify-center">
        <header className="flex flex-col items-center mb-8">
          <div className="relative w-32 h-32 mb-4 bg-slate-800/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] flex items-center justify-center p-4 overflow-hidden">
            <img src="/logo.png" alt="榕台海峡快运 LOGO" className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-1 tracking-[0.2em] leading-tight drop-shadow-md">
              業務管理系統
            </h1>
            <div className="flex items-center justify-center w-full px-2 mb-1 opacity-80">
              <div className="h-[1px] w-6 bg-gradient-to-r from-transparent to-[#f58220]"></div>
              <div className="w-1 h-1 bg-[#f58220]/80 rounded-full mx-1 shadow-[0_0_8px_rgba(245,130,32,0.8)]"></div>
              <div className="h-[1px] w-8 bg-slate-700"></div>
              <span className="mx-2 text-[10px] text-[#f58220] font-mono tracking-widest whitespace-nowrap">ADMIN PORTAL</span>
              <div className="h-[1px] w-8 bg-slate-700"></div>
              <div className="w-1 h-1 bg-[#f58220]/80 rounded-full mx-1 shadow-[0_0_8px_rgba(245,130,32,0.8)]"></div>
              <div className="h-[1px] w-6 bg-gradient-to-l from-transparent to-[#f58220]"></div>
            </div>
            <p className="text-slate-400 text-[10px] uppercase tracking-[0.15em] font-semibold font-mono">
              RONGTAI ADMINISTRATION SYSTEM
            </p>
          </div>
        </header>

        <main className="w-full">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2 rounded-xl text-sm">
                {error}
              </div>
            )}
            <div className="group flex items-center bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 focus-within:border-[#f58220] focus-within:ring-2 focus-within:ring-[#f58220]/20 transition-all duration-300 h-12">
              <div className="w-12 h-full flex items-center justify-center bg-slate-50 border-r border-slate-100">
                <span className="material-symbols-outlined text-slate-400 text-xl group-focus-within:text-[#f58220] transition-colors">admin_panel_settings</span>
              </div>
              <input 
                className="flex-1 h-full px-4 text-slate-800 bg-white border-none focus:ring-0 placeholder:text-slate-400 text-sm tracking-wide outline-none" 
                placeholder="管理員用戶名" 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="group flex items-center bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 focus-within:border-[#f58220] focus-within:ring-2 focus-within:ring-[#f58220]/20 transition-all duration-300 h-12">
              <div className="w-12 h-full flex items-center justify-center bg-slate-50 border-r border-slate-100">
                <span className="material-symbols-outlined text-slate-400 text-xl group-focus-within:text-[#f58220] transition-colors">lock</span>
              </div>
              <input 
                className="flex-1 h-full px-4 text-slate-800 bg-white border-none focus:ring-0 placeholder:text-slate-400 text-sm tracking-wide outline-none" 
                placeholder="管理員密碼" 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="w-12 h-full flex items-center justify-center bg-white border-l border-slate-100 text-slate-400 hover:text-[#f58220] transition-colors"
              >
                <span className="material-symbols-outlined text-xl">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            <button className="relative overflow-hidden w-full bg-gradient-to-r from-[#f9a34b] to-[#f58220] text-white font-bold h-12 rounded-xl shadow-[0_0_20px_rgba(245,130,32,0.3)] hover:shadow-[0_0_30px_rgba(245,130,32,0.5)] active:scale-[0.98] transition-all mt-6 text-base tracking-widest group disabled:opacity-50 disabled:cursor-not-allowed" type="submit" disabled={loading}>
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? '登入中...' : '管理員登入'}
                {!loading && <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">login</span>}
              </span>
            </button>
          </form>
        </main>

        <footer className="pb-6 text-center mt-auto relative z-10 pt-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
              演示帳號: admin / Admin123456
            </p>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest font-mono">
              © 2026 RONGTAI STRAIT EXPRESS
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
