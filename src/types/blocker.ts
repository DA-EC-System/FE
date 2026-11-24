/**
 * Mục chặn đẩy listing dùng chung cho readiness, push, push-preview và lỗi đẩy của sàn (commerio-backend#564, #566, #567;
 * Documents/21 §18.10). FE chỉ đọc `target` để chọn nút tới đúng chỗ sửa, câu hiện là `label`/`message` BE dựng.
 */

/** Chỗ sửa của một mục chặn (21 §18.10 `BlockerTarget`, cộng `listing` của §18.11) */
export type BlockerTarget =
  | { kind: 'category' }
  | { kind: 'spec_attribute'; attributeCode: string }
  | { kind: 'axis'; attributeId?: string }
  | { kind: 'variant_field'; field: 'price' | 'weight' | 'dimensions' }
  | { kind: 'product_field'; field: 'images' | 'variantImages' | 'sizeChart' | 'name' }
  | { kind: 'shop'; field: 'fee_config' | 'category_permission' }
  | { kind: 'platform_product'; externalProductIds: string[] }
  | { kind: 'listing'; listingId: string | null };

export type BlockerScope = 'common' | 'platform' | 'shop';

/** Mục chặn đã gom theo mã và chỗ sửa trên nhiều biến thể; `variantIds` rỗng khi chặn cả sản phẩm */
export interface Blocker {
  code: string;
  label: string;
  scope: BlockerScope;
  target: BlockerTarget;
  variantIds: string[];
}

/** `data`: sửa được trong app; `platform`: sàn từ chối vì lý do ngoài dữ liệu; `connection`: lỗi tạm */
export type PushErrorKind = 'data' | 'platform' | 'connection';

/** Category của sản phẩm trên sàn theo readiness (21 §18.10 `CategoryState`) */
export interface CategoryState {
  /** `chosen`: đã lưu trong thông tin sàn; `suggested`: gợi ý, chờ người bán xác nhận; `none`: chưa có */
  state: 'chosen' | 'suggested' | 'none';
  externalCategoryId: string | null;
  path: string | null;
  source: 'push' | 'match' | 'group' | 'recent' | null;
  /** null khi attribute của leaf chưa lấy về */
  maxAxes: number | null;
  combinable: boolean | null;
}

/** Readiness đăng một sản phẩm lên một gian hàng (`GET /channel/products/:productId/readiness`, commerio-backend#564) */
export interface ShopReadiness {
  shopId: string;
  shopName: string;
  platform: string;
  status: 'ready' | 'blocked';
  counts: { ready: number; blocked: number; listed: number };
  category: CategoryState;
  /** Mỗi mục thiếu một phần tử; thứ tự: mục theo sàn, mục của SKU, mục của gian hàng */
  blockers: Blocker[];
  variants: { variantId: string; status: 'ready' | 'blocked' | 'listed'; blockerCodes: string[] }[];
}

export interface ProductReadiness {
  items: ShopReadiness[];
}
