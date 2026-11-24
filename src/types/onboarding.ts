/**
 * Thiết lập ban đầu (commerio-backend#461, #569; Documents/21 mục 23). `done` của từng mục BE tính lại mỗi lần gọi;
 * riêng `completedAt` là cờ đặt một lần qua `POST /onboarding/complete`.
 */

/** Bảy mục bắt buộc theo thứ tự làm (các bước của `/welcome`), rồi ba mục tuỳ chọn (đổi 24/11/2026) */
export type OnboardingKey =
  | 'company_profile'
  | 'connect_shop'
  | 'link_skus'
  | 'assign_groups'
  | 'stock_sync'
  | 'order_cutoff'
  | 'opening_stock'
  | 'first_product'
  | 'invite_staff'
  | 'enable_report';

export interface OnboardingItem {
  key: OnboardingKey;
  done: boolean;
  /** Mục tuỳ chọn không tính vào `done`, `total` */
  optional: boolean;
  /** Bản ghi cụ thể cần làm tiếp (gian hàng đang thiết lập, phiếu đầu kỳ); null thì FE dẫn tới danh sách hoặc tạo mới */
  ref: { type: 'shop' | 'stock_document'; id: string } | null;
}

export interface Onboarding {
  items: OnboardingItem[];
  done: number;
  total: number;
  /** Lúc công ty hoàn tất onboarding (ISO); null là chưa hoàn tất */
  completedAt: string | null;
  /** Mục bắt buộc chưa xong đầu tiên của cả công ty (không lọc quyền); `mine` là người gọi làm được mục đó */
  next: { key: OnboardingKey; mine: boolean } | null;
  /** BE tính: true thì mọi route công ty đưa về `/welcome` */
  mustWizard: boolean;
}

export interface OnboardingCompleted {
  completedAt: string;
}
