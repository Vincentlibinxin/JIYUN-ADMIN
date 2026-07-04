import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, Form, Input, Modal, Pagination as AntPagination, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip, Upload, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import { adminFetch } from '../../lib/api';

interface LabelTemplateItem {
  id: number;
  label_name: string;
  template_html: string;
  description: string | null;
  is_enabled: number;
  logistics_provider_id: number | null;
  logistics_provider_name?: string | null;
  created_at: string;
  updated_at?: string;
}

interface LabelTemplatePayload {
  label_name: string;
  template_html: string;
  description?: string;
  is_enabled?: boolean;
  logistics_provider_id?: number | null;
}

interface LabelsTabProps {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  refreshKey?: number;
}

type SortKey = 'id' | 'label_name' | 'is_enabled' | 'created_at';
type SortDirection = 'asc' | 'desc';
type ModalMode = 'create' | 'edit';

const HTML_MAX_LENGTH = 500_000;

// 在新窗口中打印标签 HTML（内容由管理员维护，渲染在独立窗口中）
const printLabelHtml = (html: string) => {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) {
    message.warning('打印窗口被浏览器拦截，请允许弹出窗口后重试');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // 等待资源（条码脚本/图片）加载后再触发打印
  const triggerPrint = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 300);
  } else {
    win.onload = () => setTimeout(triggerPrint, 300);
    setTimeout(triggerPrint, 1200);
  }
};

