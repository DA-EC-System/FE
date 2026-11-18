import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { platformCategoryHandlers } from './platformCategories';
import { categorySync } from '../platformCategoryData';

const server = setupServer(...platformCategoryHandlers);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

/** acc-001 là CEO của cmp-001; acc-003 là Nhân viên kho */
const call = (path: string, method = 'GET', account = 'acc-001') =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}` },
  });
const names = (body: { items: { name: string }[] }) => body.items.map((c) => c.name);

describe('Cây category của sàn (Documents/21 §18.5)', () => {
  it('không gửi gì là cấp gốc; parentId trả con trực tiếp', async () => {
    const roots = await (await call('/channel/platforms/lazada/categories')).json();
    expect(roots.items.length).toBeGreaterThan(10);
    expect(roots.items.every((c: { parentExternalId: string | null }) => c.parentExternalId === null)).toBe(true);
    expect(roots.syncedAt).toBeTruthy();
    const parent = roots.items[0];
    const kids = await (await call(`/channel/platforms/lazada/categories?parentId=${parent.externalId}`)).json();
    expect(kids.items.length).toBeGreaterThan(0);
    expect(kids.items.every((c: { parentExternalId: string }) => c.parentExternalId === parent.externalId)).toBe(true);
    expect(kids.items[0].path.startsWith(`${parent.name} > `)).toBe(true);
  });

  it('tìm có dấu, không dấu ra cùng tập, chỉ leaf, tối đa 50', async () => {
    const plain = await (await call(`/channel/platforms/tiktok/categories?search=${encodeURIComponent('ao thun')}`)).json();
    const marked = await (await call(`/channel/platforms/tiktok/categories?search=${encodeURIComponent('áo thun')}`)).json();
    expect(names(plain).sort()).toEqual(names(marked).sort());
    expect(plain.items.length).toBeGreaterThan(0);
    expect(plain.items.every((c: { isLeaf: boolean }) => c.isLeaf)).toBe(true);
    const dong = await (await call(`/channel/platforms/lazada/categories?search=${encodeURIComponent('dong ho')}`)).json();
    expect(dong.items.length).toBeLessThanOrEqual(50);
    expect(dong.items.some((c: { path: string }) => c.path.includes('Đồng hồ'))).toBe(true);
    expect((await call('/channel/platforms/lazada/categories?search=a')).status).toBe(422);
  });

  it('sàn không có cây: 422 marketplace_unsupported', async () => {
    const res = await call('/channel/platforms/mock/categories');
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('marketplace_unsupported');
  });
});

describe('Chi tiết leaf', () => {
  it('attribute đủ trường, tier company có defaultValue, sản phẩm đang dùng kèm mã', async () => {
    const body = await (await call('/channel/platforms/tiktok/categories/601226')).json();
    expect(body.category.sizeChartRule).toBe('required');
    expect(body.stale).toBe(false);
    const company = body.attributes.find((a: { code: string }) => a.code === '101489');
    expect(company).toMatchObject({ tier: 'company', required: true, defaultValue: 'Công ty Cổ phần Thời trang ABC' });
    expect(body.attributes.some((a: { kind: string }) => a.kind === 'sales')).toBe(true);
    expect(body.attributes.every((a: { options: unknown[] }) => Array.isArray(a.options))).toBe(true);
    expect(body.products).toEqual([expect.objectContaining({ productId: 'prd-001', source: 'match' })]);
  });

  it('bản cũ: stale true; không phải leaf: 422 category_not_leaf', async () => {
    expect((await (await call('/channel/platforms/lazada/categories/4640')).json()).stale).toBe(true);
    const res = await call('/channel/platforms/lazada/categories/1355');
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('category_not_leaf');
  });

  it('leaf chưa có attribute: Lazada 503 (có gian hàng active), TikTok 409 shop_not_connected (không có)', async () => {
    const lz = await call('/channel/platforms/lazada/categories/6647');
    expect(lz.status).toBe(503);
    expect((await lz.json()).code).toBe('marketplace_unavailable');
    const tiktokLeaf = await (await call(`/channel/platforms/tiktok/categories?search=${encodeURIComponent('giay')}`)).json();
    const other = tiktokLeaf.items.find((c: { externalId: string }) => !['601226', '601357', '601534'].includes(c.externalId));
    const tt = await call(`/channel/platforms/tiktok/categories/${other.externalId}`);
    expect(tt.status).toBe(409);
    expect((await tt.json()).code).toBe('shop_not_connected');
  });
});

describe('Đồng bộ ngay', () => {
  it('202 queued; bấm lần hai khi còn lượt chờ: queued false; Nhân viên kho không có shop.sync: 403', async () => {
    categorySync.lazada.pending = false;
    const first = await call('/channel/platforms/lazada/categories/sync', 'POST');
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ queued: true });
    expect(await (await call('/channel/platforms/lazada/categories/sync', 'POST')).json()).toEqual({ queued: false });
    expect((await call('/channel/platforms/tiktok/categories/sync', 'POST', 'acc-003')).status).toBe(403);
  });
});
