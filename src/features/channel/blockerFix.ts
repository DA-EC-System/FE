import { platformFieldId, platformSectionId, SHARED_TARGETS } from '@/features/catalog/productTabs';
import { ROUTES } from '@/router/routes';
import type { BlockerTarget } from '@/types/blocker';

/**
 * Nút tới đúng chỗ sửa của một mục chặn hay lỗi đẩy, chọn theo `target` BE trả (FE#462, Documents/21 §18.10). Hàm thuần:
 * chỗ gọi tự kiểm quyền theo `perm` rồi điều hướng tới `to`.
 *
 * - `variant_field` → hộp Thông tin SKU của biến thể (`?spec=`);
 * - `category`, `spec_attribute`, `axis` → tab sàn của trang sản phẩm, đúng ô;
 * - `product_field` → tab Nội bộ, đúng ô;
 * - `shop.fee_config` → Phí sàn; `shop.category_permission` → ô category để đổi (xin quyền thì trên Seller Center);
 * - `platform_product` → tab sàn (phần giá và tồn theo gian hàng); `listing` → trang gian hàng.
 */
export interface BlockerFix {
  label: string;
  to: string;
  /** Quyền cần có để hiện nút: sửa sản phẩm, sửa phí, hoặc ai xem được trang cũng bấm được */
  perm: 'product' | 'finance' | null;
}

export interface BlockerFixContext {
  companyId: string;
  productId: string;
  /** Sàn của gian hàng; thiếu thì không dựng được lối tới tab sàn */
  platform?: string | null;
  shopId?: string | null;
  /** Biến thể của lỗi (lỗi đẩy) hoặc biến thể đầu của mục chặn */
  variantId?: string | null;
}

const VARIANT_FIELD_LABEL = { price: 'Sửa giá', weight: 'Sửa cân nặng', dimensions: 'Sửa kích thước' } as const;

const PRODUCT_FIELD = {
  images: { label: 'Sửa ảnh', id: SHARED_TARGETS.images },
  variantImages: { label: 'Thêm ảnh biến thể', id: SHARED_TARGETS.variants },
  sizeChart: { label: 'Thêm bảng kích cỡ', id: SHARED_TARGETS.sizeChart },
  name: { label: 'Sửa tên', id: SHARED_TARGETS.name },
} as const;

export function blockerFix(target: BlockerTarget | null | undefined, ctx: BlockerFixContext): BlockerFix | null {
  if (!target) return null;
  const { companyId, productId, platform } = ctx;
  const product = (at?: { spec?: string; tab?: string; focus?: string }) =>
    ROUTES.company.catalogProduct(companyId, productId, at);
  const onTab = (label: string, focus: string): BlockerFix | null =>
    platform ? { label, to: product({ tab: platform, focus }), perm: 'product' } : null;

  switch (target.kind) {
    case 'variant_field':
      return {
        label: VARIANT_FIELD_LABEL[target.field],
        to: ctx.variantId ? product({ spec: ctx.variantId }) : product({ focus: SHARED_TARGETS.variants }),
        perm: 'product',
      };
    case 'product_field': {
      const f = PRODUCT_FIELD[target.field];
      return { label: f.label, to: product({ focus: f.id }), perm: 'product' };
    }
    case 'category':
      return platform ? onTab('Chọn category', platformFieldId(platform, 'category')) : null;
    case 'spec_attribute':
      return platform ? onTab('Sửa attribute', platformFieldId(platform, target.attributeCode)) : null;
    case 'axis':
      return platform ? onTab('Sửa thuộc tính biến thể', platformSectionId(platform, 'attrs')) : null;
    case 'shop':
      return target.field === 'fee_config'
        ? { label: 'Cài phí sàn', to: ROUTES.company.financeConfigs(companyId), perm: 'finance' }
        : platform
          ? onTab('Đổi category', platformFieldId(platform, 'category'))
          : null;
    case 'platform_product':
      return platform ? onTab('Xem trên tab sàn', platformSectionId(platform, 'sales')) : null;
    case 'listing':
      return ctx.shopId ? { label: 'Xem ở gian hàng', to: ROUTES.company.shop(companyId, ctx.shopId), perm: null } : null;
  }
}

/** Hiện nút sửa khi người dùng có quyền tương ứng */
export function canUseFix(fix: BlockerFix, can: { product: boolean; finance: boolean }): boolean {
  return fix.perm === null || can[fix.perm];
}
