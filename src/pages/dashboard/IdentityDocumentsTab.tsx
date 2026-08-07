import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Input, Modal, Pagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

const DOCUMENT_TYPES = [
  { value: 'CN_RESIDENT_ID', label: '大陆居民身份证', placeholder: '18位身份证号码' },
  { value: 'TW_RESIDENT_ID', label: '台湾身份证', placeholder: '例如 A123456789' },
  { value: 'HK_PERMANENT_ID', label: '香港永久性居民身份证', placeholder: '例如 A123456(7)' },
  { value: 'MO_PERMANENT_ID', label: '澳门永久性居民身份证', placeholder: '例如 1234567(8)' },
  { value: 'HK_RESIDENCE_PERMIT', label: '港澳居民居住证（香港）', placeholder: '810000 开头的18位号码' },
  { value: 'MO_RESIDENCE_PERMIT', label: '港澳居民居住证（澳门）', placeholder: '820000 开头的18位号码' },
] as const;

const DOCUMENT_TYPE_MAP = new Map<string, string>(DOCUMENT_TYPES.map((item) => [item.value, item.label]));

interface IdentityDocument {
  id: number;
  document_type: string;
  document_number: string;
  user_id: number;
  logistics_provider_id: number;
  holder_name: string | null;
  holder_phone: string | null;
  remarks: string | null;
  logistics_provider_name: string | null;
  member_username: string | null;
  member_real_name: string | null;
  member_phone: string | null;
  created_at: string;
  updated_at: string;
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
  document_type: string;
  document_number: string;
  user_id: number;
  logistics_provider_id?: number;
  holder_name?: string;
  holder_phone?: string;
  remarks?: string;
}

interface IdentityDocumentsTabProps {
  actorScope: 'platform' | 'logistics';
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  refreshKey?: number;
}

type ModalMode = 'create' | 'edit' | 'view';
type SortKey = 'id' | 'document_type' | 'document_number' | 'user_id' | 'holder_name' | 'logistics_provider_id' | 'created_at';

const formatMember = (record: Pick<IdentityDocument, 'user_id' | 'member_username' | 'member_real_name'>) => {
  if (record.member_real_name) return `${record.member_real_name}（${record.member_username || ''}）`;
  return record.member_username || `#${record.user_id}`;
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', { hour12: false })
  : '—';

const getResponseError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
};

const toFormValues = (record: IdentityDocument): FormValues => ({
  document_type: record.document_type,
  document_number: record.document_number,
  user_id: record.user_id,
  logistics_provider_id: record.logistics_provider_id,
  holder_name: record.holder_name || undefined,
  holder_phone: record.holder_phone || undefined,
  remarks: record.remarks || undefined,
});

