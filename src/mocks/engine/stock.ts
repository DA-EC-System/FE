/**
 * Các con số tồn theo SKU và luật giữ hàng (sơ đồ Tồn kho B2, FE#56).
 * Hàm thuần trên số liệu, không đụng dữ liệu giả: handler của kho, kiện, phiếu nhận gọi chung.
 *
 * Tồn thực = khả dụng + đang giữ + tạm khoá. Chờ xử lý không thuộc tồn thực, không bán được.
 * Khả dụng là số đẩy lên sàn.
 */

export interface StockNumbers {
  onHand: number;
  reserved: number;
  /** Phiếu giảm đang chờ duyệt */
  locked: number;
  quarantine: number;
  /** Còn chờ của đề nghị nhập (kể cả phiếu nhận đang kiểm) */
  incoming: number;
}

export const emptyStock = (): StockNumbers => ({ onHand: 0, reserved: 0, locked: 0, quarantine: 0, incoming: 0 });

export const availableOf = (n: StockNumbers) => Math.max(0, n.onHand - n.reserved - n.locked);

export type StockViolation = 'negative_on_hand' | 'reserved_over_on_hand' | 'negative_quarantine' | 'negative_incoming';

/** Bất biến: tồn thực ≥ 0, 0 ≤ đang giữ ≤ tồn thực, chờ xử lý ≥ 0, còn chờ ≥ 0 */
export function violations(n: StockNumbers): StockViolation[] {
  const found: StockViolation[] = [];
  if (n.onHand < 0) found.push('negative_on_hand');
  if (n.reserved < 0 || n.reserved > Math.max(n.onHand, 0)) found.push('reserved_over_on_hand');
  if (n.quarantine < 0) found.push('negative_quarantine');
  if (n.incoming < 0) found.push('negative_incoming');
  return found;
}

/** Một lần giữ hàng (một kiện): giữ nguyên kiện, không giữ lẻ từng dòng */
export interface Hold {
  id: string;
  lines: { variantId: string; qty: number }[];
  /** Hạn giao; kiện hạn sớm được chia hàng trước */
  dueAt?: string | null;
  createdAt: string;
  /** Đơn chưa thanh toán: bị lấy lại trước */
  unpaid?: boolean;
  /** Kiện đã đóng: không bị lấy lại */
  packed?: boolean;
}

type Levels = Map<string, StockNumbers>;
const levelOf = (levels: Levels, variantId: string) => {
  let n = levels.get(variantId);
  if (!n) {
    n = emptyStock();
    levels.set(variantId, n);
  }
  return n;
};

/** Giữ nguyên kiện: mọi dòng đủ khả dụng mới giữ; trả về đã giữ hay chưa */
export function reserveWhole(levels: Levels, hold: Hold): boolean {
  const need = new Map<string, number>();
  for (const l of hold.lines) need.set(l.variantId, (need.get(l.variantId) ?? 0) + l.qty);
  for (const [variantId, qty] of need) if (availableOf(levelOf(levels, variantId)) < qty) return false;
  for (const [variantId, qty] of need) levelOf(levels, variantId).reserved += qty;
  return true;
}

export function release(levels: Levels, hold: Hold) {
  for (const l of hold.lines) {
    const n = levelOf(levels, l.variantId);
    n.reserved = Math.max(0, n.reserved - l.qty);
  }
}

/**
 * Khả dụng tăng: chia hàng cho kiện Thiếu hàng trước (hạn sớm, đơn về trước), rồi mới đẩy tồn.
 * Trả về các kiện vừa giữ được; kiện không đủ hàng thì bỏ qua, xét kiện sau.
 */
export function allocate(levels: Levels, waiting: Hold[]): Hold[] {
  const order = [...waiting].sort(
    (a, b) =>
      (a.dueAt ?? '￿').localeCompare(b.dueAt ?? '￿') || a.createdAt.localeCompare(b.createdAt),
  );
  return order.filter((h) => reserveWhole(levels, h));
}

/**
 * Tồn thực xuống dưới đang giữ: lấy lại phần giữ tới khi đang giữ ≤ tồn thực.
 * Đơn chưa thanh toán trước, giữ sau cùng trước; kiện đã đóng không bị lấy lại.
 * Trả về các kiện bị lấy lại (chuyển về Thiếu hàng).
 */
export function reclaim(levels: Levels, variantId: string, holds: Hold[]): Hold[] {
  const n = levelOf(levels, variantId);
  const taken: Hold[] = [];
  const candidates = holds
    .filter((h) => !h.packed && h.lines.some((l) => l.variantId === variantId))
    .sort((a, b) => Number(Boolean(b.unpaid)) - Number(Boolean(a.unpaid)) || b.createdAt.localeCompare(a.createdAt));
  for (const h of candidates) {
    if (n.reserved <= Math.max(n.onHand, 0)) break;
    release(levels, h);
    taken.push(h);
  }
  return taken;
}

/** Đang thiếu = hàng các kiện Thiếu hàng cần − khả dụng */
export function shortageOf(n: StockNumbers, backorderedQty: number) {
  return Math.max(0, backorderedQty - availableOf(n));
}

export type StockState = 'in_stock' | 'low' | 'out';

/** Còn hàng (khả dụng > ngưỡng), Sắp hết (0 < khả dụng ≤ ngưỡng), Hết hàng (= 0) */
export function stockState(available: number, minQty: number | null): StockState {
  if (available <= 0) return 'out';
  if (minQty !== null && available <= minQty) return 'low';
  return 'in_stock';
}

/** Khả dụng + đang về − đang thiếu ≤ ngưỡng: gợi ý đưa vào đề nghị nhập nháp */
export function needsReorder(n: StockNumbers, shortage: number, minQty: number | null) {
  return minQty !== null && availableOf(n) + n.incoming - shortage <= minQty;
}
