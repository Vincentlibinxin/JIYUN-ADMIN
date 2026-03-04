import { API_BASE } from './config';

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface ApiRequestErrorShape {
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
}

export class ApiRequestError extends Error {
  status: number;
  payload: ApiRequestErrorShape | null;

  constructor(message: string, status: number, payload: ApiRequestErrorShape | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function attachCsrfHeader(headers: Headers, method: string): void {
  const upperMethod = method.toUpperCase();
  if (upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS') {
    return;
  }

  const csrfToken = sessionStorage.getItem('adminCsrfToken');
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
}

export async function adminFetch(path: string, init: RequestInit = {}, options?: { suppressUnauthorizedHandler?: boolean }): Promise<Response> {
  const method = init.method || 'GET';
  const headers = new Headers(init.headers || {});
  attachCsrfHeader(headers, method);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !options?.suppressUnauthorizedHandler && unauthorizedHandler) {
    unauthorizedHandler();
  }

  return response;
}

async function requestJson<T>(path: string, init: RequestInit = {}, options?: { suppressUnauthorizedHandler?: boolean }): Promise<T> {
  let response: Response;
  try {
    response = await adminFetch(path, init, options);
  } catch {
    throw new Error('無法連線後端服務，請檢查網路或稍後重試');
  }

  const raw = await response.text();
  const payload = raw ? (tryParseJson(raw) ?? { error: raw }) : null;

  if (!response.ok) {
    const message =
      (payload as ApiRequestErrorShape | null)?.error ||
      (payload as ApiRequestErrorShape | null)?.message ||
      `請求失敗（${response.status}）`;
    throw new ApiRequestError(message, response.status, payload as ApiRequestErrorShape | null);
  }

  return (payload || {}) as T;
}

export const api = {
  auth: {
    login: async (username: string, password: string): Promise<{ admin: AdminUser; csrfToken: string }> => {
      const payload = await requestJson<any>(
        '/admin/login',
        {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        },
        { suppressUnauthorizedHandler: true },
      );

      const data = payload?.data ?? payload;
      return {
        admin: data?.admin,
        csrfToken: data?.csrfToken,
      };
    },

    getSession: async (): Promise<{ admin: AdminUser; csrfToken: string }> => {
      const payload = await requestJson<any>('/admin/session');
      const data = payload?.data ?? payload;
      return {
        admin: data?.admin,
        csrfToken: data?.csrfToken,
      };
    },

    logout: async (): Promise<void> => {
      await requestJson('/admin/logout', { method: 'POST' }, { suppressUnauthorizedHandler: true });
    },

    clearSession: async (): Promise<void> => {
      await requestJson('/admin/session/clear', { method: 'POST' }, { suppressUnauthorizedHandler: true });
    },
  },
};
