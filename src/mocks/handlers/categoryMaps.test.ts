import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { categoryMapHandlers } from './categoryMaps';
import { shopHandlers } from './channel';
import { categoryMaps } from '../channelData';

const server = setupServer(...categoryMapHandlers, ...shopHandlers);
const snapshot = structuredClone(categoryMaps);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  categoryMaps.splice(0, categoryMaps.length, ...structuredClone(snapshot));
});

const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.acc-001.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('Danh mục sàn (FE#146)', () => {
  it('tìm theo đường dẫn, tối đa 50 mục', async () => {
    const all = await (await call('/channel/shops/shp-003/categories')).json();
    expect(all.items).toHaveLength(50);
    const hits = await (await call(`/channel/shops/shp-003/categories?search=${encodeURIComponent('ao thun')}`)).json();
    expect(hits.items.map((c: { name: string }) => c.name)).toContain('Thời trang nam > Áo > Áo thun');
    expect(hits.items.every((c: { name: string }) => c.name.includes('Áo thun'))).toBe(true);
  });

  it('thuộc tính có loại có lựa chọn và loại nhập tự do', async () => {
    const { items } = await (await call('/channel/shops/shp-003/categories/10000/attributes')).json();
    expect(items.find((a: { name: string }) => a.name === 'brand').options).toEqual([]);
    expect(items.find((a: { name: string }) => a.name === 'material').options.length).toBeGreaterThan(0);
    expect((await call('/channel/shops/shp-003/categories/khong-co/attributes')).status).toBe(404);
  });
});

describe('Lưu ghép danh mục', () => {
  it('thiếu thuộc tính hoặc ngoài lựa chọn: 422 errors["attributes.<tên>"]', async () => {
    const res = await call('/channel/shops/shp-003/category-maps/cat-pk', 'PUT', {
      externalCategoryId: '10000',
      attributes: { material: 'Lụa' },
      version: null,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Object.keys(body.errors).sort()).toEqual(['attributes.brand', 'attributes.collar_type', 'attributes.material']);
  });

  it('ghép mới với version null, sửa phải gửi đúng version, sai thì 409 version_conflict kèm bản mới', async () => {
    const input = { externalCategoryId: '10056', attributes: { brand: 'ABC' }, version: null };
    const created = await call('/channel/shops/shp-003/category-maps/cat-pk', 'PUT', input);
    expect(created.status).toBe(200);
    const map = await created.json();
    expect(map).toMatchObject({ categoryId: 'cat-pk', platform: 'lazada', externalCategoryId: '10056', version: 1 });

    const stale = await call('/channel/shops/shp-003/category-maps/cat-pk', 'PUT', input);
    expect(stale.status).toBe(409);
    const conflict = await stale.json();
    expect(conflict.code).toBe('version_conflict');
    expect(conflict.current.version).toBe(1);

    const list = await (await call('/channel/shops/shp-003/category-maps')).json();
    expect(list.items.map((m: { categoryId: string }) => m.categoryId).sort()).toEqual(['cat-ao', 'cat-pk', 'cat-quan']);
  });

  it('gian hàng chưa kết nối: 409 shop_not_connected', async () => {
    const res = await call('/channel/shops/shp-008/category-maps/cat-pk', 'PUT', {
      externalCategoryId: '10056',
      attributes: { brand: 'ABC' },
      version: null,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('shop_not_connected');
  });
});

describe('Đẩy listing lên Lazada', () => {
  it('sản phẩm thuộc danh mục chưa ghép báo category_unmapped, ghép xong thì hết', async () => {
    const push = async () => {
      const res = await call('/channel/shops/shp-003/listings/push', 'POST', { variantIds: ['prd-003-v1'] });
      return (await res.json()).results[0];
    };
    expect(await push()).toMatchObject({ outcome: 'failed', code: 'category_unmapped' });
    await call('/channel/shops/shp-003/category-maps/cat-pk', 'PUT', {
      externalCategoryId: '10056',
      attributes: { brand: 'ABC' },
      version: null,
    });
    expect((await push()).code).not.toBe('category_unmapped');
  });
});