export default function IdentityDocumentsTab({ actorScope, canCreate, canUpdate, canDelete, refreshKey }: IdentityDocumentsTabProps) {
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
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
  const [editing, setEditing] = useState<IdentityDocument | null>(null);
  const [modalFormKey, setModalFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const selectedType = Form.useWatch('document_type', form);
  const selectedProviderId = Form.useWatch('logistics_provider_id', form);

  const fetchDocuments = async (
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
      const response = await adminFetch(`/admin/identity-documents?${params.toString()}`);
      if (!response.ok) throw new Error(await getResponseError(response, '加载证件失败'));
      const result = await response.json();
      setDocuments(result.data || []);
      setTotal(result.pagination?.total || 0);
      setPage(nextPage);
      setPageSize(nextPageSize);
      setSearching(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载证件失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments(1, pageSize);
    if (actorScope === 'platform') {
      adminFetch('/admin/logistics/options')
        .then(async (response) => response.ok ? response.json() : { data: [] })
        .then((result) => setProviderOptions(result.data || []))
        .catch(() => setProviderOptions([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current);
  }, []);

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

  useEffect(() => {
    if (refreshKey) fetchDocuments(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const searchDocuments = async (value = searchQuery) => {
    const keyword = value.trim();
    if (!keyword) {
      fetchDocuments(1, pageSize);
      return;
    }
    setLoading(true);
    try {
      const response = await adminFetch(`/admin/identity-documents/search?q=${encodeURIComponent(keyword)}`);
      if (!response.ok) throw new Error(await getResponseError(response, '搜索证件失败'));
      const result = await response.json();
      setDocuments(result.data || []);
      setTotal(result.data?.length || 0);
      setPage(1);
      setSearching(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '搜索证件失败');
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

  const seedMember = (record: IdentityDocument) => setMemberOptions([{
    id: record.user_id,
    username: record.member_username || '',
    real_name: record.member_real_name,
    phone: record.member_phone,
    logistics_provider_id: record.logistics_provider_id,
  }]);

  const openCreate = () => {
    setModalMode('create');
    setEditing(null);
    setMemberOptions([]);
    setModalFormKey((value) => value + 1);
    setModalOpen(true);
  };

  const openRecord = (record: IdentityDocument, mode: 'edit' | 'view') => {
    setModalMode(mode);
    setEditing(record);
    seedMember(record);
    setModalFormKey((value) => value + 1);
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
        document_number: values.document_number.trim(),
        holder_name: values.holder_name?.trim() || null,
        holder_phone: values.holder_phone?.trim() || null,
        remarks: values.remarks?.trim() || null,
        logistics_provider_id: actorScope === 'platform' ? values.logistics_provider_id : undefined,
      };
      const response = await adminFetch(
        modalMode === 'create' ? '/admin/identity-documents' : `/admin/identity-documents/${editing?.id}`,
        { method: modalMode === 'create' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (!response.ok) throw new Error(await getResponseError(response, '保存证件失败'));
      message.success(modalMode === 'create' ? '证件已创建' : '证件已更新');
      setModalOpen(false);
      await fetchDocuments(modalMode === 'create' ? 1 : page, pageSize);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDocuments = async (ids: number[]) => {
    const response = ids.length === 1
      ? await adminFetch(`/admin/identity-documents/${ids[0]}`, { method: 'DELETE' })
      : await adminFetch('/admin/identity-documents/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
    if (!response.ok) {
      message.error(await getResponseError(response, '删除证件失败'));
      return;
    }
    message.success(ids.length === 1 ? '证件已删除' : `已删除 ${ids.length} 条证件`);
    setSelectedRowKeys([]);
    fetchDocuments(documents.length <= ids.length && page > 1 ? page - 1 : page, pageSize);
  };

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters };
    if (!value) delete next[key];
    else next[key] = value;
    setColumnFilters(next);
    setPage(1);
    void fetchDocuments(1, pageSize, sortKey, sortOrder, next);
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
        void fetchDocuments(1, pageSize, sortKey, sortOrder, columnFilters, next);
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
    void fetchDocuments(1, pageSize, 'created_at', 'desc', {}, {});
  };

  const visibleKeys = documents.map((document) => document.id);
  const selectedVisibleCount = visibleKeys.filter((key) => selectedRowKeys.includes(key)).length;
  const allSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;
  const sortOrderFor = (key: SortKey) => sortKey === key ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null;

  const columns: ColumnsType<IdentityDocument> = [
    {
      title: '序号', key: 'index', width: 65, fixed: 'left',
      children: [{ title: <Checkbox checked={allSelected} indeterminate={indeterminate} onChange={(event) => setSelectedRowKeys(event.target.checked ? visibleKeys : [])} />, key: 'index_child', width: 65, fixed: 'left', render: (_, record, index) => <Space size={8}><Checkbox checked={selectedRowKeys.includes(record.id)} onChange={(event) => setSelectedRowKeys((previous) => event.target.checked ? [...new Set([...previous, record.id])] : previous.filter((key) => key !== record.id))} /><span>{(page - 1) * pageSize + index + 1}</span></Space> }],
    },
    {
      title: '证件类型', key: 'document_type', width: 190, sorter: true, sortOrder: sortOrderFor('document_type'),
      children: [{ title: renderSelectFilter('document_type', DOCUMENT_TYPES.map(({ value, label }) => ({ value, label }))), key: 'document_type_child', width: 190, render: (_, record) => <Tag color="blue">{DOCUMENT_TYPE_MAP.get(record.document_type) || record.document_type}</Tag> }],
    },
    {
      title: '证件号', key: 'document_number', width: 190, sorter: true, sortOrder: sortOrderFor('document_number'),
      children: [{ title: renderSearchInput('document_number', '证件号'), key: 'document_number_child', width: 190, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.document_number}>{record.document_number}</Tooltip> }],
    },
    {
      title: '会员', key: 'user_id', width: 170, sorter: true, sortOrder: sortOrderFor('user_id'),
      children: [{ title: renderSearchInput('user_id', '会员ID'), key: 'user_id_child', width: 170, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.member_phone || undefined}>{formatMember(record)}</Tooltip> }],
    },
    {
      title: '持证人名称', key: 'holder_name', width: 140, sorter: true, sortOrder: sortOrderFor('holder_name'),
      children: [{ title: renderSearchInput('holder_name', '持证人'), key: 'holder_name_child', width: 140, ellipsis: { showTitle: false }, render: (_, record) => record.holder_name || '—' }],
    },
    {
      title: '电话', key: 'holder_phone', width: 150,
      children: [{ title: renderSearchInput('holder_phone', '电话'), key: 'holder_phone_child', width: 150, ellipsis: { showTitle: false }, render: (_, record) => record.holder_phone || '—' }],
    },
    {
      title: '物流商', key: 'logistics_provider_id', width: 150, sorter: true, sortOrder: sortOrderFor('logistics_provider_id'),
      children: [{ title: renderSearchInput('logistics_provider_id', '物流商ID'), key: 'logistics_provider_id_child', width: 150, ellipsis: { showTitle: false }, render: (_, record) => record.logistics_provider_name || '—' }],
    },
    {
      title: '备注', key: 'remarks', width: 200,
      children: [{ title: renderSearchInput('remarks', '备注'), key: 'remarks_child', width: 200, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.remarks || undefined}>{record.remarks || '—'}</Tooltip> }],
    },
    {
      title: '创建时间', key: 'created_at', width: 180, sorter: true, sortOrder: sortOrderFor('created_at'),
      children: [{ title: renderDateRangeInput('created_at'), key: 'created_at_child', width: 180, render: (_, record) => formatDate(record.created_at) }],
    },
    { title: '', key: 'spacer', children: [{ title: '', key: 'spacer_child', render: () => null }] },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right', align: 'center',
      children: [{ title: <Tooltip title="重置所有搜索"><Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} /></Tooltip>, key: 'actions_child', width: 120, fixed: 'right', align: 'center', render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openRecord(record, 'view')} /></Tooltip>
          {canUpdate && <Tooltip title="修改"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRecord(record, 'edit')} /></Tooltip>}
          {canDelete && (
            <Popconfirm title="确定删除该证件？" okText="删除" cancelText="取消" onConfirm={() => deleteDocuments([record.id])}>
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
  const currentType = DOCUMENT_TYPES.find((item) => item.value === selectedType);
  const formInitialValues: Partial<FormValues> = modalMode === 'create' || !editing ? {} : toFormValues(editing);

  return (
    <Card bordered={false} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
        {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增证件</Button>}
        {canDelete && (
          <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 条证件？`} okText="删除" cancelText="取消" disabled={!selectedRowKeys.length} onConfirm={() => deleteDocuments(selectedRowKeys)}>
            <Button danger disabled={!selectedRowKeys.length}>批量删除{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}</Button>
          </Popconfirm>
        )}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); if (!event.target.value) fetchDocuments(1, pageSize); }}
            onSearch={searchDocuments}
            placeholder="搜索证件号、会员、持证人或物流商"
            enterButton
            allowClear
            style={{ width: 420 }}
          />
        </div>
        <Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => fetchDocuments(page, pageSize)} /></Tooltip>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<IdentityDocument>
          rowKey="id"
          loading={loading}
          columns={tableColumns}
          dataSource={documents}
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
              void fetchDocuments(page, pageSize, 'created_at', 'desc', columnFilters);
              return;
            }
            const nextSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
            setSortKey(nextSortKey); setSortOrder(nextSortOrder);
            void fetchDocuments(page, pageSize, nextSortKey, nextSortOrder, columnFilters);
          }}
          locale={{ emptyText: searching ? '没有匹配的证件' : '没有证件记录' }}
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
          onChange={(nextPage, nextSize) => fetchDocuments(nextPage, nextSize, sortKey, sortOrder, columnFilters)}
          onShowSizeChange={(_, nextSize) => fetchDocuments(1, nextSize, sortKey, sortOrder, columnFilters)}
        />
      </div>

      <Modal
        title={modalMode === 'create' ? '新增证件' : modalMode === 'edit' ? '修改证件' : '查看证件'}
        open={modalOpen}
        onOk={submitForm}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText={isView ? '关闭' : '取消'}
        okButtonProps={isView ? { style: { display: 'none' } } : undefined}
        centered
        forceRender
        destroyOnClose
        width={560}
      >
        <Form key={`identity-doc-form-${modalFormKey}`} form={form} layout="vertical" disabled={isView} initialValues={formInitialValues}>
          <Form.Item name="document_type" label="证件类型" rules={[{ required: true, message: '请选择证件类型' }]}>
            <Select options={DOCUMENT_TYPES.map(({ value, label }) => ({ value, label }))} placeholder="请选择证件类型" />
          </Form.Item>
          <Form.Item name="document_number" label="证件号" rules={[{ required: true, whitespace: true, message: '请输入证件号' }]}>
            <Input maxLength={64} placeholder={currentType?.placeholder || '请输入证件号'} />
          </Form.Item>
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
          <Form.Item name="holder_name" label="持证人名称"><Input maxLength={128} placeholder="选填" /></Form.Item>
          <Form.Item name="holder_phone" label="电话"><Input maxLength={32} placeholder="选填（非必填）" /></Form.Item>
          <Form.Item name="remarks" label="备注"><Input.TextArea maxLength={255} rows={3} showCount placeholder="选填" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}