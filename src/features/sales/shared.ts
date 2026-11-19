import type {
  OrderFlag,
  OrderOutcome,
  OrderSource,
  OrderStage,
  OrderStatus,
  LineCancelInitiator,
  LineCancelKind,
  OrderLine,
  OrderSummary,
  PaymentMethod,
  ShippingAddress,
} from '@/types/sales';
import type { Gateway, PaymentStatus } from '@/types/payment';
import { formatCurrency } from '@/utils/format';

export type { BadgeVariant } from '@/components/common/StatusBadge';
import type { BadgeVariant, StatusMeta } from '@/components/common/StatusBadge';

export const ORDER_STATUS: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  unpaid: { label: 'Chưa thanh toán', variant: 'warning' },
  processing: { label: 'Đang xử lý', variant: 'info' },
  completed: { label: 'Đã hoàn tất', variant: 'success' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

/** Giai đoạn hiển thị suy từ kiện (sơ đồ D1, ô "Hiển thị"); rê chuột vào nhãn để xem câu giải thích (FE#138) */
export const ORDER_STAGE: Record<OrderStage, StatusMeta> = {
  awaiting_payment: { label: 'Chờ thanh toán', variant: 'warning', hint: 'Đơn trả trước, chờ khách thanh toán.' },
  awaiting_confirmation: { label: 'Chờ xác nhận', variant: 'warning', hint: 'Chờ người bán xác nhận đơn.' },
  unmapped: {
    label: 'Chưa ghép SKU',
    variant: 'destructive',
    hint: 'Có dòng hàng sàn chưa ghép với SKU trong kho, chưa giữ hàng được.',
  },
  cancelling: { label: 'Đang huỷ', variant: 'warning', hint: 'Đã gửi yêu cầu huỷ lên sàn, chờ sàn trả lời.' },
  backordered: { label: 'Thiếu hàng', variant: 'destructive', hint: 'Kho không đủ hàng để giữ, kiện chờ hàng về.' },
  reserved: { label: 'Chờ đóng gói', variant: 'info', hint: 'Đã giữ hàng, chờ kho đóng gói.' },
  packed: { label: 'Đã đóng gói', variant: 'info', hint: 'Đã đóng gói, chờ bàn giao vận chuyển.' },
  awaiting_pickup: { label: 'Chờ lấy hàng', variant: 'info', hint: 'Chờ đơn vị vận chuyển tới lấy hàng.' },
  in_transit: { label: 'Đang giao', variant: 'info', hint: 'Đơn vị vận chuyển đang giao.' },
  self_delivering: { label: 'Đang tự giao', variant: 'info', hint: 'Cửa hàng đang tự giao.' },
  delivered: { label: 'Đã giao', variant: 'success', hint: 'Khách đã nhận hàng.' },
  delivery_failed: {
    label: 'Giao thất bại',
    variant: 'destructive',
    hint: 'Giao không thành công, cần giao lại hoặc hoàn về.',
  },
  returning: { label: 'Đang hoàn', variant: 'warning', hint: 'Kiện đang hoàn về kho.' },
  returned: { label: 'Đã hoàn về kho', variant: 'secondary', hint: 'Kiện đã về kho.' },
  lost: { label: 'Thất lạc', variant: 'destructive', hint: 'Kiện bị thất lạc khi giao.' },
  awaiting_completion: {
    label: 'Chờ hoàn tất',
    variant: 'success',
    hint: 'Mọi kiện đã dừng, đơn chờ đủ điều kiện để hoàn tất.',
  },
  completed: { label: 'Đã hoàn tất', variant: 'success', hint: 'Đơn đã xong.' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary', hint: 'Đơn đã huỷ.' },
};

export const ORDER_FLAGS: Record<OrderFlag, { label: string; variant: BadgeVariant }> = {
  needs_attention: { label: 'Cần xử lý', variant: 'destructive' },
  unmapped_sku: { label: 'Chưa ghép SKU', variant: 'destructive' },
  cancel_requested: { label: 'Khách xin huỷ', variant: 'warning' },
  cancelling: { label: 'Đang huỷ', variant: 'warning' },
  platform_cancelled: { label: 'Sàn đã huỷ', variant: 'warning' },
  due_soon: { label: 'Sắp trễ hạn', variant: 'warning' },
  return_requested: { label: 'Có yêu cầu trả', variant: 'warning' },
  payment_mismatch: { label: 'Lệch tiền', variant: 'destructive' },
  cod_mismatch: { label: 'Lệch COD', variant: 'destructive' },
  shop_disconnected: { label: 'Gian hàng đã ngắt', variant: 'warning' },
};

/** Cờ lọc được ở danh sách đơn: đúng danh sách BE nhận (`payment_mismatch` chỉ hiện trên đơn, lọc thì 422) */
export const FILTERABLE_ORDER_FLAGS: OrderFlag[] = (Object.keys(ORDER_FLAGS) as OrderFlag[]).filter(
  (f) => f !== 'payment_mismatch',
);

export const OUTCOME_LABELS: Record<OrderOutcome, string> = {
  full: 'Giao đủ',
  partial: 'Giao một phần',
  none: 'Không giao được',
};

/** Lý do đơn chưa hoàn tất khi mọi kiện đã dừng */
export const COMPLETION_BLOCKER_LABELS: Record<string, string> = {
  packages_open: 'Còn kiện chưa dừng',
  return_window: 'Chưa hết hạn trả hàng',
  return_requested: 'Còn yêu cầu trả hàng chưa xong',
  cod_unconfirmed: 'Kế toán chưa xác nhận tiền COD',
  all_packages_cancelled: 'Mọi kiện đã huỷ',
};

/**
 * Câu đủ ý cho lý do đơn chưa hoàn tất (FE#282, Documents/25 mục 8.2). Hạn trả lấy `returnWindowEndsAt` của BE
 * (Lazada theo `returnWindowDays` của gian hàng, TikTok null tới khi sàn báo xong), FE không tự tính. Mã lạ không hiện thô
 */
export function completionBlockerText(
  order: { completionBlocker?: string | null; returnWindowEndsAt?: string | null },
  fmt: (iso: string) => string,
): string | null {
  switch (order.completionBlocker) {
    case null:
    case undefined:
    case '':
      return null;
    case 'packages_open':
      return 'Còn kiện chưa xong: chưa giao tới khách, chưa hoàn về kho hoặc chưa huỷ.';
    case 'return_window':
      return order.returnWindowEndsAt
        ? `Khách còn quyền trả hàng tới ${fmt(order.returnWindowEndsAt)}.`
        : 'Sàn chưa báo hết quyền trả hàng của khách.';
    case 'return_requested':
      return 'Còn yêu cầu trả hàng chưa xong.';
    case 'cod_unconfirmed':
      return 'Kế toán chưa xác nhận đã thu tiền COD.';
    case 'all_packages_cancelled':
      return 'Mọi kiện đã huỷ, đơn sẽ chuyển sang Đã huỷ.';
    default:
      return 'Đơn còn việc chưa xong.';
  }
}

/**
 * Người huỷ đơn (FE#282): ưu tiên người huỷ dòng trên sàn; không có thì lấy dòng lịch sử chuyển sang Đã huỷ cuối cùng.
 * Hệ thống tự huỷ khi mọi kiện đã huỷ (commerio-backend#236) ghi lý do "Mọi kiện đã huỷ"
 */
export function orderCancelledBy(order: {
  status: OrderStatus;
  cancelInitiators?: LineCancelInitiator[];
  statusHistory: readonly { to: string; by: { name: string } | null; source: string; reason?: string | null }[];
}): string | null {
  if (order.cancelInitiators?.length) return order.cancelInitiators.map(initiatorLabel).join(', ');
  if (order.status !== 'cancelled') return null;
  const h = [...order.statusHistory].reverse().find((x) => x.to === 'cancelled');
  if (!h) return null;
  if (h.by) return h.by.name;
  if (h.source === 'marketplace') return 'Sàn';
  return h.reason === 'Mọi kiện đã huỷ' ? 'Hệ thống (mọi kiện đã huỷ)' : 'Hệ thống';
}

/**
 * Đơn đã qua hạn bàn giao mà còn kiện chưa rời kho (FE#252): BE bật `due_soon` cả khi đã quá hạn,
 * FE tách ra "Đã trễ hạn bàn giao" theo `shipBy`
 */
export const isOverdue = (o: { flags: readonly string[]; shipBy: string | null }, now: number = Date.now()): boolean =>
  o.flags.includes('due_soon') && Boolean(o.shipBy) && new Date(o.shipBy!).getTime() < now;

export const SOURCE_LABELS: Record<OrderSource, string> = {
  manual: 'Tạo tay',
  inbox: 'Hộp thư',
  marketplace: 'Sàn',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  prepaid: 'Trả trước',
  cod: 'Thu khi giao (COD)',
};

/** Phương thức thanh toán gốc của sàn (Lazada `payment_method`) */
const MARKETPLACE_PAYMENT_LABELS: Record<string, string> = {
  COD: 'COD',
  MIXEDCARD: 'Thẻ',
  CREDIT_CARD: 'Thẻ',
  DEBIT_CARD: 'Thẻ',
  LAZADA_WALLET: 'Ví Lazada',
  WALLET: 'Ví',
  BANK_TRANSFER: 'Chuyển khoản',
  INSTALLMENT: 'Trả góp',
};

/** Nhãn thanh toán: đơn tạo tay theo `paymentMethod`, đơn sàn theo `platformPaymentMethod` gốc; sàn chưa trả thì "Sàn thu hộ" */
export function paymentMethodLabel(o: { paymentMethod: PaymentMethod | null; platformPaymentMethod?: string | null }): string {
  if (o.paymentMethod) return PAYMENT_METHOD_LABELS[o.paymentMethod];
  const raw = o.platformPaymentMethod;
  if (!raw) return 'Sàn thu hộ';
  const key = raw.toUpperCase().replace(/[\s-]+/g, '_');
  return Object.prototype.hasOwnProperty.call(MARKETPLACE_PAYMENT_LABELS, key) ? MARKETPLACE_PAYMENT_LABELS[key]! : raw;
}

const LINE_CANCEL_INITIATOR_LABELS: Record<LineCancelInitiator, string> = {
  buyer: 'khách',
  seller: 'shop',
  platform: 'sàn',
};

/** Ai huỷ hoặc yêu cầu trả; giá trị lạ thì hiện nguyên */
export const initiatorLabel = (v: LineCancelInitiator | string) =>
  Object.prototype.hasOwnProperty.call(LINE_CANCEL_INITIATOR_LABELS, v)
    ? LINE_CANCEL_INITIATOR_LABELS[v as LineCancelInitiator]
    : v;

export const CANCEL_KIND_LABELS: Record<LineCancelKind, string> = {
  cancellation: 'Đã huỷ',
  return: 'Trả hàng',
  refund: 'Hoàn tiền',
  failed_delivery: 'Giao thất bại',
};

/** Dòng có huỷ hoặc trả trên sàn */
export const lineHasIssue = (l: {
  cancelKind?: string | null;
  cancelReason?: string | null;
  cancelInitiator?: string | null;
  returnStatus?: string | null;
  reverseOrderId?: string | null;
}) => Boolean(l.cancelKind || l.cancelReason || l.cancelInitiator || l.returnStatus || l.reverseOrderId);

/**
 * Dòng khách đang xin huỷ, người bán chưa trả lời: đơn còn cờ `cancel_requested`, dòng chưa huỷ thật (không ghi Đã huỷ,
 * không gạch tiền). Sàn ghi người huỷ là khách; hoặc Lazada để trống người huỷ nhưng đã tạo đơn ngược loại CANCEL cho món
 * chưa huỷ (ca thử 17/11, review PR FE#330).
 */
export const lineCancelPending = (
  order: { flags: readonly string[] },
  line: { cancelInitiator?: string | null; cancelKind?: string | null; reverseOrderId?: string | null; cancelledQty?: number },
) =>
  order.flags.includes('cancel_requested') &&
  (line.cancelKind == null || line.cancelKind === 'cancellation') &&
  (line.cancelInitiator === 'buyer' || (!line.cancelInitiator && Boolean(line.reverseOrderId) && !(line.cancelledQty ?? 0)));

/**
 * Món nằm trong một kiện đã giao tới khách (khớp biến thể, không có thì SKU): đơn ngược của món này mới là trả hàng (FE#252)
 */
export const lineDelivered = (
  order: { packages: readonly { status: string; lines: readonly { variantId: string | null; sku: string }[] }[] },
  line: { variantId: string | null; sku: string },
) =>
  order.packages.some(
    (p) =>
      p.status === 'delivered' &&
      p.lines.some((pl) => (line.variantId ? pl.variantId === line.variantId : pl.sku === line.sku)),
  );

/** Phường/xã hiện riêng khi chuỗi địa chỉ (sàn che một phần) chưa ghi rõ */
export function wardNote(a: ShippingAddress): string | null {
  if (!a.ward) return null;
  const norm = (x: string) => x.normalize('NFC').trim().toLocaleLowerCase('vi');
  const ward = norm(a.ward);
  return a.address.split(',').some((part) => norm(part) === ward) ? null : a.ward;
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; variant: BadgeVariant }> = {
  unpaid: { label: 'Chưa thanh toán', variant: 'warning' },
  paid: { label: 'Đã thanh toán', variant: 'success' },
  cod_pending: { label: 'Chờ thu COD', variant: 'info' },
  cod_collected: { label: 'Đã thu COD', variant: 'success' },
  not_collected: { label: 'Không thu', variant: 'secondary' },
};

export const GATEWAY_LABELS: Record<Gateway, string> = {
  vnpay: 'VNPay',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  vietqr: 'VietQR',
};

/** Nguồn đơn: đơn sàn hiện tên gian hàng */
export const sourceLabel = (o: Pick<OrderSummary, 'source' | 'shop'>) =>
  o.source === 'marketplace' && o.shop ? o.shop.shopName : SOURCE_LABELS[o.source];

type CancelLine = Pick<OrderLine, 'id' | 'sku' | 'productName' | 'quantity' | 'unitPrice' | 'cancelledQty' | 'cancelledAt' | 'cancelReason' | 'cancelReasonDetail' | 'cancelInitiator'>;

/** Tiền hàng đã huỷ của đơn (đơn giá × số món đã huỷ), chưa trừ giảm giá; 0 khi chưa huỷ món nào. */
export const cancelledAmountOf = (lines: readonly CancelLine[]) =>
  lines.reduce((sum, l) => sum + l.unitPrice * (l.cancelledQty ?? 0), 0);

/** Mọi món của đơn đã huỷ (BE#417: đơn giữ tiền lúc đặt, không thu). */
export const allLinesCancelled = (lines: readonly CancelLine[]) =>
  lines.length > 0 && lines.every((l) => (l.cancelledQty ?? 0) >= l.quantity);

export interface LineCancelEvent {
  key: string;
  /** Lúc app ghi huỷ món; null với món huỷ trước BE#417 (không có giờ) */
  at: string | null;
  title: string;
  reason: string | null;
  /** Tiền hàng còn lại sau lần huỷ này (đơn giá × món chưa huỷ, chưa trừ giảm giá, chưa cộng phí ship) */
  remaining: number;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Dòng lịch sử "huỷ món" (BE#417), cũ trước mới sau: ai huỷ món nào, bao nhiêu tiền, lý do, tiền hàng còn lại. Để người
 * xem biết vì sao tiền lúc đặt khác tiền còn thu. Món huỷ trước BE#417 không có giờ: xếp trước, `at` null.
 */
export function lineCancelEvents(lines: readonly CancelLine[]): LineCancelEvent[] {
  const cancelled = lines
    .filter((l) => (l.cancelledQty ?? 0) > 0)
    .sort((a, b) => (a.cancelledAt ?? '').localeCompare(b.cancelledAt ?? ''));
  let remaining = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  return cancelled.map((l) => {
    const qty = l.cancelledQty ?? 0;
    remaining -= l.unitPrice * qty;
    const who = l.cancelInitiator ? capitalize(initiatorLabel(l.cancelInitiator)) : 'Sàn';
    const reason = l.cancelReason && l.cancelReasonDetail ? `${l.cancelReason} (${l.cancelReasonDetail})` : l.cancelReason || l.cancelReasonDetail || null;
    return {
      key: l.id,
      at: l.cancelledAt ?? null,
      title: `${who} huỷ ${qty < l.quantity ? `${qty}/${l.quantity} ` : ''}món ${l.productName || l.sku} (${formatCurrency(l.unitPrice * qty)})`,
      reason,
      remaining,
    };
  });
}
