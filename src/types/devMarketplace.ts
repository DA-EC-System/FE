import type { Marketplace } from './shop';

/** Một loại sự kiện sàn giả lập phát được (chỉ có với mock) */
export interface MarketplaceEventType {
  type: string;
  label: string;
  description: string;
  /** Phân hệ đăng ký sự kiện, để nhóm trên trang */
  group: string;
  needsShop: boolean;
  /** Bỏ trống: mọi sàn */
  platforms?: Marketplace[];
  /** Ô nhập thêm (gửi trong params theo key), ví dụ SKU để chỉ áp cho một listing */
  param?: { key: string; label: string; placeholder?: string };
}

export interface MarketplaceEventLog {
  id: string;
  at: string;
  companyId: string;
  type: string;
  label: string;
  shopId: string | null;
  /** Kết quả trên dữ liệu, ví dụ "Gian hàng ABC chuyển sang cần kết nối lại" */
  message: string;
}

export interface MarketplaceEventsResponse {
  types: MarketplaceEventType[];
  log: MarketplaceEventLog[];
}

export interface FireMarketplaceEventInput {
  type: string;
  shopId?: string;
  params?: Record<string, string>;
}
