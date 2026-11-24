import { describe, expect, it } from 'vitest';
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';
import { onboardingRedirect, resolveView, viewAfter, viewBefore, wizardSteps, workspaceMode } from './wizardState';

const REQUIRED: OnboardingKey[] = [
  'company_profile',
  'connect_shop',
  'link_skus',
  'assign_groups',
  'stock_sync',
  'order_cutoff',
  'opening_stock',
];
const OPTIONAL: OnboardingKey[] = ['first_product', 'invite_staff', 'enable_report'];

/** Dữ liệu GET /onboarding: `doneKeys` đã xong; `keys` là các mục bắt buộc người gọi thấy (đã lọc quyền) */
function data(doneKeys: OnboardingKey[], opts: Partial<Onboarding> & { keys?: OnboardingKey[] } = {}): Onboarding {
  const keys = opts.keys ?? REQUIRED;
  const items: OnboardingItem[] = [
    ...keys.map((key) => ({ key, done: doneKeys.includes(key), optional: false, ref: null })),
    ...OPTIONAL.map((key) => ({ key, done: false, optional: true, ref: null })),
  ];
  const firstOpen = REQUIRED.find((k) => !doneKeys.includes(k));
  return {
    items,
    done: keys.filter((k) => doneKeys.includes(k)).length,
    total: keys.length,
    completedAt: null,
    next: firstOpen ? { key: firstOpen, mine: keys.includes(firstOpen) } : null,
    mustWizard: true,
    ...opts,
  };
}

