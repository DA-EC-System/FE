import type {
  OrderFlag,
  OrderOutcome,
  OrderSource,
  OrderStage,
  OrderStatus,
  LineCancelInitiator,
  LineCancelKind,
  OrderSummary,
  PaymentMethod,
  ShippingAddress,
} from '@/types/sales';
import type { Gateway, PaymentStatus } from '@/types/payment';

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
