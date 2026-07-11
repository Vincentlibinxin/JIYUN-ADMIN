import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

export interface LogisticsProvider {
  id: number;
  name: string;
  code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface LogisticsPayload {
  name: string;
  code?: string;
  contact_name?: string;
  contact_phone?: string;
  email?: string;
  website?: string;
  status?: string;
  remark?: string;
}

type LogisticsSortKey = 'id' | 'name' | 'code' | 'contact_name' | 'contact_phone' | 'email' | 'website' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface LogisticsTabProps {
  providers: LogisticsProvider[];
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
  sortKey: LogisticsSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: LogisticsSortKey, direction: SortDirection) => void;
  onCreate: (payload: LogisticsPayload) => Promise<boolean>;
  onUpdate: (id: number, payload: LogisticsPayload) => Promise<boolean>;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  canManage?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

type ModalMode = 'create' | 'edit' | 'view';

export default function LogisticsTab({
  providers,
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
  onDelete,
  onBatchDelete,
  canManage,
  canUpdate,
  canDelete,
  refreshKey,
  onColumnFilterChange,
}: LogisticsTabProps) {
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

  const renderStatusFilter = () => (
    <Select
      size="small"
      value={columnFilters['status'] || ''}
      onChange={(v) => handleColumnSearch('status', v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[
        { label: '全部', value: '' },
        { label: '启用', value: 'active' },
        { label: '停用', value: 'inactive' },
      ]}
    />
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
  const visibleRowIds = providers.map((item) => item.id);
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

  // ---------- 新增/编辑/查看 弹窗 ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<LogisticsPayload>();

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active' });
    setModalOpen(true);
  };

  const openView = (record: LogisticsProvider) => {
    setModalMode('view');
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      code: record.code || '',
      contact_name: record.contact_name || '',
      contact_phone: record.contact_phone || '',
      email: record.email || '',
      website: record.website || '',
      status: record.status,
      remark: record.remark || '',
    });
    setModalOpen(true);
  };

