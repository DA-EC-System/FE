/** Checklist thiết lập ban đầu (commerio-backend#461, Documents/21 mục 23). BE tính lại mỗi lần gọi, không lưu cờ. */

export type OnboardingKey =
  | 'company_profile'
  | 'invite_staff'
  | 'connect_shop'
  | 'setup_shop'
  | 'first_product'
  | 'opening_stock';

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
