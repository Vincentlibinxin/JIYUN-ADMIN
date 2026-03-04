const envApiBase = (import.meta.env.VITE_API_BASE || '').trim();
const envAutoLogoutMinutes = (import.meta.env.VITE_AUTO_LOGOUT_MINUTES || '').trim();

export const API_BASE =
  import.meta.env.DEV && envApiBase
    ? envApiBase
    : `${window.location.origin}/api`;

const DEFAULT_AUTO_LOGOUT_MINUTES = 60;

function resolveAutoLogoutMinutes(): number {
  if (!envAutoLogoutMinutes) {
    return DEFAULT_AUTO_LOGOUT_MINUTES;
  }

  const parsed = Number(envAutoLogoutMinutes);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AUTO_LOGOUT_MINUTES;
  }

  return parsed;
}

export const AUTO_LOGOUT_MS = resolveAutoLogoutMinutes() * 60 * 1000;
