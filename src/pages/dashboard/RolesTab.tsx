import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Checkbox, Form, Input, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { PERMISSIONS } from '../../lib/permissions';

interface RoleItem {
  code: string;
  name: string;
  scope: 'platform' | 'logistics';
  logistics_provider_id: number | null;
  is_system: boolean;
  permissions: string[];
  admin_count: number;
}

interface LogisticsOption {
  id: number;
  name: string;
}

interface RolesTabProps {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
}

const PERMISSION_GROUPS: Array<{ group: string; items: Array<{ code: string; label: string }> }> = [
  {
    group: '系统管理员',
    items: [
      { code: PERMISSIONS.ADMIN_VIEW, label: '查看管理员' },
      { code: PERMISSIONS.ADMIN_CREATE, label: '新增管理员' },
      { code: PERMISSIONS.ADMIN_UPDATE, label: '修改管理员信息' },
      { code: PERMISSIONS.ADMIN_UPDATE_STATUS, label: '启用/禁用管理员' },
      { code: PERMISSIONS.ADMIN_DELETE, label: '删除管理员' },
    ],
  },
  {
    group: '角色管理',
    items: [
      { code: PERMISSIONS.ROLE_VIEW, label: '查看角色' },
      { code: PERMISSIONS.ROLE_CREATE, label: '新增角色' },
      { code: PERMISSIONS.ROLE_UPDATE, label: '修改角色' },
      { code: PERMISSIONS.ROLE_DELETE, label: '删除角色' },
    ],
  },
  {
    group: '会员',
    items: [
      { code: PERMISSIONS.USER_VIEW, label: '查看会员' },
      { code: PERMISSIONS.USER_UPDATE, label: '修改会员' },
      { code: PERMISSIONS.USER_DELETE, label: '删除会员' },
    ],
  },
  {
    group: '包裹',
    items: [
      { code: PERMISSIONS.PARCEL_VIEW, label: '查看包裹' },
      { code: PERMISSIONS.PARCEL_CREATE, label: '包裹入库' },
      { code: PERMISSIONS.PARCEL_UPDATE, label: '编辑包裹' },
      { code: PERMISSIONS.PARCEL_UPDATE_STATUS, label: '变更包裹状态' },
      { code: PERMISSIONS.PARCEL_DELETE, label: '删除包裹' },
      { code: PERMISSIONS.PARCEL_EXPORT, label: '导出包裹' },
    ],
  },
  {
    group: '订单',
    items: [
      { code: PERMISSIONS.ORDER_VIEW, label: '查看订单' },
      { code: PERMISSIONS.ORDER_UPDATE_STATUS, label: '变更订单状态' },
      { code: PERMISSIONS.ORDER_DELETE, label: '删除订单' },
    ],
  },
  {
    group: '物流商',
    items: [
      { code: PERMISSIONS.LOGISTICS_VIEW, label: '查看物流商' },
      { code: PERMISSIONS.LOGISTICS_CREATE, label: '新增物流商' },
      { code: PERMISSIONS.LOGISTICS_UPDATE, label: '修改物流商' },
      { code: PERMISSIONS.LOGISTICS_DELETE, label: '删除物流商' },
    ],
  },
  {
    group: '短信与审计',
    items: [
      { code: PERMISSIONS.SMS_VIEW, label: '查看短信记录' },
      { code: PERMISSIONS.SMS_DELETE, label: '删除短信记录' },
      { code: PERMISSIONS.AUDIT_VIEW, label: '查看审计日志' },
      { code: PERMISSIONS.OVERVIEW_VIEW, label: '查看概览' },
    ],
  },
];

const ALL_PERMISSION_CODES = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.code));

