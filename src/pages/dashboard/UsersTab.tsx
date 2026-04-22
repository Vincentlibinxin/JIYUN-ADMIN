import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Input, Pagination as AntPagination, Popconfirm, Space, Table, Tooltip, DatePicker, Checkbox } from 'antd';
import { ReloadOutlined, DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

interface User {
  id: number;
  username: string;
  phone: string | null;
  email: string | null;
  real_name: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

type UserSortKey = 'id' | 'username' | 'phone' | 'email' | 'real_name' | 'address' | 'created_at' | 'updated_at';
type SortDirection = 'asc' | 'desc';

interface UsersTabProps {
  users: User[];
  loading: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  onDelete: (id: number) => void;
  onBatchDelete: (ids: number[]) => void;
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number, size: number) => void;
  onPageSizeChange: (size: number) => void;
  sortKey: UserSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: UserSortKey, direction: SortDirection) => void;
  refreshKey?: number;
  onColumnFilterChange?: (columnFilters: Record<string, string>, dateFilters: Record<string, [string, string]>) => void;
}

export default function UsersTab({
  users,
  loading,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onReset,
  onDelete,
  onBatchDelete,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDirection,
  onSortChange,
  refreshKey,
  onColumnFilterChange,
}: UsersTabProps) {
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);

  // 减去表头高度，避免表格内容区超高导致最后一行被覆盖 (双层表头大约是 86px)
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
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(users.map(user => user.id));
    } else {
      setSelectedRowKeys([]);
    }
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(prev => [...prev, id]);
    } else {
      setSelectedRowKeys(prev => prev.filter(key => key !== id));
    }
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

  // 渲染表头下方的搜索输入框
  const renderSearchInput = (key: string, placeholder: string) => (
    <Input
      size="small"
      placeholder={`搜索 ${placeholder}`}
      value={localColumnFilters[key] !== undefined ? localColumnFilters[key] : (columnFilters[key] || '')}
      onChange={(e) => {
        setLocalColumnFilters((prev) => ({ ...prev, [key]: e.target.value }));
        if (!e.target.value) { // 允许一键清除（allowClear）立即生效
          handleColumnSearch(key, '');
        }
      }}
      onPressEnter={(e) => handleColumnSearch(key, (e.target as HTMLInputElement).value)}
      onClick={(e) => e.stopPropagation()} // 防止点击搜索框时触发排序
      allowClear
    />
  );

  // 渲染表头下方的日期范围选择框
  const renderDateRangeInput = (key: string) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        size="small"
        style={{ width: '100%' }}
        onChange={(_, dateStrings) => handleDateSearch(key, dateStrings)}
        // 利用全局重置自增量来刷新组件状态，解决首次选择时无故卸载重置输入框数据的问题
        key={`date-picker-${key}-${resetKey}`} 
        allowClear
      />
    </div>
  );

  const allSelected = users.length > 0 && selectedRowKeys.length === users.length;
  const indeterminate = selectedRowKeys.length > 0 && selectedRowKeys.length < users.length;

  const columns: ColumnsType<User> = [
    {
      title: '序号',
      dataIndex: 'index',
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
          render: (text, record, index) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
              <Checkbox
                checked={selectedRowKeys.includes(record.id)}
                onChange={(e) => handleSelectRow(record.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <span>{index + 1}</span>
            </div>
          ),
        }
      ]
    },
    {
      title: '用户名',
      key: 'username',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'username' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('username', '用户名'),
          dataIndex: 'username',
          key: 'username_child',
          width: 180,
          ellipsis: true,
        }
      ]
    },
    {
      title: '手机',
      key: 'phone',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'phone' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('phone', '手机'),
          dataIndex: 'phone',
          key: 'phone_child',
          width: 140,
          render: (value: string | null) => value || '',
        }
      ]
    },
    {
      title: '电子邮件',
      key: 'email',
      width: 220,
      sorter: true,
      sortOrder: sortKey === 'email' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('email', '邮件'),
          dataIndex: 'email',
          key: 'email_child',
          width: 220,
          ellipsis: true,
          render: (value: string | null) => value || '',
        }
      ]
    },
    {
      title: '姓名',
      key: 'real_name',
      width: 140,
      sorter: true,
      sortOrder: sortKey === 'real_name' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('real_name', '姓名'),
          dataIndex: 'real_name',
          key: 'real_name_child',
          width: 140,
          ellipsis: true,
          render: (value: string | null) => value || '',
        }
      ]
    },
    {
      title: '地址',
      key: 'address',
      width: 220,
      sorter: true,
      sortOrder: sortKey === 'address' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('address', '地址'),
          dataIndex: 'address',
          key: 'address_child',
          width: 220,
          ellipsis: true,
          render: (value: string | null) => value || '',
        }
      ]
    },
    {
      title: '注册日期',
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
        }
      ]
    },
    {
      title: '更新日期',
      key: 'updated_at',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'updated_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('updated_at'),
          dataIndex: 'updated_at',
          key: 'updated_at_child',
          width: 180,
          render: (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
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
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title="查看">
                <Button size="small" type="text" icon={<EyeOutlined />} />
              </Tooltip>
              <Tooltip title="修改">
                <Button size="small" type="text" icon={<EditOutlined />} />
              </Tooltip>
              <Popconfirm
                title="确定删除该会员？"
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
        }
      ]
    },
  ];

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
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
            placeholder="搜索会员：账号、手机或电子邮箱"
            style={{ width: 400 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto', visibility: 'hidden' }}>
          <Button>占位</Button>
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<User>
          rowKey="id"
          rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''}
          loading={loading}
          columns={columns}
          dataSource={users}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
          locale={{ emptyText: '没有会员记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) {
              return;
            }
            // 因为排序绑在带 children 的父表头上，它的 dataIndex 是空的，我们通过 columnKey（即配置的 key）来获取字段名
            const field = (sorter.field || sorter.columnKey) as UserSortKey | undefined;
            const order = sorter.order;
            // 如果 order 为空说明原本会变成不排序，这里我们可以强制转回升序
            // 不过在配置了 sortDirections={['ascend', 'descend', 'ascend']} 之后它就不会为空了
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
