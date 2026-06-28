// 前端权限码，与 server/permissions.ts 保持一致
export const PERMISSIONS = {
  OVERVIEW_VIEW: 'overview.view',

  ADMIN_VIEW: 'admin.view',
  ADMIN_CREATE: 'admin.create',
  ADMIN_UPDATE: 'admin.update',
  ADMIN_UPDATE_STATUS: 'admin.update_status',
  ADMIN_DELETE: 'admin.delete',

  USER_VIEW: 'user.view',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  PARCEL_VIEW: 'parcel.view',
  PARCEL_CREATE: 'parcel.create',
  PARCEL_UPDATE: 'parcel.update',
  PARCEL_UPDATE_STATUS: 'parcel.update_status',
  PARCEL_DELETE: 'parcel.delete',
  PARCEL_EXPORT: 'parcel.export',

  ORDER_VIEW: 'order.view',
  ORDER_UPDATE_STATUS: 'order.update_status',
  ORDER_DELETE: 'order.delete',

  LOGISTICS_VIEW: 'logistics.view',
  LOGISTICS_CREATE: 'logistics.create',
  LOGISTICS_UPDATE: 'logistics.update',
  LOGISTICS_DELETE: 'logistics.delete',

  SMS_VIEW: 'sms.view',
  SMS_DELETE: 'sms.delete',

  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export function hasPermission(
  permissions: string[] | undefined | null,
  code: PermissionCode,
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return permissions.includes(code);
}

export function hasAnyPermission(
  permissions: string[] | undefined | null,
  codes: PermissionCode[],
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return codes.some((c) => permissions.includes(c));
}
