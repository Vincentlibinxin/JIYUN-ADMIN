import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AutoComplete, Button, Card, DatePicker, Form, Input, InputNumber, Modal,
  Pagination as AntPagination, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Tooltip, message,
} from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import { adminFetch, ApiRequestError } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

export const SHIPPING_CARRIER_TYPES = ['海运', '空运', '陆运', '铁路', '水运', '其它'];

interface ProviderOption { id: number; name: string; code: string | null }

type ModalMode = 'create' | 'edit' | 'view';
type SortDirection = 'asc' | 'desc';

interface CrudColumn {
  key: string;
  title: string;
  width: number;
  dataIndex?: string;
  searchable?: boolean;
  sortable?: boolean;
  filter?: 'text' | 'enabled' | 'date';
  ellipsis?: boolean;
  render?: (value: any, record: any) => React.ReactNode;
}

interface CrudResourceProps {
  apiPath: string;
  entityName: string;
  idPrefix: string;
  columns: CrudColumn[];
  defaultSort?: { key: string; direction: SortDirection };
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  showProviderSelect: boolean;
  providerRequired?: boolean;
  providerOptions: ProviderOption[];
  refreshKey?: number;
  modalWidth?: number;
  searchPlaceholder: string;
  renderForm: (ctx: { mode: ModalMode; form: FormInstance }) => React.ReactNode;
  fillForm: (record: any, form: FormInstance) => void;
  buildPayload: (values: any, showProviderSelect: boolean) => Record<string, any> | null;
  createDefaults?: Record<string, any>;
  onBeforeOpenModal?: () => void | Promise<void>;
  canUpdateRecord?: (record: any) => boolean;
  canDeleteRecord?: (record: any) => boolean;
  renderRowActions?: (record: any) => React.ReactNode;
}

const formatDateTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';

const renderLabeledFields = (items: Array<{ label: string; value: React.ReactNode }>) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.45 }}>
    {items.map((item) => (
      <div key={item.label}>
        <span style={{ color: '#8c8c8c' }}>{item.label}：</span>
        <span>{item.value ?? '—'}</span>
      </div>
    ))}
  </div>
);

const renderDateValue = (value: unknown) => formatDateTime(value as string | null | undefined) || '—';

const renderMultilineCell = (value?: string | null, maxLines = 5) => {
  const text = (value || '').trim();
  if (!text) return '—';
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: maxLines,
      }}
    >
      {text}
    </div>
  );
};

