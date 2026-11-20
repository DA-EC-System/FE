import { describe, expect, it } from 'vitest';
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';
import { onboardingSteps, showOnboarding } from './onboardingSteps';

const C = 'c1';
const item = (key: OnboardingKey, opts: Partial<OnboardingItem> = {}): OnboardingItem => ({
  key,
  done: false,
  optional: key === 'invite_staff',
  ref: null,
  ...opts,
});
const KEYS: OnboardingKey[] = ['company_profile', 'invite_staff', 'connect_shop', 'setup_shop', 'first_product', 'opening_stock'];
const fresh: Onboarding = { items: KEYS.map((k) => item(k)), done: 0, total: 5 };

describe('onboardingSteps (US-CT-13)', () => {
  it('công ty mới: 6 bước theo thứ tự BE trả, mỗi bước dẫn tới màn làm việc', () => {
    const steps = onboardingSteps(fresh, C);
    expect(steps.map((s) => s.key)).toEqual(KEYS);
    expect(steps.map((s) => s.to)).toEqual([
      '/c/c1/admin/company',
      '/c/c1/admin/staff',
      '/c/c1/channel/shops',
      '/c/c1/channel/shops',
      '/c/c1/catalog/products/new',
      '/c/c1/inventory/documents/new?type=stocktake',
    ]);
    expect(steps.find((s) => s.key === 'invite_staff')?.optional).toBe(true);
  });

  it('có ref thì dẫn thẳng tới gian hàng cần thiết lập và phiếu đầu kỳ đang mở', () => {
    const steps = onboardingSteps(
      {
        ...fresh,
        items: [
          item('setup_shop', { ref: { type: 'shop', id: 's9' } }),
          item('opening_stock', { ref: { type: 'stock_document', id: 'd7' } }),
        ],
      },
      C,
    );
    expect(steps.map((s) => s.to)).toEqual(['/c/c1/channel/shops/s9/setup', '/c/c1/inventory/documents/d7']);
  });

  it('bỏ qua mục FE chưa biết', () => {
    const data = { ...fresh, items: [{ ...item('first_product'), key: 'tax_profile' as OnboardingKey }, item('first_product')] };
    expect(onboardingSteps(data, C).map((s) => s.key)).toEqual(['first_product']);
  });
});

describe('showOnboarding', () => {
  it('còn mục bắt buộc chưa xong thì hiện thẻ', () => {
    expect(showOnboarding(fresh)).toBe(true);
  });

  it('mọi mục bắt buộc xong thì ẩn, dù mời nhân viên chưa làm', () => {
    expect(showOnboarding({ ...fresh, done: 5 })).toBe(false);
  });

  it('không có mục nào, chỉ có mục tuỳ chọn, hoặc chưa tải xong thì ẩn', () => {
    expect(showOnboarding({ items: [], done: 0, total: 0 })).toBe(false);
    expect(showOnboarding({ items: [item('invite_staff')], done: 0, total: 0 })).toBe(false);
    expect(showOnboarding(undefined)).toBe(false);
  });
});
