import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message, Descriptions } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, LockOutlined, UnlockOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  role_scope: 'platform' | 'logistics';
  role_logistics_provider_id: number | null;
  logistics_provider_id: number | null;
  status: string;
  last_login: string | null;
  created_at: string;
  deleted_at?: string | null;
}

interface LogisticsOption {
  id: number;
  name: string;
}

interface RoleOptionMeta {
  code: string;
  name: string;
  scope: 'platform' | 'logistics';
  logistics_provider_id: number | null;
}

type AdminSortKey = 'id' | 'username' | 'email' | 'role' | 'status' | 'last_login' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface AdminsTabProps {
  admins: AdminUser[];
  loading: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number, size: number) => void;
  onPageSizeChange: (size: number) => void;
  sortKey: AdminSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: AdminSortKey, direction: SortDirection) => void;
  onCreate?: (payload: {
    username: string;
    email: string;
    role: string;
    role_scope: 'platform' | 'logistics';
    role_logistics_provider_id: number | null;
    logistics_provider_id: number | null;
    password: string;
  }) => Promise<boolean>;
  onUpdate?: (id: number, payload: {
    username: string;
    email: string;
    role: string;
    role_scope: 'platform' | 'logistics';
    role_logistics_provider_id: number | null;
    logistics_provider_id: number | null;
    password?: string;
  }) => Promise<boolean>;
  onToggleStatus: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  canManage?: boolean;
  canUpdate?: boolean;
  canUpdateStatus?: boolean;
  canDelete?: boolean;
  currentAdminId?: number;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

