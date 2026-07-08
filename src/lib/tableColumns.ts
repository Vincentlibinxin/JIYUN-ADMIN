import type { ColumnType, ColumnsType } from 'antd/es/table';

const MAX_TABLE_DATA_COLUMN_WIDTH_PX = 240;
const MAX_TABLE_DATA_COLUMN_MAX_WIDTH_CSS = `${MAX_TABLE_DATA_COLUMN_WIDTH_PX}px`;
const DEFAULT_AUTO_COLUMN_WIDTH_PX = 120;
const CONTROL_COLUMN_KEYS = new Set(['index', 'index_child', 'actions', 'actions_child', 'spacer', 'spacer_child']);

type AnyColumn = ColumnType<any> & { children?: AnyColumn[] };

const isControlColumn = (column: AnyColumn): boolean => {
  const key = typeof column.key === 'string' ? column.key : '';
  return CONTROL_COLUMN_KEYS.has(key);
};

const capColumnWidth = (width: ColumnType<any>['width']): ColumnType<any>['width'] => {
  return width;
};

const getColumnPixelWidth = (column: AnyColumn): number => {
  if (isControlColumn(column) && column.width == null) {
    return 0;
  }
  if (Array.isArray(column.children) && column.children.length > 0) {
    return column.children.reduce((sum, child) => sum + getColumnPixelWidth(child), 0);
  }
  if (typeof column.width === 'number') {
    return column.width;
  }
  if (typeof column.width === 'string') {
    if (column.width === 'max-content') {
      return DEFAULT_AUTO_COLUMN_WIDTH_PX;
    }
    const numeric = Number(column.width.replace(/px$/i, '').trim());
    if (Number.isFinite(numeric) && /px$/i.test(column.width)) {
      return numeric;
    }
  }
  return DEFAULT_AUTO_COLUMN_WIDTH_PX;
};

const constrainLeafColumn = (column: AnyColumn): AnyColumn => {
  return column;
};

export const constrainTableColumns = <T,>(columns: ColumnsType<T>): ColumnsType<T> =>
  columns.map((column) => {
    const current = column as AnyColumn;
    if (Array.isArray(current.children) && current.children.length > 0) {
      return {
        ...current,
        children: constrainTableColumns(current.children),
      } as typeof column;
    }
    return constrainLeafColumn(current) as typeof column;
  });

export const getConstrainedTableScrollX = <T,>(columns: ColumnsType<T>): number =>
  columns.reduce((sum, column) => sum + getColumnPixelWidth(column as AnyColumn), 0);
