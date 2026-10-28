/**
 * Dữ liệu giả sales.* theo ERD cho MSW: khách hàng, đơn, dòng đơn, lịch sử trạng thái.
 * Đơn DH-1001, DH-1002, DH-2001 trùng với đơn giao không thành công ở inventoryData để số liệu khớp.
 * FE#59: seed viết theo trạng thái cũ (9 trạng thái) rồi chuyển sang đơn 4 trạng thái + kiện (sơ đồ D1, D2);
 * số Đang giữ, Thiếu hàng của tồn kho tính từ kiện.
 */

import type { OpenPurpose, PackageStatus } from '@/types/fulfillment';
import type {
  CustomerChannel,
  CustomerIdentity,
  OrderFlag,
  OrderOutcome,
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
  /** Rỗng khi dòng đơn sàn chưa ghép SKU */
  variantId: string;
  /** sku, tên sản phẩm, giá ghi cứng lúc tạo đơn (QT-12) */
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** SKU sàn khi chưa ghép */
  externalSku?: string | null;
}

export interface MockStatusChange<S extends string = OrderStatus> {
  from: S | null;
  to: S;
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
  /** Cờ lưu; Sắp trễ hạn, Gian hàng mất kết nối tính lúc đọc */
  flags: OrderFlag[];
  outcome: OrderOutcome | null;
  rawMarketplaceStatus: string | null;
  /** Hạn bàn giao do sàn đặt; đơn tạo tay không có */
  shipBy: string | null;
  paymentMethod: PaymentMethod | null;
  shippingAddress: ShippingAddress;
  shippingFee: number;
  note: string;
  cancelReason: string | null;
  invoiceNumber: string | null;
  lines: MockOrderLine[];
  history: MockStatusChange[];
  createdAt: string;
  createdBy: string | null;
  version: number;
}

export interface MockLostReport {
  by: string;
  at: string;
  claimCode: string;
}

/** Kiện (sơ đồ D2): giữ hàng nguyên kiện, đóng gói, bàn giao, giao, hoàn */
export interface MockPackage {
  id: string;
  companyId: string;
  code: string;
  orderId: string;
  status: PackageStatus;
  lines: { variantId: string; quantity: number }[];
  selfDelivery: boolean;
  needsOpen: boolean;
  openPurpose: OpenPurpose | null;
  needsAttention: boolean;
  flagNote: string | null;
  trackingCode: string | null;
  platformPackageCode: string | null;
  /** Đơn vị vận chuyển chọn lúc đóng gói kiện sàn */
  carrier: { code: string; name: string } | null;
  lostReport: MockLostReport | null;
  handedOverAt: string | null;
  handedOverBy: string | null;
  deliveredAt: string | null;
  /** Người tự giao */
  deliveredBy: string | null;
  createdAt: string;
  history: MockStatusChange<PackageStatus>[];
  version: number;
}

/** Trạng thái đơn trước FE#59, chỉ dùng để viết seed */
type LegacyStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'picking'
  | 'packing'
  | 'issued'
  | 'in_transit'
  | 'delivered'
  | 'delivery_failed'
  | 'cancelled';

type SeedOrder = Omit<MockOrder, 'status' | 'flags' | 'outcome' | 'rawMarketplaceStatus' | 'shipBy' | 'history' | 'invoiceNumber'> & {
  status: LegacyStatus;
  isShortStock: boolean;
  history: MockStatusChange<LegacyStatus>[];
};

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

