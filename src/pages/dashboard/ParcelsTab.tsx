import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Image, Input, InputNumber, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tooltip, Upload } from 'antd';
import { ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined, InboxOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';

interface Parcel {
  id: number;
  user_id: number;
  tracking_number: string;
  origin: string;
  destination: string;
  weight: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volume: number | null;
  images: string | null;
  status: string;
  estimated_delivery: string | null;
  created_at: string;
  username: string | null;
  first_item_name: string | null;
  item_count: number;
}

type ParcelSortKey = 'id' | 'user_id' | 'tracking_number' | 'origin' | 'destination' | 'weight' | 'length_cm' | 'width_cm' | 'height_cm' | 'volume' | 'status' | 'estimated_delivery' | 'created_at' | 'username';
type SortDirection = 'asc' | 'desc';

interface ParcelsTabProps {
  parcels: Parcel[];
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
  sortKey: ParcelSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: ParcelSortKey, direction: SortDirection) => void;
  onUpdateStatus: (parcelId: number, status: string) => void;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  onInbound: (formData: FormData) => Promise<boolean>;
  onEdit: (id: number, formData: FormData) => Promise<boolean>;
  onFetchItems: (id: number) => Promise<{ name: string; value: number; quantity: number }[]>;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

export default function ParcelsTab({
  parcels,
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
  onUpdateStatus,
  onDelete,
  onBatchDelete,
  onInbound,
  onEdit,
  onFetchItems,
  refreshKey,
  onColumnFilterChange,
}: ParcelsTabProps) {
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

  const [inboundOpen, setInboundOpen] = useState(false);
  const [inboundLoading, setInboundLoading] = useState(false);
  const [inboundForm] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();
  const [editFileList, setEditFileList] = useState<UploadFile[]>([]);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);

  const handleInboundSubmit = async () => {
    try {
      const values = await inboundForm.validateFields();
      setInboundLoading(true);
      const fd = new FormData();
      fd.append('tracking_number', values.tracking_number);
      fd.append('weight', String(values.weight));
      fd.append('length_cm', String(values.length_cm));
      fd.append('width_cm', String(values.width_cm));
      fd.append('height_cm', String(values.height_cm));
      fd.append('items', JSON.stringify(values.items));
      fileList.forEach(f => {
        if (f.originFileObj) fd.append('files', f.originFileObj);
      });
      const ok = await onInbound(fd);
      if (ok) {
        setInboundOpen(false);
        inboundForm.resetFields();
        setFileList([]);
      }
    } catch {
      // validation failed
    } finally {
      setInboundLoading(false);
    }
  };

  const openEditModal = async (record: Parcel) => {
    setEditingParcel(record);
    const existingUrls = record.images ? record.images.split(',').map(s => s.trim()).filter(Boolean) : [];
    setEditFileList(existingUrls.map((url, i) => ({ uid: `existing-${i}`, name: url.split('/').pop() || `img-${i}`, status: 'done' as const, url })));
    editForm.setFieldsValue({
      tracking_number: record.tracking_number,
      weight: record.weight,
      length_cm: record.length_cm,
      width_cm: record.width_cm,
      height_cm: record.height_cm,
      origin: record.origin || '',
      destination: record.destination || '',
      status: record.status,
      items: [{ name: '', value: 0, quantity: 1 }],
    });
    setEditOpen(true);
    try {
      const items = await onFetchItems(record.id);
      if (items.length > 0) editForm.setFieldsValue({ items });
    } catch { /* keep default */ }
  };

  const handleEditSubmit = async () => {
    if (!editingParcel) return;
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      const fd = new FormData();
      fd.append('weight', String(values.weight));
      fd.append('length_cm', String(values.length_cm));
      fd.append('width_cm', String(values.width_cm));
      fd.append('height_cm', String(values.height_cm));
      fd.append('origin', values.origin || '');
      fd.append('destination', values.destination || '');
      fd.append('status', values.status || editingParcel.status);
      fd.append('items', JSON.stringify(values.items));
      const existingUrls = editFileList.filter(f => f.url && !f.originFileObj).map(f => f.url!);
      fd.append('existing_images', existingUrls.join(','));
      editFileList.forEach(f => {
        if (f.originFileObj) fd.append('files', f.originFileObj);
      });
      const ok = await onEdit(editingParcel.id, fd);
      if (ok) {
        setEditOpen(false);
        editForm.resetFields();
        setEditFileList([]);
        setEditingParcel(null);
      }
    } catch {
      // validation failed
    } finally {
      setEditLoading(false);
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

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const visibleRowIds = parcels.map((item) => item.id);
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

  const columns: ColumnsType<Parcel> = [
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
      title: '包裹单号',
      key: 'tracking_number',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'tracking_number' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('tracking_number', '包裹单号'),
          dataIndex: 'tracking_number',
          key: 'tracking_number_child',
          width: 180,
          ellipsis: true,
        },
      ],
    },
    {
      title: '重量',
      key: 'weight',
      width: 100,
      sorter: true,
      sortOrder: sortKey === 'weight' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('weight', '重量'),
          key: 'weight_child',
          width: 100,
          render: (_, record) => (record.weight != null ? `${record.weight.toFixed(2)}kg` : '-'),
        },
      ],
    },
    {
      title: '尺寸',
      key: 'dimensions',
      width: 140,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>长*宽*高</span>,
          key: 'dimensions_child',
          width: 140,
          render: (_, record) => {
            if (record.length_cm != null && record.width_cm != null && record.height_cm != null) {
              return `${record.length_cm}*${record.width_cm}*${record.height_cm}`;
            }
            return '-';
          },
        },
      ],
    },
    {
      title: '体积',
      key: 'volume',
      width: 100,
      sorter: true,
      sortOrder: sortKey === 'volume' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('volume', '体积'),
          key: 'volume_child',
          width: 100,
          render: (_, record) => (record.volume != null ? record.volume : '-'),
        },
      ],
    },
    {
      title: '物品',
      key: 'items',
      width: 120,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>物品</span>,
          key: 'items_child',
          width: 120,
          ellipsis: true,
          render: (_, record) => {
            if (!record.first_item_name) return '-';
            const count = Number(record.item_count) || 0;
            return count > 1 ? `${record.first_item_name} 等${count}件` : record.first_item_name;
          },
        },
      ],
    },
    {
      title: '图片',
      key: 'images',
      width: 120,
      children: [
        {
          title: <span style={{ fontSize: 12, color: '#999' }}>图片</span>,
          key: 'images_child',
          width: 120,
          render: (_, record) => {
            if (!record.images) return '-';
            const urls = record.images.split(',').map(s => s.trim()).filter(Boolean);
            if (urls.length === 0) return '-';
            return (
              <Image.PreviewGroup items={urls.map(url => ({ src: url }))}>
                <Space size={4}>
                  {urls.slice(0, 3).map((url, i) => (
                    <Image key={i} src={url} width={32} height={32} style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} preview={{ mask: false }} />
                  ))}
                  {urls.length > 3 && <span style={{ fontSize: 12, color: '#999' }}>+{urls.length - 3}</span>}
                </Space>
              </Image.PreviewGroup>
            );
          },
        },
      ],
    },
    {
      title: '来源',
      key: 'origin',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'origin' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('origin', '来源'),
          dataIndex: 'origin',
          key: 'origin_child',
          width: 140,
          ellipsis: true,
        },
      ],
    },
    {
      title: '目的地',
      key: 'destination',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'destination' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('destination', '目的地'),
          dataIndex: 'destination',
          key: 'destination_child',
          width: 140,
          ellipsis: true,
        },
      ],
    },
    {
      title: '预计送达',
      key: 'estimated_delivery',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'estimated_delivery' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('estimated_delivery'),
          key: 'estimated_delivery_child',
          width: 180,
          render: (_, record) => (record.estimated_delivery ? new Date(record.estimated_delivery).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'),
        },
      ],
    },
    {
      title: '状态',
      key: 'status',
      width: 160,
      sorter: true,
      sortOrder: sortKey === 'status' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('status', '状态'),
          key: 'status_child',
          width: 160,
          render: (_, record) => (
            <Select
              size="small"
              value={record.status}
              style={{ width: '100%' }}
              onChange={(value) => onUpdateStatus(record.id, value)}
              onClick={(e) => e.stopPropagation()}
              options={[
                { label: '待入库', value: 'pending' },
                { label: '已入库', value: 'arrived' },
                { label: '运输中', value: 'shipping' },
                { label: '已签收', value: 'completed' },
                { label: '已取消', value: 'cancelled' },
              ]}
            />
          ),
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
      title: '会员用户名',
      key: 'username',
      width: 130,
      sorter: true,
      sortOrder: sortKey === 'username' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('username', '用户名'),
          key: 'username_child',
          width: 130,
          render: (_, record) => record.username || '-',
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
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title="查看">
                <Button size="small" type="text" icon={<EyeOutlined />} />
              </Tooltip>
              <Tooltip title="修改">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
              </Tooltip>
              <Popconfirm
                title="确定删除该包裹？"
                okText="删除"
                cancelText="取消"
                onConfirm={() => onDelete(record.id)}
              >
                <Tooltip title="删除">
                  <Button danger size="small" type="text" icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          ),
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
            placeholder="搜索包裹：包裹单号、来源、目的地、用户名或状态"
            style={{ width: 420 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <Button type="primary" icon={<InboxOutlined />} onClick={() => setInboundOpen(true)}>
            入库
          </Button>
        </div>
      </div>

      <Modal
        title="包裹入库"
        open={inboundOpen}
        onCancel={() => { setInboundOpen(false); inboundForm.resetFields(); setFileList([]); }}
        onOk={handleInboundSubmit}
        confirmLoading={inboundLoading}
        okText="确认入库"
        cancelText="取消"
      >
        <Form form={inboundForm} layout="vertical" autoComplete="off">
          <Form.Item name="tracking_number" label="包裹单号" rules={[{ required: true, message: '请输入包裹单号' }]}>
            <Input placeholder="请输入包裹单号" />
          </Form.Item>
          <Form.Item name="weight" label="重量 (kg)" rules={[{ required: true, message: '请输入重量' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入重量" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="length_cm" label="长 (cm)" rules={[{ required: true, message: '请输入长' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="长" />
            </Form.Item>
            <Form.Item name="width_cm" label="宽 (cm)" rules={[{ required: true, message: '请输入宽' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="宽" />
            </Form.Item>
            <Form.Item name="height_cm" label="高 (cm)" rules={[{ required: true, message: '请输入高' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="高" />
            </Form.Item>
          </div>
          <Form.Item label="图片 (可选)">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
              beforeUpload={() => false}
              accept="image/*"
              multiple
            >
              {fileList.length >= 10 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.List
            name="items"
            initialValue={[{ name: '', value: 0, quantity: 1 }]}
            rules={[{ validator: async (_, items) => { if (!items || items.length < 1) throw new Error('至少添加一个物品'); } }]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>物品清单</div>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                    <Form.Item {...restField} name={[name, 'name']} rules={[{ required: true, message: '名称' }]} style={{ flex: 2, marginBottom: 0 }}>
                      <Input placeholder="物品名称" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, message: '价值' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="价值" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: '数量' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} placeholder="数量" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined style={{ marginTop: 8, color: '#ff4d4f', fontSize: 18 }} onClick={() => remove(name)} />
                    )}
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ name: '', value: 0, quantity: 1 })} block icon={<PlusOutlined />}>
                  添加物品
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="编辑包裹"
        open={editOpen}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); setEditFileList([]); setEditingParcel(null); }}
        onOk={handleEditSubmit}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={editForm} layout="vertical" autoComplete="off">
          <Form.Item name="tracking_number" label="包裹单号">
            <Input disabled />
          </Form.Item>
          <Form.Item name="weight" label="重量 (kg)" rules={[{ required: true, message: '请输入重量' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入重量" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="length_cm" label="长 (cm)" rules={[{ required: true, message: '请输入长' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="长" />
            </Form.Item>
            <Form.Item name="width_cm" label="宽 (cm)" rules={[{ required: true, message: '请输入宽' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="宽" />
            </Form.Item>
            <Form.Item name="height_cm" label="高 (cm)" rules={[{ required: true, message: '请输入高' }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={0.1} precision={1} style={{ width: '100%' }} placeholder="高" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="origin" label="来源" style={{ flex: 1 }}>
              <Input placeholder="来源" />
            </Form.Item>
            <Form.Item name="destination" label="目的地" style={{ flex: 1 }}>
              <Input placeholder="目的地" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '待入库', value: 'pending' },
                { label: '已入库', value: 'arrived' },
                { label: '运输中', value: 'shipping' },
                { label: '已签收', value: 'completed' },
                { label: '已取消', value: 'cancelled' },
              ]}
            />
          </Form.Item>
          <Form.Item label="图片">
            <Upload
              listType="picture-card"
              fileList={editFileList}
              onChange={({ fileList: fl }) => setEditFileList(fl)}
              beforeUpload={() => false}
              accept="image/*"
              multiple
            >
              {editFileList.length >= 10 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.List
            name="items"
            rules={[{ validator: async (_, items) => { if (!items || items.length < 1) throw new Error('至少添加一个物品'); } }]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>物品清单</div>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                    <Form.Item {...restField} name={[name, 'name']} rules={[{ required: true, message: '名称' }]} style={{ flex: 2, marginBottom: 0 }}>
                      <Input placeholder="物品名称" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, message: '价值' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="价值" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: '数量' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} placeholder="数量" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined style={{ marginTop: 8, color: '#ff4d4f', fontSize: 18 }} onClick={() => remove(name)} />
                    )}
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ name: '', value: 0, quantity: 1 })} block icon={<PlusOutlined />}>
                  添加物品
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<Parcel>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={columns}
          dataSource={parcels}
          pagination={false}
          size="small"
          sticky
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 1800, y: tableScrollY }}
          locale={{ emptyText: '没有包裹记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as ParcelSortKey | undefined;
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
    </Card>
  );
}
