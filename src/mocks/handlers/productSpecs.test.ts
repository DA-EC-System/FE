// Thông tin sàn của sản phẩm (commerio-backend#400, Documents/21 §18.5): gợi ý, GET/PUT spec, cascade, chặn đẩy
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { db } from '../db';
import { products } from '../catalogData';
import { listings } from '../channelData';
import { categoryPermissions, productSpecs } from '../platformCategoryData';
import { shopHandlers } from './channel';
import { platformCategoryHandlers } from './platformCategories';
import { productSpecHandlers } from './productSpecs';

const server = setupServer(...shopHandlers, ...platformCategoryHandlers, ...productSpecHandlers);
const snap = {
  specs: structuredClone(productSpecs),
  perms: structuredClone(categoryPermissions),
  shops: structuredClone(db.shops),
  products: structuredClone(products),
  listings: structuredClone(listings),
  logs: db.companyAuditLogs.length,
};
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  productSpecs.splice(0, productSpecs.length, ...structuredClone(snap.specs));
  categoryPermissions.splice(0, categoryPermissions.length, ...structuredClone(snap.perms));
  db.shops.splice(0, db.shops.length, ...structuredClone(snap.shops));
  products.splice(0, products.length, ...structuredClone(snap.products));
  listings.splice(0, listings.length, ...structuredClone(snap.listings));
});

/** acc-001 CEO, acc-002 Sale, acc-003 Nhân viên kho của cmp-001 */
const call = (path: string, method = 'GET', body?: unknown, account = 'acc-001') =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const activate = (id: string) => (db.shops.find((s) => s.id === id)!.status = 'active');

describe('GET category-suggestions', () => {
  it('Lazada: tối đa 5 gợi ý, permission null', async () => {
    const res = await call('/channel/shops/shp-003/category-suggestions?productId=prd-001');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.items[0]).toMatchObject({ permission: null, path: expect.stringContaining('Áo phông') });
  });

  it('Lazada: sản phẩm chưa có ảnh → 422 images_missing', async () => {
    const res = await call('/channel/shops/shp-003/category-suggestions?productId=prd-005');
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('images_missing');
  });

  it('TikTok: tên dưới 25 ký tự → 422 product_name_too_short kèm min; đủ dài thì 1 gợi ý kèm quyền, ghi quyền', async () => {
    activate('shp-008');
    const short = await call('/channel/shops/shp-008/category-suggestions?productId=prd-001');
    expect(short.status).toBe(422);
    expect(await short.json()).toMatchObject({ code: 'product_name_too_short', min: 25 });
    products.find((p) => p.id === 'prd-001')!.name = 'Áo thun basic cổ tròn cotton 100% nam nữ';
    const body = await (await call('/channel/shops/shp-008/category-suggestions?productId=prd-001')).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].permission).toBe('available');
    expect(categoryPermissions.some((p) => p.shopId === 'shp-008' && p.externalCategoryId === body.items[0].externalId)).toBe(true);
  });

  it('gian hàng không active → 409 shop_not_connected; Kho không có listing.manage → 403', async () => {
    const res = await call('/channel/shops/shp-002/category-suggestions?productId=prd-001');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('shop_not_connected');
    expect((await call('/channel/shops/shp-003/category-suggestions?productId=prd-001', 'GET', undefined, 'acc-003')).status).toBe(403);
  });
});

describe('GET spec', () => {
  it('chưa có spec: spec null, missing rỗng; có spec ghép thiếu attribute: missing có nhãn', async () => {
    expect(await (await call('/channel/products/prd-003/specs/lazada')).json()).toEqual({ spec: null, missing: [] });
    const body = await (await call('/channel/products/prd-001/specs/lazada')).json();
    expect(body.spec).toMatchObject({ source: 'match', externalCategoryId: '7930', categoryPath: expect.stringContaining('Áo phông') });
    expect(body.missing).toEqual([expect.objectContaining({ code: 'clothing_material', reason: 'required' })]);
  });

  it('sản phẩm công ty khác hay không có → 404; sàn không có cây → 422', async () => {
    expect((await call('/channel/products/prd-101/specs/lazada')).status).toBe(404);
    expect((await call('/channel/products/prd-001/specs/shopee')).status).toBe(422);
  });
});