describe('wizardSteps (FE#468)', () => {
  it('bảy bước bắt buộc theo thứ tự BE, bỏ mục tuỳ chọn và mục FE chưa biết', () => {
    const d = data([]);
    d.items.splice(2, 0, { key: 'tax_profile' as OnboardingKey, done: false, optional: false, ref: null });
    const steps = wizardSteps(d);
    expect(steps.map((s) => s.key)).toEqual(REQUIRED);
    expect(steps.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(steps[5].label).toBe('Đồng bộ đơn từ thời điểm nào');
  });

  it('mở được bước đã xong và bước chưa xong đầu tiên; các bước sau khoá', () => {
    const steps = wizardSteps(data(['company_profile', 'connect_shop']));
    expect(steps.map((s) => s.reachable)).toEqual([true, true, true, false, false, false, false]);
  });

  it('bước sau đã xong vẫn mở được dù bước trước bị đảo lại (ngắt gian hàng)', () => {
    const steps = wizardSteps(data(['company_profile', 'opening_stock']));
    expect(steps.find((s) => s.key === 'opening_stock')?.reachable).toBe(true);
    expect(steps.find((s) => s.key === 'link_skus')?.reachable).toBe(false);
  });
});

describe('resolveView: tải lại giữ đúng bước, không nhảy cóc qua URL', () => {
  const d = data(['company_profile', 'connect_shop']);

  it('không có ?step thì đứng ở bước next', () => {
    expect(resolveView(d, null)).toBe('link_skus');
  });

  it('?step là bước đã xong thì xem lại bước đó', () => {
    expect(resolveView(d, 'company_profile')).toBe('company_profile');
  });

  it('?step vượt tiến độ hoặc lạ thì về bước next', () => {
    expect(resolveView(d, 'opening_stock')).toBe('link_skus');
    expect(resolveView(d, 'ready')).toBe('link_skus');
    expect(resolveView(d, 'abc')).toBe('link_skus');
  });

  it('xong hết bảy bước (next = null) thì đứng ở "Sẵn sàng bán"', () => {
    const all = data(REQUIRED);
    expect(all.next).toBeNull();
    expect(resolveView(all, null)).toBe('ready');
    expect(resolveView(all, 'ready')).toBe('ready');
    expect(resolveView(all, 'connect_shop')).toBe('connect_shop');
  });

  it('Nhân viên kho chỉ thấy bước 7: next của công ty không phải của mình thì đứng ở bước mình làm được', () => {
    const staff = data([], { keys: ['opening_stock'], mustWizard: false });
    expect(staff.next).toEqual({ key: 'company_profile', mine: false });
    expect(resolveView(staff, null)).toBe('opening_stock');
  });
});

describe('viewAfter, viewBefore', () => {
  const d = data(['company_profile']);
  it('bước kế, hết bước thì "Sẵn sàng bán"', () => {
    expect(viewAfter(d, 'company_profile')).toBe('connect_shop');
    expect(viewAfter(d, 'opening_stock')).toBe('ready');
  });
  it('bước trước, bước đầu không có', () => {
    expect(viewBefore(d, 'company_profile')).toBeNull();
    expect(viewBefore(d, 'connect_shop')).toBe('company_profile');
    expect(viewBefore(d, 'ready')).toBe('opening_stock');
  });
});

describe('workspaceMode (Documents/21 mục 23, mục FE)', () => {
  it('CEO công ty mới: ép về wizard', () => {
    expect(workspaceMode(data([]))).toBe('force');
  });

  it('Nhân viên kho khi CEO còn ở bước 1–6: không ép, có dải "Công ty đang thiết lập"', () => {
    expect(workspaceMode(data([], { keys: ['opening_stock'], mustWizard: false }))).toBe('banner');
  });

  it('Sale không thấy mục bắt buộc nào (total = 0): vẫn có dải khi công ty chưa hoàn tất', () => {
    expect(workspaceMode(data([], { keys: [], mustWizard: false }))).toBe('banner');
  });

  it('đã hoàn tất mà một mục bị đảo lại: dải "Tiếp tục thiết lập", không ép', () => {
    const d = data(REQUIRED.slice(0, 6), { completedAt: '2026-11-24T10:00:00Z', mustWizard: false });
    expect(workspaceMode(d)).toBe('resume');
  });

  it('đã hoàn tất và xong hết, hoặc chưa tải: không hiện gì', () => {
    expect(workspaceMode(data(REQUIRED, { completedAt: '2026-11-24T10:00:00Z', mustWizard: false }))).toBe('none');
    expect(workspaceMode(undefined)).toBe('none');
  });
});

describe('onboardingRedirect (guard công ty)', () => {
  const force = data([]);
  it('bị ép thì mọi trang công ty về /welcome', () => {
    expect(onboardingRedirect(force, 'c1', '/c/c1')).toBe('/c/c1/welcome');
    expect(onboardingRedirect(force, 'c1', '/c/c1/')).toBe('/c/c1/welcome');
    expect(onboardingRedirect(force, 'c1', '/c/c1/sales/orders')).toBe('/c/c1/welcome');
    expect(onboardingRedirect(force, 'c1', '/c/c1/channel/shops')).toBe('/c/c1/welcome');
  });

  it('tạm thời còn mở trang uỷ quyền sàn, thiết lập gian hàng, phiếu kiểm kê (bước chưa nhúng)', () => {
    expect(onboardingRedirect(force, 'c1', '/c/c1/channel/shops/oauth-callback/tiktok')).toBeNull();
    expect(onboardingRedirect(force, 'c1', '/c/c1/channel/shops/s9/setup')).toBeNull();
    expect(onboardingRedirect(force, 'c1', '/c/c1/inventory/documents/d7')).toBeNull();
    expect(onboardingRedirect(force, 'c1', '/c/c1/inventory/documents')).toBe('/c/c1/welcome');
  });

  it('không bị ép hoặc chưa tải thì không chuyển (lỗi GET không khoá người dùng khỏi app)', () => {
    expect(onboardingRedirect(data([], { mustWizard: false }), 'c1', '/c/c1/sales/orders')).toBeNull();
    expect(onboardingRedirect(undefined, 'c1', '/c/c1/sales/orders')).toBeNull();
  });
});