// 通用自包含 CRUD 表格（自带 adminFetch，分页/列搜索/排序/选择/增删改查）
function CrudResource({
  apiPath, entityName, idPrefix, columns: fieldColumns, defaultSort, canCreate, canUpdate, canDelete,
  showProviderSelect, providerRequired, providerOptions, refreshKey, modalWidth = 720, searchPlaceholder,
  renderForm, fillForm, buildPayload, createDefaults, onBeforeOpenModal,
  canUpdateRecord, canDeleteRecord, renderRowActions,
}: CrudResourceProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? 'created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction ?? 'desc');

  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, [string, string] | null>>({});
  const [resetKey, setResetKey] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      const nextHeight = tableHostRef.current?.clientHeight ?? 0;
      if (nextHeight > 0) setTableScrollY(nextHeight - 86);
    };
    updateTableHeight();
    const observer = new ResizeObserver(() => updateTableHeight());
    if (tableHostRef.current) observer.observe(tableHostRef.current);
    window.addEventListener('resize', updateTableHeight);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateTableHeight); };
  }, []);

  const providerSelectOptions = providerOptions.map((o) => ({ label: o.code ? `${o.name}（${o.code}）` : o.name, value: o.id }));

  const buildParams = (
    p: number, size: number, sk: string, sd: string,
    cf: Record<string, string>, df: Record<string, [string, string] | null>,
  ) => {
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('limit', String(size));
    if (sk) params.set('sortKey', sk);
    if (sd) params.set('sortOrder', sd);
    const cleanCf: Record<string, string> = {};
    for (const [k, v] of Object.entries(cf)) if (v && v.trim()) cleanCf[k] = v;
    if (Object.keys(cleanCf).length) params.set('columnFilters', JSON.stringify(cleanCf));
    const cleanDf: Record<string, [string, string]> = {};
    for (const [k, v] of Object.entries(df)) if (v && v[0] && v[1]) cleanDf[k] = v;
    if (Object.keys(cleanDf).length) params.set('dateFilters', JSON.stringify(cleanDf));
    return params;
  };

  const fetchData = async (
    p = page, size = pageSize, sk = sortKey, sd = sortDirection,
    cf = columnFilters, df = dateFilters,
  ) => {
    try {
      setLoading(true);
      const params = buildParams(p, size, sk, sd, cf, df);
      const res = await adminFetch(`${apiPath}?${params.toString()}`);
      if (!res.ok) { setData([]); setTotal(0); return; }
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.pagination?.total || 0);
      setPage(json.pagination?.page || p);
    } catch {
      setData([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const doSearch = async (keyword: string) => {
    const kw = keyword.trim();
    if (!kw) { fetchData(1, pageSize); return; }
    try {
      setLoading(true);
      const res = await adminFetch(`${apiPath}/search?q=${encodeURIComponent(kw)}`);
      if (!res.ok) { setData([]); setTotal(0); return; }
      const json = await res.json();
      setData(json.data || []);
      setTotal((json.data || []).length);
      setPage(1);
    } catch {
      setData([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, pageSize, sortKey, sortDirection, {}, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setSearchQuery('');
    setResetKey((prev) => prev + 1);
    setSelectedRowKeys([]);
    setSortKey(defaultSort?.key ?? 'created_at');
    setSortDirection(defaultSort?.direction ?? 'desc');
    fetchData(1, pageSize, defaultSort?.key ?? 'created_at', defaultSort?.direction ?? 'desc', {}, {});
  };

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) resetFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters, [key]: value };
    if (!value) delete next[key];
    setColumnFilters(next);
    fetchData(1, pageSize, sortKey, sortDirection, next, dateFilters);
  };
  const handleDateSearch = (key: string, dateStrings: [string, string]) => {
    const next = { ...dateFilters };
    if (!dateStrings || !dateStrings[0]) next[key] = null; else next[key] = dateStrings;
    setDateFilters(next);
    fetchData(1, pageSize, sortKey, sortDirection, columnFilters, next);
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
  const renderDateRangeInput = (key: string) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        size="small"
        style={{ width: '100%' }}
        onChange={(_, dateStrings) => handleDateSearch(key, dateStrings as [string, string])}
        key={`date-picker-${key}-${resetKey}`}
        allowClear
      />
    </div>
  );
  const renderEnabledFilter = () => (
    <Select
      size="small"
      value={columnFilters['is_enabled'] || ''}
      onChange={(v) => handleColumnSearch('is_enabled', v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[{ label: '全部', value: '' }, { label: '启用', value: '1' }, { label: '停用', value: '0' }]}
    />
  );

  const visibleRowIds = data.map((item) => item.id);
  const selectedVisibleCount = visibleRowIds.filter((id) => selectedRowKeys.includes(id)).length;
  const allSelected = visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;
  const handleSelectAll = (checked: boolean) => setSelectedRowKeys(checked ? visibleRowIds : []);
  const handleSelectRow = (id: number, checked: boolean) =>
    setSelectedRowKeys((prev) => checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((k) => k !== id));

  // ---------- 弹窗 ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const openCreate = async () => {
    await onBeforeOpenModal?.();
    setModalMode('create');
    setEditingId(null);
    form.resetFields();
    if (createDefaults) form.setFieldsValue(createDefaults);
    setModalOpen(true);
  };
  const openView = async (record: any) => {
    await onBeforeOpenModal?.();
    setModalMode('view');
    setEditingId(record.id);
    form.resetFields();
    fillForm(record, form);
    setModalOpen(true);
  };
  const openEdit = async (record: any) => {
    await onBeforeOpenModal?.();
    setModalMode('edit');
    setEditingId(record.id);
    form.resetFields();
    fillForm(record, form);
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    if (modalMode === 'view') { setModalOpen(false); return; }
    try {
      const values = await form.validateFields();
      const payload = buildPayload(values, showProviderSelect);
      if (!payload) return;
      setSubmitting(true);
      let res: Response;
      if (modalMode === 'create') {
        res = await adminFetch(apiPath, { method: 'POST', body: JSON.stringify(payload) });
      } else {
        res = await adminFetch(`${apiPath}/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      }
      if (!res.ok) {
        let msg = '操作失败';
        try { const j = await res.json(); msg = j.error || j.message || msg; } catch { /* ignore */ }
        message.error(msg);
        return;
      }
      message.success(modalMode === 'create' ? `${entityName}已创建` : `${entityName}已更新`);
      setModalOpen(false);
      fetchData();
    } catch (err) {
      if (err instanceof ApiRequestError) message.error(err.message);
      // 表单校验失败：忽略
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await adminFetch(`${apiPath}/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      let msg = '删除失败';
      try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
      message.error(msg);
      return;
    }
    message.success(`${entityName}已删除`);
    fetchData();
  };
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    const res = await adminFetch(`${apiPath}/batch-delete`, { method: 'POST', body: JSON.stringify({ ids: selectedRowKeys }) });
    if (!res.ok) {
      let msg = '批量删除失败';
      try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
      message.error(msg);
      return;
    }
    message.success('批量删除成功');
    setSelectedRowKeys([]);
    fetchData();
  };

  const isView = modalMode === 'view';
  const modalTitle = modalMode === 'create' ? `新增${entityName}` : modalMode === 'edit' ? `修改${entityName}` : `查看${entityName}`;

  const columns: ColumnsType<any> = useMemo(() => {
    const indexCol: any = {
      title: '序号', key: 'index', width: 65, fixed: 'left', align: 'left',
      children: [{
        title: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}>
            <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = indeterminate; }} onChange={(e) => handleSelectAll(e.target.checked)} />
          </div>
        ),
        key: 'index_child', width: 65, fixed: 'left', align: 'left',
        render: (_: any, record: any, index: number) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
            <input type="checkbox" checked={selectedRowKeys.includes(record.id)} onChange={(e) => handleSelectRow(record.id, e.target.checked)} onClick={(e) => e.stopPropagation()} />
            <span>{index + 1}</span>
          </div>
        ),
      }],
    };

    const providerCol: any = {
      title: '物流商', key: 'logistics_provider_id', width: 150,
      children: [{
        title: renderSearchInput('logistics_provider_id', '物流商ID'),
        key: 'logistics_provider_id_child', width: 150, ellipsis: true,
        render: (_: any, record: any) => record.logistics_provider_name || (record.logistics_provider_id ? `#${record.logistics_provider_id}` : '—'),
      }],
    };

    const mapped = fieldColumns.map((col) => {
      const headerTitle = col.searchable
        ? renderSearchInput(col.key, col.title)
        : col.filter === 'enabled'
          ? renderEnabledFilter()
          : col.filter === 'date'
            ? renderDateRangeInput(col.key)
            : '';
      return {
        title: col.title, key: col.key, width: col.width,
        ...(col.sortable ? { sorter: true, sortOrder: sortKey === col.key ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null } : {}),
        children: [{
          title: headerTitle,
          dataIndex: col.dataIndex ?? col.key,
          key: `${col.key}_child`,
          width: col.width,
          ellipsis: col.ellipsis ?? true,
          render: col.render,
        }],
      } as any;
    });

    const spacerCol: any = { title: '', key: 'spacer', children: [{ title: '', key: 'spacer_child', render: () => null }] };
    const actionsCol: any = {
      title: '', key: 'actions', width: renderRowActions ? 200 : 120, fixed: 'right', align: 'center',
      children: [{
        title: (<Tooltip title="重置所有搜索"><Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} /></Tooltip>),
        key: 'actions_child', width: renderRowActions ? 200 : 120, fixed: 'right', align: 'center',
        render: (_: any, record: any) => {
          const allowUpdate = canUpdate && (canUpdateRecord ? canUpdateRecord(record) : true);
          const allowDelete = canDelete && (canDeleteRecord ? canDeleteRecord(record) : true);
          return (
            <Space size={4}>
              <Tooltip title="查看"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openView(record)} /></Tooltip>
              {allowUpdate && (<Tooltip title="修改"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>)}
              {allowDelete && (
              <Popconfirm title={`确定删除该${entityName}？`} okText="删除" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
                <Tooltip title="删除"><Button danger size="small" type="text" icon={<DeleteOutlined />} /></Tooltip>
              </Popconfirm>
              )}
              {renderRowActions?.(record)}
            </Space>
          );
        },
      }],
    };

    return [indexCol, ...(showProviderSelect ? [providerCol] : []), ...mapped, spacerCol, actionsCol];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldColumns, allSelected, indeterminate, selectedRowKeys, sortKey, sortDirection, columnFilters, localColumnFilters, resetKey, showProviderSelect, canUpdate, canDelete, canUpdateRecord, canDeleteRecord, renderRowActions]);

  const tableColumns = useMemo(() => constrainTableColumns(columns), [columns]);
  const tableScrollX = useMemo(() => getConstrainedTableScrollX(tableColumns), [tableColumns]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bordered={false} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增{entityName}</Button>
          )}
          {canDelete && (
            <Popconfirm
              title={`确定删除选中的 ${selectedRowKeys.length} 条记录？`}
              okText="删除" cancelText="取消"
              onConfirm={handleBatchDelete}
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
            onChange={(event) => { const val = event.target.value; setSearchQuery(val); if (!val) fetchData(1, pageSize); }}
            onSearch={doSearch}
            placeholder={searchPlaceholder}
            style={{ width: 420 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}><Button>占位</Button></div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={tableColumns}
          dataSource={data}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: tableScrollX, y: tableScrollY }}
          locale={{ emptyText: `没有${entityName}记录` }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const field = (sorter.field || sorter.columnKey) as string | undefined;
            const order = sorter.order;
            if (!field || !order) return;
            const dir: SortDirection = order === 'ascend' ? 'asc' : 'desc';
            setSortKey(field);
            setSortDirection(dir);
            fetchData(page, pageSize, field, dir);
          }}
        />
      </div>

      <div style={{ flexShrink: 0, zIndex: 10, background: '#fff', borderTop: '1px solid #f0f0f0', padding: '6px 16px' }}>
        <AntPagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={[10, 20, 30, 50]}
          showQuickJumper
          showTotal={(t, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${t} 条 · ${totalPages} 页`}
          onChange={(p, size) => { setPage(p); setPageSize(size); fetchData(p, size); }}
          onShowSizeChange={(_, size) => { setPageSize(size); setPage(1); fetchData(1, size); }}
        />
      </div>

      <Modal
        title={modalTitle}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={isView ? '关闭' : '保存'}
        cancelText="取消"
        okButtonProps={isView ? { style: { display: 'none' } } : undefined}
        cancelButtonProps={isView ? { children: '关闭' } : undefined}
        destroyOnClose
        width={modalWidth}
      >
        <Form form={form} layout="vertical" disabled={isView}>
          {showProviderSelect && (
            <Form.Item name="logistics_provider_id" label="物流商" rules={providerRequired ? [{ required: true, message: '请选择所属物流商' }] : undefined}>
              <Select allowClear showSearch optionFilterProp="label" placeholder={providerRequired ? '请选择所属物流商' : '请选择物流商（可空）'} options={providerSelectOptions} />
            </Form.Item>
          )}
          {renderForm({ mode: modalMode, form })}
        </Form>
      </Modal>
    </Card>
  );
}

// ==================== 各子模块配置 ====================

const dateTimeFieldItem = (name: string, label: string, required = false) => (
  <Form.Item name={name} label={label} rules={required ? [{ required: true, message: `请选择${label}` }] : undefined} style={{ marginBottom: 12 }}>
    <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} placeholder={`请选择${label}`} />
  </Form.Item>
);

const carrierTypeColor = (t: string): string => {
  switch (t) {
    case '海运': return 'blue';
    case '空运': return 'geekblue';
    case '陆运': return 'green';
    case '铁路': return 'orange';
    case '水运': return 'cyan';
    default: return 'default';
  }
};

interface SubTabProps {
  showProviderSelect: boolean;
  providerOptions: ProviderOption[];
  actorScope: 'platform' | 'logistics';
  actorProviderId: number | null;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
}

// -------- 航线管理 --------
function RoutesSubTab(props: SubTabProps) {
  const isOwnedByActor = (record: any): boolean => {
    if (props.actorScope !== 'logistics') return true;
    if (!props.actorProviderId) return false;
    return Number(record?.logistics_provider_id) === Number(props.actorProviderId);
  };

  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [grantRoute, setGrantRoute] = useState<any | null>(null);
  const [grantTargets, setGrantTargets] = useState<ProviderOption[]>([]);
  const [granteeProviderIds, setGranteeProviderIds] = useState<number[]>([]);

  const loadGrantTargets = async () => {
    const targetsRes = await adminFetch('/admin/ship-routes/grant-targets');
    if (!targetsRes.ok) {
      let msg = '加载可授权物流商失败';
      try { const j = await targetsRes.json(); msg = j.error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const targetsJson = await targetsRes.json();
    setGrantTargets(targetsJson.data || []);
  };

  const openGrantModal = async (record: any) => {
    if (!props.canUpdate) return;
    if (!record?.logistics_provider_id) {
      message.warning('仅归属物流商的航线支持代理授权');
      return;
    }
    try {
      setGrantRoute(record);
      setGrantModalOpen(true);
      setGrantLoading(true);
      await loadGrantTargets();
      const grantsRes = await adminFetch(`/admin/ship-routes/${record.id}/grants`);
      if (!grantsRes.ok) {
        let msg = '加载授权列表失败';
        try { const j = await grantsRes.json(); msg = j.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const grantsJson = await grantsRes.json();
      const ids = (grantsJson.data || [])
        .map((g: any) => Number(g.grantee_provider_id))
        .filter((id: number) => Number.isInteger(id) && id > 0);
      setGranteeProviderIds(ids);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载授权信息失败');
      setGrantModalOpen(false);
      setGrantRoute(null);
    } finally {
      setGrantLoading(false);
    }
  };

  const handleGrantSave = async () => {
    if (!grantRoute) return;
    try {
      setGrantSubmitting(true);
      const res = await adminFetch(`/admin/ship-routes/${grantRoute.id}/grants`, {
        method: 'PUT',
        body: JSON.stringify({ grantee_provider_ids: granteeProviderIds }),
      });
      if (!res.ok) {
        let msg = '保存授权失败';
        try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
        message.error(msg);
        return;
      }
      message.success('代理授权已更新');
      setGrantModalOpen(false);
      setGrantRoute(null);
      setGranteeProviderIds([]);
    } finally {
      setGrantSubmitting(false);
    }
  };

  const grantTargetOptions = grantTargets.map((o) => ({
    label: o.code ? `${o.name}（${o.code}）` : o.name,
    value: o.id,
  }));

  const columns: CrudColumn[] = [
    {
      key: 'route_name', title: '航线信息', width: 250, searchable: true, sortable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '航线名称', value: <Tag color="blue">{record.route_name || '—'}</Tag> },
        { label: '航线代码', value: record.route_code || '—' },
      ]),
    },
    {
      key: 'carrier_type', title: '承运信息', width: 250, searchable: true, sortable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '承运类型', value: record.carrier_type ? <Tag color={carrierTypeColor(record.carrier_type)}>{record.carrier_type}</Tag> : '—' },
        { label: '承运工具名称', value: record.carrier_tool_name || '—' },
        { label: '承运人', value: record.carrier || '—' },
      ]),
    },
    {
      key: 'departure_port', title: '港口信息', width: 280, searchable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '起运港', value: record.departure_port || '—' },
        { label: '目的港', value: record.destination_port || '—' },
      ]),
    },
    { key: 'is_enabled', title: '状态', width: 100, filter: 'enabled', sortable: true, render: (v: number) => <Tag color={v === 1 ? 'success' : 'default'}>{v === 1 ? '启用' : '停用'}</Tag> },
    { key: 'description', title: '备注', width: 160, searchable: true },
    {
      key: 'created_at', title: '创建/更新时间', width: 240,
      render: (_v, record) => renderLabeledFields([
        { label: '创建时间', value: renderDateValue(record.created_at) },
        { label: '更新时间', value: renderDateValue(record.updated_at) },
      ]),
    },
  ];
  return (
    <>
      <CrudResource
        apiPath="/admin/ship-routes"
        entityName="航线"
        idPrefix="route"
        columns={columns}
        canCreate={props.canCreate}
        canUpdate={props.canUpdate}
        canDelete={props.canDelete}
        showProviderSelect={props.showProviderSelect}
        providerOptions={props.providerOptions}
        refreshKey={props.refreshKey}
        searchPlaceholder="搜索航线：名称、代码、承运类型、承运人或备注"
        createDefaults={{ is_enabled: true, carrier_type: '海运' }}
        canUpdateRecord={isOwnedByActor}
        canDeleteRecord={isOwnedByActor}
        renderRowActions={(record) => (
          props.canUpdate && record?.logistics_provider_id && isOwnedByActor(record) ? (
            <Tooltip title="代理授权">
              <Button size="small" type="text" onClick={() => openGrantModal(record)}>授权</Button>
            </Tooltip>
          ) : null
        )}
        renderForm={() => (
          <>
            <Form.Item name="route_name" label="航线名称" rules={[{ required: true, message: '请输入航线名称' }]}>
              <Input placeholder="请输入航线名称" maxLength={128} />
            </Form.Item>
            <Form.Item name="route_code" label="航线代码">
              <Input placeholder="请输入航线代码" maxLength={64} />
            </Form.Item>
            <Form.Item name="carrier_type" label="承运类型" rules={[{ required: true, message: '请选择承运类型' }]}>
              <Select options={SHIPPING_CARRIER_TYPES.map((t) => ({ label: t, value: t }))} placeholder="请选择承运类型" />
            </Form.Item>
            <Form.Item name="carrier_tool_name" label="承运工具名称">
              <Input placeholder="如船名、航班号、车次等" maxLength={128} />
            </Form.Item>
            <Form.Item name="carrier" label="承运人">
              <Input placeholder="请输入承运人" maxLength={128} />
            </Form.Item>
            <Space size={12} style={{ display: 'flex' }} wrap>
              <Form.Item name="departure_port" label="起运港" tooltip="多个港口用 / 分隔" style={{ flex: 1, minWidth: 260 }}>
                <Input placeholder="多个港口用 / 分隔（选填）" maxLength={255} />
              </Form.Item>
              <Form.Item name="destination_port" label="目的港" tooltip="多个港口用 / 分隔" style={{ flex: 1, minWidth: 260 }}>
                <Input placeholder="多个港口用 / 分隔（选填）" maxLength={255} />
              </Form.Item>
            </Space>
            <Form.Item name="description" label="备注">
              <Input.TextArea rows={2} maxLength={255} showCount placeholder="备注" />
            </Form.Item>
            <Form.Item name="is_enabled" label="是否启用" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </>
        )}
        fillForm={(record, form) => form.setFieldsValue({
          route_name: record.route_name,
          route_code: record.route_code || '',
          carrier_type: record.carrier_type,
          carrier_tool_name: record.carrier_tool_name || '',
          carrier: record.carrier || '',
          departure_port: record.departure_port || '',
          destination_port: record.destination_port || '',
          description: record.description || '',
          is_enabled: record.is_enabled === 1,
          logistics_provider_id: record.logistics_provider_id ?? null,
        })}
        buildPayload={(values, showProvider) => ({
          route_name: (values.route_name || '').trim(),
          route_code: (values.route_code || '').trim(),
          carrier_type: values.carrier_type,
          carrier_tool_name: (values.carrier_tool_name || '').trim(),
          carrier: (values.carrier || '').trim(),
          departure_port: (values.departure_port || '').trim(),
          destination_port: (values.destination_port || '').trim(),
          description: (values.description || '').trim(),
          is_enabled: values.is_enabled !== false,
          logistics_provider_id: showProvider ? (values.logistics_provider_id ?? null) : undefined,
        })}
      />

      <Modal
        title={grantRoute ? `航线代理授权 - ${grantRoute.route_name}` : '航线代理授权'}
        open={grantModalOpen}
        onOk={handleGrantSave}
        onCancel={() => {
          setGrantModalOpen(false);
          setGrantRoute(null);
          setGranteeProviderIds([]);
        }}
        confirmLoading={grantSubmitting}
        okText="保存授权"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ color: '#8c8c8c', marginBottom: 8 }}>可将该航线授权给其它物流商，授权后对方可在班(航)次管理只读查看该航线下班次，并在提(运)单中关联班次。</div>
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="请选择被授权物流商"
          loading={grantLoading}
          value={granteeProviderIds}
          options={grantTargetOptions}
          onChange={(vals) => setGranteeProviderIds((vals || []).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))}
          style={{ width: '100%' }}
        />
      </Modal>
    </>
  );
}

// -------- 集装箱管理 --------
function ContainersSubTab(props: SubTabProps) {
  const columns: CrudColumn[] = [
    {
      key: 'container_no', title: '集装箱信息', width: 260, searchable: true, sortable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '箱号', value: <Tag color="purple">{record.container_no || '—'}</Tag> },
        { label: '箱型', value: record.container_type || '—' },
      ]),
    },
    { key: 'is_enabled', title: '状态', width: 100, filter: 'enabled', sortable: true, render: (v: number) => <Tag color={v === 1 ? 'success' : 'default'}>{v === 1 ? '启用' : '停用'}</Tag> },
    { key: 'description', title: '备注', width: 200, searchable: true },
    {
      key: 'created_at', title: '创建/更新时间', width: 240,
      render: (_v, record) => renderLabeledFields([
        { label: '创建时间', value: renderDateValue(record.created_at) },
        { label: '更新时间', value: renderDateValue(record.updated_at) },
      ]),
    },
  ];
  return (
    <CrudResource
      apiPath="/admin/ship-containers"
      entityName="集装箱"
      idPrefix="container"
      columns={columns}
      canCreate={props.canCreate}
      canUpdate={props.canUpdate}
      canDelete={props.canDelete}
      showProviderSelect={props.showProviderSelect}
      providerRequired
      providerOptions={props.providerOptions}
      refreshKey={props.refreshKey}
      searchPlaceholder="搜索集装箱：箱号、箱型或备注"
      createDefaults={{ is_enabled: true }}
      renderForm={() => (
        <>
          <Form.Item name="container_no" label="箱号" rules={[{ required: true, message: '请输入箱号' }]}>
            <Input placeholder="请输入箱号" maxLength={64} />
          </Form.Item>
          <Form.Item name="container_type" label="箱型" rules={[{ required: true, message: '请输入箱型' }]}>
            <Input placeholder="如 20GP / 40HQ / 45HQ 等" maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} maxLength={255} showCount placeholder="备注" />
          </Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </>
      )}
      fillForm={(record, form) => form.setFieldsValue({
        container_no: record.container_no,
        container_type: record.container_type,
        description: record.description || '',
        is_enabled: record.is_enabled === 1,
        logistics_provider_id: record.logistics_provider_id ?? null,
      })}
      buildPayload={(values, showProvider) => ({
        container_no: (values.container_no || '').trim(),
        container_type: (values.container_type || '').trim(),
        description: (values.description || '').trim(),
        is_enabled: values.is_enabled !== false,
        logistics_provider_id: showProvider ? (values.logistics_provider_id ?? null) : undefined,
      })}
    />
  );
}

// -------- 班(航)次管理 --------
function VoyagesSubTab(props: SubTabProps) {
  const [routeOptions, setRouteOptions] = useState<Array<{ id: number; route_name: string; departure_port: string | null; destination_port: string | null }>>([]);
  const fetchRouteOptions = async () => {
    try {
      const res = await adminFetch('/admin/ship-routes/options?ownedOnly=1');
      if (res.ok) { const j = await res.json(); setRouteOptions(j.data || []); }
    } catch { /* ignore */ }
  };
  useEffect(() => { fetchRouteOptions(); }, []);
  const routeSelectOptions = routeOptions.map((r) => ({ label: r.route_name, value: r.id }));

  const renderLabeledFields = (items: Array<{ label: string; value: React.ReactNode }>) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.45 }}>
      {items.map((item) => (
        <div key={item.label}>
          <span style={{ color: '#8c8c8c' }}>{item.label}：</span>
          <span>{item.value ?? '—'}</span>
        </div>
      ))}
    </div>
  );

  const renderDateValue = (value: unknown) => formatDateTime(value as string | null | undefined) || '—';

  const columns: CrudColumn[] = [
    {
      key: 'voyage_name', title: '班(航)次信息', width: 250, searchable: true, sortable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '班(航)次名称', value: <Tag color="blue">{record.voyage_name || '—'}</Tag> },
        { label: '班(航)次号', value: record.voyage_no || '—' },
      ]),
    },
    {
      key: 'route_name', title: '航线及港口', width: 260, searchable: true,
      render: (_v, record) => {
        const isOwned = !(props.actorScope === 'logistics' && props.actorProviderId && Number(record.logistics_provider_id) !== Number(props.actorProviderId));
        const operatorName = record.logistics_provider_name || (record.logistics_provider_id ? `物流商#${record.logistics_provider_id}` : '—');
        const operatorNode: React.ReactNode = isOwned ? <Tag color="success">自有</Tag> : operatorName;
        return renderLabeledFields([
          { label: '航线', value: record.route_name || '—' },
          { label: '起运港', value: record.departure_port || '—' },
          { label: '目的港', value: record.destination_port || '—' },
          { label: '航线运营人', value: operatorNode },
        ]);
      },
    },
    {
      key: 'etd', title: '运输时间', width: 250, filter: 'date',
      render: (_v, record) => renderLabeledFields([
        { label: '预计启航', value: renderDateValue(record.etd) },
        { label: '预计到港', value: renderDateValue(record.eta) },
        { label: '实际启航', value: renderDateValue(record.atd) },
        { label: '实际到港', value: renderDateValue(record.ata) },
      ]),
    },
    {
      key: 'si_cutoff', title: '截单信息', width: 250, filter: 'date',
      render: (_v, record) => renderLabeledFields([
        { label: '截单时间', value: renderDateValue(record.si_cutoff) },
        { label: '交货截止', value: renderDateValue(record.cargo_cutoff) },
        { label: '截VGM时间', value: renderDateValue(record.vgm_cutoff) },
      ]),
    },
    { key: 'is_enabled', title: '状态', width: 100, filter: 'enabled', sortable: true, render: (v: number) => <Tag color={v === 1 ? 'success' : 'default'}>{v === 1 ? '启用' : '停用'}</Tag> },
    { key: 'description', title: '备注', width: 160, searchable: true },
    {
      key: 'created_at', title: '创建/更新时间', width: 240, filter: 'date', sortable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '创建时间', value: renderDateValue(record.created_at) },
        { label: '更新时间', value: renderDateValue(record.updated_at) },
      ]),
    },
  ];
  return (
    <CrudResource
      apiPath="/admin/ship-voyages"
      entityName="班(航)次"
      idPrefix="voyage"
      columns={columns}
      modalWidth={760}
      canCreate={props.canCreate}
      canUpdate={props.canUpdate}
      canDelete={props.canDelete}
      canUpdateRecord={(record) => !(props.actorScope === 'logistics' && props.actorProviderId && Number(record.logistics_provider_id) !== Number(props.actorProviderId))}
      canDeleteRecord={(record) => !(props.actorScope === 'logistics' && props.actorProviderId && Number(record.logistics_provider_id) !== Number(props.actorProviderId))}
      showProviderSelect={props.showProviderSelect}
      providerOptions={props.providerOptions}
      refreshKey={props.refreshKey}
      searchPlaceholder="搜索班(航)次：名称、班次号、航线、港口、运营人或时间"
      createDefaults={{ is_enabled: true }}
      onBeforeOpenModal={fetchRouteOptions}
      renderForm={({ form }) => (
        <>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="voyage_name" label="班(航)次名称" rules={[{ required: true, message: '请输入班(航)次名称' }]} style={{ flex: 1, minWidth: 260 }}>
              <Input placeholder="请输入班(航)次名称" maxLength={128} />
            </Form.Item>
            <Form.Item name="voyage_no" label="班(航)次号" style={{ flex: 1, minWidth: 260 }}>
              <Input placeholder="请输入班(航)次号" maxLength={64} />
            </Form.Item>
          </Space>
          <Form.Item name="route_id" label="关联航线">
            <Select
              allowClear showSearch optionFilterProp="label"
              placeholder="请选择关联航线（可空）"
              options={routeSelectOptions}
              onChange={(val) => {
                const r = routeOptions.find((o) => o.id === val);
                if (r) {
                  form.setFieldsValue({
                    departure_port: r.departure_port || '',
                    destination_port: r.destination_port || '',
                  });
                }
              }}
            />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <div style={{ flex: 1, minWidth: 260 }}>{dateTimeFieldItem('etd', '预计启航时间', true)}</div>
            <div style={{ flex: 1, minWidth: 260 }}>{dateTimeFieldItem('eta', '预计到港时间', true)}</div>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <div style={{ flex: 1, minWidth: 260 }}>{dateTimeFieldItem('atd', '实际启航时间')}</div>
            <div style={{ flex: 1, minWidth: 260 }}>{dateTimeFieldItem('ata', '实际到港时间')}</div>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <div style={{ flex: 1, minWidth: 170 }}>{dateTimeFieldItem('si_cutoff', '截单时间')}</div>
            <div style={{ flex: 1, minWidth: 170 }}>{dateTimeFieldItem('cargo_cutoff', '交货截止时间')}</div>
            <div style={{ flex: 1, minWidth: 170 }}>{dateTimeFieldItem('vgm_cutoff', '截VGM时间')}</div>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="departure_port" label="起运港" tooltip="默认取关联航线的起运港，多个港口用 / 分隔" style={{ flex: 1, minWidth: 260 }}>
              <Input placeholder="默认取关联航线的起运港" maxLength={255} />
            </Form.Item>
            <Form.Item name="destination_port" label="目的港" tooltip="默认取关联航线的目的港，多个港口用 / 分隔" style={{ flex: 1, minWidth: 260 }}>
              <Input placeholder="默认取关联航线的目的港" maxLength={255} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} maxLength={255} showCount placeholder="备注" />
          </Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </>
      )}
      fillForm={(record, form) => form.setFieldsValue({
        voyage_name: record.voyage_name,
        voyage_no: record.voyage_no || '',
        route_id: record.route_id ?? null,
        etd: record.etd ? dayjs(record.etd) : null,
        eta: record.eta ? dayjs(record.eta) : null,
        atd: record.atd ? dayjs(record.atd) : null,
        ata: record.ata ? dayjs(record.ata) : null,
        si_cutoff: record.si_cutoff ? dayjs(record.si_cutoff) : null,
        cargo_cutoff: record.cargo_cutoff ? dayjs(record.cargo_cutoff) : null,
        vgm_cutoff: record.vgm_cutoff ? dayjs(record.vgm_cutoff) : null,
        departure_port: record.departure_port || '',
        destination_port: record.destination_port || '',
        description: record.description || '',
        is_enabled: record.is_enabled === 1,
        logistics_provider_id: record.logistics_provider_id ?? null,
      })}
      buildPayload={(values, showProvider) => {
        const fmt = (d: any) => d && dayjs.isDayjs(d) ? d.format('YYYY-MM-DD HH:mm:ss') : (d || null);
        return {
          voyage_name: (values.voyage_name || '').trim(),
          voyage_no: (values.voyage_no || '').trim(),
          route_id: values.route_id ?? null,
          etd: fmt(values.etd),
          eta: fmt(values.eta),
          atd: fmt(values.atd),
          ata: fmt(values.ata),
          si_cutoff: fmt(values.si_cutoff),
          cargo_cutoff: fmt(values.cargo_cutoff),
          vgm_cutoff: fmt(values.vgm_cutoff),
          departure_port: (values.departure_port || '').trim(),
          destination_port: (values.destination_port || '').trim(),
          description: (values.description || '').trim(),
          is_enabled: values.is_enabled !== false,
          logistics_provider_id: showProvider ? (values.logistics_provider_id ?? null) : undefined,
        };
      }}
    />
  );
}

