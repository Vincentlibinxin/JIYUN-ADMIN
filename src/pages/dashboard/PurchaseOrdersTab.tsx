import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Pagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

const ORDER_STATUSES = [
  { value: 'pending', label: '待处理', color: 'default' },
  { value: 'confirmed', label: '已确认', color: 'blue' },
  { value: 'purchasing', label: '采购中', color: 'processing' },
  { value: 'purchased', label: '已采购', color: 'cyan' },
  { value: 'completed', label: '已完成', color: 'success' },
  { value: 'cancelled', label: '已取消', color: 'error' },
] as const;

const STATUS_MAP = new Map<string, { label: string; color: string }>(
  ORDER_STATUSES.map((item) => [item.value, { label: item.label, color: item.color }])
);

interface PurchaseOrder {
  id: number;
  user_id: number;
  logistics_provider_id: number;
  items: PurchaseOrderItem[];
  status: string;
  logistics_provider_name: string | null;
  member_username: string | null;
  member_real_name: string | null;
  member_phone: string | null;
  created_at: string;
  updated_at: string;
}

interface PurchaseOrderItem {
  id?: number;
  item_name: string;
  quantity: number;
  description?: string | null;
  item_url?: string | null;
}

interface ProviderOption {
  id: number;
  name: string;
  code: string | null;
}

interface MemberOption {
  id: number;
  username: string;
  real_name: string | null;
  phone: string | null;
  logistics_provider_id?: number | null;
}

interface FormValues {
  user_id: number;
  logistics_provider_id?: number;
  status: string;
  items: PurchaseOrderItem[];
}

interface PurchaseOrdersTabProps {
  actorScope: 'platform' | 'logistics';
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  refreshKey?: number;
}

type ModalMode = 'create' | 'edit' | 'view';
type SortKey = 'id' | 'user_id' | 'logistics_provider_id' | 'status' | 'created_at' | 'updated_at';

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', { hour12: false })
  : '—';

const responseError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
};

const memberLabel = (record: PurchaseOrder) => record.member_real_name
  ? `${record.member_real_name}（${record.member_username || ''}）`
  : record.member_username || `#${record.user_id}`;

