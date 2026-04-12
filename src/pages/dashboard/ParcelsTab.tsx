import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Image, Input, InputNumber, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Table, Tooltip, Upload } from 'antd';
import { ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
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
  onInbound: (formData: FormData) => Promise<boolean>;
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
  onInbound,
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
                <Button size="small" type="text" icon={<EditOutlined />} />
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
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space wrap>
          <Input
            allowClear
            value={searchQuery}
            onChange={(event) => {
              const val = event.target.value;
              onSearchQueryChange(val);
              if (!val) onReset();
            }}
            onPressEnter={onSearch}
            placeholder="搜索包裹：包裹单号、来源、目的地、用户名或状态"
            style={{ width: 420 }}
          />
          <Button type="primary" onClick={onSearch}>
            搜索
          </Button>
        </Space>
        <Button type="primary" icon={<InboxOutlined />} onClick={() => setInboundOpen(true)}>
          入库
        </Button>
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
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
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
