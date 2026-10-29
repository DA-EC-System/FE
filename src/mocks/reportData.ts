/**
 * Dữ liệu giả báo cáo kinh doanh cho MSW (UC-RP-01, FE#13): số theo ngày, theo nguồn và gian hàng của cmp-001.
 * 60 ngày tới hôm nay tính lúc nạp trang, nên luôn có số cho khoảng mặc định 30 ngày. Có ngày trống, một ngày
 * phí sàn chờ đối soát, một ngày lãi âm, một gian hàng đã xoá khỏi kênh. Lãi tính lúc đọc như BE. Dữ liệu giả.
 */

import type { OrderSource } from '@/types/sales';

export interface MockReportRow {
  companyId: string;
  /** yyyy-mm-dd giờ VN */
  day: string;
  source: OrderSource;
  /** Chỉ có với `marketplace` */
  shopId: string | null;
  revenue: number;
  cashCollected: number;
  platformFee: number;
  paymentFee: number;
  shippingFee: number;
  cogs: number;
  feesPending: boolean;
  updatedAt: string;
}

/** Gian hàng đã xoá khỏi kênh: không còn trong `db.shops` nên tên, sàn là `null` */
export const DELETED_SHOP_ID = 'shp-deleted-001';

const DAY_MS = 86_400_000;
const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Số tròn nghìn, đổi theo ngày để biểu đồ không phẳng */
const wave = (i: number, base: number, step: number) => base + ((i * 37 + 11) % 9) * step;

function rowsOfDay(i: number): Omit<MockReportRow, 'companyId' | 'day' | 'updatedAt'>[] {
  // 0 là ngày xa nhất, 59 là hôm nay. Ngày trống: không có đơn nào
  if (i % 11 === 5) return [];
  // Ngày lãi âm (9 ngày trước): chỉ có một đơn tạo tay bán lỗ giá vốn
  if (i === 50) {
    return [
      {
        source: 'manual',
        shopId: null,
        revenue: 300000,
        cashCollected: 300000,
        platformFee: 0,
        paymentFee: 0,
        shippingFee: 30000,
        cogs: 420000,
        feesPending: false,
      },
    ];
  }
  const tiktokRevenue = wave(i, 900000, 120000);
  const shopeeRevenue = wave(i + 3, 600000, 90000);
  const rows: Omit<MockReportRow, 'companyId' | 'day' | 'updatedAt'>[] = [
    {
      source: 'marketplace',
      shopId: 'shp-002',
      revenue: tiktokRevenue,
      cashCollected: tiktokRevenue - 150000,
      // Hôm kia bảng kê TikTok chưa về nên phí sàn đang tính 0
      platformFee: i === 57 ? 0 : Math.round(tiktokRevenue * 0.09),
      paymentFee: 0,
      shippingFee: 30000,
      cogs: Math.round(tiktokRevenue * 0.5),
      feesPending: i === 57,
    },
    {
      source: 'marketplace',
      shopId: 'shp-001',
      revenue: shopeeRevenue,
      cashCollected: shopeeRevenue,
      platformFee: Math.round(shopeeRevenue * 0.08),
      paymentFee: 0,
      shippingFee: 20000,
      cogs: Math.round(shopeeRevenue * 0.55),
      feesPending: false,
    },
    {
      source: 'inbox',
      shopId: null,
      revenue: wave(i + 5, 200000, 50000),
      cashCollected: wave(i + 5, 200000, 50000),
      platformFee: 0,
      paymentFee: 0,
      shippingFee: 25000,
      cogs: Math.round(wave(i + 5, 200000, 50000) * 0.5),
      feesPending: false,
    },
  ];
  if (i % 3 === 0) {
    rows.push({
      source: 'manual',
      shopId: null,
      revenue: wave(i, 150000, 30000),
      cashCollected: 0,
      platformFee: 0,
      paymentFee: 0,
      shippingFee: 0,
      cogs: Math.round(wave(i, 150000, 30000) * 0.6),
      feesPending: false,
    });
  }
  // Gian hàng đã xoá chỉ có số tới 20 ngày trước, nên vẫn có trong khoảng 30 ngày mặc định
  if (i < 40 && i % 2 === 0) {
    rows.push({
      source: 'marketplace',
      shopId: DELETED_SHOP_ID,
      revenue: 250000,
      cashCollected: 250000,
      platformFee: 20000,
      paymentFee: 0,
      shippingFee: 15000,
      cogs: 140000,
      feesPending: false,
    });
  }
  return rows;
}

function build(): MockReportRow[] {
  const today = vnToday();
  const rows: MockReportRow[] = [];
  for (let i = 0; i < 60; i++) {
    const day = addDays(today, i - 59);
    // Số của ngày được tính lại lúc 10:00 giờ VN; hôm nay thì tính 5 phút trước
    const updatedAt = i === 59 ? new Date(Date.now() - 5 * 60_000).toISOString() : `${day}T03:00:00.000Z`;
    for (const r of rowsOfDay(i)) rows.push({ companyId: 'cmp-001', day, updatedAt, ...r });
  }
  return rows;
}

export const reportRows: MockReportRow[] = build();
