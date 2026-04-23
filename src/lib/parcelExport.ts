import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExportParcelRow {
  id: number;
  tracking_number?: string | null;
  origin?: string | null;
  destination?: string | null;
  weight?: number | string | null;
  length_cm?: number | string | null;
  width_cm?: number | string | null;
  height_cm?: number | string | null;
  status?: string | null;
  sub_status?: string | null;
  status_remark?: string | null;
  username?: string | null;
  item_names?: string | null;
  item_values?: string | null;
  item_quantities?: string | null;
}

// Template columns (1-indexed):
// A=单序(公式), B=运单号, C=缴税方式, D=代收款, E=自提方, F=备注, G=客户,
// H=发件人, I=发件电话, J=发件人地址,
// K=收件人, L=收件人电话, M=收件人地址, N=收件人证件, O=收件人(申报), P=收件电话(申报), Q=收件证件(申报),
// R=重量, S=长, T=宽, U=高,
// V=物品名称, W=单价, X=数量,
// Y=清关单号, Z=订单号, AA=参考单号
// Data rows start from row 3.

export async function exportParcelsToTemplate(parcels: ExportParcelRow[], templateUrl = '/运单模板.xlsx') {
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error('加载模板失败');
  const buf = await resp.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Sheet1') || wb.worksheets[0];
  if (!ws) throw new Error('模板缺少 Sheet1');

  const DATA_START_ROW = 3;
  parcels.forEach((p, idx) => {
    const row = ws.getRow(DATA_START_ROW + idx);
    // Keep the col A formula (单序) — do not overwrite.
    row.getCell(2).value = p.tracking_number || '';           // B 运单号
    row.getCell(6).value = p.status_remark || '';              // F 备注
    row.getCell(7).value = p.username || '';                   // G 客户
    row.getCell(11).value = p.username || '';                  // K 收件人
    row.getCell(18).value = p.weight != null ? Number(p.weight) : '';   // R 重量
    row.getCell(19).value = p.length_cm != null ? Number(p.length_cm) : '';  // S 长
    row.getCell(20).value = p.width_cm != null ? Number(p.width_cm) : '';    // T 宽
    row.getCell(21).value = p.height_cm != null ? Number(p.height_cm) : '';  // U 高
    row.getCell(22).value = p.item_names || '';               // V 物品名称
    row.getCell(23).value = p.item_values || '';              // W 单价
    row.getCell(24).value = p.item_quantities || '';          // X 数量
    row.commit();
  });

  const out = await wb.xlsx.writeBuffer();
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `运单导出_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.xlsx`;
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