export default function RolesTab({ canCreate, canUpdate, canDelete, refreshKey }: RolesTabProps) {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [logisticsOptions, setLogisticsOptions] = useState<LogisticsOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<'name' | 'code' | 'admin_count' | 'permission_count' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [form] = Form.useForm();

  const roleKey = (role: Pick<RoleItem, 'scope' | 'logistics_provider_id' | 'code'>): string => {
    return `${role.scope}:${role.logistics_provider_id ?? 0}:${role.code}`;
  };

  const isSuperAdminEditing = modalMode === 'edit' && editingRole?.code === 'super_admin';

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await adminFetch('/admin/roles');
      if (response.status === 401) return;
      if (!response.ok) throw new Error('fetch roles failed');
      const data = await response.json();
      setRoles(Array.isArray(data?.roles) ? data.roles : []);
    } catch {
      messageApi.error('读取角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const fetchLogisticsOptions = async () => {
      try {
        const response = await adminFetch('/admin/logistics/options');
        if (response.status === 401) return;
        if (!response.ok) throw new Error('fetch logistics options failed');
        const data = await response.json();
        setLogisticsOptions(Array.isArray(data?.data) ? data.data : []);
      } catch {
        // 保持页面可用，失败时不阻塞角色管理
      }
    };
    void fetchLogisticsOptions();
  }, []);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) {
        setTableScrollY(nextHeight - 86);
      }
    };
    updateTableHeight();
    const observer = new ResizeObserver(() => updateTableHeight());
    if (tableHostRef.current) {
      observer.observe(tableHostRef.current);
    }
    window.addEventListener('resize', updateTableHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTableHeight);
    };
  }, []);

  const openCreate = () => {
    setModalMode('create');
    setEditingRole(null);
    form.setFieldsValue({
      scope: 'platform',
      logistics_provider_id: null,
      name: undefined,
      code: undefined,
    });
    setSelectedPermissions([]);
    setModalOpen(true);
  };

  const openEdit = (role: RoleItem) => {
    setModalMode('edit');
    setEditingRole(role);
    form.setFieldsValue({
      name: role.name,
      code: role.code,
      scope: role.scope,
      logistics_provider_id: role.logistics_provider_id,
    });
    setSelectedPermissions(role.code === 'super_admin' ? [...ALL_PERMISSION_CODES] : [...role.permissions]);
    setModalOpen(true);
  };

  const togglePermission = (code: string) => {
    setSelectedPermissions((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleGroup = (codes: string[], checked: boolean) => {
    setSelectedPermissions((prev) =>
      checked ? Array.from(new Set([...prev, ...codes])) : prev.filter((c) => !codes.includes(c))
    );
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        const response = await adminFetch('/admin/roles', {
          method: 'POST',
          body: JSON.stringify({
            code: String(values.code || '').trim().toLowerCase(),
            name: String(values.name || '').trim(),
            scope: values.scope === 'logistics' ? 'logistics' : 'platform',
            logistics_provider_id:
              values.scope === 'logistics'
                ? (values.logistics_provider_id ? Number(values.logistics_provider_id) : null)
                : null,
            permissions: selectedPermissions,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          messageApi.error(data?.error || '创建角色失败');
          return;
        }
        messageApi.success('角色已创建');
      } else if (editingRole) {
        const response = await adminFetch(`/admin/roles/${encodeURIComponent(editingRole.code)}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: String(values.name || '').trim(),
            scope: editingRole.scope,
            logistics_provider_id: editingRole.logistics_provider_id,
            permissions: selectedPermissions,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          messageApi.error(data?.error || '更新角色失败');
          return;
        }
        messageApi.success('角色已更新');
      }
      setModalOpen(false);
      await fetchRoles();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role: RoleItem) => {
    try {
      const params = new URLSearchParams({ scope: role.scope });
      if (role.scope === 'logistics' && role.logistics_provider_id) {
        params.set('logistics_provider_id', String(role.logistics_provider_id));
      }
      const response = await adminFetch(`/admin/roles/${encodeURIComponent(role.code)}?${params.toString()}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || '删除角色失败');
        return;
      }
      messageApi.success('角色已删除');
      await fetchRoles();
    } catch {
      messageApi.error('删除角色失败');
    }
  };

  const handleBatchDelete = async () => {
    const targets = roles.filter((r) => selectedRowKeys.includes(roleKey(r)) && !r.is_system);
    if (targets.length === 0) {
      messageApi.info('所选角色均为系统内置角色，无法删除');
      return;
    }
    let ok = 0;
    for (const role of targets) {
      try {
        const params = new URLSearchParams({ scope: role.scope });
        if (role.scope === 'logistics' && role.logistics_provider_id) {
          params.set('logistics_provider_id', String(role.logistics_provider_id));
        }
        const response = await adminFetch(`/admin/roles/${encodeURIComponent(role.code)}?${params.toString()}`, { method: 'DELETE' });
        if (response.ok) ok += 1;
      } catch {
        // 单个失败忽略，继续处理其余
      }
    }
    setSelectedRowKeys([]);
    if (ok > 0) messageApi.success(`已删除 ${ok} 个角色`);
    else messageApi.error('删除失败');
    await fetchRoles();
  };

  const processedRoles = useMemo(() => {
    const kw = searchQuery.trim().toLowerCase();
    const nameKw = (columnFilters['name'] || '').toLowerCase();
    const codeKw = (columnFilters['code'] || '').toLowerCase();
    const adminKw = (columnFilters['admin_count'] || '').toLowerCase();
    const list = roles.filter((r) => {
      if (kw && !r.name.toLowerCase().includes(kw) && !r.code.toLowerCase().includes(kw)) return false;
      if (nameKw && !r.name.toLowerCase().includes(nameKw)) return false;
      if (codeKw && !r.code.toLowerCase().includes(codeKw)) return false;
      if (adminKw && !String(r.admin_count).includes(adminKw)) return false;
      return true;
    });
    if (sortKey) {
      const dir = sortDirection === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        let va: number | string;
        let vb: number | string;
        if (sortKey === 'permission_count') {
          va = a.code === 'super_admin' ? ALL_PERMISSION_CODES.length : a.permissions.length;
          vb = b.code === 'super_admin' ? ALL_PERMISSION_CODES.length : b.permissions.length;
        } else if (sortKey === 'admin_count') {
          va = a.admin_count;
          vb = b.admin_count;
        } else {
          va = a[sortKey];
          vb = b[sortKey];
        }
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'zh-CN') * dir;
      });
    }
    return list;
  }, [roles, searchQuery, columnFilters, sortKey, sortDirection]);

  const pagedRoles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedRoles.slice(start, start + pageSize);
  }, [processedRoles, currentPage, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(processedRoles.length / pageSize));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [processedRoles.length, pageSize, currentPage]);

  const visibleRoleKeys = pagedRoles.map((r) => roleKey(r));
  const selectedVisibleCount = visibleRoleKeys.filter((c) => selectedRowKeys.includes(c)).length;
  const allSelected = visibleRoleKeys.length > 0 && selectedVisibleCount === visibleRoleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRoleKeys.length;

  const handleSelectAll = (checked: boolean) => {
    setSelectedRowKeys(checked ? visibleRoleKeys : []);
  };

  const handleSelectRow = (rowKey: string, checked: boolean) => {
    setSelectedRowKeys((prev) =>
      checked ? (prev.includes(rowKey) ? prev : [...prev, rowKey]) : prev.filter((c) => c !== rowKey)
    );
  };

  const handleColumnSearch = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
    setCurrentPage(1);
  };

  const renderSearchInput = (key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(e) => {
        setLocalColumnFilters((prev) => ({ ...prev, [key]: e.target.value }));
        if (!e.target.value) handleColumnSearch(key, '');
      }}
      onPressEnter={(e) => handleColumnSearch(key, (e.target as HTMLInputElement).value)}
      onClick={(e) => e.stopPropagation()}
      allowClear
    />
  );

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setSearchQuery('');
    setSortKey(null);
    setSelectedRowKeys([]);
    setCurrentPage(1);
  };

  const columns: ColumnsType<RoleItem> = [
    {
      title: '序号',
      key: 'index',
      width: 65,
      fixed: 'left',
      align: 'left',
      children: [
        {
          title: (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}>
              <Checkbox
                checked={allSelected}
                indeterminate={indeterminate}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            </div>
          ),
          key: 'index_child',
          width: 65,
          fixed: 'left',
          align: 'left',
          render: (_, record, index) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
              <Checkbox
                checked={selectedRowKeys.includes(roleKey(record))}
                onChange={(e) => handleSelectRow(roleKey(record), e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <span>{(currentPage - 1) * pageSize + index + 1}</span>
            </div>
          ),
        },
      ],
    },
    {
      title: '角色名称',
      key: 'name',
      width: 220,
      sorter: true,
      sortOrder: sortKey === 'name' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('name', '角色名称'),
          key: 'name_child',
          width: 220,
          render: (_, record) => (
            <Space size={6}>
              <span style={{ fontWeight: 600 }}>{record.name}</span>
              {record.is_system && <Tag color="blue">系统内置</Tag>}
            </Space>
          ),
        },
      ],
    },
    {
      title: '角色标识',
      key: 'code',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'code' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('code', '角色标识'),
          key: 'code_child',
          width: 180,
          render: (_, record) => <Tag>{record.code}</Tag>,
        },
      ],
    },
    {
      title: '作用域',
      key: 'scope',
      width: 120,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>作用域</span>,
          key: 'scope_child',
          width: 120,
          render: (_, record) =>
            record.scope === 'logistics' ? <Tag color="orange">物流商</Tag> : <Tag color="default">平台</Tag>,
        },
      ],
    },
    {
      title: '归属物流商',
      key: 'logistics_provider_id',
      width: 170,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>归属物流商</span>,
          key: 'logistics_provider_child',
          width: 170,
          render: (_, record) => {
            if (record.scope !== 'logistics') return <span style={{ color: '#999' }}>-</span>;
            const provider = logisticsOptions.find((item) => item.id === record.logistics_provider_id);
            return <span>{provider?.name || `ID: ${record.logistics_provider_id ?? '-'}`}</span>;
          },
        },
      ],
    },
    {
      title: '关联管理员',
      key: 'admin_count',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'admin_count' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('admin_count', '人数'),
          key: 'admin_count_child',
          width: 140,
          render: (_, record) => `${record.admin_count} 人`,
        },
      ],
    },
    {
      title: '权限数',
      key: 'permission_count',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'permission_count' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>权限数</span>,
          key: 'permission_count_child',
          width: 140,
          render: (_, record) =>
            record.code === 'super_admin'
              ? `全部（${ALL_PERMISSION_CODES.length}）`
              : `${record.permissions.length} / ${ALL_PERMISSION_CODES.length}`,
        },
      ],
    },
    {
      title: '',
      key: 'spacer',
      children: [{ title: '', key: 'spacer_child', render: () => null }],
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      align: 'center',
      children: [
        {
          title: (
            <Tooltip title="重置所有搜索">
              <Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} />
            </Tooltip>
          ),
          key: 'actions_child',
          width: 120,
          fixed: 'right',
          align: 'center',
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title={record.code === 'super_admin' ? '查看' : '编辑'}>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  disabled={!canUpdate}
                  onClick={() => openEdit(record)}
                />
              </Tooltip>
              {canDelete && !record.is_system && (
                <Popconfirm
                  title="确定删除该角色？"
                  description={record.admin_count > 0 ? '该角色下仍有管理员，需先转移后才能删除。' : '删除后不可恢复。'}
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleDelete(record)}
                >
                  <Tooltip title="删除">
                    <Button danger size="small" type="text" icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              )}
            </Space>
          ),
        },
      ],
    },
  ];

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      {messageContextHolder}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
          <Space>
            {canDelete && (
              <Popconfirm
                title={`确定删除选中的 ${selectedRowKeys.length} 个角色？`}
                description="系统内置角色将被跳过；删除后不可恢复。"
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={handleBatchDelete}
                disabled={selectedRowKeys.length === 0}
              >
                <Button danger disabled={selectedRowKeys.length === 0}>
                  批量删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search
            allowClear
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="搜索角色：名称或标识"
            style={{ width: 420 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#f58220' }}>
              新增角色
            </Button>
          )}
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<RoleItem>
          rowKey={(record) => roleKey(record)}
          rowClassName={(record) => (selectedRowKeys.includes(roleKey(record)) ? 'row-selected' : '')}
          loading={loading}
          columns={columns}
          dataSource={pagedRoles}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
          locale={{ emptyText: '没有角色记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const field = (sorter.columnKey || sorter.field) as 'name' | 'code' | 'admin_count' | 'permission_count' | undefined;
            const order = sorter.order;
            if (!field || !order) {
              setSortKey(null);
              return;
            }
            setSortKey(field);
            setSortDirection(order === 'ascend' ? 'asc' : 'desc');
          }}
        />
      </div>

      <div
        style={{
          flexShrink: 0,
          zIndex: 10,
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <AntPagination
          size="small"
          current={currentPage}
          pageSize={pageSize}
          total={processedRoles.length}
          showSizeChanger
          pageSizeOptions={[10, 20, 30, 50]}
          showQuickJumper
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`}
          onChange={(page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          }}
          onShowSizeChange={(_, size) => {
            setCurrentPage(1);
            setPageSize(size);
          }}
        />
      </div>

      <Modal
        title={modalMode === 'create' ? '新增角色' : isSuperAdminEditing ? '查看角色（超级管理员）' : '编辑角色'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okButtonProps={{ disabled: isSuperAdminEditing, style: { background: '#f58220' } }}
        okText={modalMode === 'create' ? '创建' : '保存'}
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label="角色名称"
            name="name"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input maxLength={64} placeholder="如：仓库管理员" disabled={isSuperAdminEditing} />
          </Form.Item>
          <Form.Item
            label="角色标识"
            name="code"
            rules={
              modalMode === 'create'
                ? [
                    { required: true, message: '请输入角色标识' },
                    {
                      pattern: /^[a-z][a-z0-9_]{1,31}$/,
                      message: '小写字母开头，仅含小写字母/数字/下划线，长度 2-32 位',
                    },
                  ]
                : []
            }
            extra={modalMode === 'create' ? '英文唯一标识，创建后不可修改，如 warehouse_admin' : '系统标识不可修改'}
          >
            <Input placeholder="如：warehouse_admin" disabled={modalMode === 'edit'} />
          </Form.Item>
          <Form.Item
            label="角色作用域"
            name="scope"
            rules={[{ required: true, message: '请选择角色作用域' }]}
          >
            <Select
              disabled={modalMode === 'edit'}
              options={[
                { value: 'platform', label: '平台角色' },
                { value: 'logistics', label: '物流商角色' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scope !== cur.scope}>
            {({ getFieldValue }) => {
              const scope = getFieldValue('scope');
              if (scope !== 'logistics') return null;
              return (
                <Form.Item
                  label="归属物流商"
                  name="logistics_provider_id"
                  rules={[{ required: true, message: '请选择归属物流商' }]}
                >
                  <Select
                    placeholder="请选择物流商"
                    disabled={modalMode === 'edit'}
                    options={logisticsOptions.map((item) => ({ value: item.id, label: item.name }))}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            权限配置
            {isSuperAdminEditing && <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>超级管理员恒拥有全部权限，不可修改</span>}
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 360, overflow: 'auto' }}>
            {PERMISSION_GROUPS.map((group) => {
              const codes = group.items.map((i) => i.code);
              const checkedCount = codes.filter((c) => selectedPermissions.includes(c)).length;
              const allChecked = checkedCount === codes.length;
              const indeterminate = checkedCount > 0 && checkedCount < codes.length;
              return (
                <div key={group.group} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ padding: '8px 12px', background: '#f8fafc' }}>
                    <Checkbox
                      checked={allChecked}
                      indeterminate={indeterminate}
                      disabled={isSuperAdminEditing}
                      onChange={(e) => toggleGroup(codes, e.target.checked)}
                    >
                      <span style={{ fontWeight: 600 }}>{group.group}</span>
                    </Checkbox>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: '8px 12px' }}>
                    {group.items.map((item) => (
                      <Checkbox
                        key={item.code}
                        checked={selectedPermissions.includes(item.code)}
                        disabled={isSuperAdminEditing}
                        onChange={() => togglePermission(item.code)}
                      >
                        {item.label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </Card>
  );
}