// -------- 提(运)单管理 --------
function BillsSubTab(props: SubTabProps) {
  const [voyageOptions, setVoyageOptions] = useState<Array<{ id: number; voyage_name: string; voyage_no: string | null; departure_port: string | null; destination_port: string | null }>>([]);
  const [containerOptions, setContainerOptions] = useState<Array<{ id: number; container_no: string; container_type: string }>>([]);
  const [cargoStatusOptions, setCargoStatusOptions] = useState<Array<{ status_code: string; status_name: string }>>([]);
  // 关联班(航)次带出的可选港口（起运港/目的港各自的下拉候选，取班次中以 / 分隔的多个港口）
  const [departurePortOptions, setDeparturePortOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [destinationPortOptions, setDestinationPortOptions] = useState<Array<{ label: string; value: string }>>([]);
  const parsePorts = (s: string | null | undefined): string[] => String(s || '').split('/').map((p) => p.trim()).filter(Boolean);
  // 构造下拉候选：以班次港口为主，并确保当前已保存的值（编辑时）也在候选中，避免无法回显
  const buildPortOptions = (ports: string[], current?: string | null): Array<{ label: string; value: string }> => {
    const seen = new Set<string>();
    const list: Array<{ label: string; value: string }> = [];
    for (const p of ports) { if (p && !seen.has(p)) { seen.add(p); list.push({ label: p, value: p }); } }
    const cur = String(current || '').trim();
    if (cur && !seen.has(cur)) list.push({ label: cur, value: cur });
    return list;
  };
  const cargoStatusMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of cargoStatusOptions) m[s.status_code] = s.status_name;
    return m;
  }, [cargoStatusOptions]);

  const fetchAux = async () => {
    setDeparturePortOptions([]);
    setDestinationPortOptions([]);
    try {
      const [vRes, cRes, sRes] = await Promise.all([
        adminFetch('/admin/ship-voyages/options?includeGranted=0'),
        adminFetch('/admin/ship-containers/options'),
        adminFetch('/admin/ship-bills/cargo-status-options'),
      ]);
      if (vRes.ok) { const j = await vRes.json(); setVoyageOptions(j.data || []); }
      if (cRes.ok) { const j = await cRes.json(); setContainerOptions(j.data || []); }
      if (sRes.ok) { const j = await sRes.json(); setCargoStatusOptions(j.data || []); }
    } catch { /* ignore */ }
  };
  useEffect(() => { fetchAux(); }, []);

  const voyageSelectOptions = voyageOptions.map((v) => ({ label: v.voyage_no ? `${v.voyage_name}（${v.voyage_no}）` : v.voyage_name, value: v.id }));
  const containerAutoOptions = containerOptions.map((c) => ({ value: c.container_no, label: `${c.container_no}（${c.container_type}）` }));
  const cargoStatusSelectOptions = cargoStatusOptions.map((s) => ({ label: s.status_name, value: s.status_code }));

  const columns: CrudColumn[] = [
    {
      key: 'bl_no', title: '提单/班次信息', width: 260, searchable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '提单号', value: record.bl_no || '—' },
        { label: '班(航)名称', value: record.voyage_name || '—' },
        { label: '货物状态', value: record.cargo_status ? <Tag color="processing">{cargoStatusMap[record.cargo_status] || record.cargo_status}</Tag> : '—' },
      ]),
    },
    {
      key: 'description', title: '备注', width: 240, searchable: true, ellipsis: false,
      render: (value) => renderMultilineCell(value, 5),
    },
    {
      key: 'shipper', title: '收发通知人', width: 300, searchable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '发货人', value: record.shipper || '—' },
        { label: '收货人', value: record.consignee || '—' },
        { label: '通知人', value: record.notify_party || '—' },
      ]),
    },
    {
      key: 'departure_port', title: '港口及箱信息', width: 300, searchable: true,
      render: (_v, record) => renderLabeledFields([
        { label: '起运港', value: record.departure_port || '—' },
        { label: '目的港', value: record.destination_port || '—' },
        { label: '集装箱号', value: record.container_no || '—' },
        { label: '封条号', value: record.seal_no || '—' },
      ]),
    },
    {
      key: 'package_count', title: '货物信息', width: 320,
      render: (_v, record) => renderLabeledFields([
        { label: '件数', value: record.package_count ?? '—' },
        { label: '重量', value: record.weight ?? '—' },
        { label: '体积', value: record.volume ?? '—' },
        { label: '唛头', value: record.marks || '—' },
        { label: '交货地', value: record.delivery_place || '—' },
      ]),
    },
    {
      key: 'created_at', title: '创建/更新时间', width: 240,
      render: (_v, record) => renderLabeledFields([
        { label: '创建时间', value: renderDateValue(record.created_at) },
        { label: '更新时间', value: renderDateValue(record.updated_at) },
      ]),
    },
  ];

  return (
    <CrudResource
      apiPath="/admin/ship-bills"
      entityName="提(运)单"
      idPrefix="bill"
      columns={columns}
      modalWidth={820}
      canCreate={props.canCreate}
      canUpdate={props.canUpdate}
      canDelete={props.canDelete}
      showProviderSelect={props.showProviderSelect}
      providerOptions={props.providerOptions}
      refreshKey={props.refreshKey}
      searchPlaceholder="搜索提(运)单：提单号、发/收货人、集装箱号或港口"
      onBeforeOpenModal={fetchAux}
      renderForm={({ form }) => (
        <>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="bl_no" label="提单号" style={{ flex: 1, minWidth: 240 }}>
              <Input placeholder="请输入提单号（选填）" maxLength={64} />
            </Form.Item>
          </Space>
          <Form.Item name="voyage_id" label="关联班(航)次">
            <Select
              allowClear showSearch optionFilterProp="label"
              placeholder="请选择关联班(航)次（可空）"
              options={voyageSelectOptions}
              onChange={(val) => {
                const v = voyageOptions.find((o) => o.id === val);
                const depPorts = parsePorts(v?.departure_port);
                const destPorts = parsePorts(v?.destination_port);
                setDeparturePortOptions(buildPortOptions(depPorts));
                setDestinationPortOptions(buildPortOptions(destPorts));
                if (v) {
                  form.setFieldsValue({
                    departure_port: depPorts[0] || '',
                    destination_port: destPorts[0] || '',
                  });
                }
              }}
            />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="departure_port" label="起运港" rules={[{ required: true, message: '请选择起运港' }]} style={{ flex: 1, minWidth: 240 }}>
              <Select
                placeholder="请选择起运港"
                options={departurePortOptions}
              />
            </Form.Item>
            <Form.Item name="destination_port" label="目的港" rules={[{ required: true, message: '请选择目的港' }]} style={{ flex: 1, minWidth: 240 }}>
              <Select
                placeholder="请选择目的港"
                options={destinationPortOptions}
              />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="shipper" label="发货人" rules={[{ required: true, message: '请输入发货人' }]} style={{ flex: 1, minWidth: 240 }}>
              <Input.TextArea rows={2} maxLength={255} placeholder="请输入发货人" />
            </Form.Item>
            <Form.Item name="consignee" label="收货人" rules={[{ required: true, message: '请输入收货人' }]} style={{ flex: 1, minWidth: 240 }}>
              <Input.TextArea rows={2} maxLength={255} placeholder="请输入收货人" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="notify_party" label="通知人" rules={[{ required: true, message: '请输入通知人' }]} style={{ flex: 1, minWidth: 240 }}>
              <Input.TextArea rows={2} maxLength={255} placeholder="请输入通知人" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="container_no" label="集装箱号" style={{ flex: 1, minWidth: 240 }}>
              <AutoComplete
                allowClear
                options={containerAutoOptions}
                placeholder="可自定义或从启用集装箱中选择"
                filterOption={(input, option) => String(option?.value ?? '').toUpperCase().includes(input.toUpperCase())}
              />
            </Form.Item>
            <Form.Item name="seal_no" label="封条号" style={{ flex: 1, minWidth: 240 }}>
              <Input placeholder="请输入封条号（选填）" maxLength={64} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="package_count" label="件数" style={{ flex: 1, minWidth: 150 }}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="件数" />
            </Form.Item>
            <Form.Item name="weight" label="重量" style={{ flex: 1, minWidth: 150 }}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="重量" />
            </Form.Item>
            <Form.Item name="volume" label="体积" style={{ flex: 1, minWidth: 150 }}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="体积" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="delivery_place" label="交货地" style={{ flex: 1, minWidth: 240 }}>
              <Input placeholder="请输入交货地（选填）" maxLength={128} />
            </Form.Item>
            <Form.Item name="cargo_status" label="货物状态" style={{ flex: 1, minWidth: 240 }}>
              <Select allowClear showSearch optionFilterProp="label" placeholder="请选择货物状态（货物态）" options={cargoStatusSelectOptions} />
            </Form.Item>
          </Space>
          <Form.Item name="marks" label="唛头">
            <Input.TextArea rows={2} maxLength={255} showCount placeholder="唛头（选填）" />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} maxLength={255} showCount placeholder="备注" />
          </Form.Item>
        </>
      )}
      fillForm={(record, form) => {
        const v = voyageOptions.find((o) => o.id === (record.voyage_id ?? null));
        setDeparturePortOptions(buildPortOptions(parsePorts(v?.departure_port), record.departure_port));
        setDestinationPortOptions(buildPortOptions(parsePorts(v?.destination_port), record.destination_port));
        form.setFieldsValue({
          bl_no: record.bl_no || '',
          voyage_id: record.voyage_id ?? null,
          departure_port: record.departure_port || '',
          destination_port: record.destination_port || '',
          shipper: record.shipper,
          consignee: record.consignee,
          notify_party: record.notify_party,
          container_no: record.container_no || '',
          seal_no: record.seal_no || '',
          package_count: record.package_count ?? null,
          weight: record.weight !== null && record.weight !== undefined && record.weight !== '' ? Number(record.weight) : null,
          volume: record.volume !== null && record.volume !== undefined && record.volume !== '' ? Number(record.volume) : null,
          delivery_place: record.delivery_place || '',
          cargo_status: record.cargo_status || null,
          marks: record.marks || '',
          description: record.description || '',
          logistics_provider_id: record.logistics_provider_id ?? null,
        });
      }}
      buildPayload={(values, showProvider) => ({
        bl_no: (values.bl_no || '').trim(),
        voyage_id: values.voyage_id ?? null,
        departure_port: (values.departure_port || '').trim(),
        destination_port: (values.destination_port || '').trim(),
        shipper: (values.shipper || '').trim(),
        consignee: (values.consignee || '').trim(),
        notify_party: (values.notify_party || '').trim(),
        container_no: (values.container_no || '').trim(),
        seal_no: (values.seal_no || '').trim(),
        package_count: values.package_count ?? null,
        weight: values.weight ?? null,
        volume: values.volume ?? null,
        delivery_place: (values.delivery_place || '').trim(),
        cargo_status: values.cargo_status || null,
        marks: (values.marks || '').trim(),
        description: (values.description || '').trim(),
        logistics_provider_id: showProvider ? (values.logistics_provider_id ?? null) : undefined,
      })}
    />
  );
}

