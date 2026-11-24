import { ROUTES } from '@/router/routes';
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';
import { supportedPlatformNames } from '@/lib/platforms';

export interface OnboardingStep {
  key: OnboardingKey;
  label: string;
  hint: string;
  /** Chữ trên nút: động từ + đối tượng, đọc riêng vẫn hiểu (không chỉ "Làm") */
  action: string;
  done: boolean;
  optional: boolean;
  /** Màn làm việc đó (Documents/21 mục 23, cột "FE dẫn tới") */
  to: string;
}

const TEXT: Record<OnboardingKey, { label: string; hint: string; action: string }> = {
  company_profile: { label: 'Hồ sơ công ty', hint: 'Địa chỉ và người chịu trách nhiệm, in trên chứng từ.', action: 'Điền hồ sơ' },
  invite_staff: { label: 'Mời nhân viên', hint: 'Tạo link mời để nhân viên vào làm cùng.', action: 'Mời nhân viên' },
  connect_shop: { label: 'Kết nối gian hàng', hint: `Nối gian hàng ${supportedPlatformNames('hoặc')}.`, action: 'Kết nối gian hàng' },
  link_skus: { label: 'Liên kết SKU sàn', hint: 'Nối SKU đang bán trên sàn với SKU kho, hoặc tạo SKU kho từ sàn.', action: 'Liên kết SKU' },
  assign_groups: { label: 'Danh mục sản phẩm', hint: 'Chọn danh mục cho sản phẩm tạo từ sàn.', action: 'Chọn danh mục' },
  stock_sync: { label: 'Đồng bộ tồn lần đầu', hint: 'Chọn cách đưa tồn của Commerio lên sàn.', action: 'Đồng bộ tồn' },
  order_cutoff: { label: 'Đồng bộ đơn từ thời điểm nào', hint: 'Chọn mốc lấy đơn rồi hoàn tất thiết lập gian hàng.', action: 'Hoàn tất thiết lập' },
  first_product: { label: 'Sản phẩm đầu tiên', hint: 'Tạo sản phẩm và biến thể để bán.', action: 'Tạo sản phẩm' },
  opening_stock: { label: 'Tồn đầu kỳ', hint: 'Kiểm kê số hàng đang có trong kho.', action: 'Kiểm kê tồn đầu' },
  enable_report: { label: 'Bật Báo cáo', hint: 'Xem doanh thu, thực nhận ở Tổng quan.', action: 'Bật Báo cáo' },
};

function target(item: OnboardingItem, companyId: string): string {
  const c = ROUTES.company;
  switch (item.key) {
    case 'company_profile':
      return c.companyProfile(companyId);
    case 'invite_staff':
      return c.staff(companyId);
    case 'connect_shop':
      return c.shops(companyId);
    case 'link_skus':
    case 'assign_groups':
    case 'stock_sync':
    case 'order_cutoff':
      // Từ dải ở Tổng quan, bốn mục thiết lập gian hàng tới trang thiết lập (Documents/21 mục 23)
      return item.ref?.type === 'shop' ? c.shopSetup(companyId, item.ref.id) : c.shops(companyId);
    case 'first_product':
      return c.catalogNew(companyId);
    case 'opening_stock':
      return item.ref?.type === 'stock_document'
        ? c.inventoryDoc(companyId, item.ref.id)
        : c.inventoryDocNew(companyId, 'stocktake');
    case 'enable_report':
      return c.modules(companyId);
  }
}

/** Các bước theo đúng thứ tự BE trả; mục BE không biết (bản FE cũ hơn BE) thì bỏ qua */
export function onboardingSteps(data: Onboarding, companyId: string): OnboardingStep[] {
  return data.items
    .filter((i) => i.key in TEXT)
    .map((i) => ({ key: i.key, ...TEXT[i.key], done: i.done, optional: i.optional, to: target(i, companyId) }));
}

/** Mục bắt buộc theo thứ tự BE trả (người thiếu quyền đã bị BE bỏ): dải "Tiếp tục thiết lập" ở Tổng quan */
export const requiredSteps = (steps: OnboardingStep[]) => steps.filter((s) => !s.optional);

/** Việc tuỳ chọn ở bảng "Việc nên làm thêm" và trang "Sẵn sàng bán" */
export const optionalSteps = (steps: OnboardingStep[]) => steps.filter((s) => s.optional);
