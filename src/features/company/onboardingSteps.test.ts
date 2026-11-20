import { describe, expect, it } from 'vitest';
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';
import { firstPendingIndex, onboardingSteps, optionalSteps, requiredSteps, showOnboarding } from './onboardingSteps';

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

describe('wizard /welcome (US-CT-12, FE#419)', () => {
  const ORDER: OnboardingKey[] = ['company_profile', 'connect_shop', 'setup_shop', 'opening_stock', 'first_product', 'invite_staff', 'enable_report'];
  const OPT = new Set<OnboardingKey>(['first_product', 'invite_staff', 'enable_report']);
  const data = (doneKeys: OnboardingKey[]): Onboarding => ({
    items: ORDER.map((k) => item(k, { optional: OPT.has(k), done: doneKeys.includes(k) })),
    done: doneKeys.filter((k) => !OPT.has(k)).length,
    total: 4,
  });

  it('bước wizard là bốn mục bắt buộc theo thứ tự BE, việc tuỳ chọn tách riêng', () => {
    const steps = onboardingSteps(data([]), C);
    expect(requiredSteps(steps).map((s) => s.key)).toEqual(['company_profile', 'connect_shop', 'setup_shop', 'opening_stock']);
    expect(optionalSteps(steps).map((s) => s.key)).toEqual(['first_product', 'invite_staff', 'enable_report']);
  });

  it('Bật Báo cáo dẫn tới trang Tính năng', () => {
    expect(onboardingSteps(data([]), C).find((s) => s.key === 'enable_report')?.to).toBe('/c/c1/admin/modules');
  });

  it('mở lại thì đứng ở bước bắt buộc đầu tiên chưa xong, kể cả khi bước sau đã xong', () => {
    expect(firstPendingIndex(requiredSteps(onboardingSteps(data([]), C)))).toBe(0);
    expect(firstPendingIndex(requiredSteps(onboardingSteps(data(['company_profile', 'connect_shop']), C)))).toBe(2);
    expect(firstPendingIndex(requiredSteps(onboardingSteps(data(['company_profile', 'setup_shop']), C)))).toBe(1);
  });

  it('xong hết bước bắt buộc thì ra trang Sẵn sàng bán (chỉ số bằng số bước), dải ở Tổng quan ẩn', () => {
    const all = data(['company_profile', 'connect_shop', 'setup_shop', 'opening_stock']);
    expect(firstPendingIndex(requiredSteps(onboardingSteps(all, C)))).toBe(4);
    expect(showOnboarding(all)).toBe(false);
  });

  it('người chỉ thấy mục tuỳ chọn thì không có bước wizard nào', () => {
    const onlyOptional: Onboarding = { items: [item('invite_staff', { optional: true })], done: 0, total: 0 };
    expect(requiredSteps(onboardingSteps(onlyOptional, C))).toEqual([]);
    expect(showOnboarding(onlyOptional)).toBe(false);
  });
});
