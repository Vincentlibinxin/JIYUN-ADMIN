import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type LangCode = 'zh-CN' | 'zh-TW' | 'en-US' | 'id-ID';

type TranslationValue = string;
type Dictionary = Record<string, TranslationValue>;

const STORAGE_KEY = 'jiyun.admin.lang';
const DEFAULT_LANG: LangCode = 'zh-CN';

const dictionaries: Record<LangCode, Dictionary> = {
  'zh-CN': {
    'lang.simplifiedChinese': '中文简体',
    'lang.traditionalChinese': '中文繁體',
    'lang.english': 'English',
    'lang.indonesian': 'Indonesian',

    'app.systemTitle': '业务管理系统',
    'app.admin': '管理员',
    'app.logout': '登出',

    'menu.overview': '首页',
    'menu.users': '会员管理',
    'menu.orders': '订单管理',
    'menu.sms': '简讯资讯',
    'menu.parcels': '包裹管理',
    'menu.admins': '系统管理员',

    'login.username': '管理员用户名',
    'login.password': '管理员密码',
    'login.submit': '管理员登入',
    'login.usernameRequired': '用户名不能为空',
    'login.passwordRequired': '密码不能为空',
    'login.invalidCredentials': '用户名或密码错误',
    'login.failed': '登入失败',
    'login.requestFailed': '请求失败',
    'login.networkError': '无法连线后端服务，请检查网络或稍后重试',
    'login.retryPrefix': '登录尝试过于频繁，请在 ',
    'login.retrySuffix': ' 后重试',

    'auth.checking': '正在验证登录状态...',

    'dashboard.totalUsers': '会员总数',
    'dashboard.totalOrders': '订单总数',
    'dashboard.totalParcels': '包裹总数',
    'dashboard.comparedToLastWeek': '较上周',
    'dashboard.systemStatus': '系统状态',
    'dashboard.apiServer': 'API 服务器',
    'dashboard.operatingNormally': '正常运作',
    'dashboard.dbConnection': '资料库连线',
    'dashboard.appStatus': '应用状态',
    'dashboard.running': '运作中',
    'dashboard.quickStats': '快速概览统计',
    'dashboard.newUsersToday': '今日新增会员',
    'dashboard.newOrdersToday': '今日新增订单'
  },
  'zh-TW': {
    'lang.simplifiedChinese': '中文简体',
    'lang.traditionalChinese': '中文繁體',
    'lang.english': 'English',
    'lang.indonesian': 'Indonesian',

    'app.systemTitle': '業務管理系統',
    'app.admin': '管理員',
    'app.logout': '登出',

    'menu.overview': '首頁',
    'menu.users': '會員管理',
    'menu.orders': '訂單管理',
    'menu.sms': '簡訊資訊',
    'menu.parcels': '包裹管理',
    'menu.admins': '系統管理員',

    'login.username': '管理員用戶名',
    'login.password': '管理員密碼',
    'login.submit': '管理員登入',
    'login.usernameRequired': '用戶名不能為空',
    'login.passwordRequired': '密碼不能為空',
    'login.invalidCredentials': '用戶名或密碼錯誤',
    'login.failed': '登入失敗',
    'login.requestFailed': '請求失敗',
    'login.networkError': '無法連線後端服務，請檢查網路或稍後重試',
    'login.retryPrefix': '登錄嘗試過於頻繁，請在 ',
    'login.retrySuffix': ' 後重試',

    'auth.checking': '正在驗證登入狀態...',

    'dashboard.totalUsers': '會員總數',
    'dashboard.totalOrders': '訂單總數',
    'dashboard.totalParcels': '包裹總數',
    'dashboard.comparedToLastWeek': '較上週',
    'dashboard.systemStatus': '系統狀態',
    'dashboard.apiServer': 'API 伺服器',
    'dashboard.operatingNormally': '正常運作',
    'dashboard.dbConnection': '資料庫連線',
    'dashboard.appStatus': '應用狀態',
    'dashboard.running': '運作中',
    'dashboard.quickStats': '快速概覽統計',
    'dashboard.newUsersToday': '今日新增會員',
    'dashboard.newOrdersToday': '今日新增訂單'
  },
  'en-US': {
    'lang.simplifiedChinese': '中文简体',
    'lang.traditionalChinese': '中文繁體',
    'lang.english': 'English',
    'lang.indonesian': 'Indonesian',

    'app.systemTitle': 'Business Management System',
    'app.admin': 'Administrator',
    'app.logout': 'Logout',

    'menu.overview': 'Overview',
    'menu.users': 'Users',
    'menu.orders': 'Orders',
    'menu.sms': 'SMS',
    'menu.parcels': 'Parcels',
    'menu.admins': 'System Admins',

    'login.username': 'Admin Username',
    'login.password': 'Admin Password',
    'login.submit': 'Admin Login',
    'login.usernameRequired': 'Username is required',
    'login.passwordRequired': 'Password is required',
    'login.invalidCredentials': 'Invalid username or password',
    'login.failed': 'Login failed',
    'login.requestFailed': 'Request failed',
    'login.networkError': 'Cannot reach backend service. Please check your network and retry.',
    'login.retryPrefix': 'Too many login attempts, please retry in ',
    'login.retrySuffix': '',

    'auth.checking': 'Checking login status...',

    'dashboard.totalUsers': 'Total Users',
    'dashboard.totalOrders': 'Total Orders',
    'dashboard.totalParcels': 'Total Parcels',
    'dashboard.comparedToLastWeek': 'vs last week',
    'dashboard.systemStatus': 'System Status',
    'dashboard.apiServer': 'API Server',
    'dashboard.operatingNormally': 'Operating Normally',
    'dashboard.dbConnection': 'DB Connection',
    'dashboard.appStatus': 'App Status',
    'dashboard.running': 'Running',
    'dashboard.quickStats': 'Quick Stats',
    'dashboard.newUsersToday': 'New Users Today',
    'dashboard.newOrdersToday': 'New Orders Today'
  },
  'id-ID': {
    'lang.simplifiedChinese': '中文简体',
    'lang.traditionalChinese': '中文繁體',
    'lang.english': 'English',
    'lang.indonesian': 'Indonesian',

    'app.systemTitle': 'Sistem Manajemen Bisnis',
    'app.admin': 'Pentadbir',
    'app.logout': 'Keluar',

    'menu.overview': 'Utama',
    'menu.users': 'Pengguna',
    'menu.orders': 'Pesanan',
    'menu.sms': 'SMS',
    'menu.parcels': 'Bungkusan',
    'menu.admins': 'Pentadbir Sistem',

    'login.username': 'Nama Pengguna Admin',
    'login.password': 'Kata Laluan Admin',
    'login.submit': 'Log Masuk Admin',
    'login.usernameRequired': 'Nama pengguna diperlukan',
    'login.passwordRequired': 'Kata laluan diperlukan',
    'login.invalidCredentials': 'Nama pengguna atau kata laluan tidak sah',
    'login.failed': 'Log masuk gagal',
    'login.requestFailed': 'Permintaan gagal',
    'login.networkError': 'Tidak dapat sambung ke backend. Sila semak rangkaian dan cuba lagi.',
    'login.retryPrefix': 'Terlalu banyak cubaan log masuk, cuba semula dalam ',
    'login.retrySuffix': '',

    'auth.checking': 'Sedang mengesahkan status log masuk...',

    'dashboard.totalUsers': 'Jumlah Pengguna',
    'dashboard.totalOrders': 'Jumlah Pesanan',
    'dashboard.totalParcels': 'Jumlah Bungkusan',
    'dashboard.comparedToLastWeek': 'berbanding minggu lepas',
    'dashboard.systemStatus': 'Status Sistem',
    'dashboard.apiServer': 'Pelayan API',
    'dashboard.operatingNormally': 'Beroperasi Normal',
    'dashboard.dbConnection': 'Sambungan DB',
    'dashboard.appStatus': 'Status Aplikasi',
    'dashboard.running': 'Sedang Berjalan',
    'dashboard.quickStats': 'Statistik Ringkas',
    'dashboard.newUsersToday': 'Pengguna Baru Hari Ini',
    'dashboard.newOrdersToday': 'Pesanan Baru Hari Ini'
  }
};

type I18nContextValue = {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLang(): LangCode {
  const raw = localStorage.getItem(STORAGE_KEY) as LangCode | 'ms-MY' | null;
  if (raw === 'ms-MY') {
    // Backward compatibility for previous language code.
    return 'id-ID';
  }
  if (raw && raw in dictionaries) {
    return raw as LangCode;
  }
  return DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(getInitialLang);

  const setLang = (nextLang: LangCode) => {
    setLangState(nextLang);
    localStorage.setItem(STORAGE_KEY, nextLang);
  };

  const value = useMemo<I18nContextValue>(() => {
    const current = dictionaries[lang] ?? dictionaries[DEFAULT_LANG];
    return {
      lang,
      setLang,
      t: (key: string) => current[key] ?? dictionaries[DEFAULT_LANG][key] ?? key,
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
