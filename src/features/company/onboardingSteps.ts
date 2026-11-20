import { ROUTES } from '@/router/routes';
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';

export interface OnboardingStep {
  key: OnboardingKey;
  label: string;
  hint: string;
  done: boolean;
  optional: boolean;
  /** Màn làm việc đó (Documents/21 mục 23, cột "FE dẫn tới") */
  to: string;
}

const TEXT: Record<OnboardingKey, { label: string; hint: string }> = {
  company_profile: { label: 'Hồ sơ công ty', hint: 'Địa chỉ và người chịu trách nhiệm, in trên chứng từ.' },
  invite_staff: { label: 'Mời nhân viên', hint: 'Tạo link mời để nhân viên vào làm cùng.' },
  connect_shop: { label: 'Kết nối gian hàng', hint: 'Nối gian hàng Lazada hoặc TikTok Shop.' },
  setup_shop: { label: 'Thiết lập gian hàng', hint: 'Ghép SKU trên sàn với sản phẩm và chọn mốc nhận đơn.' },
  first_product: { label: 'Sản phẩm đầu tiên', hint: 'Tạo sản phẩm và biến thể để bán.' },
  opening_stock: { label: 'Tồn đầu kỳ', hint: 'Kiểm kê số hàng đang có trong kho.' },
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
    case 'setup_shop':
      return item.ref?.type === 'shop' ? c.shopSetup(companyId, item.ref.id) : c.shops(companyId);
    case 'first_product':
      return c.catalogNew(companyId);
    case 'opening_stock':
      return item.ref?.type === 'stock_document'
        ? c.inventoryDoc(companyId, item.ref.id)
        : c.inventoryDocNew(companyId, 'stocktake');
  }
}

/** Các bước theo đúng thứ tự BE trả; mục BE không biết (bản FE cũ hơn BE) thì bỏ qua */
export function onboardingSteps(data: Onboarding, companyId: string): OnboardingStep[] {
  return data.items
    .filter((i) => i.key in TEXT)
    .map((i) => ({ key: i.key, ...TEXT[i.key], done: i.done, optional: i.optional, to: target(i, companyId) }));
}

/** Ẩn thẻ khi không có mục nào cho người xem, hoặc mọi mục bắt buộc đã xong (US-CT-13 ca 5, 6) */
export const showOnboarding = (data: Onboarding | undefined): data is Onboarding =>
  !!data && data.items.length > 0 && data.done < data.total;
