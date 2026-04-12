import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Input, Pagination as AntPagination, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';
import { ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

interface SmsInfo {
  id: number;
  phone: string;
  code: string;
  verified: number;
  created_at: string;
  expires_at: string;
}

type SmsSortKey = 'id' | 'phone' | 'code' | 'verified' | 'expires_at' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface SmsTabProps {
  smsItems: SmsInfo[];
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
  sortKey: SmsSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SmsSortKey, direction: SortDirection) => void;
  onDelete: (id: number) => void;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

export default function SmsTab({
  smsItems,
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
  onDelete,
  refreshKey,
  onColumnFilterChange,
}: SmsTabProps) {
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

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const visibleRowIds = smsItems.map((item) => item.id);
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

  const columns: ColumnsType<SmsInfo> = [
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
      title: '手机',
      key: 'phone',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'phone' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('phone', '手机'),
          dataIndex: 'phone',
          key: 'phone_child',
          width: 180,
        },
      ],
    },
    {
      title: '验证码',
      key: 'code',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'code' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('code', '验证码'),
          dataIndex: 'code',
          key: 'code_child',
          width: 140,
        },
      ],
    },
    {
      title: '状态',
      key: 'verified',
      width: 120,
      sorter: true,
      sortOrder: sortKey === 'verified' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('verified', '状态'),
          key: 'verified_child',
          width: 120,
          render: (_, record) => (
            <Tag color={record.verified ? 'success' : 'warning'}>{record.verified ? '已验证' : '未验证'}</Tag>
          ),
        },
      ],
    },
    {
      title: '到期时间',
      key: 'expires_at',
      width: 220,
      sorter: true,
      sortOrder: sortKey === 'expires_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('expires_at'),
          dataIndex: 'expires_at',
          key: 'expires_at_child',
          width: 220,
          render: (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        },
      ],
    },
    {
      title: '创建时间',
      key: 'created_at',
      width: 220,
      sorter: true,
      sortOrder: sortKey === 'created_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('created_at'),
          dataIndex: 'created_at',
          key: 'created_at_child',
          width: 220,
          render: (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
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
                title="确定删除该记录？"
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
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
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
            placeholder="搜索简讯：ID、手机、验证码或状态"
            style={{ width: 320 }}
          />
          <Button type="primary" onClick={onSearch}>
            搜索
          </Button>
        </Space>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<SmsInfo>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={columns}
          dataSource={smsItems}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
          locale={{ emptyText: '没有简讯记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            const field = (sorter.field || sorter.columnKey) as SmsSortKey | undefined;
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
