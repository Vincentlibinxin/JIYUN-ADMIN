import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Cascader, Checkbox, DatePicker, Form, Input, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { loadChinaRegionOptions, regionInfoFromProvince, isRegionPathComplete, type RegionCascaderOption } from '../../lib/chinaRegions';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

// 区域及其国际电话代码（中国大陆/台湾/香港/澳门）
export const ADDRESS_BOOK_REGIONS: Array<{ value: string; label: string; dialCode: string }> = [
  { value: 'CN', label: '中国大陆', dialCode: '+86' },
  { value: 'TW', label: '台湾', dialCode: '+886' },
  { value: 'HK', label: '香港', dialCode: '+852' },
  { value: 'MO', label: '澳门', dialCode: '+853' },
];

const REGION_MAP: Record<string, { label: string; dialCode: string }> = ADDRESS_BOOK_REGIONS.reduce(
  (acc, r) => { acc[r.value] = { label: r.label, dialCode: r.dialCode }; return acc; },
  {} as Record<string, { label: string; dialCode: string }>
);

export interface AddressBookEntry {
  id: number;
  name: string;
  region: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  phone: string;
  address: string;
  user_id: number | null;
  logistics_provider_id: number | null;
  logistics_provider_name?: string | null;
  member_username?: string | null;
  member_real_name?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AddressBookPayload {
  name: string;
  region: string;
  province: string;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  phone: string;
  address: string;
  user_id?: number | null;
  logistics_provider_id?: number | null;
}

type AddressBookSortKey = 'id' | 'name' | 'region' | 'phone' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface AddressBookTabProps {
  entries: AddressBookEntry[];
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
  sortKey: AddressBookSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: AddressBookSortKey, direction: SortDirection) => void;
  onCreate: (payload: AddressBookPayload) => Promise<boolean>;
  onUpdate: (id: number, payload: AddressBookPayload) => Promise<boolean>;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  canManage?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

type ModalMode = 'create' | 'edit' | 'view';

interface AddressBookFormValues {
  name: string;
  regionPath?: string[];
  phone: string;
  address: string;
  user_id?: number | null;
  logistics_provider_id?: number | null;
}

interface MemberOption {
  id: number;
  username: string;
  real_name: string | null;
  phone: string | null;
}

export default function AddressBookTab({
  entries,
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
}: AddressBookTabProps) {
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  // 省市区级联选项（按需加载）
  const [regionOptions, setRegionOptions] = useState<RegionCascaderOption[]>([]);
  useEffect(() => {
    loadChinaRegionOptions().then(setRegionOptions).catch(() => { /* ignore */ });
  }, []);

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

  // 物流商下拉（平台账号可选；物流商账号无该权限，接口返回空则不显示选择器）
  const [providerOptions, setProviderOptions] = useState<{ id: number; name: string; code: string | null }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/admin/logistics/options');
        if (res.ok) {
          const j = await res.json();
          setProviderOptions(j.data || []);
        }
      } catch { /* ignore */ }
    })();
  }, []);
  const providerSelectOptions = providerOptions.map((o) => ({
    label: o.code ? `${o.name}（${o.code}）` : o.name,
    value: o.id,
  }));
  const showProviderSelect = providerOptions.length > 0;

  // 会员选择（异步搜索）
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const memberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchMembers = (keyword: string) => {
    if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current);
    const kw = keyword.trim();
    if (!kw) {
      setMemberOptions([]);
      return;
    }
    memberSearchTimer.current = setTimeout(async () => {
      try {
        setMemberSearching(true);
        const res = await adminFetch(`/admin/users/search?q=${encodeURIComponent(kw)}&page=1&limit=20`);
        if (res.ok) {
          const j = await res.json();
          setMemberOptions((j.data || []).map((u: any) => ({
            id: u.id,
            username: u.username,
            real_name: u.real_name ?? null,
            phone: u.phone ?? null,
          })));
        }
      } catch { /* ignore */ } finally {
        setMemberSearching(false);
      }
    }, 300);
  };

  const memberLabel = (m: { id: number; username?: string | null; real_name?: string | null; phone?: string | null }): string => {
    const namePart = m.real_name ? `${m.real_name}（${m.username || ''}）` : (m.username || `#${m.id}`);
    return m.phone ? `${namePart} · ${m.phone}` : namePart;
  };

  const memberSelectOptions = memberOptions.map((m) => ({ label: memberLabel(m), value: m.id }));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const renderRegionFilter = () => (
    <Select
      size="small"
      value={columnFilters['region'] || ''}
      onChange={(v) => handleColumnSearch('region', v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[{ label: '全部', value: '' }, ...ADDRESS_BOOK_REGIONS.map((r) => ({ label: r.label, value: r.value }))]}
    />
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const visibleRowIds = entries.map((item) => item.id);
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
  const [form] = Form.useForm<AddressBookFormValues>();
  const regionPath = Form.useWatch('regionPath', form) as string[] | undefined;
  const selectedProvince = regionPath?.[0];
  const currentDialCode = selectedProvince ? regionInfoFromProvince(selectedProvince).dialCode : '';

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    form.resetFields();
    setMemberOptions([]);
    setModalOpen(true);
  };

  const fillForm = (record: AddressBookEntry) => {
    const path = [record.province, record.city, record.district, record.street].filter((v): v is string => !!v);
    form.setFieldsValue({
      name: record.name,
      regionPath: path,
      phone: record.phone,
      address: record.address,
      user_id: record.user_id ?? null,
      logistics_provider_id: record.logistics_provider_id ?? null,
    });
    // 预置当前会员选项，保证编辑/查看时能显示会员名
    if (record.user_id) {
      setMemberOptions([{
        id: record.user_id,
        username: record.member_username || '',
        real_name: record.member_real_name ?? null,
        phone: null,
      }]);
    } else {
      setMemberOptions([]);
    }
  };

  const openView = (record: AddressBookEntry) => {
    setModalMode('view');
    setEditingId(record.id);
    fillForm(record);
    setModalOpen(true);
  };

  const openEdit = (record: AddressBookEntry) => {
    setModalMode('edit');
    setEditingId(record.id);
    fillForm(record);
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
      const path = (values.regionPath || []) as string[];
      const province = path[0] || '';
      const city = path[1] || '';
      const district = path[2] || '';
      const street = path[3] || '';
      const { region } = regionInfoFromProvince(province);
      const payload: AddressBookPayload = {
        name: values.name.trim(),
        region,
        province,
        city: city || null,
        district: district || null,
        street: street || null,
        phone: values.phone.trim(),
        address: values.address.trim(),
        user_id: values.user_id ?? null,
        logistics_provider_id: showProviderSelect ? (values.logistics_provider_id ?? null) : undefined,
      };
      let ok = false;
      if (modalMode === 'create') {
        ok = await onCreate(payload);
      } else if (editingId != null) {
        ok = await onUpdate(editingId, payload);
      }
      if (ok) {
        message.success(modalMode === 'create' ? '地址已创建' : '地址已更新');
        setModalOpen(false);
      }
    } catch (err) {
      // 校验失败，忽略
    } finally {
      setSubmitting(false);
    }
  };

  const isView = modalMode === 'view';
  const modalTitle = modalMode === 'create' ? '新增地址' : modalMode === 'edit' ? '修改地址' : '查看地址';

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';

  const renderMemberText = (record: AddressBookEntry): string => {
    if (!record.user_id) return '—';
    if (record.member_real_name) return `${record.member_real_name}（${record.member_username || ''}）`;
    return record.member_username || `#${record.user_id}`;
  };

  const columns: ColumnsType<AddressBookEntry> = [
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
      title: '物流商',
      key: 'logistics_provider_id',
      width: 150,
      children: [
        {
          title: renderSearchInput('logistics_provider_id', '物流商ID'),
          key: 'logistics_provider_id_child',
          width: 150,
          ellipsis: true,
          render: (_, record) => record.logistics_provider_name || (record.logistics_provider_id ? `#${record.logistics_provider_id}` : '—'),
        },
      ],
    },
    {
      title: '姓名',
      key: 'name',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'name' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('name', '姓名'),
          dataIndex: 'name',
          key: 'name_child',
          width: 140,
          ellipsis: true,
        },
      ],
    },
    {
      title: '区域',
      key: 'region',
      width: 220,
      children: [
        {
          title: renderRegionFilter(),
          key: 'region_child',
          width: 220,
          ellipsis: true,
          render: (_, record) => {
            const parts = [record.province, record.city, record.district, record.street].filter(Boolean);
            const text = parts.join(' / ');
            if (!text) {
              const r = REGION_MAP[record.region];
              return r ? <Tag color="blue">{r.label}</Tag> : (record.region || '—');
            }
            return <Tooltip title={text}>{text}</Tooltip>;
          },
        },
      ],
    },
    {
      title: '电话',
      key: 'phone',
      width: 170,
      sorter: true,
      sortOrder: sortKey === 'phone' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('phone', '电话'),
          key: 'phone_child',
          width: 170,
          ellipsis: true,
          render: (_, record) => {
            const dial = REGION_MAP[record.region]?.dialCode || '';
            return dial ? `${dial} ${record.phone}` : record.phone;
          },
        },
      ],
    },
    {
      title: '地址',
      key: 'address',
      width: 240,
      children: [
        {
          title: renderSearchInput('address', '地址'),
          dataIndex: 'address',
          key: 'address_child',
          width: 240,
          ellipsis: true,
        },
      ],
    },
    {
      title: '会员',
      key: 'member',
      width: 160,
      children: [
        {
          title: '',
          key: 'member_child',
          width: 160,
          ellipsis: true,
          render: (_, record) => renderMemberText(record),
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
                  title="确定删除该地址？"
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
              新增地址
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
            placeholder="搜索地址：ID、姓名、电话、地址或会员"
            style={{ width: 400 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}>
          <Button>占位</Button>
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<AddressBookEntry>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={tableColumns}
          dataSource={entries}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: tableScrollX, y: tableScrollY }}
          locale={{ emptyText: '没有地址记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as AddressBookSortKey | undefined;
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
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={isView ? '关闭' : '保存'}
        cancelText="取消"
        okButtonProps={isView ? { style: { display: 'none' } } : undefined}
        cancelButtonProps={isView ? { children: '关闭' } : undefined}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" disabled={isView}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" maxLength={128} />
          </Form.Item>

          <Form.Item
            name="regionPath"
            label="行政区域"
            rules={[
              { required: true, message: '请选择省 / 市 / 区县 / 街道' },
              {
                validator: (_rule, value: string[] | undefined) => {
                  if (!value || value.length === 0) return Promise.resolve();
                  if (!isRegionPathComplete(regionOptions, value)) {
                    return Promise.reject(new Error('请选择到最小级别（如街道 / 区县）'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Cascader
              options={regionOptions}
              placeholder="请选择省 / 市 / 区县 / 街道"
              showSearch={{
                filter: (input, path) =>
                  path.some((option) => String(option.label).toLowerCase().includes(input.toLowerCase())),
              }}
              expandTrigger="hover"
            />
          </Form.Item>

          <Form.Item
            name="phone"
            label="电话"
            rules={[{ required: true, message: '请输入电话' }]}
          >
            <Input addonBefore={currentDialCode || undefined} placeholder="请输入电话号码" maxLength={32} />
          </Form.Item>

          <Form.Item
            name="address"
            label="地址"
            rules={[{ required: true, message: '请输入地址' }]}
          >
            <Input.TextArea placeholder="请输入详细地址" maxLength={255} rows={2} />
          </Form.Item>

          <Form.Item name="user_id" label="会员（选填）">
            <Select
              allowClear
              showSearch
              placeholder="搜索会员（用户名/姓名/电话）"
              filterOption={false}
              onSearch={searchMembers}
              notFoundContent={memberSearching ? '搜索中…' : null}
              options={memberSelectOptions}
            />
          </Form.Item>

          {showProviderSelect && (
            <Form.Item
              name="logistics_provider_id"
              label="物流商"
              rules={[{ required: true, message: '请选择物流商' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="请选择物流商"
                options={providerSelectOptions}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
