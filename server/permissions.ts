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

  // 角色管理 - 平台角色
  ROLE_PLATFORM_VIEW: 'role.platform.view',
  ROLE_PLATFORM_CREATE: 'role.platform.create',
  ROLE_PLATFORM_UPDATE: 'role.platform.update',
  ROLE_PLATFORM_DELETE: 'role.platform.delete',

  // 角色管理 - 物流商角色
  ROLE_LOGISTICS_VIEW: 'role.logistics.view',
  ROLE_LOGISTICS_CREATE: 'role.logistics.create',
  ROLE_LOGISTICS_UPDATE: 'role.logistics.update',
  ROLE_LOGISTICS_DELETE: 'role.logistics.delete',

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

  PERMISSIONS.ROLE_PLATFORM_VIEW,
  PERMISSIONS.ROLE_PLATFORM_CREATE,
  PERMISSIONS.ROLE_PLATFORM_UPDATE,
  PERMISSIONS.ROLE_PLATFORM_DELETE,
  PERMISSIONS.ROLE_LOGISTICS_VIEW,
  PERMISSIONS.ROLE_LOGISTICS_CREATE,
  PERMISSIONS.ROLE_LOGISTICS_UPDATE,
  PERMISSIONS.ROLE_LOGISTICS_DELETE,

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

// 物流商角色可配置的权限白名单：仅涉及概览、包裹、订单、会员、管理员、物流商角色
export const LOGISTICS_ALLOWED_PERMISSIONS: PermissionCode[] = [
  // 概览首页
  PERMISSIONS.OVERVIEW_VIEW,
  // 管理员
  PERMISSIONS.ADMIN_VIEW,
  PERMISSIONS.ADMIN_CREATE,
  PERMISSIONS.ADMIN_UPDATE,
  PERMISSIONS.ADMIN_UPDATE_STATUS,
  PERMISSIONS.ADMIN_DELETE,
  // 物流商角色（仅限物流商作用域内的角色管理）
  PERMISSIONS.ROLE_LOGISTICS_VIEW,
  PERMISSIONS.ROLE_LOGISTICS_CREATE,
  PERMISSIONS.ROLE_LOGISTICS_UPDATE,
  PERMISSIONS.ROLE_LOGISTICS_DELETE,
  // 会员管理
  PERMISSIONS.USER_VIEW,
  PERMISSIONS.USER_UPDATE,
  PERMISSIONS.USER_DELETE,
  // 包裹管理
  PERMISSIONS.PARCEL_VIEW,
  PERMISSIONS.PARCEL_CREATE,
  PERMISSIONS.PARCEL_UPDATE,
  PERMISSIONS.PARCEL_UPDATE_STATUS,
  PERMISSIONS.PARCEL_DELETE,
  PERMISSIONS.PARCEL_EXPORT,
  // 订单管理
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE_STATUS,
  PERMISSIONS.ORDER_DELETE,
];

export const getPermissionsForRole = (role: string | undefined | null): PermissionCode[] => {
  if (!role) return [];
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
};

export const hasPermission = (role: string | undefined | null, code: PermissionCode): boolean => {
  return getPermissionsForRole(role).includes(code);
};
