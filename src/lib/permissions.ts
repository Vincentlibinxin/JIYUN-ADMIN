// 前端权限码，与 server/permissions.ts 保持一致
export const PERMISSIONS = {
  OVERVIEW_VIEW: 'overview.view',

  ADMIN_VIEW: 'admin.view',
  ADMIN_CREATE: 'admin.create',
  ADMIN_UPDATE: 'admin.update',
  ADMIN_UPDATE_STATUS: 'admin.update_status',
  ADMIN_DELETE: 'admin.delete',

  ROLE_PLATFORM_VIEW: 'role.platform.view',
  ROLE_PLATFORM_CREATE: 'role.platform.create',
  ROLE_PLATFORM_UPDATE: 'role.platform.update',
  ROLE_PLATFORM_DELETE: 'role.platform.delete',

  ROLE_LOGISTICS_VIEW: 'role.logistics.view',
  ROLE_LOGISTICS_CREATE: 'role.logistics.create',
  ROLE_LOGISTICS_UPDATE: 'role.logistics.update',
  ROLE_LOGISTICS_DELETE: 'role.logistics.delete',

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

  STORAGE_BIN_VIEW: 'storage_bin.view',
  STORAGE_BIN_CREATE: 'storage_bin.create',
  STORAGE_BIN_UPDATE: 'storage_bin.update',
  STORAGE_BIN_DELETE: 'storage_bin.delete',

  SMS_VIEW: 'sms.view',
  SMS_DELETE: 'sms.delete',

  AUDIT_VIEW: 'audit.view',

  PARCEL_STATUS_VIEW: 'parcel_status.view',
  PARCEL_STATUS_CREATE: 'parcel_status.create',
  PARCEL_STATUS_UPDATE: 'parcel_status.update',
  PARCEL_STATUS_DELETE: 'parcel_status.delete',
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
