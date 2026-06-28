// 系统管理员 RBAC 权限码与角色映射（代码内置，不做后台配置）

// 权限码命名规范：module.action
export const PERMISSIONS = {
  // 概览
  OVERVIEW_VIEW: 'overview.view',

  // 系统管理员
  ADMIN_VIEW: 'admin.view',
  ADMIN_CREATE: 'admin.create',
  ADMIN_UPDATE: 'admin.update',
  ADMIN_UPDATE_STATUS: 'admin.update_status',
  ADMIN_DELETE: 'admin.delete',

  // 会员
  USER_VIEW: 'user.view',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // 包裹
  PARCEL_VIEW: 'parcel.view',
  PARCEL_CREATE: 'parcel.create',
  PARCEL_UPDATE: 'parcel.update',
  PARCEL_UPDATE_STATUS: 'parcel.update_status',
  PARCEL_DELETE: 'parcel.delete',
  PARCEL_EXPORT: 'parcel.export',

  // 订单
  ORDER_VIEW: 'order.view',
  ORDER_UPDATE_STATUS: 'order.update_status',
  ORDER_DELETE: 'order.delete',

  // 物流商
  LOGISTICS_VIEW: 'logistics.view',
  LOGISTICS_CREATE: 'logistics.create',
  LOGISTICS_UPDATE: 'logistics.update',
  LOGISTICS_DELETE: 'logistics.delete',

  // 短信
  SMS_VIEW: 'sms.view',
  SMS_DELETE: 'sms.delete',

  // 审计日志
  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS);

// 普通管理员权限集合：默认可读各模块、可执行常规业务操作；敏感操作（系统管理员管理、删除会员、删除物流商、审计日志等）仅 super_admin。
const ADMIN_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.OVERVIEW_VIEW,
  PERMISSIONS.ADMIN_VIEW,

  PERMISSIONS.USER_VIEW,
  PERMISSIONS.USER_UPDATE,

  PERMISSIONS.PARCEL_VIEW,
  PERMISSIONS.PARCEL_CREATE,
  PERMISSIONS.PARCEL_UPDATE,
  PERMISSIONS.PARCEL_UPDATE_STATUS,
  PERMISSIONS.PARCEL_EXPORT,

  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE_STATUS,

  PERMISSIONS.LOGISTICS_VIEW,

  PERMISSIONS.SMS_VIEW,
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  super_admin: ALL_PERMISSION_CODES,
  admin: ADMIN_PERMISSIONS,
};

export const getPermissionsForRole = (role: string | undefined | null): PermissionCode[] => {
  if (!role) return [];
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
};

export const hasPermission = (role: string | undefined | null, code: PermissionCode): boolean => {
  return getPermissionsForRole(role).includes(code);
};