describe('PUT spec', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    externalCategoryId: '7930',
    attributes: { clothing_material: '100% Cotton', fa_pattern: 'Trơn', Fit_Type: 'Thường xuyên' },
    axisMap: { 'att-mau': 'color_family', 'att-size': '__custom' },
    valueMap: { 'val-den': 'Đen' },
    version: 1,
    ...over,
  });

  it('lưu: version tăng, source push, đủ thì missing rỗng, ghi nhật ký; thương hiệu, công ty trùng mặc định không lưu', async () => {
    const res = await call(
      '/channel/products/prd-001/specs/lazada',
      'PUT',
      body({
        attributes: {
          clothing_material: '100% Cotton',
          fa_pattern: 'Trơn',
          Fit_Type: 'Thường xuyên',
          brand: 'X',
          Manufacturer_Or_Trader_Name: 'Công ty Cổ phần Thời trang ABC',
        },
      }),
    );
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.spec).toMatchObject({ version: 2, source: 'push', categoryStatus: 'ok', attributes: { clothing_material: '100% Cotton', fa_pattern: 'Trơn', Fit_Type: 'Thường xuyên' } });
    expect(saved.missing).toEqual([]);
    expect(db.companyAuditLogs[0]).toMatchObject({ entityType: 'channel.product_specs', action: 'update' });
    expect(db.companyAuditLogs.length).toBeGreaterThan(snap.logs);
  });

  it('422 theo ô: leaf không hợp lệ; attribute bắt buộc thiếu, giá trị ngoài danh sách; trục thiếu; giá trị chuẩn sai', async () => {
    const leaf = await call('/channel/products/prd-001/specs/lazada', 'PUT', body({ externalCategoryId: '1355' }));
    expect((await leaf.json()).errors).toHaveProperty('externalCategoryId');
    const res = await call(
      '/channel/products/prd-001/specs/lazada',
      'PUT',
      body({ attributes: { Fit_Type: 'Không có' }, axisMap: { 'att-mau': 'color_family' }, valueMap: { 'val-den': 'Tím than' } }),
    );
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(Object.keys(errors).sort()).toEqual([
      'attributes.Fit_Type',
      'attributes.clothing_material',
      'attributes.fa_pattern',
      'axisMap.att-size',
      'valueMap.val-den',
    ]);
    expect(productSpecs.find((s) => s.productId === 'prd-001' && s.platform === 'lazada')!.version).toBe(1);
  });

  it('409 version_conflict kèm current; tạo mới mà đã có spec cũng 409', async () => {
    const res = await call('/channel/products/prd-001/specs/lazada', 'PUT', body({ version: 0 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'version_conflict', current: { spec: { version: 1 } } });
    expect((await call('/channel/products/prd-001/specs/lazada', 'PUT', body({ version: null }))).status).toBe(409);
  });

  it('tạo mới version null → 1; leaf chưa có attribute trong bảng: Lazada 503', async () => {
    const created = await call('/channel/products/prd-006/specs/lazada', 'PUT', body({ version: null, valueMap: {} }));
    expect(created.status).toBe(200);
    expect((await created.json()).spec.version).toBe(1);
    const unknown = await call('/channel/products/prd-003/specs/lazada', 'PUT', body({ externalCategoryId: '6647', version: null, axisMap: {}, valueMap: {} }));
    expect(unknown.status).toBe(503);
  });

  it('Nhân viên kho không có listing.manage → 403 trước 422', async () => {
    const res = await call('/channel/products/prd-001/specs/lazada', 'PUT', { externalCategoryId: '' }, 'acc-003');
    expect(res.status).toBe(403);
  });
});

describe('GET cascade', () => {
  it('Lazada trả cấp kế theo parent; TikTok 422 marketplace_unsupported', async () => {
    const root = await (await call('/channel/platforms/lazada/categories/6371/cascade?code=propCascade')).json();
    expect(root.items.length).toBeGreaterThan(0);
    const next = await (await call(`/channel/platforms/lazada/categories/6371/cascade?code=propCascade&parent=${root.items[0].id}`)).json();
    expect(next.items.length).toBeGreaterThan(0);
    expect((await call('/channel/platforms/tiktok/categories/601226/cascade?code=x')).status).toBe(422);
  });
});

describe('Đẩy chặn theo thông tin sàn (AC-14, AC-8, AC-9)', () => {
  const push = async (shopId: string, variantId: string) => {
    const res = await call(`/channel/shops/${shopId}/listings/push`, 'POST', { variantIds: [variantId] });
    return ((await res.json()) as { results: { code: string | null; message: string | null }[] }).results[0]!;
  };

  it('chưa có spec → category_unmapped; spec thiếu → spec_incomplete kèm nhãn; đủ → xếp việc', async () => {
    expect(await push('shp-003', 'prd-001-v1')).toMatchObject({ code: 'spec_incomplete', message: expect.stringContaining('Chất liệu') });
    const spec = productSpecs.find((s) => s.productId === 'prd-001' && s.platform === 'lazada')!;
    productSpecs.splice(productSpecs.indexOf(spec), 1);
    expect((await push('shp-003', 'prd-001-v1')).code).toBe('category_unmapped');
    productSpecs.push({ ...spec, attributes: { ...spec.attributes, clothing_material: '100% Cotton' } });
    expect((await push('shp-003', 'prd-001-v1')).code).toBeNull();
  });

  it('TikTok: gian hàng không có quyền category → category_not_permitted, gian hàng khác cùng sàn vẫn đẩy', async () => {
    activate('shp-002');
    activate('shp-008');
    categoryPermissions.push({ shopId: 'shp-008', externalCategoryId: '601226', status: 'invite_only' });
    products.find((p) => p.id === 'prd-001')!.sizeChartFileId = 'fil-001';
    expect((await push('shp-008', 'prd-001-v4')).code).toBe('category_not_permitted');
    expect((await push('shp-002', 'prd-001-v4')).code).toBeNull();
  });
});
