import { describe, expect, it } from 'vitest';
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';
import { onboardingSteps, optionalSteps, requiredSteps } from './onboardingSteps';

const C = 'c1';
const OPT = new Set<OnboardingKey>(['first_product', 'invite_staff', 'enable_report']);
const item = (key: OnboardingKey, opts: Partial<OnboardingItem> = {}): OnboardingItem => ({
  key,
  done: false,
  optional: OPT.has(key),
  ref: null,
  ...opts,
});
const KEYS: OnboardingKey[] = [
  'company_profile',
  'connect_shop',
  'link_skus',
  'assign_groups',
  'stock_sync',
  'order_cutoff',
  'opening_stock',
  'first_product',
  'invite_staff',
  'enable_report',
];
const fresh: Onboarding = {
  items: KEYS.map((k) => item(k)),
  done: 0,
  total: 7,
  completedAt: null,
  next: { key: 'company_profile', mine: true },
  mustWizard: true,
};

describe('onboardingSteps (US-CT-13, dải và bảng ở Tổng quan)', () => {
  it('mỗi mục dẫn tới trang làm việc đó, theo thứ tự BE trả', () => {
    const steps = onboardingSteps(fresh, C);
    expect(steps.map((s) => s.key)).toEqual(KEYS);
    expect(steps.map((s) => s.to)).toEqual([
      '/c/c1/admin/company',
      '/c/c1/channel/shops',
      '/c/c1/channel/shops',
      '/c/c1/channel/shops',
      '/c/c1/channel/shops',
      '/c/c1/channel/shops',
      '/c/c1/inventory/documents/new?type=stocktake',
      '/c/c1/catalog/products/new',
      '/c/c1/admin/staff',
      '/c/c1/admin/modules',
    ]);
  });

  it('bốn mục thiết lập gian hàng có ref thì tới trang thiết lập của gian hàng đó; phiếu đầu kỳ đang mở thì tới phiếu', () => {
    const shop = { type: 'shop' as const, id: 's9' };
    const steps = onboardingSteps(
      {
        ...fresh,
        items: [
          item('link_skus', { ref: shop }),
          item('assign_groups', { ref: shop }),
          item('stock_sync', { ref: shop }),
          item('order_cutoff', { ref: shop }),
          item('opening_stock', { ref: { type: 'stock_document', id: 'd7' } }),
        ],
      },
      C,
    );
    expect(steps.map((s) => s.to)).toEqual([
      '/c/c1/channel/shops/s9/setup',
      '/c/c1/channel/shops/s9/setup',
      '/c/c1/channel/shops/s9/setup',
      '/c/c1/channel/shops/s9/setup',
      '/c/c1/inventory/documents/d7',
    ]);
  });

  it('bỏ qua mục FE chưa biết (bản FE cũ hơn BE)', () => {
    const data = { ...fresh, items: [item('tax_profile' as OnboardingKey), item('first_product')] };
    expect(onboardingSteps(data, C).map((s) => s.key)).toEqual(['first_product']);
  });

  it('tách mục bắt buộc và mục tuỳ chọn', () => {
    const steps = onboardingSteps(fresh, C);
    expect(requiredSteps(steps)).toHaveLength(7);
    expect(optionalSteps(steps).map((s) => s.key)).toEqual(['first_product', 'invite_staff', 'enable_report']);
  });
});
