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
