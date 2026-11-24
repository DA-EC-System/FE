import { describe, expect, it } from 'vitest';
import type { Blocker, ShopReadiness } from '@/types/blocker';
import { platformMissing, platformShop, readinessBlocker, shopMissing, shopState } from './readiness';

const blocker = (code: string): Blocker => ({ code, label: code, scope: 'common', target: { kind: 'category' }, variantIds: [] });
const shop = (patch: Partial<ShopReadiness>): ShopReadiness => ({
  shopId: 's1',
  shopName: 'Đùi Gà Store',
  platform: 'lazada',
  status: 'blocked',
  counts: { ready: 0, blocked: 2, listed: 0 },
  category: { state: 'none', externalCategoryId: null, path: null, source: null, maxAxes: null, combinable: null },
  blockers: [blocker('a'), blocker('b'), blocker('c'), blocker('d')],
  variants: [],
  ...patch,
});
const ready = shop({ shopId: 's2', shopName: 'TT', platform: 'tiktok', status: 'ready', counts: { ready: 2, blocked: 0, listed: 0 }, blockers: [] });

describe('readiness theo gian hàng (FE#458)', () => {
  it('trạng thái và số mục của gian hàng', () => {
    expect(shopState(shop({}))).toBe('blocked');
    expect(shopMissing(shop({}))).toBe(4);
    expect(shopState(ready)).toBe('ready');
    expect(shopState(shop({ counts: { ready: 0, blocked: 0, listed: 3 }, blockers: [] }))).toBe('listed');
    expect(shopMissing(shop({ counts: { ready: 0, blocked: 0, listed: 3 } }))).toBe(0);
  });

  it('số của sàn: gian hàng ít mục nhất', () => {
    const items = [shop({}), shop({ shopId: 's3', blockers: [blocker('a')] }), ready];
    expect(platformMissing(items, 'lazada')).toBe(1);
    expect(platformShop(items, 'lazada')?.shopId).toBe('s3');
    expect(platformMissing(items, 'tiktok')).toBe(0);
    expect(platformMissing(items, 'shopee')).toBeNull();
    expect(platformMissing(undefined, 'lazada')).toBeNull();
  });

  it('khoá Đăng chỉ khi không gian hàng nào đăng được', () => {
    expect(readinessBlocker([shop({})])).toBe('Chưa gian hàng nào đăng được: Đùi Gà Store (Lazada) còn 4 mục');
    expect(readinessBlocker([shop({}), ready])).toBeNull();
    expect(readinessBlocker([])).toBeNull();
    expect(readinessBlocker([shop({ counts: { ready: 0, blocked: 0, listed: 2 }, blockers: [] })])).toBeNull();
  });
});
