/** Một dòng kho quét lúc nhận hàng về (FE#212); expected null là món ngoài danh sách */
export interface ScanRow {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  expected: number | null;
  quantity: string;
}

import type { ScannedLine } from '@/api/fulfillment.api';

/** Dòng của kiện hoặc yêu cầu trả, gộp theo biến thể; mặc định quét đủ */
export function scanRowsFrom(
  lines: { variantId: string; sku: string; productName: string; attributesLabel: string; quantity: number }[],
): ScanRow[] {
  const rows: ScanRow[] = [];
  for (const l of lines) {
    const row = rows.find((r) => r.variantId === l.variantId);
    if (row) {
      row.expected = (row.expected ?? 0) + l.quantity;
      row.quantity = String(row.expected);
    } else {
      rows.push({ variantId: l.variantId, sku: l.sku, productName: l.productName, attributesLabel: l.attributesLabel, expected: l.quantity, quantity: String(l.quantity) });
    }
  }
  return rows;
}

/** Chặn trước khi gửi: số nguyên không âm (0 là không thấy món đó), không lặp SKU */
export function checkScanRows(rows: ScanRow[]): { errors: Record<string, string>; lines: ScannedLine[] } {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  const lines = rows.map((r, i) => {
    const text = r.quantity.trim();
    if (!/^\d+$/.test(text)) errors[`lines.${i}.quantity`] = 'Số lượng là số nguyên không âm';
    if (seen.has(r.variantId)) errors[`lines.${i}.variantId`] = 'Biến thể bị lặp';
    seen.add(r.variantId);
    return { variantId: r.variantId, quantity: Number(text) };
  });
  return { errors, lines };
}

/** Lỗi của bảng quét trong 422 (giữ nguyên câu BE); null nếu không có */
export function scanErrorsOf(errors: Record<string, string> | undefined): Record<string, string> | null {
  const picked = Object.fromEntries(Object.entries(errors ?? {}).filter(([k]) => k === 'lines' || k.startsWith('lines.')));
  return Object.keys(picked).length ? picked : null;
}