// ==================== 主入口：航线运输管理（外层 Tabs 四页签） ====================
interface RouteTransportTabProps {
  actorScope: 'platform' | 'logistics';
  actorProviderId: number | null;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
}

export default function RouteTransportTab({ actorScope, actorProviderId, canCreate, canUpdate, canDelete, refreshKey }: RouteTransportTabProps) {
  const [activeKey, setActiveKey] = useState('bills');
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['bills']));
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  useEffect(() => {
    if (actorScope !== 'platform') return;
    (async () => {
      try {
        const res = await adminFetch('/admin/logistics/options');
        if (res.ok) { const j = await res.json(); setProviderOptions(j.data || []); }
      } catch { /* ignore */ }
    })();
  }, [actorScope]);
  // 平台账号可选物流商归属；物流商账号自动绑定本商，不显示选择器
  const showProviderSelect = actorScope === 'platform' && providerOptions.length > 0;

  const subProps: SubTabProps = { showProviderSelect, providerOptions, actorScope, actorProviderId, canCreate, canUpdate, canDelete, refreshKey };

  const handleTabChange = (key: string) => {
    setActiveKey(key);
    setVisited((prev) => prev.has(key) ? prev : new Set(prev).add(key));
  };

  const items = [
    { key: 'bills', label: '提(运)单管理', render: () => <BillsSubTab {...subProps} /> },
    { key: 'voyages', label: '班(航)次管理', render: () => <VoyagesSubTab {...subProps} /> },
    { key: 'routes', label: '航线管理', render: () => <RoutesSubTab {...subProps} /> },
    { key: 'containers', label: '集装箱管理', render: () => <ContainersSubTab {...subProps} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '0 12px', borderBottom: '1px solid #eef2f6', background: '#f8fafc', flexShrink: 0 }}>
        <Tabs
          activeKey={activeKey}
          size="small"
          items={items.map((it) => ({ key: it.key, label: it.label }))}
          onChange={handleTabChange}
          tabBarStyle={{ margin: 0, padding: '0 4px' }}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {items.map((it) => (
          visited.has(it.key) ? (
            <div key={it.key} style={{ flex: 1, minHeight: 0, display: activeKey === it.key ? 'flex' : 'none', flexDirection: 'column' }}>
              {it.render()}
            </div>
          ) : null
        ))}
      </div>
    </div>
  );
}
