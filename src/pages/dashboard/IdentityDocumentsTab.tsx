import { useEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, Form, Input, Modal, Pagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
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

export default function IdentityDocumentsTab({ actorScope, canCreate, canUpdate, canDelete, refreshKey }: IdentityDocumentsTabProps) {
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const memberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editing, setEditing] = useState<IdentityDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const selectedType = Form.useWatch('document_type', form);
  const selectedProviderId = Form.useWatch('logistics_provider_id', form);

  const fetchDocuments = async (
    nextPage = page,
    nextPageSize = pageSize,
    nextSortKey = sortKey,
    nextSortOrder = sortOrder
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(nextPageSize),
        sortKey: nextSortKey,
        sortOrder: nextSortOrder,
      });
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
    form.resetFields();
    setModalOpen(true);
  };

  const openRecord = (record: IdentityDocument, mode: 'edit' | 'view') => {
    setModalMode(mode);
    setEditing(record);
    seedMember(record);
    form.setFieldsValue({
      document_type: record.document_type,
      document_number: record.document_number,
      user_id: record.user_id,
      logistics_provider_id: record.logistics_provider_id,
      holder_name: record.holder_name || undefined,
      remarks: record.remarks || undefined,
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
        document_number: values.document_number.trim(),
        holder_name: values.holder_name?.trim() || null,
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

  const columns: ColumnsType<IdentityDocument> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 72, sorter: true, fixed: 'left' },
    {
      title: '证件类型', dataIndex: 'document_type', key: 'document_type', width: 180, sorter: true,
      render: (value: string) => <Tag color="blue">{DOCUMENT_TYPE_MAP.get(value) || value}</Tag>,
    },
    { title: '证件号', dataIndex: 'document_number', key: 'document_number', width: 190, sorter: true, ellipsis: true },
    {
      title: '会员', key: 'user_id', width: 160, sorter: true, ellipsis: true,
      render: (_, record) => <Tooltip title={record.member_phone || undefined}>{formatMember(record)}</Tooltip>,
    },
    { title: '持证人姓名', dataIndex: 'holder_name', key: 'holder_name', width: 130, sorter: true, ellipsis: true, render: (value) => value || '—' },
    { title: '物流商', dataIndex: 'logistics_provider_name', key: 'logistics_provider_id', width: 150, sorter: true, ellipsis: true },
    { title: '备注', dataIndex: 'remarks', key: 'remarks', width: 200, ellipsis: true, render: (value) => value || '—' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, sorter: true, render: formatDate },
    { title: '', key: 'spacer', render: () => null },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right', align: 'center',
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openRecord(record, 'view')} /></Tooltip>
          {canUpdate && <Tooltip title="修改"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRecord(record, 'edit')} /></Tooltip>}
          {canDelete && (
            <Popconfirm title="确定删除该证件？" okText="删除" cancelText="取消" onConfirm={() => deleteDocuments([record.id])}>
              <Tooltip title="删除"><Button danger type="text" size="small" icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const visibleColumns = actorScope === 'logistics'
    ? columns.filter((column) => column.key !== 'logistics_provider_id')
    : columns;
  const tableColumns = constrainTableColumns(visibleColumns);
  const isView = modalMode === 'view';
  const currentType = DOCUMENT_TYPES.find((item) => item.value === selectedType);

  const handleTableChange = (_pagination: TablePaginationConfig, _filters: unknown, sorter: SorterResult<IdentityDocument> | SorterResult<IdentityDocument>[]) => {
    if (Array.isArray(sorter) || !sorter.order) return;
    const nextSortKey = String(sorter.field || sorter.columnKey || 'created_at');
    const nextSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
    setSortKey(nextSortKey);
    setSortOrder(nextSortOrder);
    fetchDocuments(1, pageSize, nextSortKey, nextSortOrder);
  };

  return (
    <Card bordered={false} style={{ flex: 1, minHeight: 0 }} bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }}>
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

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<IdentityDocument>
          rowKey="id"
          loading={loading}
          columns={tableColumns}
          dataSource={documents}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          scroll={{ x: getConstrainedTableScrollX(tableColumns), y: 'calc(100vh - 190px)' }}
          rowSelection={canDelete ? { selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as number[]) } : undefined}
          onChange={handleTableChange}
          locale={{ emptyText: searching ? '没有匹配的证件' : '没有证件记录' }}
        />
      </div>

      <div style={{ flexShrink: 0, padding: '6px 16px', borderTop: '1px solid #f0f0f0', background: '#fff' }}>
        <Pagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showQuickJumper
          showTotal={(count, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`}
          disabled={searching}
          onChange={(nextPage, nextSize) => fetchDocuments(nextPage, nextSize)}
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
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" disabled={isView} preserve={false}>
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
          <Form.Item name="holder_name" label="持证人姓名"><Input maxLength={128} placeholder="选填" /></Form.Item>
          <Form.Item name="remarks" label="备注"><Input.TextArea maxLength={255} rows={3} showCount placeholder="选填" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}