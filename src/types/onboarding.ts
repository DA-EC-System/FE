/** Checklist thiết lập ban đầu (commerio-backend#461, Documents/21 mục 23). BE tính lại mỗi lần gọi, không lưu cờ. */

/** Bốn mục bắt buộc theo thứ tự làm (các bước của `/welcome`), rồi ba mục tuỳ chọn (commerio-backend#501) */
export type OnboardingKey =
  | 'company_profile'
  | 'connect_shop'
  | 'setup_shop'
  | 'opening_stock'
  | 'first_product'
  | 'invite_staff'
  | 'enable_report';

export interface OnboardingItem {
  key: OnboardingKey;
  done: boolean;
  /** Mục tuỳ chọn không tính vào `done`, `total` */
  optional: boolean;
  /** Bản ghi cụ thể cần làm tiếp; null thì FE dẫn tới trang danh sách hoặc tạo mới */
  ref: { type: 'shop' | 'stock_document'; id: string } | null;
}

export interface Onboarding {
  items: OnboardingItem[];
  done: number;
  total: number;
}
