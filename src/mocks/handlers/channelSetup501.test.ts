import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { db } from '../db';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  // authorize-url ghép redirect_uri từ window.location.origin
  vi.stubGlobal('window', { location: new URL('http://localhost') });
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

const NEW_SHOP = 'shp-cmp003-moi';
// cmp-003 chưa có gian hàng nào nên gian hàng mới là gian hàng đầu tiên; bật tạm phân hệ Kênh bán cho công ty này
const cmp003 = db.companies.find((c) => c.id === 'cmp-003')!;
const modules = [...cmp003.optionalModules];
afterEach(() => {
  const i = db.shops.findIndex((s) => s.id === NEW_SHOP);
  if (i >= 0) db.shops.splice(i, 1);
  cmp003.optionalModules = [...modules];
});

const call = (companyId: string, path: string, method = 'GET', body?: unknown) =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.acc-001.${companyId}.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('Sàn chưa nối được (§18.7.3)', () => {
  it('Shopee khoá, có lý do, không có cách nối', async () => {
    const { items } = await (await call('cmp-001', '/channel/shops/platforms')).json();
    expect(items.find((p: { platform: string }) => p.platform === 'shopee')).toMatchObject({
      connectable: false,
      reason: 'Shopee chưa cấp quyền API cho ứng dụng sinh viên',
      methods: [],
    });
    const res = await call('cmp-001', '/channel/shops/shopee/token', 'POST', { accessToken: 'abc' });
    expect(res.ok).toBe(false);
  });
});

describe('TikTok Shop (FE#198, commerio-backend#217)', () => {
  const created: string[] = [];
  afterEach(() => {
    for (const id of created.splice(0)) {
      const i = db.shops.findIndex((s) => s.id === id);
      if (i >= 0) db.shops.splice(i, 1);
    }
  });

  it('khai đủ 4 năng lực và cả hai cách nối', async () => {
    const { items } = await (await call('cmp-001', '/channel/shops/platforms')).json();
    expect(items.find((p: { platform: string }) => p.platform === 'tiktok')).toEqual({
      platform: 'tiktok',
      name: 'TikTok Shop',
      connectable: true,
      reason: null,
      methods: ['oauth', 'token'],
      capabilities: { listingReview: true, hideBy: 'deactivate', splitLevel: 'sku', returnWindow: 'platform_status' },
    });
  });

  it('trang uỷ quyền giả lập trả về đúng tham số của TikTok', async () => {
    const { url } = await (await call('cmp-001', '/channel/shops/tiktok/authorize-url')).json();
    const search = new URL(url, 'http://localhost').searchParams;
    expect(Object.fromEntries(new URLSearchParams(search.get('deny_params') ?? ''))).toEqual({ code: 'null', error: 'auth_denied' });
    expect(Object.fromEntries(new URLSearchParams(search.get('approve_params') ?? ''))).toEqual({
      app_key: 'mock-tiktok-app-key',
      locale: 'vi-VN',
      shop_region: 'VN',
    });
  });

  it('uỷ quyền xong trả shops[], gian hàng ở connecting, gợi ý ghép có mã SKU sàn dạng số dài', async () => {
    const { url } = await (await call('cmp-001', '/channel/shops/tiktok/authorize-url')).json();
    const state = new URL(url, 'http://localhost').searchParams.get('state')!;
    const code = btoa(encodeURIComponent(JSON.stringify({ externalShopId: '7495012345678901234', shopName: 'TikTok thử' })));
    const res = await call('cmp-001', '/channel/shops/tiktok/callback', 'POST', {
      state,
      params: { code, app_key: 'mock-tiktok-app-key', locale: 'vi-VN', shop_region: 'VN' },
    });
    expect(res.status).toBe(201);
    const result = await res.json();
    created.push(result.shop.id);
    expect(result.shops).toHaveLength(1);
    expect(result.shop).toMatchObject({ platform: 'tiktok', status: 'connecting' });
    const preview = await (await call('cmp-001', `/channel/shops/${result.shop.id}/setup`)).json();
    expect(preview.suggestions.length).toBeGreaterThan(0);
    for (const s of preview.suggestions) expect(s.externalSkuId).toMatch(/^\d{19}$/);
    expect(preview.suggestions.some((s: { variantId: string | null }) => s.variantId)).toBe(true);
  });

  it('dán token TikTok trả cùng dạng với callback', async () => {
    const res = await call('cmp-001', '/channel/shops/tiktok/token', 'POST', { accessToken: 'tt-token-abc123' });
    expect(res.status).toBe(201);
    const result = await res.json();
    created.push(result.shop.id);
    expect(result.shops).toHaveLength(1);
    expect(result.shop.platform).toBe('tiktok');
  });
});

describe('Kiểm kê đầu kỳ chưa làm (R13, commerio-backend#245)', () => {
  it('gian hàng đầu tiên của công ty chọn stocktake thì 501 not_implemented kèm issue, owner; không đổi gian hàng', async () => {
    const base = db.shops[0];
    cmp003.optionalModules = [...modules, 'channel'];
    db.shops.push({
      ...base,
      id: NEW_SHOP,
      companyId: 'cmp-003',
      platform: 'lazada',
      capabilities: { ...base.capabilities, returnWindow: 'days' },
      externalShopId: 'lazada-cmp003-moi',
      status: 'connecting',
      setupRun: null,
      openingStocktakeDocId: null,
    });
    const res = await call('cmp-003', `/channel/shops/${NEW_SHOP}/setup`, 'POST', {
      decisions: [],
      openingStock: 'stocktake',
      returnWindowDays: 7,
    });
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ code: 'not_implemented', issue: 'commerio-backend#245', owner: 'Bình' });
    expect(db.shops.find((s) => s.id === NEW_SHOP)?.status).toBe('connecting');
  });
});