  const openEdit = (record: LogisticsProvider) => {
    setModalMode('edit');
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      code: record.code || '',
      contact_name: record.contact_name || '',
      contact_phone: record.contact_phone || '',
      email: record.email || '',
      website: record.website || '',
      status: record.status,
      remark: record.remark || '',
    });
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    if (modalMode === 'view') {
      setModalOpen(false);
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload: LogisticsPayload = {
        name: values.name.trim(),
        code: values.code?.trim().toUpperCase() || '',
        contact_name: values.contact_name?.trim() || '',
        contact_phone: values.contact_phone?.trim() || '',
        email: values.email?.trim() || '',
        website: values.website?.trim() || '',
        status: values.status || 'active',
        remark: values.remark?.trim() || '',
      };
      let ok = false;
      if (modalMode === 'create') {
        ok = await onCreate(payload);
      } else if (editingId != null) {
        ok = await onUpdate(editingId, payload);
      }
      if (ok) {
        message.success(modalMode === 'create' ? '物流商已创建' : '物流商已更新');
        setModalOpen(false);
      }
    } catch (err) {
      // 校验失败，忽略
    } finally {
      setSubmitting(false);
    }
  };

  const isView = modalMode === 'view';
  const modalTitle = modalMode === 'create' ? '新增物流商' : modalMode === 'edit' ? '修改物流商' : '查看物流商';

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';

  const columns: ColumnsType<LogisticsProvider> = [
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
      title: '名称',
      key: 'name',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'name' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('name', '名称'),
          dataIndex: 'name',
          key: 'name_child',
          width: 180,
          ellipsis: true,
        },
      ],
    },
    {
      title: '代号',
      key: 'code',
      width: 130,
      sorter: true,
      sortOrder: sortKey === 'code' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('code', '代号'),
          dataIndex: 'code',
          key: 'code_child',
          width: 130,
          ellipsis: true,
        },
      ],
    },
    {
      title: '联系人',
      key: 'contact_name',
      width: 130,
      sorter: true,
      sortOrder: sortKey === 'contact_name' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('contact_name', '联系人'),
          dataIndex: 'contact_name',
          key: 'contact_name_child',
          width: 130,
          ellipsis: true,
        },
      ],
    },
    {
      title: '联系电话',
      key: 'contact_phone',
      width: 150,
      sorter: true,
      sortOrder: sortKey === 'contact_phone' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('contact_phone', '联系电话'),
          dataIndex: 'contact_phone',
          key: 'contact_phone_child',
          width: 150,
          ellipsis: true,
        },
      ],
    },
    {
      title: '电子邮箱',
      key: 'email',
      width: 200,
      sorter: true,
      sortOrder: sortKey === 'email' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('email', '电子邮箱'),
          dataIndex: 'email',
          key: 'email_child',
          width: 200,
          ellipsis: true,
        },
      ],
    },
    {
      title: '官网/查询网址',
      key: 'website',
      width: 200,
      children: [
        {
          title: renderSearchInput('website', '官网'),
          dataIndex: 'website',
          key: 'website_child',
          width: 200,
          ellipsis: true,
          render: (value: string | null) =>
            value ? (
              <a href={value} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{value}</a>
            ) : '',
        },
      ],
    },
    {
      title: '状态',
      key: 'status',
      width: 110,
      sorter: true,
      sortOrder: sortKey === 'status' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderStatusFilter(),
          key: 'status_child',
          width: 110,
          render: (_, record) => <Tag color={record.status === 'active' ? 'success' : 'default'}>{record.status === 'active' ? '启用' : '停用'}</Tag>,
        },
      ],
    },
    {
      title: '备注',
      key: 'remark',
      width: 180,
      children: [
        {
          title: renderSearchInput('remark', '备注'),
          dataIndex: 'remark',
          key: 'remark_child',
          width: 180,
          ellipsis: true,
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
          render: (value: string) => formatDate(value),
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
              <Tooltip title="查看">
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openView(record)} />
              </Tooltip>
              {canUpdate && (
                <Tooltip title="修改">
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                </Tooltip>
              )}
              {canDelete && (
                <Popconfirm
                  title="确定删除该物流商？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => onDelete(record.id)}
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

  const tableColumns = constrainTableColumns(columns);
  const tableScrollX = getConstrainedTableScrollX(tableColumns);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增物流商
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
            placeholder="搜索物流商：ID、名称、代号、联系人、电话或状态"
            style={{ width: 400 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}>
          <Button>占位</Button>
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<LogisticsProvider>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={tableColumns}
          dataSource={providers}
          pagination={false}
          size="small"
          sticky
          tableLayout="auto"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: tableScrollX, y: tableScrollY }}
          locale={{ emptyText: '没有物流商记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as LogisticsSortKey | undefined;
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
        title={modalTitle}
        open={modalOpen}
        rootClassName="detail-modal"
        className="detail-modal"
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        centered
        confirmLoading={submitting}
        okText={isView ? '关闭' : '保存'}
        cancelText="取消"
        okButtonProps={isView ? { style: { display: 'none' } } : undefined}
        cancelButtonProps={isView ? { children: '关闭' } : undefined}
        destroyOnClose
        width={560}
        style={{ maxWidth: 'calc(100vw - 24px)' }}
      >
        <Form form={form} layout="vertical" disabled={isView}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入物流商名称' }]}
          >
            <Input placeholder="请输入物流商名称" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="code"
            label="代号/编码"
            rules={modalMode === 'create' ? [
              { required: true, message: '请输入物流商代号' },
              { pattern: /^[A-Za-z]{4,8}$/, message: '请输入4-8个字母' },
            ] : []}
            extra={modalMode === 'create' ? '将用于生成初始管理员账号 admin@代号（初始密码 88888888）' : undefined}
          >
            <Input placeholder="如 HAOYUN，将生成 admin@HAOYUN" maxLength={8} disabled={modalMode === 'edit'} />
          </Form.Item>
          <Form.Item name="contact_name" label="联系人">
            <Input placeholder="请输入联系人" maxLength={64} />
          </Form.Item>
          <Form.Item name="contact_phone" label="联系电话">
            <Input placeholder="请输入联系电话" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="email"
            label="电子邮箱"
            rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="请输入电子邮箱" maxLength={255} />
          </Form.Item>
          <Form.Item name="website" label="官网/查询网址">
            <Input placeholder="请输入官网或查询网址" maxLength={255} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '启用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="请输入备注" maxLength={255} rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
