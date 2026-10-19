/**
 * Dữ liệu giả sales.* theo ERD cho MSW: khách hàng, đơn, dòng đơn, lịch sử trạng thái.
 * Đơn DH-1001, DH-1002, DH-2001 trùng với đơn giao không thành công ở inventoryData để số liệu khớp.
 * Đơn đã xác nhận trong seed coi như đã nằm trong số đang giữ của tồn kho, không trừ thêm.
 */

import type {
  CustomerChannel,
  CustomerIdentity,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  ShippingAddress,
  StatusChangeSource,
} from '@/types/sales';
import { products } from './catalogData';

export interface MockCustomer {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  channels: CustomerChannel[];
  identities: CustomerIdentity[];
  createdAt: string;
  version: number;
}

export interface MockOrderLine {
  id: string;
  variantId: string;
  /** sku, tên sản phẩm, giá ghi cứng lúc tạo đơn (QT-12) */
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface MockStatusChange {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  by: string | null;
  /** Mặc định: có người làm là 'user', không có thì 'marketplace' với đơn sàn, 'system' với đơn khác */
  source?: StatusChangeSource;
  reason?: string | null;
}

export interface MockOrder {
  id: string;
  companyId: string;
  code: string;
  source: OrderSource;
  shopId: string | null;
  customerId: string | null;
  status: OrderStatus;
  isShortStock: boolean;
  paymentMethod: PaymentMethod | null;
  shippingAddress: ShippingAddress;
  shippingFee: number;
  note: string;
  cancelReason: string | null;
  lines: MockOrderLine[];
  history: MockStatusChange[];
  createdAt: string;
  createdBy: string | null;
  version: number;
}

const SALE = 'acc-002';
const KHO = 'acc-003';

export const customers: MockCustomer[] = [
  {
    id: 'cus-001',
    companyId: 'cmp-001',
    name: 'Nguyễn Văn An',
    phone: '0901234567',
    email: 'an.nguyen@example.com',
    address: '12 Lê Lợi, Quận 1, TP.HCM',
    note: 'Khách quen, thích áo màu tối',
    channels: ['manual', 'tiktok'],
    identities: [{ channelKind: 'tiktok', externalUserId: 'tt-user-7781', displayName: 'an.nguyen' }],
    createdAt: '2026-09-02T03:00:00.000Z',
    version: 1,
  },
  {
    id: 'cus-002',
    companyId: 'cmp-001',
    name: 'Phạm Thị Bình',
    phone: '0912345678',
    email: '',
    address: '45 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội',
    note: '',
    channels: ['shopee'],
    identities: [{ channelKind: 'shopee', externalUserId: 'sp-55120', displayName: 'binhpham' }],
    createdAt: '2026-09-15T08:00:00.000Z',
    version: 1,
  },
  {
    id: 'cus-003',
    companyId: 'cmp-001',
    name: 'Trần Minh Châu',
    phone: '0938765432',
    email: 'chau.tran@example.com',
    address: '8 Nguyễn Huệ, Hải Châu, Đà Nẵng',
    note: '',
    channels: ['manual'],
    identities: [],
    createdAt: '2026-10-01T02:00:00.000Z',
    version: 1,
  },
  {
    id: 'cus-004',
    companyId: 'cmp-001',
    name: 'Hoàng Gia Dũng',
    phone: '0977111222',
    email: '',
    address: '3 Hai Bà Trưng, Ninh Kiều, Cần Thơ',
    note: '',
    channels: ['tiktok'],
    identities: [{ channelKind: 'tiktok', externalUserId: 'tt-user-9012', displayName: 'giadung.hg' }],
    createdAt: '2026-10-16T05:00:00.000Z',
    version: 1,
  },
  {
    id: 'cus-101',
    companyId: 'cmp-002',
    name: 'Lý Văn Cường',
    phone: '0987654321',
    email: '',
    address: '20 Phan Chu Trinh, Huế',
    note: '',
    channels: ['manual'],
    identities: [],
    createdAt: '2026-09-20T02:00:00.000Z',
    version: 1,
  },
];

function line(n: number, variantId: string, quantity: number, unitPrice: number): MockOrderLine {
  const product = products.find((p) => p.variants.some((v) => v.id === variantId));
  const variant = product?.variants.find((v) => v.id === variantId);
  return {
    id: `orl-${n}`,
    variantId,
    sku: variant?.sku ?? variantId,
    productName: product?.name ?? '',
    quantity,
    unitPrice,
  };
}

const ship = (c: MockCustomer): ShippingAddress => ({ name: c.name, phone: c.phone, address: c.address });
const [an, binh, chau, dung, cuong] = customers;

export const orders: MockOrder[] = [
  {
    id: 'ord-1001',
    companyId: 'cmp-001',
    code: 'DH-1001',
    source: 'manual',
    shopId: null,
    customerId: an.id,
    status: 'delivery_failed',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(an),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(1, 'prd-001-v1', 2, 150000), line(2, 'prd-002-v3', 3, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-08T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-08T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'delivery_failed', at: '2026-10-12T09:00:00.000Z', by: null, reason: 'Khách từ chối nhận hàng' },
    ],
    createdAt: '2026-10-08T02:00:00.000Z',
    createdBy: SALE,
    version: 3,
  },
  {
    id: 'ord-1002',
    companyId: 'cmp-001',
    code: 'DH-1002',
    source: 'marketplace',
    shopId: 'shp-001',
    customerId: binh.id,
    status: 'delivery_failed',
    isShortStock: false,
    paymentMethod: null,
    shippingAddress: ship(binh),
    shippingFee: 0,
    note: '',
    cancelReason: null,
    lines: [line(3, 'prd-003-v1', 1, 180000)],
    history: [
      { from: null, to: 'confirmed', at: '2026-10-09T04:00:00.000Z', by: null },
      { from: 'confirmed', to: 'delivery_failed', at: '2026-10-13T10:30:00.000Z', by: null, reason: 'Không liên lạc được người nhận' },
    ],
    createdAt: '2026-10-09T04:00:00.000Z',
    createdBy: null,
    version: 2,
  },
  // Chờ xác nhận, đủ hàng, trả trước: xác nhận và tạo mã thanh toán
  {
    id: 'ord-1003',
    companyId: 'cmp-001',
    code: 'DH-1003',
    source: 'manual',
    shopId: null,
    customerId: chau.id,
    status: 'pending_confirmation',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(chau),
    shippingFee: 30000,
    note: 'Giao giờ hành chính',
    cancelReason: null,
    lines: [line(4, 'prd-001-v1', 2, 150000)],
    history: [{ from: null, to: 'pending_confirmation', at: '2026-10-17T03:00:00.000Z', by: SALE }],
    createdAt: '2026-10-17T03:00:00.000Z',
    createdBy: SALE,
    version: 1,
  },
  // Chờ xác nhận, COD, thiếu hàng (prd-001-v4 còn 4): xác nhận bị 409 insufficient_stock
  {
    id: 'ord-1004',
    companyId: 'cmp-001',
    code: 'DH-1004',
    source: 'manual',
    shopId: null,
    customerId: an.id,
    status: 'pending_confirmation',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(an),
    shippingFee: 25000,
    note: '',
    cancelReason: null,
    lines: [line(5, 'prd-001-v4', 6, 150000), line(6, 'prd-002-v1', 1, 320000)],
    history: [{ from: null, to: 'pending_confirmation', at: '2026-10-17T06:00:00.000Z', by: SALE }],
    createdAt: '2026-10-17T06:00:00.000Z',
    createdBy: SALE,
    version: 1,
  },
  // Đơn sàn thiếu hàng: không có nút xác nhận, không có khung thanh toán
  {
    id: 'ord-1005',
    companyId: 'cmp-001',
    code: 'DH-1005',
    source: 'marketplace',
    shopId: 'shp-002',
    customerId: dung.id,
    status: 'pending_confirmation',
    isShortStock: true,
    paymentMethod: null,
    shippingAddress: ship(dung),
    shippingFee: 0,
    note: '',
    cancelReason: null,
    lines: [line(7, 'prd-002-v3', 2, 299000)],
    history: [{ from: null, to: 'pending_confirmation', at: '2026-10-17T08:00:00.000Z', by: null }],
    createdAt: '2026-10-17T08:00:00.000Z',
    createdBy: null,
    version: 1,
  },
  // Đã xác nhận, đã thanh toán qua VNPay
  {
    id: 'ord-1006',
    companyId: 'cmp-001',
    code: 'DH-1006',
    source: 'manual',
    shopId: null,
    customerId: chau.id,
    status: 'confirmed',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(chau),
    shippingFee: 0,
    note: '',
    cancelReason: null,
    lines: [line(8, 'prd-002-v2', 1, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-15T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-15T02:05:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-15T02:00:00.000Z',
    createdBy: SALE,
    version: 2,
  },
  // Đã xác nhận, trả trước, mã VietQR cũ đã hết hạn
  {
    id: 'ord-1007',
    companyId: 'cmp-001',
    code: 'DH-1007',
    source: 'manual',
    shopId: null,
    customerId: an.id,
    status: 'confirmed',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(an),
    shippingFee: 20000,
    note: '',
    cancelReason: null,
    lines: [line(9, 'prd-001-v2', 1, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-16T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-16T02:03:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-16T02:00:00.000Z',
    createdBy: SALE,
    version: 2,
  },
  // Đơn hộp thư, COD, chờ thu
  {
    id: 'ord-1008',
    companyId: 'cmp-001',
    code: 'DH-1008',
    source: 'inbox',
    shopId: null,
    customerId: binh.id,
    status: 'confirmed',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(binh),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(10, 'prd-001-v3', 2, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-14T07:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-14T07:30:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-14T07:00:00.000Z',
    createdBy: SALE,
    version: 2,
  },
  {
    id: 'ord-1009',
    companyId: 'cmp-001',
    code: 'DH-1009',
    source: 'manual',
    shopId: null,
    customerId: chau.id,
    status: 'cancelled',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(chau),
    shippingFee: 0,
    note: '',
    cancelReason: 'Khách đổi ý',
    lines: [line(11, 'prd-001-v1', 1, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-05T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'cancelled', at: '2026-10-05T04:00:00.000Z', by: SALE, reason: 'Khách đổi ý' },
    ],
    createdAt: '2026-10-05T02:00:00.000Z',
    createdBy: SALE,
    version: 2,
  },
  // FE#10: ba đơn trong lô LO-000001 đang nhặt, chung biến thể prd-001-v1
  {
    id: 'ord-1010',
    companyId: 'cmp-001',
    code: 'DH-1010',
    source: 'manual',
    shopId: null,
    customerId: an.id,
    status: 'picking',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(an),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(13, 'prd-001-v1', 1, 150000), line(14, 'prd-002-v1', 1, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-16T01:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-16T01:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-18T01:00:00.000Z', by: KHO },
    ],
    createdAt: '2026-10-16T01:00:00.000Z',
    createdBy: SALE,
    version: 3,
  },
  {
    id: 'ord-1011',
    companyId: 'cmp-001',
    code: 'DH-1011',
    source: 'inbox',
    shopId: null,
    customerId: binh.id,
    status: 'picking',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(binh),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(15, 'prd-001-v1', 2, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-16T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-16T02:20:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-18T01:00:00.000Z', by: KHO },
    ],
    createdAt: '2026-10-16T02:00:00.000Z',
    createdBy: SALE,
    version: 3,
  },
  {
    id: 'ord-1012',
    companyId: 'cmp-001',
    code: 'DH-1012',
    source: 'marketplace',
    shopId: 'shp-001',
    customerId: dung.id,
    status: 'picking',
    isShortStock: false,
    paymentMethod: null,
    shippingAddress: ship(dung),
    shippingFee: 0,
    note: '',
    cancelReason: null,
    lines: [line(16, 'prd-001-v1', 1, 150000), line(17, 'prd-003-v1', 1, 180000)],
    history: [
      { from: null, to: 'confirmed', at: '2026-10-16T05:00:00.000Z', by: null },
      { from: 'confirmed', to: 'picking', at: '2026-10-18T01:00:00.000Z', by: KHO },
    ],
    createdAt: '2026-10-16T05:00:00.000Z',
    createdBy: null,
    version: 2,
  },
  // Chờ nhặt, COD: cùng biến thể với lô LO-000001
  {
    id: 'ord-1013',
    companyId: 'cmp-001',
    code: 'DH-1013',
    source: 'manual',
    shopId: null,
    customerId: dung.id,
    status: 'confirmed',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(dung),
    shippingFee: 25000,
    note: '',
    cancelReason: null,
    lines: [line(18, 'prd-001-v1', 1, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-17T01:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-17T01:05:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-17T01:00:00.000Z',
    createdBy: SALE,
    version: 2,
  },
  // Lô LO-000002 đã nhặt: một đơn trả trước chưa trả tiền, một đơn sàn
  {
    id: 'ord-1014',
    companyId: 'cmp-001',
    code: 'DH-1014',
    source: 'manual',
    shopId: null,
    customerId: chau.id,
    status: 'packing',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(chau),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(19, 'prd-002-v1', 1, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-15T03:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-15T03:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-17T02:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-17T03:00:00.000Z', by: KHO },
    ],
    createdAt: '2026-10-15T03:00:00.000Z',
    createdBy: SALE,
    version: 4,
  },
  {
    id: 'ord-1015',
    companyId: 'cmp-001',
    code: 'DH-1015',
    source: 'marketplace',
    shopId: 'shp-002',
    customerId: an.id,
    status: 'packing',
    isShortStock: false,
    paymentMethod: null,
    shippingAddress: ship(an),
    shippingFee: 0,
    note: '',
    cancelReason: null,
    lines: [line(20, 'prd-003-v1', 2, 180000)],
    history: [
      { from: null, to: 'confirmed', at: '2026-10-15T06:00:00.000Z', by: null },
      { from: 'confirmed', to: 'picking', at: '2026-10-17T02:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-17T03:00:00.000Z', by: KHO },
    ],
    createdAt: '2026-10-15T06:00:00.000Z',
    createdBy: null,
    version: 3,
  },
  // Lô LO-000003 hoàn tất: đơn COD đã xuất kho, đơn COD đang giao
  {
    id: 'ord-1016',
    companyId: 'cmp-001',
    code: 'DH-1016',
    source: 'manual',
    shopId: null,
    customerId: binh.id,
    status: 'issued',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(binh),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(21, 'prd-001-v2', 1, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-13T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-13T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-14T01:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-14T02:00:00.000Z', by: KHO },
      { from: 'packing', to: 'issued', at: '2026-10-14T03:00:00.000Z', by: KHO },
    ],
    createdAt: '2026-10-13T02:00:00.000Z',
    createdBy: SALE,
    version: 5,
  },
  {
    id: 'ord-1017',
    companyId: 'cmp-001',
    code: 'DH-1017',
    source: 'inbox',
    shopId: null,
    customerId: chau.id,
    status: 'in_transit',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(chau),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(22, 'prd-002-v2', 1, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-13T04:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-13T04:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-14T01:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-14T02:00:00.000Z', by: KHO },
      { from: 'packing', to: 'issued', at: '2026-10-14T03:00:00.000Z', by: KHO },
      { from: 'issued', to: 'in_transit', at: '2026-10-15T01:00:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-13T04:00:00.000Z',
    createdBy: SALE,
    version: 6,
  },
  {
    id: 'ord-2001',
    companyId: 'cmp-002',
    code: 'DH-2001',
    source: 'manual',
    shopId: null,
    customerId: cuong.id,
    status: 'delivery_failed',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(cuong),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(12, 'prd-101-v1', 2, 85000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-07T02:00:00.000Z', by: null },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-07T03:00:00.000Z', by: null },
      { from: 'confirmed', to: 'delivery_failed', at: '2026-10-12T09:00:00.000Z', by: null, reason: 'Sai địa chỉ' },
    ],
    createdAt: '2026-10-07T02:00:00.000Z',
    createdBy: null,
    version: 3,
  },
];

/** Bộ đếm mã đơn theo công ty (đề xuất DH-000001); seed đã dùng tới 1017 */
export const orderCounters: Record<string, number> = { 'cmp-001': 1017, 'cmp-002': 2001 };

export function nextOrderCode(companyId: string) {
  const n = (orderCounters[companyId] ?? 0) + 1;
  orderCounters[companyId] = n;
  return `DH-${String(n).padStart(6, '0')}`;
}

export const subtotalOf = (o: MockOrder) => o.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
export const totalOf = (o: MockOrder) => subtotalOf(o) + o.shippingFee;