export default function PurchaseOrdersTab({ actorScope, canCreate, canUpdate, canDelete, refreshKey }: PurchaseOrdersTabProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, [string, string] | null>>({});
  const [dateResetKey, setDateResetKey] = useState(0);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const memberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const selectedProviderId = Form.useWatch('logistics_provider_id', form);

  const fetchOrders = async (
    nextPage = page,
    nextPageSize = pageSize,
    nextSortKey: SortKey = sortKey,
    nextSortOrder = sortOrder,
    nextColumnFilters = columnFilters,
    nextDateFilters = dateFilters,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(nextPageSize),
        sortKey: nextSortKey,
        sortOrder: nextSortOrder,
      });
      if (Object.keys(nextColumnFilters).length) params.set('columnFilters', JSON.stringify(nextColumnFilters));
      const cleanDateFilters = Object.fromEntries(Object.entries(nextDateFilters).filter((entry): entry is [string, [string, string]] => Boolean(entry[1])));
      if (Object.keys(cleanDateFilters).length) params.set('dateFilters', JSON.stringify(cleanDateFilters));
      const response = await adminFetch(`/admin/purchase-orders?${params.toString()}`);
      if (!response.ok) throw new Error(await responseError(response, '加载代购订单失败'));
      const result = await response.json();
      setOrders(result.data || []);
      setTotal(result.pagination?.total || 0);
      setPage(nextPage);
      setPageSize(nextPageSize);
      setSearching(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载代购订单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(1, pageSize);
    if (actorScope === 'platform') {
      adminFetch('/admin/logistics/options')
        .then(async (response) => response.ok ? response.json() : { data: [] })
        .then((result) => setProviderOptions(result.data || []))
        .catch(() => setProviderOptions([]));
    }
    return () => {
      if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshKey) fetchOrders(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) setTableScrollY(nextHeight - 86);
    };
    updateTableHeight();
    const observer = new ResizeObserver(updateTableHeight);
    if (tableHostRef.current) observer.observe(tableHostRef.current);
    window.addEventListener('resize', updateTableHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTableHeight);
    };
  }, []);

  const searchOrders = async (value = searchQuery) => {
    const keyword = value.trim();
    if (!keyword) {
      fetchOrders(1, pageSize);
      return;
    }
    setLoading(true);
    try {
      const response = await adminFetch(`/admin/purchase-orders/search?q=${encodeURIComponent(keyword)}`);
      if (!response.ok) throw new Error(await responseError(response, '搜索代购订单失败'));
      const result = await response.json();
      setOrders(result.data || []);
      setTotal(result.data?.length || 0);
      setPage(1);
      setSearching(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '搜索代购订单失败');
    } finally {
      setLoading(false);
    }
  };

  const searchMembers = (keyword: string) => {
    if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current);
    if (!keyword.trim()) {
      setMemberOptions([]);
      return;
    }
    memberSearchTimer.current = setTimeout(async () => {
      setMemberSearching(true);
      try {
        const response = await adminFetch(`/admin/users/search?q=${encodeURIComponent(keyword.trim())}&page=1&limit=30`);
        if (!response.ok) return;
        const result = await response.json();
        const options = (result.data || []) as MemberOption[];
        setMemberOptions(actorScope === 'platform' && selectedProviderId
          ? options.filter((member) => Number(member.logistics_provider_id) === Number(selectedProviderId))
          : options);
      } finally {
        setMemberSearching(false);
      }
    }, 300);
  };

  const openCreate = () => {
    setModalMode('create');
    setEditing(null);
    setMemberOptions([]);
    form.resetFields();
    form.setFieldsValue({ status: 'pending', items: [{ item_name: '', quantity: 1 }] });
    setModalOpen(true);
  };

  const openRecord = (record: PurchaseOrder, mode: 'edit' | 'view') => {
    setModalMode(mode);
    setEditing(record);
    setMemberOptions([{
      id: record.user_id,
      username: record.member_username || '',
      real_name: record.member_real_name,
      phone: record.member_phone,
      logistics_provider_id: record.logistics_provider_id,
    }]);
    form.setFieldsValue({
      user_id: record.user_id,
      logistics_provider_id: record.logistics_provider_id,
      status: record.status,
      items: record.items.map((item) => ({
        item_name: item.item_name,
        quantity: item.quantity,
        description: item.description || undefined,
        item_url: item.item_url || undefined,
      })),
    });
    setModalOpen(true);
  };

  const submitForm = async () => {
    if (modalMode === 'view') {
      setModalOpen(false);
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        ...values,
        items: values.items.map((item) => ({
          item_name: item.item_name.trim(),
          quantity: item.quantity,
          description: item.description?.trim() || null,
          item_url: item.item_url?.trim() || null,
        })),
        logistics_provider_id: actorScope === 'platform' ? values.logistics_provider_id : undefined,
      };
      const response = await adminFetch(
        modalMode === 'create' ? '/admin/purchase-orders' : `/admin/purchase-orders/${editing?.id}`,
        {
          method: modalMode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) throw new Error(await responseError(response, '保存代购订单失败'));
      message.success(modalMode === 'create' ? '代购订单已创建' : '代购订单已更新');
      setModalOpen(false);
      await fetchOrders(modalMode === 'create' ? 1 : page, pageSize);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteOrders = async (ids: number[]) => {
    const response = ids.length === 1
      ? await adminFetch(`/admin/purchase-orders/${ids[0]}`, { method: 'DELETE' })
      : await adminFetch('/admin/purchase-orders/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
    if (!response.ok) {
      message.error(await responseError(response, '删除代购订单失败'));
      return;
    }
    message.success(ids.length === 1 ? '代购订单已删除' : `已删除 ${ids.length} 条代购订单`);
    setSelectedRowKeys([]);
    fetchOrders(orders.length <= ids.length && page > 1 ? page - 1 : page, pageSize);
  };

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters };
    if (!value) delete next[key];
    else next[key] = value;
    setColumnFilters(next);
    setPage(1);
    void fetchOrders(1, pageSize, sortKey, sortOrder, next);
  };

  const renderSearchInput = (key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(event) => {
        setLocalColumnFilters((previous) => ({ ...previous, [key]: event.target.value }));
        if (!event.target.value) handleColumnSearch(key, '');
      }}
      onPressEnter={(event) => handleColumnSearch(key, (event.target as HTMLInputElement).value)}
      onClick={(event) => event.stopPropagation()}
      allowClear
    />
  );

  const renderSelectFilter = (key: string, options: Array<{ label: string; value: string }>) => (
    <Select size="small" value={columnFilters[key] || ''} onChange={(value) => handleColumnSearch(key, value)} onClick={(event) => event.stopPropagation()} style={{ width: '100%' }} options={[{ label: '全部', value: '' }, ...options]} />
  );

  const renderDateRangeInput = (key: string) => (
    <DatePicker.RangePicker
      size="small"
      onChange={(_, dateStrings) => {
        const next = { ...dateFilters, [key]: dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] as [string, string] : null };
        setDateFilters(next);
        setPage(1);
        void fetchOrders(1, pageSize, sortKey, sortOrder, columnFilters, next);
      }}
      onClick={(event) => event.stopPropagation()}
      style={{ width: '100%' }}
      key={`date-picker-${key}-${dateResetKey}`}
      allowClear
    />
  );

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setDateResetKey((value) => value + 1);
    setSearchQuery('');
    setSortKey('created_at');
    setSortOrder('desc');
    setSelectedRowKeys([]);
    setPage(1);
    void fetchOrders(1, pageSize, 'created_at', 'desc', {}, {});
  };

  const visibleKeys = orders.map((order) => order.id);
  const selectedVisibleCount = visibleKeys.filter((key) => selectedRowKeys.includes(key)).length;
  const allSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;
  const sortOrderFor = (key: SortKey) => sortKey === key ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null;

  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: '序号', key: 'index', width: 65, fixed: 'left',
      children: [{ title: <Checkbox checked={allSelected} indeterminate={indeterminate} onChange={(event) => setSelectedRowKeys(event.target.checked ? visibleKeys : [])} />, key: 'index_child', width: 65, fixed: 'left', render: (_, record, index) => <Space size={8}><Checkbox checked={selectedRowKeys.includes(record.id)} onChange={(event) => setSelectedRowKeys((previous) => event.target.checked ? [...new Set([...previous, record.id])] : previous.filter((key) => key !== record.id))} /><span>{(page - 1) * pageSize + index + 1}</span></Space> }],
    },
    {
      title: '订单号', key: 'id', width: 105, sorter: true, sortOrder: sortOrderFor('id'),
      children: [{ title: renderSearchInput('id', '订单号'), key: 'id_child', width: 105, render: (_, record) => `#${record.id}` }],
    },
    {
      title: '会员', key: 'user_id', width: 180, sorter: true, sortOrder: sortOrderFor('user_id'),
      children: [{ title: renderSearchInput('user_id', '会员ID'), key: 'user_id_child', width: 180, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.member_phone || undefined}>{memberLabel(record)}</Tooltip> }],
    },
    {
      title: '物品', key: 'items', width: 260, ellipsis: true,
      children: [{ title: renderSearchInput('items', '物品'), key: 'items_child', width: 240, ellipsis: { showTitle: false }, render: (_, record) => {
        const names = record.items.map((item) => item.item_name).join('、');
        return <Tooltip title={names}>{names || '—'}</Tooltip>;
      } }],
    },
    { title: '物品种类', key: 'item_count', width: 100, children: [{ title: renderSearchInput('item_count', '种类数'), key: 'item_count_child', width: 100, align: 'right', render: (_, record) => record.items.length }] },
    { title: '总数量', key: 'total_quantity', width: 100, children: [{ title: renderSearchInput('total_quantity', '总数量'), key: 'total_quantity_child', width: 100, align: 'right', render: (_, record) => record.items.reduce((total, item) => total + Number(item.quantity || 0), 0) }] },
    {
      title: '状态', key: 'status', width: 110, sorter: true, sortOrder: sortOrderFor('status'),
      children: [{ title: renderSelectFilter('status', ORDER_STATUSES.map(({ value, label }) => ({ value, label }))), key: 'status_child', width: 110, render: (_, record) => {
        const status = STATUS_MAP.get(record.status);
        return <Tag color={status?.color}>{status?.label || record.status}</Tag>;
      } }],
    },
    {
      title: '链接', key: 'item_urls', width: 150, align: 'center',
      children: [{ title: renderSearchInput('item_urls', '链接'), key: 'item_urls_child', width: 150, align: 'center', render: (_, record) => {
        const linkedItems = record.items.filter((item) => item.item_url);
        if (!linkedItems.length) return '—';
        return (
          <Space size={0}>
            {linkedItems.slice(0, 3).map((item, index) => (
              <Tooltip key={`${item.id || index}-${item.item_url}`} title={item.item_name}>
                <Button type="link" size="small" icon={<LinkOutlined />} href={item.item_url || undefined} target="_blank" rel="noreferrer">{index + 1}</Button>
              </Tooltip>
            ))}
            {linkedItems.length > 3 && <span>+{linkedItems.length - 3}</span>}
          </Space>
        );
      } }],
    },
    { title: '物流商', key: 'logistics_provider_id', width: 150, sorter: true, sortOrder: sortOrderFor('logistics_provider_id'), children: [{ title: renderSearchInput('logistics_provider_id', '物流商ID'), key: 'logistics_provider_id_child', width: 150, ellipsis: { showTitle: false }, render: (_, record) => record.logistics_provider_name || '—' }] },
    { title: '创建时间', key: 'created_at', width: 180, sorter: true, sortOrder: sortOrderFor('created_at'), children: [{ title: renderDateRangeInput('created_at'), key: 'created_at_child', width: 180, render: (_, record) => formatDate(record.created_at) }] },
    { title: '', key: 'spacer', children: [{ title: '', key: 'spacer_child', render: () => null }] },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right', align: 'center',
      children: [{ title: <Tooltip title="重置所有搜索"><Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} /></Tooltip>, key: 'actions_child', width: 120, fixed: 'right', align: 'center', render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openRecord(record, 'view')} /></Tooltip>
          {canUpdate && <Tooltip title="修改"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRecord(record, 'edit')} /></Tooltip>}
          {canDelete && (
            <Popconfirm title="确定删除该代购订单？" okText="删除" cancelText="取消" onConfirm={() => deleteOrders([record.id])}>
              <Tooltip title="删除"><Button danger type="text" size="small" icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ) }],
    },
  ];

  const visibleColumns = actorScope === 'logistics'
    ? columns.filter((column) => column.key !== 'logistics_provider_id')
    : columns;
  const tableColumns = constrainTableColumns(visibleColumns);
  const isView = modalMode === 'view';

  return (
    <Card bordered={false} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增代购订单</Button>}
        {canDelete && (
          <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 条代购订单？`} okText="删除" cancelText="取消" disabled={!selectedRowKeys.length} onConfirm={() => deleteOrders(selectedRowKeys)}>
            <Button danger disabled={!selectedRowKeys.length}>批量删除{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}</Button>
          </Popconfirm>
        )}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); if (!event.target.value) fetchOrders(1, pageSize); }}
            onSearch={searchOrders}
            placeholder="搜索物品、说明、链接、会员或物流商"
            enterButton
            allowClear
            style={{ width: 420 }}
          />
        </div>
        <Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => fetchOrders(page, pageSize)} /></Tooltip>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<PurchaseOrder>
          rowKey="id"
          loading={loading}
          columns={tableColumns}
          dataSource={orders}
          pagination={false}
          size="small"
          sticky
          tableLayout="auto"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: getConstrainedTableScrollX(tableColumns), y: tableScrollY }}
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const nextSortKey = (sorter.columnKey || sorter.field) as SortKey | undefined;
            if (!nextSortKey || !sorter.order) {
              setSortKey('created_at'); setSortOrder('desc');
              void fetchOrders(page, pageSize, 'created_at', 'desc', columnFilters);
              return;
            }
            const nextSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
            setSortKey(nextSortKey); setSortOrder(nextSortOrder);
            void fetchOrders(page, pageSize, nextSortKey, nextSortOrder, columnFilters);
          }}
          locale={{ emptyText: searching ? '没有匹配的代购订单' : '没有代购订单' }}
        />
      </div>

      <div style={{ flexShrink: 0, padding: '6px 16px', borderTop: '1px solid #f0f0f0', background: '#fff' }}>
        <Pagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger={!searching}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          showQuickJumper={!searching}
          showTotal={(count, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`}
          disabled={searching}
          onChange={(nextPage, nextSize) => fetchOrders(nextPage, nextSize, sortKey, sortOrder, columnFilters)}
          onShowSizeChange={(_, nextSize) => fetchOrders(1, nextSize, sortKey, sortOrder, columnFilters)}
        />
      </div>

      <Modal
        title={modalMode === 'create' ? '新增代购订单' : modalMode === 'edit' ? '修改代购订单' : '查看代购订单'}
        open={modalOpen}
        onOk={submitForm}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText={isView ? '关闭' : '取消'}
        okButtonProps={isView ? { style: { display: 'none' } } : undefined}
        centered
        destroyOnClose
        width={760}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" disabled={isView} preserve={false}>
          {actorScope === 'platform' && (
            <Form.Item name="logistics_provider_id" label="物流商" rules={[{ required: true, message: '请选择物流商' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="请选择物流商"
                options={providerOptions.map((provider) => ({ value: provider.id, label: provider.code ? `${provider.name}（${provider.code}）` : provider.name }))}
                onChange={() => { form.setFieldValue('user_id', undefined); setMemberOptions([]); }}
              />
            </Form.Item>
          )}
          <Form.Item name="user_id" label="会员" rules={[{ required: true, message: '请选择会员' }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={searchMembers}
              loading={memberSearching}
              placeholder={actorScope === 'platform' && !selectedProviderId ? '请先选择物流商' : '输入会员账号、姓名或手机号搜索'}
              disabled={isView || (actorScope === 'platform' && !selectedProviderId)}
              options={memberOptions.map((member) => ({
                value: member.id,
                label: member.real_name ? `${member.real_name}（${member.username}）${member.phone ? ` · ${member.phone}` : ''}` : `${member.username}${member.phone ? ` · ${member.phone}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="status" label="订单状态" rules={[{ required: true, message: '请选择订单状态' }]}>
            <Select options={ORDER_STATUSES.map(({ value, label }) => ({ value, label }))} style={{ width: 220 }} />
          </Form.Item>
          <Form.List name="items" rules={[{ validator: async (_, items) => { if (!items?.length) throw new Error('请至少添加一个物品'); } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>物品明细（{fields.length}）</strong>
                  {!isView && <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>添加物品</Button>}
                </div>
                {fields.map((field, index) => (
                  <div key={field.key} style={{ border: '1px solid #e5e7eb', padding: 12, marginBottom: 12, borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>物品 {index + 1}</span>
                      {!isView && fields.length > 1 && (
                        <Tooltip title="删除物品"><Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} /></Tooltip>
                      )}
                    </div>
                    <Space align="start" style={{ display: 'flex' }} size={12}>
                      <Form.Item name={[field.name, 'item_name']} label="物品名称" rules={[{ required: true, whitespace: true, message: '请输入物品名称' }]} style={{ flex: 1 }}>
                        <Input maxLength={255} placeholder="请输入物品名称" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'quantity']} label="数量" rules={[{ required: true, message: '请输入数量' }]} style={{ width: 140 }}>
                        <InputNumber min={1} max={999999} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>
                    <Form.Item name={[field.name, 'item_url']} label="链接" rules={[{ type: 'url', message: '请输入有效的 http 或 https 链接' }]}>
                      <Input maxLength={2048} placeholder="https://example.com/item" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'description']} label="说明" style={{ marginBottom: 0 }}>
                      <Input.TextArea maxLength={5000} rows={2} showCount placeholder="填写规格、颜色、尺寸或其他代购要求" />
                    </Form.Item>
                  </div>
                ))}
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
  );
}