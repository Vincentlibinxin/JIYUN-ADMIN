import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Input, Pagination as AntPagination, Popconfirm, Space, Table, Tooltip, DatePicker } from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
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
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number, size: number) => void;
  onPageSizeChange: (size: number) => void;
  sortKey: UserSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: UserSortKey, direction: SortDirection) => void;
}

export default function UsersTab({
  users,
  loading,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onReset,
  onDelete,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDirection,
  onSortChange,
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

  const handleColumnSearch = (key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleDateSearch = (key: string, dateStrings: [string, string]) => {
    if (!dateStrings || !dateStrings[0]) {
      setDateFilters((prev) => ({ ...prev, [key]: null }));
    } else {
      setDateFilters((prev) => ({ ...prev, [key]: dateStrings }));
    }
  };

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setDateFilters({});
    setResetKey((prev) => prev + 1);
  };

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

  const columns: ColumnsType<User> = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 50,
      fixed: 'left',
      align: 'center',
      children: [
        {
          title: <div style={{ height: 24 }}></div>, // 占位，不需要搜索的列留空
          key: 'index_child',
          width: 50,
          fixed: 'left',
          align: 'center',
          render: (text, record, index) => index + 1,
        }
      ]
    },
    {
      title: 'ID',
      key: 'id',
      width: 100,
      sorter: true,
      sortOrder: sortKey === 'id' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('id', 'ID'),
          dataIndex: 'id',
          key: 'id_child',
          width: 100,
        }
      ]
    },
    {
      title: '账号',
      key: 'username',
      width: 180,
      sorter: true,
      sortOrder: sortKey === 'username' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderSearchInput('username', '账号'),
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
          render: (value: string | null) => value || '-',
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
          render: (value: string | null) => value || '-',
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
          render: (value: string | null) => value || '-',
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
          render: (value: string | null) => value || '-',
        }
      ]
    },
    {
      title: '注册日期',
      key: 'created_at',
      width: 132,
      sorter: true,
      sortOrder: sortKey === 'created_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('created_at'),
          dataIndex: 'created_at',
          key: 'created_at_child',
          width: 132,
          render: (value: string) => new Date(value).toLocaleDateString('zh-CN'),
        }
      ]
    },
    {
      title: '更新日期',
      key: 'updated_at',
      width: 132,
      sorter: true,
      sortOrder: sortKey === 'updated_at' ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null,
      children: [
        {
          title: renderDateRangeInput('updated_at'),
          dataIndex: 'updated_at',
          key: 'updated_at_child',
          width: 132,
          render: (value: string) => new Date(value).toLocaleDateString('zh-CN'),
        }
      ]
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 80,
      children: [
        {
          title: (
            <Tooltip title="重置所有搜索">
              <Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} />
            </Tooltip>
          ),
          key: 'actions_child',
          fixed: 'right',
          width: 80,
          align: 'center',
          render: (_, record) => (
            <Popconfirm
              title="确定删除该会员？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => onDelete(record.id)}
            >
              <Tooltip title="删除会员">
                <Button danger size="small" type="text" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          ),
        }
      ]
    },
  ];

  // 对通过 API 获取的 users 数据进行前端二次过滤
  const filteredUsers = users.filter((user) => {
    // 文本匹配
    const textMatch = Object.entries(columnFilters).every(([key, searchText]) => {
      if (!searchText) return true;
      const value = user[key as keyof User];
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(searchText.toLowerCase());
    });

    // 范围日期匹配
    const dateMatch = Object.entries(dateFilters).every(([key, dateRange]) => {
      if (!dateRange || !dateRange[0] || !dateRange[1]) return true;
      const userPropStr = user[key as keyof User];
      if (!userPropStr) return false;
      
      const userDate = new Date(userPropStr as string).getTime();
      const startDate = new Date(dateRange[0] + 'T00:00:00').getTime();
      const endDate = new Date(dateRange[1] + 'T23:59:59.999').getTime();
      
      return userDate >= startDate && userDate <= endDate;
    });

    return textMatch && dateMatch;
  });

  // 检查是否正在使用前端条件过滤
  const isLocalFiltered =
    Object.values(columnFilters).some((v) => !!v) ||
    Object.values(dateFilters).some((v) => !!v);

  const displayTotalItems = isLocalFiltered ? filteredUsers.length : totalItems;
  const displayCurrentPage = isLocalFiltered ? 1 : currentPage;
  
  const totalPages = Math.max(1, Math.ceil(displayTotalItems / pageSize));

  // 因为增加了双层表头，表头总高度会变大（大约从 39px 增加到 80px 左右），我们需要稍微调整一下 ResizeObserver 的高度计算减去的值


  return (
    <Card bodyStyle={{ padding: 0, height: 'calc(100vh - 61px)', display: 'flex', flexDirection: 'column' }} bordered={false}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Space wrap>
          <Input
            allowClear
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onPressEnter={onSearch}
            placeholder="搜索会员：账号、手机或电子邮箱"
            style={{ width: 320 }}
          />
          <Button type="primary" onClick={onSearch}>
            搜索
          </Button>
          <Button onClick={onReset}>重置</Button>
        </Space>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<User>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredUsers}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 1394, y: tableScrollY }}
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
          current={displayCurrentPage}
          pageSize={pageSize}
          total={displayTotalItems}
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