export default function LabelsTab({ canCreate, canUpdate, canDelete, refreshKey }: LabelsTabProps) {
  const [items, setItems] = useState<LabelTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingItem, setEditingItem] = useState<LabelTemplateItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [form] = Form.useForm();

  // 预览弹窗
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

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
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTableHeight);
    };
  }, []);

  const fetchLabels = async (
    page: number = currentPage,
    size: number = pageSize,
    sortK: SortKey = sortKey,
    sortD: SortDirection = sortDirection,
    cf: Record<string, string> = columnFilters,
    q: string = searchQuery,
  ) => {
    try {
      setLoading(true);
      const keyword = q.trim();
      if (keyword) {
        const response = await adminFetch(`/admin/labels/search?q=${encodeURIComponent(keyword)}`);
        if (response.status === 401) return;
        if (!response.ok) throw new Error('search failed');
        const data = await response.json();
        const list = Array.isArray(data?.data) ? data.data : [];
        setItems(list);
        setTotalItems(list.length);
      } else {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(size),
          sortKey: sortK,
          sortOrder: sortD,
        });
        if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));
        const response = await adminFetch(`/admin/labels?${params.toString()}`);
        if (response.status === 401) return;
        if (!response.ok) throw new Error('fetch failed');
        const data = await response.json();
        setItems(Array.isArray(data?.data) ? data.data : []);
        setTotalItems(data?.pagination?.total || 0);
        setCurrentPage(page);
        setPageSize(size);
      }
    } catch {
      messageApi.error('读取标签失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLabels(1, pageSize, sortKey, sortDirection, {}, '');
    setColumnFilters({});
    setLocalColumnFilters({});
    setSearchQuery('');
    setSelectedRowKeys([]);
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters };
    if (!value) delete next[key];
    else next[key] = value;
    setColumnFilters(next);
    setCurrentPage(1);
    void fetchLabels(1, pageSize, sortKey, sortDirection, next, searchQuery);
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

  const renderSelectFilter = (key: string, options: Array<{ label: string; value: string }>) => (
    <Select
      size="small"
      value={columnFilters[key] || ''}
      onChange={(v) => handleColumnSearch(key, v)}
      onClick={(e) => e.stopPropagation()}
      style={{ width: '100%' }}
      options={[{ label: '全部', value: '' }, ...options]}
    />
  );

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setSearchQuery('');
    setSortKey('created_at');
    setSortDirection('desc');
    setSelectedRowKeys([]);
    setCurrentPage(1);
    void fetchLabels(1, pageSize, 'created_at', 'desc', {}, '');
  };

  const visibleKeys = items.map((it) => it.id);
  const selectedVisibleCount = visibleKeys.filter((k) => selectedRowKeys.includes(k)).length;
  const allSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;

  const handleSelectAll = (checked: boolean) => setSelectedRowKeys(checked ? visibleKeys : []);
  const handleSelectRow = (key: number, checked: boolean) => {
    setSelectedRowKeys((prev) => (checked ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key)));
  };

  const openCreate = () => {
    setModalMode('create');
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ is_enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: LabelTemplateItem) => {
    setModalMode('edit');
    setEditingItem(record);
    form.setFieldsValue({
      label_name: record.label_name,
      template_html: record.template_html,
      description: record.description || '',
      is_enabled: !!record.is_enabled,
      logistics_provider_id: record.logistics_provider_id ?? undefined,
    });
    setModalOpen(true);
  };

  const openPreview = (title: string, html: string) => {
    setPreviewTitle(title);
    setPreviewHtml(html);
    setPreviewOpen(true);
  };

  // 表单内“预览当前模板”
  const handleFormPreview = () => {
    const html = String(form.getFieldValue('template_html') || '');
    if (!html.trim()) {
      messageApi.warning('请先填写或上传 HTML 模板');
      return;
    }
    openPreview(String(form.getFieldValue('label_name') || '模板预览'), html);
  };

  // 上传 .html 文件，读取文本填入模板字段
  const beforeUploadHtml: UploadProps['beforeUpload'] = (file) => {
    const isHtml = /\.(html?|htm)$/i.test(file.name) || file.type === 'text/html';
    if (!isHtml) {
      messageApi.error('请上传 .html 文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > HTML_MAX_LENGTH) {
      messageApi.error('模板文件过大');
      return Upload.LIST_IGNORE;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      form.setFieldsValue({ template_html: text });
      if (!form.getFieldValue('label_name')) {
        form.setFieldsValue({ label_name: file.name.replace(/\.(html?|htm)$/i, '') });
      }
      messageApi.success('已载入模板文件');
    };
    reader.onerror = () => messageApi.error('读取文件失败');
    reader.readAsText(file);
    return Upload.LIST_IGNORE;
  };

  const handleSubmit = async () => {
    let values: LabelTemplatePayload;
    try {
      values = (await form.validateFields()) as LabelTemplatePayload;
    } catch {
      return;
    }
    const payload: LabelTemplatePayload = {
      label_name: String(values.label_name || '').trim(),
      template_html: String(values.template_html || ''),
      description: String(values.description || '').trim(),
      is_enabled: !!values.is_enabled,
    };
    if (showProviderSelect) {
      payload.logistics_provider_id = values.logistics_provider_id ?? null;
    }
    try {
      setSubmitting(true);
      const path = modalMode === 'create'
        ? '/admin/labels'
        : `/admin/labels/${editingItem?.id}`;
      const response = await adminFetch(path, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || (modalMode === 'create' ? '创建失败' : '更新失败'));
        return;
      }
      messageApi.success(modalMode === 'create' ? '标签已创建' : '标签已更新');
      setModalOpen(false);
      void fetchLabels();
    } catch {
      messageApi.error('请求失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (record: LabelTemplateItem) => {
    try {
      const response = await adminFetch(`/admin/labels/${record.id}`, { method: 'DELETE' });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || '删除失败');
        return;
      }
      messageApi.success('标签已删除');
      setSelectedRowKeys((prev) => prev.filter((k) => k !== record.id));
      void fetchLabels();
    } catch {
      messageApi.error('请求失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      const response = await adminFetch('/admin/labels/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedRowKeys }),
      });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(data?.error || '批量删除失败');
        return;
      }
      messageApi.success(data?.message || '删除成功');
      setSelectedRowKeys([]);
      void fetchLabels();
    } catch {
      messageApi.error('请求失败');
    }
  };

  const sortOrderFor = (key: SortKey) => (sortKey === key ? (sortDirection === 'asc' ? 'ascend' : 'descend') : null);

  const columns: ColumnsType<LabelTemplateItem> = [
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
              <Checkbox checked={allSelected} indeterminate={indeterminate} onChange={(e) => handleSelectAll(e.target.checked)} />
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
              <span>{(currentPage - 1) * pageSize + index + 1}</span>
            </div>
          ),
        },
      ],
    },
    {
      title: '标签名称',
      key: 'label_name',
      width: 220,
      sorter: true,
      sortOrder: sortOrderFor('label_name'),
      children: [
        {
          title: renderSearchInput('label_name', '标签名称'),
          key: 'label_name_child',
          width: 220,
          render: (_, record) => <span style={{ fontWeight: 600 }}>{record.label_name}</span>,
        },
      ],
    },
    {
      title: '备注',
      key: 'description',
      width: 240,
      children: [
        {
          title: renderSearchInput('description', '备注'),
          key: 'description_child',
          width: 240,
          render: (_, record) => <span>{record.description || '-'}</span>,
        },
      ],
    },
    {
      title: '物流商',
      key: 'logistics_provider',
      width: 180,
      children: [
        {
          title: '',
          key: 'logistics_provider_child',
          width: 180,
          render: (_, record) => (
            record.logistics_provider_name
              ? <Tag color="blue">{record.logistics_provider_name}</Tag>
              : <Tag>平台通用</Tag>
          ),
        },
      ],
    },
    {
      title: '是否启用',
      key: 'is_enabled',
      width: 120,
      sorter: true,
      sortOrder: sortOrderFor('is_enabled'),
      children: [
        {
          title: renderSelectFilter('is_enabled', [{ label: '启用', value: '1' }, { label: '停用', value: '0' }]),
          key: 'is_enabled_child',
          width: 120,
          render: (_, record) => (
            record.is_enabled
              ? <Tag color="green">启用</Tag>
              : <Tag>停用</Tag>
          ),
        },
      ],
    },
    {
      title: '创建时间',
      key: 'created_at',
      width: 180,
      sorter: true,
      sortOrder: sortOrderFor('created_at'),
      children: [
        {
          title: '',
          key: 'created_at_child',
          width: 180,
          render: (_, record) => <span>{record.created_at ? new Date(record.created_at).toLocaleString() : '-'}</span>,
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
      width: 160,
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
          width: 160,
          fixed: 'right',
          align: 'center',
          render: (_, record) => (
            <Space size={4}>
              <Tooltip title="预览">
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openPreview(record.label_name, record.template_html)} />
              </Tooltip>
              <Tooltip title="打印">
                <Button size="small" type="text" icon={<PrinterOutlined />} onClick={() => printLabelHtml(record.template_html)} />
              </Tooltip>
              <Tooltip title="编辑">
                <Button size="small" type="text" icon={<EditOutlined />} disabled={!canUpdate} onClick={() => openEdit(record)} />
              </Tooltip>
              {canDelete && (
                <Popconfirm
                  title="确定删除该标签？"
                  description="删除后不可恢复。"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleDelete(record)}
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

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bordered={false}>
      {messageContextHolder}
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: '0 0 auto' }}>
          <Space>
            {canDelete && (
              <Popconfirm
                title={`确定删除选中的 ${selectedRowKeys.length} 个标签？`}
                description="删除后不可恢复。"
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={handleBatchDelete}
                disabled={selectedRowKeys.length === 0}
              >
                <Button danger disabled={selectedRowKeys.length === 0}>
                  批量删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search
            allowClear
            value={searchQuery}
            onChange={(event) => {
              const v = event.target.value;
              setSearchQuery(v);
              if (!v.trim()) {
                void fetchLabels(1, pageSize, sortKey, sortDirection, columnFilters, '');
              }
            }}
            onSearch={(v) => {
              setSearchQuery(v);
              setCurrentPage(1);
              void fetchLabels(1, pageSize, sortKey, sortDirection, columnFilters, v);
            }}
            placeholder="搜索标签：名称 / 备注"
            style={{ width: 460 }}
            enterButton
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#f58220' }}>
              新增标签
            </Button>
          )}
        </div>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<LabelTemplateItem>
          rowKey={(record) => record.id}
          rowClassName={(record) => (selectedRowKeys.includes(record.id) ? 'row-selected' : '')}
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          size="small"
          sticky
          tableLayout="fixed"
          showSorterTooltip={false}
          sortDirections={['ascend', 'descend', 'ascend']}
          scroll={{ x: 'max-content', y: tableScrollY }}
          locale={{ emptyText: '没有标签记录' }}
          onChange={(_, __, sorter) => {
            if (Array.isArray(sorter)) return;
            const field = (sorter.columnKey || sorter.field) as SortKey | undefined;
            const order = sorter.order;
            if (!field || !order) {
              setSortKey('created_at');
              setSortDirection('desc');
              void fetchLabels(currentPage, pageSize, 'created_at', 'desc', columnFilters, searchQuery);
              return;
            }
            const dir: SortDirection = order === 'ascend' ? 'asc' : 'desc';
            setSortKey(field);
            setSortDirection(dir);
            void fetchLabels(currentPage, pageSize, field, dir, columnFilters, searchQuery);
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <AntPagination
          size="small"
          current={currentPage}
          pageSize={pageSize}
          total={totalItems}
          showSizeChanger={!isSearching}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          showQuickJumper={!isSearching}
          disabled={isSearching}
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`}
          onChange={(page, size) => {
            void fetchLabels(page, size, sortKey, sortDirection, columnFilters, searchQuery);
          }}
          onShowSizeChange={(_, size) => {
            void fetchLabels(1, size, sortKey, sortDirection, columnFilters, searchQuery);
          }}
        />
      </div>

      <Modal
        title={modalMode === 'create' ? '新增标签' : '编辑标签'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okButtonProps={{ style: { background: '#f58220' } }}
        okText={modalMode === 'create' ? '创建' : '保存'}
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="label_name"
            label="标签名称"
            rules={[{ required: true, message: '请输入标签名称' }, { max: 128, message: '不能超过128个字符' }]}
          >
            <Input placeholder="如 仓内标签 60x40" />
          </Form.Item>

          <Form.Item
            label="HTML模板"
            required
            style={{ marginBottom: 8 }}
          >
            <Space style={{ marginBottom: 8 }}>
              <Upload beforeUpload={beforeUploadHtml} showUploadList={false} accept=".html,.htm">
                <Button icon={<UploadOutlined />}>上传 HTML 文件</Button>
              </Upload>
              <Button icon={<EyeOutlined />} onClick={handleFormPreview}>预览</Button>
            </Space>
            <Form.Item
              name="template_html"
              noStyle
              rules={[{ required: true, message: '请上传或粘贴 HTML 模板' }]}
            >
              <Input.TextArea
                rows={10}
                placeholder="粘贴标签 HTML 源码，或点击上方按钮上传 .html 文件"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
          </Form.Item>

          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} placeholder="可填写标签用途、尺寸等说明" maxLength={255} showCount />
          </Form.Item>

          {showProviderSelect && (
            <Form.Item name="logistics_provider_id" label="归属物流商">
              <Select
                allowClear
                placeholder="平台通用（不选则所有物流商可见）"
                options={providerSelectOptions}
              />
            </Form.Item>
          )}

          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`预览：${previewTitle}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width={560}
        footer={[
          <Button key="print" type="primary" icon={<PrinterOutlined />} style={{ background: '#f58220' }} onClick={() => printLabelHtml(previewHtml)}>
            打印
          </Button>,
          <Button key="close" onClick={() => setPreviewOpen(false)}>关闭</Button>,
        ]}
        destroyOnClose
      >
        <div style={{ background: '#f5f5f5', padding: 16, display: 'flex', justifyContent: 'center' }}>
          <iframe
            title="label-preview"
            srcDoc={previewHtml}
            sandbox="allow-scripts allow-popups"
            style={{ width: '100%', height: 420, border: '1px solid #d9d9d9', background: '#fff' }}
          />
        </div>
      </Modal>
    </Card>
  );
}
