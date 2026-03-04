import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, AdminUser, setUnauthorizedHandler } from './api';
import { AUTO_LOGOUT_MS } from './config';

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LOGOUT_SYNC_KEY = 'admin:logout-sync';

function setExpiredTip(show: boolean): void {
  if (show) {
    sessionStorage.setItem('adminAuthExpired', '1');
  } else {
    sessionStorage.removeItem('adminAuthExpired');
  }
}

function clearLocalSessionData(): void {
  sessionStorage.removeItem('adminCsrfToken');
  localStorage.removeItem('adminUser');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);
  const isLoggingOutRef = useRef(false);

  const clearAutoLogoutTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const broadcastLogout = useCallback((showExpiredTip: boolean) => {
    localStorage.setItem(
      LOGOUT_SYNC_KEY,
      JSON.stringify({ at: Date.now(), showExpiredTip }),
    );
  }, []);

  const runLogout = useCallback(async (options?: { callApi?: boolean; broadcast?: boolean; showExpiredTip?: boolean }) => {
    if (isLoggingOutRef.current) {
      return;
    }

    const callApi = options?.callApi !== false;
    const shouldBroadcast = options?.broadcast !== false;
    const shouldShowExpiredTip = options?.showExpiredTip !== false;

    isLoggingOutRef.current = true;
    clearAutoLogoutTimer();

    try {
      if (callApi) {
        try {
          await api.auth.logout();
        } catch {
        }
      }
    } finally {
      setExpiredTip(shouldShowExpiredTip);
      clearLocalSessionData();
      setUser(null);
      setLoading(false);
      if (shouldBroadcast) {
        broadcastLogout(shouldShowExpiredTip);
      }
      isLoggingOutRef.current = false;
    }
  }, [broadcastLogout, clearAutoLogoutTimer]);

  const resetAutoLogoutTimer = useCallback(() => {
    if (!user || loading) {
      clearAutoLogoutTimer();
      return;
    }

    clearAutoLogoutTimer();
    timerRef.current = window.setTimeout(() => {
      void runLogout({ callApi: true, broadcast: true, showExpiredTip: false });
    }, AUTO_LOGOUT_MS);
  }, [clearAutoLogoutTimer, loading, runLogout, user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void runLogout({ callApi: false, broadcast: true, showExpiredTip: true });
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [runLogout]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOGOUT_SYNC_KEY || !event.newValue) {
        return;
      }

      let showExpiredTip = true;
      try {
        const parsed = JSON.parse(event.newValue);
        showExpiredTip = Boolean(parsed?.showExpiredTip);
      } catch {
      }

      clearAutoLogoutTimer();
      setExpiredTip(showExpiredTip);
      clearLocalSessionData();
      setUser(null);
      setLoading(false);
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [clearAutoLogoutTimer]);

  useEffect(() => {
    if (!user || loading) {
      clearAutoLogoutTimer();
      return;
    }

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const onActivity = () => resetAutoLogoutTimer();

    resetAutoLogoutTimer();

    events.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      clearAutoLogoutTimer();
    };
  }, [clearAutoLogoutTimer, loading, resetAutoLogoutTimer, user]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const session = await api.auth.getSession();
        if (!mounted) {
          return;
        }

        if (!session?.admin || !session?.csrfToken) {
          throw new Error('invalid_session');
        }

        localStorage.setItem('adminUser', JSON.stringify(session.admin));
        sessionStorage.setItem('adminCsrfToken', session.csrfToken);
        setExpiredTip(false);
        setUser(session.admin);
      } catch {
        if (!mounted) {
          return;
        }

        clearLocalSessionData();
        setUser(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
      clearAutoLogoutTimer();
    };
  }, [clearAutoLogoutTimer]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.auth.login(username, password);

    if (!result?.admin) {
      throw new Error('登入失敗：伺服器回應缺少帳號資料，請聯絡管理員');
    }

    if (!result?.csrfToken) {
      throw new Error('登入失敗：伺服器回應缺少憑證，請聯絡管理員');
    }

    setExpiredTip(false);
    localStorage.setItem('adminUser', JSON.stringify(result.admin));
    sessionStorage.setItem('adminCsrfToken', result.csrfToken);
    setUser(result.admin);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await runLogout({ callApi: true, broadcast: true, showExpiredTip: false });
  }, [runLogout]);

  const contextValue = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    logout,
  }), [loading, login, logout, user]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