const seed: SeedOrder[] = [
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
  // Chờ xác nhận, COD, thiếu hàng (prd-001-v4 tồn 10, cần 12): kiện Thiếu hàng
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
    lines: [line(5, 'prd-001-v4', 12, 150000), line(6, 'prd-002-v1', 1, 320000)],
    history: [{ from: null, to: 'pending_confirmation', at: '2026-10-17T06:00:00.000Z', by: SALE }],
    createdAt: '2026-10-17T06:00:00.000Z',
    createdBy: SALE,
    version: 1,
  },
  // Đơn sàn đã giữ đủ hàng, chờ đóng gói: không có nút xác nhận, không có khung thanh toán
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
  // FE#12: ba đơn COD đã giao chờ kế toán xác nhận tiền, một đơn đã thu (UC-PF-04)
  {
    id: 'ord-1018',
    companyId: 'cmp-001',
    code: 'DH-1018',
    source: 'manual',
    shopId: null,
    customerId: an.id,
    status: 'delivered',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(an),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(23, 'prd-001-v1', 1, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-09T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-09T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-10T01:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-10T02:00:00.000Z', by: KHO },
      { from: 'packing', to: 'issued', at: '2026-10-10T03:00:00.000Z', by: KHO },
      { from: 'issued', to: 'delivered', at: '2026-10-11T09:00:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-09T02:00:00.000Z',
    createdBy: SALE,
    version: 6,
  },
  {
    id: 'ord-1019',
    companyId: 'cmp-001',
    code: 'DH-1019',
    source: 'manual',
    shopId: null,
    customerId: binh.id,
    status: 'delivered',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(binh),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(24, 'prd-002-v2', 2, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-10T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-10T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-11T01:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-11T02:00:00.000Z', by: KHO },
      { from: 'packing', to: 'issued', at: '2026-10-11T03:00:00.000Z', by: KHO },
      { from: 'issued', to: 'delivered', at: '2026-10-12T09:00:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-10T02:00:00.000Z',
    createdBy: SALE,
    version: 6,
  },
  {
    id: 'ord-1020',
    companyId: 'cmp-001',
    code: 'DH-1020',
    source: 'manual',
    shopId: null,
    customerId: dung.id,
    status: 'delivered',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(dung),
    shippingFee: 0,
    note: '',
    cancelReason: null,
    lines: [line(25, 'prd-003-v1', 1, 180000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-11T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-11T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-12T01:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-12T02:00:00.000Z', by: KHO },
      { from: 'packing', to: 'issued', at: '2026-10-12T03:00:00.000Z', by: KHO },
      { from: 'issued', to: 'delivered', at: '2026-10-13T09:00:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-11T02:00:00.000Z',
    createdBy: SALE,
    version: 6,
  },
  {
    id: 'ord-1021',
    companyId: 'cmp-001',
    code: 'DH-1021',
    source: 'manual',
    shopId: null,
    customerId: chau.id,
    status: 'delivered',
    isShortStock: false,
    paymentMethod: 'cod',
    shippingAddress: ship(chau),
    shippingFee: 30000,
    note: '',
    cancelReason: null,
    lines: [line(26, 'prd-001-v2', 2, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-05T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-05T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'picking', at: '2026-10-06T01:00:00.000Z', by: KHO },
      { from: 'picking', to: 'packing', at: '2026-10-06T02:00:00.000Z', by: KHO },
      { from: 'packing', to: 'issued', at: '2026-10-06T03:00:00.000Z', by: KHO },
      { from: 'issued', to: 'delivered', at: '2026-10-07T09:00:00.000Z', by: SALE },
    ],
    createdAt: '2026-10-05T02:00:00.000Z',
    createdBy: SALE,
    version: 6,
  },
  // FE#12: đơn trả trước đã thu rồi huỷ — hai đơn chờ hoàn, một đơn đã hoàn (UC-PF-06)
  {
    id: 'ord-1022',
    companyId: 'cmp-001',
    code: 'DH-1022',
    source: 'manual',
    shopId: null,
    customerId: an.id,
    status: 'cancelled',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(an),
    shippingFee: 30000,
    note: '',
    cancelReason: 'Khách đổi ý',
    lines: [line(27, 'prd-002-v1', 1, 320000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-12T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-12T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'cancelled', at: '2026-10-13T03:00:00.000Z', by: SALE, reason: 'Khách đổi ý' },
    ],
    createdAt: '2026-10-12T02:00:00.000Z',
    createdBy: SALE,
    version: 3,
  },
  {
    id: 'ord-1023',
    companyId: 'cmp-001',
    code: 'DH-1023',
    source: 'manual',
    shopId: null,
    customerId: dung.id,
    status: 'cancelled',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(dung),
    shippingFee: 0,
    note: '',
    cancelReason: 'Hết hàng màu khách chọn',
    lines: [line(28, 'prd-003-v1', 1, 180000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-13T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-13T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'cancelled', at: '2026-10-14T03:00:00.000Z', by: SALE, reason: 'Hết hàng màu khách chọn' },
    ],
    createdAt: '2026-10-13T02:00:00.000Z',
    createdBy: SALE,
    version: 3,
  },
  {
    id: 'ord-1024',
    companyId: 'cmp-001',
    code: 'DH-1024',
    source: 'manual',
    shopId: null,
    customerId: binh.id,
    status: 'cancelled',
    isShortStock: false,
    paymentMethod: 'prepaid',
    shippingAddress: ship(binh),
    shippingFee: 30000,
    note: '',
    cancelReason: 'Khách đặt trùng',
    lines: [line(29, 'prd-001-v1', 1, 150000)],
    history: [
      { from: null, to: 'pending_confirmation', at: '2026-10-06T02:00:00.000Z', by: SALE },
      { from: 'pending_confirmation', to: 'confirmed', at: '2026-10-06T02:10:00.000Z', by: SALE },
      { from: 'confirmed', to: 'cancelled', at: '2026-10-07T03:00:00.000Z', by: SALE, reason: 'Khách đặt trùng' },
    ],
    createdAt: '2026-10-06T02:00:00.000Z',
    createdBy: SALE,
    version: 3,
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

// ---------- Chuyển seed sang đơn + kiện (FE#59) ----------

const HOUR = 3600_000;
const plus = (at: string, hours: number) => new Date(Date.parse(at) + hours * HOUR).toISOString();

/** Đơn trả trước chưa trả: vẫn Chưa thanh toán */
const UNPAID_PREPAID = new Set(['ord-1007', 'ord-1014']);
/** Đơn COD đã thu và hết hạn trả: Đã hoàn tất */
const COMPLETED = new Set(['ord-1021']);
/** Giờ bàn giao của đơn giao thất bại (khớp phiếu xuất ở inventoryData) */
const FAILED_HANDOVER: Record<string, string> = {
  'ord-1001': '2026-10-08T07:00:00.000Z',
  'ord-1002': '2026-10-09T07:00:00.000Z',
  'ord-2001': '2026-10-08T07:00:00.000Z',
};
/** Trạng thái gốc trên sàn */
const RAW: Record<string, string> = {
  'ord-1002': 'TO_RETURN',
  'ord-1005': 'AWAITING_SHIPMENT',
  'ord-1012': 'READY_TO_SHIP',
  'ord-1015': 'AWAITING_COLLECTION',
};

function orderStatusOf(o: SeedOrder): OrderStatus {
  if (o.status === 'cancelled') return 'cancelled';
  if (COMPLETED.has(o.id)) return 'completed';
  if (o.source === 'marketplace') return 'processing';
  if (o.status === 'pending_confirmation' || UNPAID_PREPAID.has(o.id)) return 'unpaid';
  return 'processing';
}

function orderHistory(o: SeedOrder, status: OrderStatus): MockStatusChange[] {
  const first = o.source === 'marketplace' ? 'processing' : 'unpaid';
  const h: MockStatusChange[] = [{ from: null, to: first, at: o.createdAt, by: o.createdBy }];
  const confirm = o.history.find((x) => x.from === 'pending_confirmation' && x.to === 'confirmed');
  if (first === 'unpaid' && confirm && status !== 'unpaid') {
    // Trả trước: chuyển khi khách trả; COD: người bán xác nhận
    h.push(
      o.paymentMethod === 'prepaid'
        ? { from: 'unpaid', to: 'processing', at: confirm.at, by: null, source: 'system' }
        : { from: 'unpaid', to: 'processing', at: confirm.at, by: confirm.by },
    );
  }
  const cancel = o.history.find((x) => x.to === 'cancelled');
  if (cancel) h.push({ from: h[h.length - 1].to, to: 'cancelled', at: cancel.at, by: cancel.by, reason: cancel.reason });
  const delivered = o.history.find((x) => x.to === 'delivered');
  if (status === 'completed' && delivered) {
    h.push({ from: 'processing', to: 'completed', at: plus(delivered.at, 24 * 7 + 1), by: null, source: 'system' });
  }
  return h;
}

let packageSeq = 0;
const packageCode = () => `KH-${String(++packageSeq).padStart(6, '0')}`;

function seedPackage(o: SeedOrder, lines: MockPackage['lines'], target: PackageStatus): MockPackage {
  const at = (s: LegacyStatus) => o.history.find((x) => x.to === s)?.at ?? null;
  const confirmAt = at('confirmed') ?? o.createdAt;
  const selfDelivery = o.source === 'inbox';
  const h: MockStatusChange<PackageStatus>[] = [];
  const step = (to: PackageStatus, when: string, by: string | null, reason?: string | null) =>
    h.push({ from: h.length ? h[h.length - 1].to : null, to, at: when, by, reason });
  const held = target !== 'backordered';
  step(held ? 'reserved' : 'backordered', o.createdAt, null);
  const pkg: MockPackage = {
    id: `pkg-${o.id.slice(4)}${lines === o.lines ? '' : `-${packageSeq + 1}`}`,
    companyId: o.companyId,
    code: packageCode(),
    orderId: o.id,
    status: target,
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    selfDelivery,
    needsOpen: false,
    openPurpose: null,
    needsAttention: false,
    flagNote: null,
    trackingCode: null,
    platformPackageCode: o.source === 'marketplace' ? `PK${o.code.slice(3)}${packageSeq}` : null,
    carrier: null,
    lostReport: null,
    handedOverAt: null,
    handedOverBy: null,
    deliveredAt: null,
    deliveredBy: null,
    createdAt: o.createdAt,
    history: h,
    version: 1,
  };
  if (target === 'cancelled') {
    step('cancelled', at('cancelled') ?? confirmAt, null, 'Huỷ đơn');
  }
  const RANK: PackageStatus[] = ['packed', 'awaiting_pickup', 'in_transit', 'self_delivering', 'delivered', 'returned'];
  if (!RANK.includes(target)) return finish(pkg);

  const handover = FAILED_HANDOVER[o.id] ?? at('issued') ?? plus(confirmAt, 20);
  step('packed', plus(handover, -1), KHO);
  if (o.source === 'marketplace') pkg.carrier = SEED_CARRIER[o.shopId ?? ''] ?? null;
  if (target === 'packed') return finish(pkg);
  if (selfDelivery) {
    const left = at('in_transit') ?? handover;
    step('self_delivering', left, SALE);
    pkg.handedOverAt = left;
    pkg.handedOverBy = SALE;
    pkg.deliveredBy = SALE;
  } else {
    step('awaiting_pickup', plus(handover, -0.5), KHO);
    pkg.trackingCode = `VD${o.code.slice(3)}${packageSeq}`;
    if (target === 'awaiting_pickup') return finish(pkg);
    step('in_transit', handover, KHO);
    pkg.handedOverAt = handover;
    pkg.handedOverBy = KHO;
  }
  const deliveredAt = at('delivered');
  if (target === 'delivered' && deliveredAt) {
    step('delivered', deliveredAt, o.source === 'marketplace' ? null : SALE);
    pkg.deliveredAt = deliveredAt;
  }
  const failed = o.history.find((x) => x.to === 'delivery_failed');
  if (target === 'returned' && failed) {
    step('delivery_failed', failed.at, failed.by, failed.reason);
    step('returning', plus(failed.at, 1), null);
    step('returned', plus(failed.at, 24), KHO);
  }
  return finish(pkg);
}

/** Phiên bản bằng số lần chuyển trạng thái */
function finish(p: MockPackage) {
  p.version = p.history.length;
  return p;
}

function packageStatusOf(o: SeedOrder): PackageStatus {
  switch (o.status) {
    case 'pending_confirmation':
      return o.id === 'ord-1004' ? 'backordered' : 'reserved';
    case 'confirmed':
    case 'picking':
      return 'reserved';
    case 'packing':
      return o.source === 'marketplace' ? 'awaiting_pickup' : 'reserved';
    case 'issued':
      return 'in_transit';
    case 'in_transit':
      return o.source === 'inbox' ? 'self_delivering' : 'in_transit';
    case 'delivered':
      return 'delivered';
    case 'delivery_failed':
      return 'returned';
    case 'cancelled':
      return 'cancelled';
  }
}

/** Đơn vị vận chuyển của kiện sàn đã đóng gói trong seed, theo gian hàng */
const SEED_CARRIER: Record<string, MockPackage['carrier']> = {
  'shp-001': { code: 'SPX', name: 'SPX Express' },
  'shp-002': { code: 'JT', name: 'J&T Express' },
  'shp-003': { code: 'LEX', name: 'LEX VN' },
};

/** Đơn sàn khách đang xin huỷ (§19.3) */
const CANCEL_REQUESTED = ['ord-1015'];
/** Số hoá đơn đã nhập */
const INVOICES: Record<string, string> = { 'ord-1015': 'HD-2026-0015' };

export const seedPackages: MockPackage[] = [];

export const orders: MockOrder[] = seed.map((o) => {
  const status = orderStatusOf(o);
  if (o.id === 'ord-1012') {
    // Đơn sàn chia hai kiện: áo đã đóng gói, quần còn chờ đóng gói
    const a = seedPackage(o, [o.lines[0]], 'packed');
    const b = seedPackage(o, [o.lines[1]], 'reserved');
    seedPackages.push(a, b);
  } else {
    seedPackages.push(seedPackage(o, o.lines, packageStatusOf(o)));
  }
  const { isShortStock: _short, history: _legacy, status: _legacyStatus, ...rest } = o;
  return {
    ...rest,
    status,
    flags: CANCEL_REQUESTED.includes(o.id) ? ['cancel_requested'] : [],
    outcome: status === 'completed' ? 'full' : null,
    invoiceNumber: INVOICES[o.id] ?? null,
    rawMarketplaceStatus: RAW[o.id] ?? null,
    shipBy: o.source === 'marketplace' ? plus(o.createdAt, 48) : null,
    history: orderHistory(o, status),
  };
});

/** Mã kiện đánh chung mọi công ty (KH-000001), tiếp sau seed */
export const nextPackageCode = packageCode;

/** Bộ đếm mã đơn theo công ty (đề xuất DH-000001); seed đã dùng tới 1024 */
export const orderCounters: Record<string, number> = { 'cmp-001': 1024, 'cmp-002': 2001 };

export function nextOrderCode(companyId: string) {
  const n = (orderCounters[companyId] ?? 0) + 1;
  orderCounters[companyId] = n;
  return `DH-${String(n).padStart(6, '0')}`;
}

export const subtotalOf = (o: MockOrder) => o.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
export const totalOf = (o: MockOrder) => subtotalOf(o) + o.shippingFee;
