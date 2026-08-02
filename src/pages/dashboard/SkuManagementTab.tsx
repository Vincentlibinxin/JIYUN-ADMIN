import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, Col, Form, Image, Input, InputNumber, Modal, Pagination, Popconfirm, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import { AppstoreAddOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../lib/api';
import { constrainTableColumns, getConstrainedTableScrollX } from '../../lib/tableColumns';

interface SpecDimension {
  name: string;
  values: string[];
}

interface MallSku {
  id?: number;
  sku_code: string;
  spec_values: Record<string, string>;
  spec_signature?: string;
  price: number;
  stock: number;
  image_url?: string | null;
  is_enabled: boolean;
}

interface MallProduct {
  id: number;
  product_name: string;
  product_code: string;
  category_name: string | null;
  unit_name: string;
  main_image_url: string | null;
  description: string | null;
  spec_dimensions: SpecDimension[];
  is_enabled: boolean;
  logistics_provider_id: number;
  logistics_provider_name: string | null;
  sku_count: number;
  total_stock: number;
  min_price: number | null;
  max_price: number | null;
  skus?: MallSku[];
  created_at: string;
  updated_at: string;
}

interface ProviderOption {
  id: number;
  name: string;
  code: string | null;
}

interface ProductFormValues {
  product_name: string;
  product_code: string;
  category_name?: string;
  unit_name: string;
  main_image_url?: string;
  description?: string;
  logistics_provider_id?: number;
  is_enabled: boolean;
  spec_dimensions: SpecDimension[];
  skus: MallSku[];
}

interface SkuManagementTabProps {
  actorScope: 'platform' | 'logistics';
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  refreshKey?: number;
}

type ModalMode = 'create' | 'edit' | 'view';
type SortKey = 'id' | 'product_name' | 'product_code' | 'category_name' | 'unit_name' | 'is_enabled' | 'logistics_provider_id' | 'created_at' | 'updated_at';

const responseError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', { hour12: false })
  : '—';

const createSignature = (values: Record<string, string>, dimensions: SpecDimension[]) =>
  dimensions.map((dimension) => `${dimension.name}:${values[dimension.name]}`).join('|');

const createCombinations = (dimensions: SpecDimension[]): Array<Record<string, string>> =>
  dimensions.reduce<Array<Record<string, string>>>(
    (combinations, dimension) => combinations.flatMap((combination) =>
      dimension.values.map((value) => ({ ...combination, [dimension.name]: value }))),
    [{}],
  );

const safeCodePart = (value: string) => value.trim().replace(/\s+/g, '-').replace(/[^\w\-\u4e00-\u9fff]/g, '').slice(0, 20);

export default function SkuManagementTab({ actorScope, canCreate, canUpdate, canDelete, refreshKey }: SkuManagementTabProps) {
  const [products, setProducts] = useState<MallProduct[]>([]);
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
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editing, setEditing] = useState<MallProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<ProductFormValues>();
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(240);
  const dimensions = Form.useWatch('spec_dimensions', form) || [];
  const skus = Form.useWatch('skus', form) || [];
  const isView = modalMode === 'view';

  const fetchProducts = async (
    nextPage = page,
    nextPageSize = pageSize,
    nextSortKey: SortKey = sortKey,
    nextSortOrder = sortOrder,
    nextColumnFilters = columnFilters,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(nextPageSize), sortKey: nextSortKey, sortOrder: nextSortOrder });
      if (Object.keys(nextColumnFilters).length) params.set('columnFilters', JSON.stringify(nextColumnFilters));
      const response = await adminFetch(`/admin/mall-products?${params.toString()}`);
      if (!response.ok) throw new Error(await responseError(response, '加载商品失败'));
      const result = await response.json();
      setProducts(result.data || []);
      setTotal(result.pagination?.total || 0);
      setPage(nextPage);
      setPageSize(nextPageSize);
      setSearching(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载商品失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(1, pageSize);
    if (actorScope === 'platform') {
      adminFetch('/admin/logistics/options')
        .then(async (response) => response.ok ? response.json() : { data: [] })
        .then((result) => setProviderOptions(result.data || []))
        .catch(() => setProviderOptions([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshKey) fetchProducts(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

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

  const searchProducts = async (value = searchQuery) => {
    const keyword = value.trim();
    if (!keyword) { fetchProducts(1, pageSize); return; }
    setLoading(true);
    try {
      const response = await adminFetch(`/admin/mall-products/search?q=${encodeURIComponent(keyword)}`);
      if (!response.ok) throw new Error(await responseError(response, '搜索商品失败'));
      const result = await response.json();
      setProducts(result.data || []);
      setTotal(result.data?.length || 0);
      setPage(1);
      setSearching(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '搜索商品失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setModalMode('create');
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      unit_name: '件',
      is_enabled: true,
      spec_dimensions: [{ name: '颜色', values: [] }],
      skus: [],
    });
    setModalOpen(true);
  };

  const openRecord = async (record: MallProduct, mode: 'edit' | 'view') => {
    setModalMode(mode);
    setEditing(record);
    setModalOpen(true);
    setDetailLoading(true);
    try {
      const response = await adminFetch(`/admin/mall-products/${record.id}`);
      if (!response.ok) throw new Error(await responseError(response, '加载商品详情失败'));
      const result = await response.json();
      const detail = result.data as MallProduct;
      setEditing(detail);
      form.setFieldsValue({
        product_name: detail.product_name,
        product_code: detail.product_code,
        category_name: detail.category_name || undefined,
        unit_name: detail.unit_name,
        main_image_url: detail.main_image_url || undefined,
        description: detail.description || undefined,
        logistics_provider_id: detail.logistics_provider_id,
        is_enabled: Boolean(detail.is_enabled),
        spec_dimensions: detail.spec_dimensions,
        skus: (detail.skus || []).map((sku) => ({ ...sku, is_enabled: Boolean(sku.is_enabled) })),
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载商品详情失败');
      setModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const generateSkuRows = async () => {
    try {
      await form.validateFields(['product_code', 'spec_dimensions']);
      const currentDimensions = form.getFieldValue('spec_dimensions') || [];
      const combinationCount = currentDimensions.reduce((count: number, dimension: SpecDimension) => count * (dimension.values?.length || 0), 1);
      if (!combinationCount || combinationCount > 500) {
        message.warning('规格组合数量需为 1 至 500 个');
        return;
      }
      const currentSkus = form.getFieldValue('skus') || [];
      const existingBySignature = new Map(currentSkus.map((sku: MallSku) => [createSignature(sku.spec_values, currentDimensions), sku]));
      const productCode = safeCodePart(form.getFieldValue('product_code') || 'SKU');
      const nextSkus = createCombinations(currentDimensions).map((specValues, index) => {
        const signature = createSignature(specValues, currentDimensions);
        const existing = existingBySignature.get(signature);
        return existing || {
          sku_code: `${productCode}-${String(index + 1).padStart(3, '0')}`,
          spec_values: specValues,
          price: 0,
          stock: 0,
          image_url: undefined,
          is_enabled: true,
        };
      });
      form.setFieldValue('skus', nextSkus);
      message.success(`已生成 ${nextSkus.length} 个 SKU 组合`);
    } catch {
      message.warning('请先完整填写商品货号与规格维度');
    }
  };

  const submitForm = async () => {
    if (isView) { setModalOpen(false); return; }
    try {
      const values = await form.validateFields();
      if (!values.skus?.length) {
        message.warning('请先生成 SKU 组合');
        return;
      }
      setSubmitting(true);
      const payload = {
        ...values,
        product_name: values.product_name.trim(),
        product_code: values.product_code.trim(),
        category_name: values.category_name?.trim() || null,
        unit_name: values.unit_name.trim(),
        main_image_url: values.main_image_url?.trim() || null,
        description: values.description?.trim() || null,
        logistics_provider_id: actorScope === 'platform' ? values.logistics_provider_id : undefined,
        spec_dimensions: values.spec_dimensions.map((dimension) => ({ name: dimension.name.trim(), values: dimension.values.map((value) => value.trim()) })),
        skus: values.skus.map((sku) => ({ ...sku, sku_code: sku.sku_code.trim(), image_url: sku.image_url?.trim() || null })),
      };
      const response = await adminFetch(modalMode === 'create' ? '/admin/mall-products' : `/admin/mall-products/${editing?.id}`, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response, '保存商品失败'));
      message.success(modalMode === 'create' ? '商品与 SKU 已创建' : '商品与 SKU 已更新');
      setModalOpen(false);
      await fetchProducts(modalMode === 'create' ? 1 : page, pageSize);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteProducts = async (ids: number[]) => {
    const response = ids.length === 1
      ? await adminFetch(`/admin/mall-products/${ids[0]}`, { method: 'DELETE' })
      : await adminFetch('/admin/mall-products/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    if (!response.ok) { message.error(await responseError(response, '删除商品失败')); return; }
    message.success(ids.length === 1 ? '商品已删除' : `已删除 ${ids.length} 个商品`);
    setSelectedRowKeys([]);
    fetchProducts(products.length <= ids.length && page > 1 ? page - 1 : page, pageSize);
  };

  const handleColumnSearch = (key: string, value: string) => {
    const next = { ...columnFilters };
    if (!value) delete next[key];
    else next[key] = value;
    setColumnFilters(next);
    setPage(1);
    void fetchProducts(1, pageSize, sortKey, sortOrder, next);
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

  const resetFilters = () => {
    setColumnFilters({});
    setLocalColumnFilters({});
    setSearchQuery('');
    setSortKey('created_at');
    setSortOrder('desc');
    setSelectedRowKeys([]);
    setPage(1);
    void fetchProducts(1, pageSize, 'created_at', 'desc', {});
  };

  const visibleKeys = products.map((product) => product.id);
  const selectedVisibleCount = visibleKeys.filter((key) => selectedRowKeys.includes(key)).length;
  const allSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;
  const sortOrderFor = (key: SortKey) => sortKey === key ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null;

  const columns: ColumnsType<MallProduct> = [
    {
      title: '序号', key: 'index', width: 65, fixed: 'left',
      children: [{ title: <Checkbox checked={allSelected} indeterminate={indeterminate} onChange={(event) => setSelectedRowKeys(event.target.checked ? visibleKeys : [])} />, key: 'index_child', width: 65, fixed: 'left', render: (_, record, index) => <Space size={8}><Checkbox checked={selectedRowKeys.includes(record.id)} onChange={(event) => setSelectedRowKeys((previous) => event.target.checked ? [...new Set([...previous, record.id])] : previous.filter((key) => key !== record.id))} /><span>{(page - 1) * pageSize + index + 1}</span></Space> }],
    },
    {
      title: '商品名称', key: 'product_name', width: 220, sorter: true, sortOrder: sortOrderFor('product_name'),
      children: [{ title: renderSearchInput('product_name', '商品名称'), key: 'product_name_child', width: 220, render: (_, record) => <Space size={8}>{record.main_image_url ? <Image src={record.main_image_url} width={34} height={34} style={{ objectFit: 'cover', borderRadius: 4 }} preview={false} /> : <div style={{ width: 34, height: 34, flexShrink: 0, background: '#f3f4f6', borderRadius: 4 }} />}<Typography.Text ellipsis style={{ maxWidth: 165, fontWeight: 600 }}>{record.product_name}</Typography.Text></Space> }],
    },
    {
      title: '商品货号', key: 'product_code', width: 150, sorter: true, sortOrder: sortOrderFor('product_code'),
      children: [{ title: renderSearchInput('product_code', '商品货号'), key: 'product_code_child', width: 150, ellipsis: { showTitle: false }, render: (_, record) => <Tooltip title={record.product_code}>{record.product_code}</Tooltip> }],
    },
    {
      title: '类目', key: 'category_name', width: 140, sorter: true, sortOrder: sortOrderFor('category_name'),
      children: [{ title: renderSearchInput('category_name', '类目'), key: 'category_name_child', width: 140, ellipsis: { showTitle: false }, render: (_, record) => record.category_name || '—' }],
    },
    { title: 'SKU数', key: 'sku_count', width: 82, children: [{ title: '', key: 'sku_count_child', width: 82, align: 'right', render: (_, record) => record.sku_count }] },
    { title: '总库存', key: 'total_stock', width: 100, children: [{ title: '', key: 'total_stock_child', width: 100, align: 'right', render: (_, record) => record.total_stock }] },
    {
      title: '价格区间', key: 'price_range', width: 150, align: 'right',
      children: [{ title: '', key: 'price_range_child', width: 150, align: 'right', render: (_, record) => record.min_price === null ? '—' : record.min_price === record.max_price ? `¥${record.min_price.toFixed(2)}` : `¥${record.min_price.toFixed(2)} - ${record.max_price?.toFixed(2)}` }],
    },
    { title: '单位', key: 'unit_name', width: 90, sorter: true, sortOrder: sortOrderFor('unit_name'), children: [{ title: renderSearchInput('unit_name', '单位'), key: 'unit_name_child', width: 90, render: (_, record) => record.unit_name }] },
    { title: '状态', key: 'is_enabled', width: 100, sorter: true, sortOrder: sortOrderFor('is_enabled'), children: [{ title: renderSelectFilter('is_enabled', [{ label: '启用', value: '1' }, { label: '停用', value: '0' }]), key: 'is_enabled_child', width: 100, render: (_, record) => <Tag color={record.is_enabled ? 'success' : 'default'}>{record.is_enabled ? '启用' : '停用'}</Tag> }] },
    { title: '物流商', key: 'logistics_provider_id', width: 150, sorter: true, sortOrder: sortOrderFor('logistics_provider_id'), children: [{ title: '', key: 'logistics_provider_id_child', width: 150, ellipsis: { showTitle: false }, render: (_, record) => record.logistics_provider_name || '—' }] },
    { title: '更新时间', key: 'updated_at', width: 180, sorter: true, sortOrder: sortOrderFor('updated_at'), children: [{ title: '', key: 'updated_at_child', width: 180, render: (_, record) => formatDate(record.updated_at) }] },
    { title: '', key: 'spacer', children: [{ title: '', key: 'spacer_child', render: () => null }] },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right', align: 'center',
      children: [{ title: <Tooltip title="重置所有搜索"><Button size="small" icon={<ReloadOutlined />} onClick={resetFilters} /></Tooltip>, key: 'actions_child', width: 120, fixed: 'right', align: 'center', render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openRecord(record, 'view')} /></Tooltip>
          {canUpdate && <Tooltip title="修改"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRecord(record, 'edit')} /></Tooltip>}
          {canDelete && <Popconfirm title="确定删除该商品及其全部 SKU？" okText="删除" cancelText="取消" onConfirm={() => deleteProducts([record.id])}><Tooltip title="删除"><Button danger type="text" size="small" icon={<DeleteOutlined />} /></Tooltip></Popconfirm>}
        </Space>
      ) }],
    },
  ];

  const visibleColumns = actorScope === 'logistics' ? columns.filter((column) => column.key !== 'logistics_provider_id') : columns;
  const tableColumns = constrainTableColumns(visibleColumns);
  return (
    <Card bordered={false} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增商品</Button>}
        {canDelete && <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 个商品？`} okText="删除" cancelText="取消" disabled={!selectedRowKeys.length} onConfirm={() => deleteProducts(selectedRowKeys)}><Button danger disabled={!selectedRowKeys.length}>批量删除{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}</Button></Popconfirm>}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Input.Search value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); if (!event.target.value) fetchProducts(1, pageSize); }} onSearch={searchProducts} placeholder="搜索商品、货号、类目、SKU编码或规格" enterButton allowClear style={{ width: 440 }} />
        </div>
        <Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => fetchProducts(page, pageSize)} /></Tooltip>
      </div>

      <div ref={tableHostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<MallProduct> rowKey="id" rowClassName={(record) => selectedRowKeys.includes(record.id) ? 'row-selected' : ''} loading={loading} columns={tableColumns} dataSource={products} pagination={false} size="small" sticky tableLayout="auto" showSorterTooltip={false} sortDirections={['ascend', 'descend', 'ascend']} scroll={{ x: getConstrainedTableScrollX(tableColumns), y: tableScrollY }} onChange={(_, __, sorter) => {
          if (Array.isArray(sorter)) return;
          const nextSortKey = (sorter.columnKey || sorter.field) as SortKey | undefined;
          if (!nextSortKey || !sorter.order) {
            setSortKey('created_at'); setSortOrder('desc');
            void fetchProducts(page, pageSize, 'created_at', 'desc', columnFilters);
            return;
          }
          const nextSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
          setSortKey(nextSortKey); setSortOrder(nextSortOrder);
          void fetchProducts(page, pageSize, nextSortKey, nextSortOrder, columnFilters);
        }} locale={{ emptyText: searching ? '没有匹配的商品' : '没有商品' }} />
      </div>

      <div style={{ flexShrink: 0, padding: '6px 16px', borderTop: '1px solid #f0f0f0', background: '#fff' }}>
        <Pagination size="small" current={page} pageSize={pageSize} total={total} showSizeChanger={!searching} pageSizeOptions={[10, 20, 30, 50, 100]} showQuickJumper={!searching} showTotal={(count, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`} disabled={searching} onChange={(nextPage, nextSize) => fetchProducts(nextPage, nextSize, sortKey, sortOrder, columnFilters)} onShowSizeChange={(_, nextSize) => fetchProducts(1, nextSize, sortKey, sortOrder, columnFilters)} />
      </div>

      <Modal title={modalMode === 'create' ? '新增商品与 SKU' : modalMode === 'edit' ? '修改商品与 SKU' : '查看商品与 SKU'} open={modalOpen} onOk={submitForm} onCancel={() => setModalOpen(false)} confirmLoading={submitting} loading={detailLoading} okText="保存" cancelText={isView ? '关闭' : '取消'} okButtonProps={isView ? { style: { display: 'none' } } : undefined} centered destroyOnClose width={1180} styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}>
        <Form form={form} layout="vertical" disabled={isView} preserve={false}>
          <Typography.Title level={5} style={{ margin: '0 0 12px' }}>商品信息</Typography.Title>
          <Row gutter={12}>
            <Col span={10}><Form.Item name="product_name" label="商品名称" rules={[{ required: true, whitespace: true, message: '请输入商品名称' }]}><Input maxLength={255} /></Form.Item></Col>
            <Col span={6}><Form.Item name="product_code" label="商品货号" rules={[{ required: true, whitespace: true, message: '请输入商品货号' }]}><Input maxLength={64} /></Form.Item></Col>
            <Col span={5}><Form.Item name="category_name" label="商品类目"><Input maxLength={128} /></Form.Item></Col>
            <Col span={3}><Form.Item name="unit_name" label="计量单位" rules={[{ required: true, whitespace: true, message: '请输入单位' }]}><Input maxLength={32} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            {actorScope === 'platform' && <Col span={7}><Form.Item name="logistics_provider_id" label="物流商" rules={[{ required: true, message: '请选择物流商' }]}><Select showSearch optionFilterProp="label" options={providerOptions.map((provider) => ({ value: provider.id, label: provider.code ? `${provider.name}（${provider.code}）` : provider.name }))} /></Form.Item></Col>}
            <Col span={actorScope === 'platform' ? 14 : 21}><Form.Item name="main_image_url" label="商品主图链接" rules={[{ type: 'url', message: '请输入有效的图片链接' }]}><Input maxLength={2048} placeholder="https://..." /></Form.Item></Col>
            <Col span={3}><Form.Item name="is_enabled" label="商品状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="商品说明"><Input.TextArea rows={2} maxLength={10000} showCount /></Form.Item>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 10px' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>规格维度</Typography.Title>
            {!isView && <Typography.Text type="secondary">最多 3 个维度，每个维度最多 20 个规格值</Typography.Text>}
          </div>
          <Form.List name="spec_dimensions" rules={[{ validator: async (_, value) => { if (!value?.length) throw new Error('请至少添加一个规格维度'); if (value.length > 3) throw new Error('最多添加三个规格维度'); } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field, index) => (
                  <Row gutter={12} key={field.key} align="top">
                    <Col span={5}><Form.Item name={[field.name, 'name']} label={`规格 ${index + 1}`} rules={[{ required: true, whitespace: true, message: '请输入规格名称' }]}><Input maxLength={32} placeholder="如：颜色" /></Form.Item></Col>
                    <Col span={17}><Form.Item name={[field.name, 'values']} label="规格值" rules={[{ required: true, message: '请至少输入一个规格值' }, { validator: async (_, values) => { if (values?.length > 20) throw new Error('每个维度最多20个规格值'); } }]}><Select mode="tags" tokenSeparators={[',', '，']} maxTagCount="responsive" placeholder="输入后按回车，如：红色、蓝色" /></Form.Item></Col>
                    <Col span={2} style={{ paddingTop: 30 }}>{!isView && fields.length > 1 && <Tooltip title="删除规格"><Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} /></Tooltip>}</Col>
                  </Row>
                ))}
                <Form.ErrorList errors={errors} />
                {!isView && <Space style={{ marginBottom: 16 }}><Button type="dashed" icon={<PlusOutlined />} disabled={fields.length >= 3} onClick={() => add({ name: '', values: [] })}>添加规格维度</Button><Button type="primary" ghost icon={<AppstoreAddOutlined />} onClick={generateSkuRows}>生成 SKU 组合</Button></Space>}
              </>
            )}
          </Form.List>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>SKU 组合明细</Typography.Title>
            <Typography.Text type="secondary">共 {skus.length} 个组合</Typography.Text>
          </div>
          {!skus.length ? <div style={{ padding: 28, textAlign: 'center', color: '#8c8c8c', border: '1px dashed #d9d9d9' }}>设置规格后点击“生成 SKU 组合”</div> : (
            <Table<MallSku>
              rowKey={(_, index) => String(index)}
              size="small"
              pagination={false}
              dataSource={skus}
              scroll={{ x: 1040, y: 320 }}
              columns={[
                ...dimensions.map((dimension) => ({ title: dimension.name, key: dimension.name, width: 105, render: (_: unknown, sku: MallSku) => sku.spec_values[dimension.name] || '—' })),
                { title: 'SKU编码', key: 'sku_code', width: 180, render: (_: unknown, _sku: MallSku, index: number) => <Form.Item name={['skus', index, 'sku_code']} rules={[{ required: true, whitespace: true, message: '必填' }]} style={{ margin: 0 }}><Input maxLength={128} /></Form.Item> },
                { title: '价格（¥）', key: 'price', width: 130, render: (_: unknown, _sku: MallSku, index: number) => <Form.Item name={['skus', index, 'price']} rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}><InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item> },
                { title: '库存', key: 'stock', width: 120, render: (_: unknown, _sku: MallSku, index: number) => <Form.Item name={['skus', index, 'stock']} rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}><InputNumber min={0} max={999999999} precision={0} style={{ width: '100%' }} /></Form.Item> },
                { title: 'SKU图片', key: 'image_url', width: 220, render: (_: unknown, _sku: MallSku, index: number) => <Form.Item name={['skus', index, 'image_url']} rules={[{ type: 'url', message: '链接无效' }]} style={{ margin: 0 }}><Input maxLength={2048} placeholder="可选" /></Form.Item> },
                { title: '启用', key: 'is_enabled', width: 75, align: 'center', render: (_: unknown, _sku: MallSku, index: number) => <Form.Item name={['skus', index, 'is_enabled']} valuePropName="checked" style={{ margin: 0 }}><Switch size="small" /></Form.Item> },
              ]}
            />
          )}
        </Form>
      </Modal>
    </Card>
  );
}