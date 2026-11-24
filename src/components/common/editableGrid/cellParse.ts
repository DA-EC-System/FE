/** Kết quả đọc chữ trong ô: `value` null là xoá giá trị */
export type CellParse = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Ô số của bảng sửa (lấy từ BulkEditPage, FE#155): trống là xoá; còn lại là số nguyên dương (hoặc từ 0 khi `allowZero`),
 * cho gõ dấu chấm, phẩy, khoảng trắng ngăn nghìn. `max` chặn số quá lớn (sai đơn vị)
 */
export function parseCell(raw: string, limit?: { max?: number; tooBig?: string; allowZero?: boolean }): CellParse {
  const t = raw.trim().replace(/[.,\s]/g, '');
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!/^\d+$/.test(t) || !Number.isSafeInteger(n)) return { ok: false, error: limit?.allowZero ? 'Nhập số nguyên từ 0' : 'Nhập số lớn hơn 0' };
  if (n === 0 && !limit?.allowZero) return { ok: false, error: 'Nhập số lớn hơn 0' };
  if (limit?.max !== undefined && n > limit.max) return { ok: false, error: limit.tooBig ?? `Tối đa ${limit.max.toLocaleString('vi-VN')}` };
  return { ok: true, value: n };
}
