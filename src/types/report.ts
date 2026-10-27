/**
 * Report types — báo cáo kinh doanh, lãi theo gian hàng, chuỗi theo ngày (UC-RP-01, UC-RP-02).
 * Hợp đồng theo Documents/21 mục 12.7, 12.8, BE ở commerio-backend#29 (PR #60).
 */

import type { OrderSource } from './sales';

/** Tiền là số nguyên đồng. `cogs`, `profit` là `null` khi người xem thiếu `inventory.cost.view` */
export interface ReportFigures {
  revenue: number;
  cashCollected: number;
  platformFee: number;
  paymentFee: number;
  shippingFee: number;
  cogs: number | null;
  profit: number | null;
  /** Có ngày chưa đối soát nên phí sàn đang tính 0 */
  feesPending: boolean;
}

interface ReportHead {
  /** yyyy-mm-dd giờ VN, khoảng BE thực dùng (mặc định 30 ngày tới hôm nay) */
  from: string;
  to: string;
  /** Lần tính lại gần nhất; `null` khi khoảng chưa có số */
  asOf: string | null;
}

export type ReportOverview = ReportHead & ReportFigures;

export interface ShopFigures extends ReportFigures {
  source: OrderSource;
  /** `null` với hộp thư, đơn tạo tay; gian hàng đã xoá khỏi kênh thì `shopName`, `platform` là `null` */
  shop: { id: string; shopName: string | null; platform: string | null } | null;
}

export interface ReportShops extends ReportHead {
  items: ShopFigures[];
  total: ReportFigures;
}

export interface DailyFigures extends ReportFigures {
  day: string;
}

export interface ReportDaily extends ReportHead {
  items: DailyFigures[];
}

export type ReportKind = 'overview' | 'shops' | 'daily';
