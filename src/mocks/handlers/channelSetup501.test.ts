import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { db } from '../db';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
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
  it('TikTok khoá, có lý do, không có cách nối', async () => {
    const { items } = await (await call('cmp-001', '/channel/shops/platforms')).json();
    expect(items.find((p: { platform: string }) => p.platform === 'tiktok')).toMatchObject({
      connectable: false,
      reason: 'Đang làm, thuộc commerio-backend#217 (đợt 4)',
      methods: [],
    });
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
