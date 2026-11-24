/**
 * Bảng dòng của phiếu kiểm kê (FE#468 bước 7; design v2.html màn s7). Hàm thuần: đếm theo bộ lọc, lọc và tìm, chia
 * trang, dòng trống kế, điền theo tồn sàn. Phiếu đầu kỳ có thể hàng nghìn dòng nên chỉ vẽ một trang.
 */
import { draftNumber } from './shared';

export type CountSource = 'manual' | 'platform';
export type SheetFilter = 'all' | 'empty' | 'platform' | 'diff';

export const SHEET_PAGE_SIZE = 50;

export interface SheetRow {
  sku: string;
  productName: string;
  attributesLabel: string;
  /** Chữ trong ô Thực tế */
  counted: string;
  /** Tồn sổ theo khu vực đang chọn */
  book?: number;
  /** Tồn trên sàn (Documents/21 mục 18.6.2, chỉ phiếu đầu kỳ); không có thì null */
  platformStock: number | null;
  countSource: CountSource | null;
}

const isEmpty = (r: SheetRow) => r.counted.trim() === '';
const hasDiff = (r: SheetRow) => {
  const n = draftNumber(r.counted);
  return n !== null && r.book !== undefined && n !== r.book;
};

const MATCH: Record<SheetFilter, (r: SheetRow) => boolean> = {
  all: () => true,
  empty: isEmpty,
  platform: (r) => !isEmpty(r) && r.countSource === 'platform',
  diff: hasDiff,
};

export function sheetCounts(rows: SheetRow[]): Record<SheetFilter, number> {
  return {
    all: rows.length,
    empty: rows.filter(MATCH.empty).length,
    platform: rows.filter(MATCH.platform).length,
    diff: rows.filter(MATCH.diff).length,
  };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Chỉ số các dòng hiện, gom theo sản phẩm (tên sản phẩm, rồi thứ tự trên phiếu) */
export function visibleRows(rows: SheetRow[], filter: SheetFilter, search: string): number[] {
  const q = norm(search.trim());
  const hits = rows.flatMap((r, i) =>
    MATCH[filter](r) && (!q || norm(`${r.sku} ${r.productName} ${r.attributesLabel}`).includes(q)) ? [i] : [],
  );
  return hits.sort((a, b) => rows[a].productName.localeCompare(rows[b].productName, 'vi') || a - b);
}

export interface SheetPage {
  items: number[];
  /** Trang đang xem, từ 1, đã kẹp vào khoảng có */
  page: number;
  pages: number;
  from: number;
  to: number;
}

export function pageOf(indices: number[], page: number, size = SHEET_PAGE_SIZE): SheetPage {
  const pages = Math.max(1, Math.ceil(indices.length / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  const items = indices.slice(start, start + size);
  return { items, page: p, pages, from: items.length ? start + 1 : 0, to: start + items.length };
}

/** Dòng trống kế sau dòng `after` theo thứ tự đang hiện (vòng lại đầu); không còn dòng trống thì null */
export function nextEmpty(rows: SheetRow[], order: number[], after: number | null): number | null {
  const empties = order.filter((i) => isEmpty(rows[i]));
  if (!empties.length) return null;
  const pos = after === null ? -1 : order.indexOf(after);
  return empties.find((i) => order.indexOf(i) > pos) ?? empties[0];
}

/** "Điền theo tồn sàn": chỉ dòng còn trống và có tồn trên sàn; không đè số đã đếm */
export function fillFromPlatform(rows: SheetRow[]): { index: number; value: number }[] {
  return rows.flatMap((r, i) => (isEmpty(r) && r.platformStock !== null ? [{ index: i, value: r.platformStock }] : []));
}

/**
 * Nguồn số đếm gửi BE: ô trống thì null; số trùng tồn sàn mà đang đánh dấu theo sàn thì giữ `platform`; còn lại
 * `manual` (người dùng gõ đè). BE cũng tự hạ về `manual` khi lệch (mục 18.6.2).
 */
export function countSourceOf(row: Pick<SheetRow, 'counted' | 'platformStock' | 'countSource'>): CountSource | null {
  const n = draftNumber(row.counted);
  if (n === null) return null;
  return row.countSource === 'platform' && n === row.platformStock ? 'platform' : 'manual';
}