export default function AdminsTab({
  admins,
  loading,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onReset,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDirection,
  onSortChange,
  onCreate,
  onUpdate,
  onToggleStatus,
  onDelete,
  onBatchDelete,
  canManage,
  canUpdate,
  canUpdateStatus,
  canDelete,
  currentAdminId,
  refreshKey,
  onColumnFilterChange,
}: AdminsTabProps) {
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) {
        setTableScrollY(nextHeight - 86);
      }
    };

    updateTableHeight();

    const observer = new ResizeObserver(() => {
      updateTableHeight();
    });

    if (tableHostRef.current) {
      observer.observe(tableHostRef.current);
    }

    window.addEventListener('resize', updateTableHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTableHeight);
    };
  }, []);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, [string, string] | null>>({});
  const [resetKey, setResetKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('view');
  const [activeAdmin, setActiveAdmin] = useState<AdminUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [roleOptions, setRoleOptions] = useState<Array<{ label: string; value: string }>>([
    { label: '管理员 (admin)', value: 'platform:0:admin' },
    { label: '超级管理员 (super_admin)', value: 'platform:0:super_admin' },
  ]);
  const [roleOptionMap, setRoleOptionMap] = useState<Record<string, RoleOptionMeta>>({
    'platform:0:admin': { code: 'admin', name: '管理员', scope: 'platform', logistics_provider_id: null },
    'platform:0:super_admin': { code: 'super_admin', name: '超级管理员', scope: 'platform', logistics_provider_id: null },
  });
  const [logisticsOptions, setLogisticsOptions] = useState<LogisticsOption[]>([]);
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({
    admin: '管理员',
    super_admin: '超级管理员',
  });

  const makeRoleOptionValue = (scope: 'platform' | 'logistics', providerId: number | null, code: string): string => {
    return `${scope}:${providerId ?? 0}:${code}`;
  };

  const makeRoleIdentityKey = (scope: 'platform' | 'logistics', providerId: number | null, code: string): string => {
    return `${scope}:${providerId ?? 0}:${code}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [platformResp, logisticsResp, logisticsOptionsResp] = await Promise.all([
          adminFetch('/admin/roles?scope=platform'),
          adminFetch('/admin/roles?scope=logistics'),
          adminFetch('/admin/logistics/options'),
        ]);

        const roleList: any[] = [];
        if (platformResp.ok) {
          const data = await platformResp.json();
          roleList.push(...(Array.isArray(data?.roles) ? data.roles : []));
        }
        if (logisticsResp.ok) {
          const data = await logisticsResp.json();
          roleList.push(...(Array.isArray(data?.roles) ? data.roles : []));
        }
        if (logisticsOptionsResp.ok) {
          const data = await logisticsOptionsResp.json();
          setLogisticsOptions(Array.isArray(data?.data) ? data.data : []);
        }

        if (cancelled || roleList.length === 0) return;

        const nextRoleOptions = roleList.map((r: any) => {
          const scope: 'platform' | 'logistics' = r.scope === 'logistics' ? 'logistics' : 'platform';
          const providerId = r.logistics_provider_id === null || r.logistics_provider_id === undefined
            ? null
            : Number(r.logistics_provider_id);
          const value = makeRoleOptionValue(scope, providerId, String(r.code));
          const suffix = scope === 'logistics' ? ` / 物流商ID:${providerId ?? '-'}` : ' / 平台';
          return { label: `${r.name} (${r.code})${suffix}`, value };
        });

        const nextRoleOptionMap = roleList.reduce((acc: Record<string, RoleOptionMeta>, r: any) => {
          const scope: 'platform' | 'logistics' = r.scope === 'logistics' ? 'logistics' : 'platform';
          const providerId = r.logistics_provider_id === null || r.logistics_provider_id === undefined
            ? null
            : Number(r.logistics_provider_id);
          const value = makeRoleOptionValue(scope, providerId, String(r.code));
          acc[value] = {
            code: String(r.code),
            name: String(r.name),
            scope,
            logistics_provider_id: providerId,
          };
          return acc;
        }, {});

        setRoleOptions(nextRoleOptions);
        setRoleOptionMap(nextRoleOptionMap);
        setRoleNameMap(
          roleList.reduce((acc: Record<string, string>, r: any) => {
            const scope: 'platform' | 'logistics' = r.scope === 'logistics' ? 'logistics' : 'platform';
            const providerId = r.logistics_provider_id === null || r.logistics_provider_id === undefined
              ? null
              : Number(r.logistics_provider_id);
            acc[makeRoleIdentityKey(scope, providerId, String(r.code))] = String(r.name);
            return acc;
          }, {})
        );
      } catch {
        // 读取失败时保留默认角色选项
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const openCreate = () => {
    setActiveAdmin(null);
    setModalMode('create');
    form.resetFields();
    form.setFieldsValue({
      role_scope: 'platform',
      logistics_provider_id: null,
      role_key: 'platform:0:admin',
    });
    setModalOpen(true);
  };

  const openView = (record: AdminUser) => {
    setActiveAdmin(record);
    setModalMode('view');
    setModalOpen(true);
  };

  const openEdit = (record: AdminUser) => {
    setActiveAdmin(record);
    setModalMode('edit');
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      role_scope: record.role_scope,
      logistics_provider_id: record.logistics_provider_id,
      role_key: makeRoleOptionValue(record.role_scope, record.role_logistics_provider_id, record.role),
      password: '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (modalMode === 'create' && onCreate) {
        const roleMeta = roleOptionMap[String(values.role_key || '')];
        if (!roleMeta) {
          message.error('请选择有效角色');
          return;
        }
        const ok = await onCreate({
          username: String(values.username || '').trim(),
          email: String(values.email || '').trim(),
          role: roleMeta.code,
          role_scope: roleMeta.scope,
          role_logistics_provider_id: roleMeta.scope === 'logistics' ? roleMeta.logistics_provider_id : null,
          logistics_provider_id:
            roleMeta.scope === 'logistics'
              ? (values.logistics_provider_id ? Number(values.logistics_provider_id) : roleMeta.logistics_provider_id)
              : null,
          password: String(values.password || ''),
        });
        if (ok) {
          message.success('管理员已创建');
          setModalOpen(false);
        }
      }
      if (modalMode === 'edit' && activeAdmin && onUpdate) {
        const roleMeta = roleOptionMap[String(values.role_key || '')];
        if (!roleMeta) {
          message.error('请选择有效角色');
          return;
        }
        const payload: {
          username: string;
          email: string;
          role: string;
          role_scope: 'platform' | 'logistics';
          role_logistics_provider_id: number | null;
          logistics_provider_id: number | null;
          password?: string;
        } = {
          username: String(values.username || '').trim(),
          email: String(values.email || '').trim(),
          role: roleMeta.code,
          role_scope: roleMeta.scope,
          role_logistics_provider_id: roleMeta.scope === 'logistics' ? roleMeta.logistics_provider_id : null,
          logistics_provider_id:
            roleMeta.scope === 'logistics'
              ? (values.logistics_provider_id ? Number(values.logistics_provider_id) : roleMeta.logistics_provider_id)
              : null,
        };
        if (values.password && String(values.password).trim()) {
          payload.password = String(values.password);
        }
        const ok = await onUpdate(activeAdmin.id, payload);
        if (ok) {
          message.success('管理员信息已更新');
          setModalOpen(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cleanFiltersAndNotify = (newColFilters: Record<string, string>, newDateFilters: Record<string, [string, string] | null>) => {
    const cleanCf: Record<string, string> = {};
    for (const [k, v] of Object.entries(newColFilters)) {
      if (v && v.trim()) cleanCf[k] = v;
    }
    const cleanDf: Record<string, [string, string]> = {};
    for (const [k, v] of Object.entries(newDateFilters)) {
      if (v && v[0] && v[1]) cleanDf[k] = v;
    }
    onColumnFilterChange?.(cleanCf, cleanDf);
  };

  const handleColumnSearch = (key: string, value: string) => {
    const newFilters = { ...columnFilters, [key]: value };
    setColumnFilters(newFilters);
    cleanFiltersAndNotify(newFilters, dateFilters);
  };

  const handleDateSearch = (key: string, dateStrings: [string, string]) => {
    const newDateFilters = { ...dateFilters };
    if (!dateStrings || !dateStrings[0]) {
      newDateFilters[key] = null;
    } else {
      newDateFilters[key] = dateStrings;
    }
    setDateFilters(newDateFilters);
    cleanFiltersAndNotify(columnFilters, newDateFilters);
  };

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setResetKey((prev) => prev + 1);
    setSelectedRowKeys([]);
    onColumnFilterChange?.({}, {});
  };

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      resetFilters();
    }
  }, [refreshKey]);

  const renderSearchInput = (key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(e) => {
        setLocalColumnFilters((prev) => ({ ...prev, [key]: e.target.value }));
        if (!e.target.value) {
          handleColumnSearch(key, '');
        }
      }}
      onPressEnter={(e) => handleColumnSearch(key, (e.target as HTMLInputElement).value)}
      onClick={(e) => e.stopPropagation()}
      allowClear
    />
  );

  const renderDateRangeInput = (key: string) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        size="small"
        style={{ width: '100%' }}
        onChange={(_, dateStrings) => handleDateSearch(key, dateStrings)}
        key={`date-picker-${key}-${resetKey}`}
        allowClear
      />
    </div>
  );

  const renderDeletedFilter = () => (
    <Select
      size="small"
      value={columnFilters['__deleted__'] || 'not_deleted'}
      onChange={(v) => handleColumnSearch('__deleted__', v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[
        { label: '未删除', value: 'not_deleted' },
        { label: '已删除', value: 'deleted' },
        { label: '全部', value: 'all' },
      ]}
    />
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const visibleRowIds = admins.map((item) => item.id);
  const selectedVisibleCount = visibleRowIds.filter((id) => selectedRowKeys.includes(id)).length;
  const allSelected = visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(visibleRowIds);
      return;
    }
    setSelectedRowKeys([]);
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRowKeys((prev) => (prev.includes(id) ? prev : [...prev, id]));
      return;
    }
    setSelectedRowKeys((prev) => prev.filter((key) => key !== id));
  };

  const columns: ColumnsType<AdminUser> = [
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
                checked={selectedRowKeys.includes(record.id)}
                onChange={(e) => handleSelectRow(record.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <span>{index + 1}</span>
            </div>
          ),
        },
      ],
    },
    {
      title: '账号',
      key: 'username',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'username' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('username', '账号'),
          dataIndex: 'username',
          key: 'username_child',
          width: 180,
          ellipsis: true,
        },
      ],
    },
    {
      title: '电子邮件',
      key: 'email',
      width: 220,
      sorter: true,
      sortOrder: sortKey === 'email' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('email', '电子邮件'),
          dataIndex: 'email',
          key: 'email_child',
          width: 220,
          ellipsis: true,
        },
      ],
    },
    {
      title: '角色',
      key: 'role',
      width: 130,
      sorter: true,
      sortOrder: sortKey === 'role' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('role', '角色'),
          dataIndex: 'role',
          key: 'role_child',
          width: 130,
          render: (role: string, record) => roleNameMap[makeRoleIdentityKey(record.role_scope, record.role_logistics_provider_id, role)] || role,
        },
      ],
    },
    {
      title: '状态',
      key: 'status',
      width: 130,
      sorter: true,
      sortOrder: sortKey === 'status' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('status', '状态'),
          key: 'status_child',
          width: 130,
          render: (_, record) => <Tag color={record.status === 'active' ? 'success' : 'default'}>{record.status}</Tag>,
        },
      ],
    },
    {
      title: '上次登录',
      key: 'last_login',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'last_login' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('last_login'),
          key: 'last_login_child',
          width: 180,
          render: (_, record) => (record.last_login ? new Date(record.last_login).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : ''),
        },
      ],
    },
    {
      title: '创建时间',
      key: 'created_at',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'created_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('created_at'),
          dataIndex: 'created_at',
          key: 'created_at_child',
          width: 180,
          render: (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        },
      ],
    },
    {
      title: '删除',
      key: '__deleted__',
      width: 110,
      children: [
        {
          title: renderDeletedFilter(),
          key: '__deleted___child',
          width: 110,
          render: (_, record) => record.deleted_at ? <Tag color="red">已删除</Tag> : '',
        }
      ]
    },
    {
      title: '',
      key: 'spacer',
      children: [{ title: '', key: 'spacer_child', render: () => null }],
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
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
          width: 100,
          fixed: 'right',
          align: 'center',
          render: (_, record) => {
            const isSelf = currentAdminId === record.id;
            return (
              <Space size={4}>
                <Tooltip title="查看">
                  <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openView(record)} />
                </Tooltip>
                {canUpdate && (
                  <Tooltip title="修改">
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                  </Tooltip>
                )}
                {canUpdateStatus && (
                  <Tooltip title={record.status === 'active' ? '禁用' : '启用'}>
                    <Button
                      size="small"
                      type="text"
                      icon={record.status === 'active' ? <LockOutlined /> : <UnlockOutlined />}
                      disabled={isSelf}
                      onClick={() => onToggleStatus(record.id, record.status === 'active' ? 'disabled' : 'active')}
                    />
                  </Tooltip>
                )}
                <Popconfirm
                  title="确定删除该管理员？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => onDelete(record.id)}
                  disabled={!canDelete || isSelf}
                >
                  <Tooltip title="删除">
                    <Button danger size="small" type="text" icon={<DeleteOutlined />} disabled={!canDelete || isSelf} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            );
          },
        },
      ],
    },
  ];

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
          <Space>
            {canManage && (
              <Button type="primary" onClick={openCreate}>
                新增管理员
              </Button>
            )}
            {canDelete && (
              <Popconfirm
                title={`确定删除选中的 ${selectedRowKeys.length} 条记录？`}
                okText="删除"
                cancelText="取消"
                onConfirm={() => { onBatchDelete(selectedRowKeys); setSelectedRowKeys([]); }}
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
              const val = event.target.value;
              onSearchQueryChange(val);
              if (!val) onReset();
            }}
            onSearch={onSearch}
            placeholder="搜索管理员：ID、账号、邮件、角色或状态"
            style={{ width: 400 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}>
          <Button>占位</Button>
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<AdminUser>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={columns}
          dataSource={admins}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
          locale={{ emptyText: '没有管理员记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as AdminSortKey | undefined;
            const order = sorter.order;
            if (!field || !order) {
              return;
            }
            onSortChange(field, order === 'ascend' ? 'asc' : 'desc');
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
        }}
      >
        <AntPagination
          size="small"
          current={currentPage}
          pageSize={pageSize}
          total={totalItems}
          showSizeChanger
          pageSizeOptions={[10, 20, 30, 50]}
          showQuickJumper
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条 · ${totalPages} 页`}
          onChange={(page, size) => onPageChange(page, size)}
          onShowSizeChange={(_, size) => onPageSizeChange(size)}
        />
      </div>

      <Modal
        title={modalMode === 'create' ? '新增管理员' : modalMode === 'edit' ? '修改管理员' : '管理员详情'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={modalMode === 'view' ? () => setModalOpen(false) : handleSubmit}
        okText={modalMode === 'view' ? '关闭' : '保存'}
        cancelText="取消"
        confirmLoading={submitting}
        cancelButtonProps={modalMode === 'view' ? { style: { display: 'none' } } : undefined}
        destroyOnClose
      >
        {modalMode === 'view' && activeAdmin && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="账号">{activeAdmin.username}</Descriptions.Item>
            <Descriptions.Item label="电子邮件">{activeAdmin.email}</Descriptions.Item>
            <Descriptions.Item label="角色">
              {roleNameMap[makeRoleIdentityKey(activeAdmin.role_scope, activeAdmin.role_logistics_provider_id, activeAdmin.role)] || activeAdmin.role}
            </Descriptions.Item>
            <Descriptions.Item label="角色作用域">{activeAdmin.role_scope === 'logistics' ? '物流商' : '平台'}</Descriptions.Item>
            <Descriptions.Item label="归属物流商">
              {activeAdmin.logistics_provider_id
                ? (logisticsOptions.find((item) => item.id === activeAdmin.logistics_provider_id)?.name || `ID: ${activeAdmin.logistics_provider_id}`)
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">{activeAdmin.status}</Descriptions.Item>
            <Descriptions.Item label="上次登录">
              {activeAdmin.last_login ? new Date(activeAdmin.last_login).toLocaleString('zh-CN', { hour12: false }) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {new Date(activeAdmin.created_at).toLocaleString('zh-CN', { hour12: false })}
            </Descriptions.Item>
          </Descriptions>
        )}

        {(modalMode === 'create' || modalMode === 'edit') && (
          <Form form={form} layout="vertical" preserve={false}>
            <Form.Item
              label="账号"
              name="username"
              rules={[{ required: true, message: '请输入管理员账号' }]}
            >
              <Input maxLength={64} placeholder="请输入账号" />
            </Form.Item>

            <Form.Item
              label="电子邮件"
              name="email"
              rules={[{ required: true, message: '请输入电子邮件' }, { type: 'email', message: '邮箱格式不正确' }]}
            >
              <Input maxLength={255} placeholder="请输入电子邮件" />
            </Form.Item>

            <Form.Item
              label="角色作用域"
              name="role_scope"
              rules={[{ required: true, message: '请选择角色作用域' }]}
            >
              <Select
                options={[
                  { label: '平台', value: 'platform' },
                  { label: '物流商', value: 'logistics' },
                ]}
                onChange={(nextScope) => {
                  const logisticsProviderId = form.getFieldValue('logistics_provider_id');
                  const targetProvider = nextScope === 'logistics' ? (logisticsProviderId || null) : null;
                  const matched = Object.entries(roleOptionMap)
                    .find(([, meta]) => meta.code !== 'super_admin' && meta.scope === nextScope && (meta.logistics_provider_id ?? null) === targetProvider);
                  form.setFieldsValue({ role_key: matched ? matched[0] : undefined });
                }}
              />
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.role_scope !== cur.role_scope}>
              {({ getFieldValue }) => {
                if (getFieldValue('role_scope') !== 'logistics') return null;
                return (
                  <Form.Item
                    label="归属物流商"
                    name="logistics_provider_id"
                    rules={[{ required: true, message: '请选择归属物流商' }]}
                  >
                    <Select
                      options={logisticsOptions.map((item) => ({ label: item.name, value: item.id }))}
                      onChange={(providerId) => {
                        const scope = form.getFieldValue('role_scope') || 'platform';
                        const matched = Object.entries(roleOptionMap)
                          .find(([, meta]) => meta.code !== 'super_admin' && meta.scope === scope && (meta.logistics_provider_id ?? null) === (providerId ?? null));
                        form.setFieldsValue({ role_key: matched ? matched[0] : undefined });
                      }}
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) =>
                prev.role_scope !== cur.role_scope || prev.logistics_provider_id !== cur.logistics_provider_id}
            >
              {({ getFieldValue }) => {
                const scope = getFieldValue('role_scope') || 'platform';
                const providerId = getFieldValue('logistics_provider_id') || null;
                const editingSuperAdmin = modalMode === 'edit' && activeAdmin?.role === 'super_admin';
                const filteredRoleOptions = roleOptions.filter((opt) => {
                  const meta = roleOptionMap[opt.value];
                  if (!meta) return false;
                  // 超级管理员唯一，创建/修改其它账号时不允许选择
                  if (meta.code === 'super_admin' && !editingSuperAdmin) return false;
                  if (scope !== meta.scope) return false;
                  if (scope === 'logistics' && (meta.logistics_provider_id ?? null) !== providerId) return false;
                  return true;
                });
                return (
                  <Form.Item
                    label="角色"
                    name="role_key"
                    rules={[{ required: true, message: '请选择角色' }]}
                  >
                    <Select options={filteredRoleOptions} placeholder="请选择角色" />
                  </Form.Item>
                );
              }}
            </Form.Item>

            <Form.Item
              label={modalMode === 'create' ? '密码' : '新密码（不改可留空）'}
              name="password"
              rules={modalMode === 'create'
                ? [
                  { required: true, message: '请输入密码' },
                  { min: 12, message: '密码至少 12 位' },
                ]
                : [
                  { min: 12, message: '密码至少 12 位' },
                ]}
            >
              <Input.Password placeholder={modalMode === 'create' ? '请输入密码（至少12位）' : '留空表示不修改'} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Card>
  );
}
