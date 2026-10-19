import { z } from 'zod';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import type { CustomerChannel, OrderSource, OrderStatus, OrderSummary, PaymentMethod } from '@/types/sales';
import type { Gateway, LinkStatus, PaymentStatus, RefundStatus } from '@/types/payment';

export type BadgeVariant = 'secondary' | 'success' | 'warning' | 'info' | 'destructive' | 'outline';

export const MAX_LINE_QTY = 9999;
export const PHONE_RE = /^0\d{9}$/;

export const ORDER_STATUS: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  pending_confirmation: { label: 'Chờ xác nhận', variant: 'warning' },
  confirmed: { label: 'Đã xác nhận', variant: 'info' },
  picking: { label: 'Đang lấy hàng', variant: 'info' },
  packing: { label: 'Đang đóng gói', variant: 'info' },
  issued: { label: 'Đã xuất kho', variant: 'info' },
  in_transit: { label: 'Đang giao', variant: 'info' },
  delivered: { label: 'Đã giao', variant: 'success' },
  delivery_failed: { label: 'Giao không thành công', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
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

export const CHANNEL_LABELS: Record<CustomerChannel, string> = {
  ...PLATFORM_LABELS,
  tiktok: 'TikTok',
  manual: 'Tạo tay',
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; variant: BadgeVariant }> = {
  unpaid: { label: 'Chưa thanh toán', variant: 'warning' },
  paid: { label: 'Đã thanh toán', variant: 'success' },
  cod_pending: { label: 'Chờ thu COD', variant: 'info' },
  cod_collected: { label: 'Đã thu COD', variant: 'success' },
  not_collected: { label: 'Không thu', variant: 'secondary' },
};

export const REFUND_LABELS: Record<RefundStatus, string> = {
  none: '',
  pending_refund: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
};

export const LINK_STATUS: Record<LinkStatus, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Đang chờ trả', variant: 'info' },
  paid: { label: 'Đã trả', variant: 'success' },
  expired: { label: 'Hết hạn', variant: 'secondary' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
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

// ---------- Biểu mẫu tạo đơn ----------

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Nhập số điện thoại')
  .regex(PHONE_RE, 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0');

/** Ô số nguyên không âm (đồng), cho phép dấu phân cách nghìn */
const feeSchema = z.string().transform((raw, ctx): number => {
  const text = raw.trim().replace(/[\s.,]/g, '');
  if (!text) return 0;
  if (!/^\d+$/.test(text)) {
    ctx.addIssue({ code: 'custom', message: 'Phí giao là số nguyên không âm' });
    return z.NEVER;
  }
  return Number(text);
});

const qtySchema = z.string().transform((raw, ctx): number => {
  const text = raw.trim();
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > MAX_LINE_QTY) {
    ctx.addIssue({ code: 'custom', message: `Số lượng là số nguyên từ 1 đến ${MAX_LINE_QTY}` });
    return z.NEVER;
  }
  return Number(text);
});

export const orderFormSchema = z
  .object({
    customerMode: z.enum(['existing', 'new']),
    customerId: z.string(),
    customerName: z.string().trim(),
    customerPhone: z.string().trim(),
    customerEmail: z
      .string()
      .trim()
      .max(200, 'Tối đa 200 ký tự')
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email không hợp lệ'),
    customerAddress: z.string().trim().max(500),
    recipientName: z.string().trim().min(1, 'Nhập tên người nhận'),
    recipientPhone: phoneSchema,
    address: z.string().trim().min(1, 'Nhập địa chỉ giao').max(500, 'Tối đa 500 ký tự'),
    shippingFee: feeSchema,
    paymentMethod: z.enum(['prepaid', 'cod'], { message: 'Chọn cách thanh toán' }),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
    lines: z
      .array(z.object({ variantId: z.string(), quantity: qtySchema }))
      .min(1, 'Thêm ít nhất một sản phẩm')
      .max(100, 'Tối đa 100 dòng một đơn'),
  })
  .superRefine((f, ctx) => {
    if (f.customerMode === 'existing' && !f.customerId) {
      ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Chọn khách hàng hoặc tạo khách mới' });
    }
    if (f.customerMode === 'new') {
      if (!f.customerName) ctx.addIssue({ code: 'custom', path: ['customerName'], message: 'Nhập tên khách' });
      const phone = phoneSchema.safeParse(f.customerPhone);
      if (!phone.success) {
        ctx.addIssue({ code: 'custom', path: ['customerPhone'], message: phone.error.issues[0].message });
      }
    }
  });

/** Dòng trên form giữ thêm thông tin hiển thị; chỉ variantId, quantity được gửi đi */
export interface OrderLineDraft {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  price: number;
  available: number;
  quantity: string;
}

export interface OrderFormInput {
  customerMode: 'existing' | 'new';
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  shippingFee: string;
  paymentMethod: PaymentMethod | '';
  note: string;
  lines: OrderLineDraft[];
}
export type OrderFormOutput = z.output<typeof orderFormSchema>;

/** Số nguyên từ ô nhập; không hợp lệ thì 0 (chỉ để tính tạm trên màn hình) */
export const parseIntOr0 = (raw: string) => {
  const text = raw.trim().replace(/[\s.,]/g, '');
  return /^\d+$/.test(text) ? Number(text) : 0;
};
