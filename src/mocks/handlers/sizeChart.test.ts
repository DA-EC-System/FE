// Ảnh bảng kích cỡ (FE#261, commerio-backend#347): body PUT, lỗi errors.sizeChart, chặn size_chart_missing khi đẩy
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { sizeChartPatch } from '@/features/catalog/shared';
import { listings } from '../channelData';
import { db } from '../db';
import { files, products } from '../catalogData';
import { catalogHandlers } from './catalog';
import { shopHandlers } from './channel';

const server = setupServer(...catalogHandlers, ...shopHandlers);
const snapProducts = structuredClone(products);
const snapFiles = structuredClone(files);
const snapShops = structuredClone(db.shops);
const snapListings = structuredClone(listings);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  products.splice(0, products.length, ...structuredClone(snapProducts));
  files.splice(0, files.length, ...structuredClone(snapFiles));
  db.shops.splice(0, db.shops.length, ...structuredClone(snapShops));
  listings.splice(0, listings.length, ...structuredClone(snapListings));
});

const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.acc-001.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const addFile = (id: string, sizeBytes = 50_000) =>
  files.push({ id, companyId: 'cmp-001', fileName: `${id}.png`, contentType: 'image/png', sizeBytes, url: `blob:${id}` });

/** Sửa Quần kaki (prd-002), giữ tên, mô tả, ảnh như cũ */
const save = async (patch: { sizeChartFileId?: string | null }) => {
  const p = await (await call('/catalog/products/prd-002')).json();
  return call('/catalog/products/prd-002', 'PUT', {
    name: p.name,
    description: p.description,
    imageFileIds: p.images.map((i: { fileId: string }) => i.fileId),
    version: p.version,
    ...patch,
  });
};

describe('sizeChartPatch', () => {
  it('không đổi thì bỏ trống, gỡ thì null, chọn ảnh khác thì id mới', () => {
    expect(sizeChartPatch(null, null)).toEqual({});
    expect(sizeChartPatch('fil-a', 'fil-a')).toEqual({});
    expect(sizeChartPatch('fil-a', null)).toEqual({ sizeChartFileId: null });
    expect(sizeChartPatch('fil-a', 'fil-b')).toEqual({ sizeChartFileId: 'fil-b' });
    expect(sizeChartPatch(null, 'fil-b')).toEqual({ sizeChartFileId: 'fil-b' });
  });
});

describe('Ảnh bảng kích cỡ trong sản phẩm', () => {
  it('thêm, giữ khi bỏ trống, thay, gỡ bằng null', async () => {
    addFile('fil-sc1');
    addFile('fil-sc2');
    expect((await (await save({ sizeChartFileId: 'fil-sc1' })).json()).sizeChart).toMatchObject({ fileId: 'fil-sc1' });
    expect((await (await save({})).json()).sizeChart).toMatchObject({ fileId: 'fil-sc1' });
    expect((await (await save({ sizeChartFileId: 'fil-sc2' })).json()).sizeChart).toMatchObject({ fileId: 'fil-sc2' });
    expect((await (await save({ sizeChartFileId: null })).json()).sizeChart).toBeNull();
  });

  it('tệp chưa tải xong hoặc lớn hơn 1 MB: 422 errors.sizeChart', async () => {
    const missing = await save({ sizeChartFileId: 'khong-co' });
    expect(missing.status).toBe(422);
    expect((await missing.json()).errors.sizeChart).toBeTruthy();
    addFile('fil-big', 2 * 1024 * 1024);
    expect((await (await save({ sizeChartFileId: 'fil-big' })).json()).errors.sizeChart).toContain('1 MB');
  });

  it('tạo sản phẩm kèm ảnh bảng kích cỡ', async () => {
    addFile('fil-sc3');
    const res = await call('/catalog/products', 'POST', {
      name: 'Giày thể thao FE261',
      categoryId: 'cat-quan',
      description: '',
      imageFileIds: [],
      sizeChartFileId: 'fil-sc3',
      variants: [{ attributeValueIds: [] }],
    });
    expect(res.status).toBe(201);
    expect((await res.json()).sizeChart).toMatchObject({ fileId: 'fil-sc3' });
  });
});

describe('Đẩy listing khi danh mục sàn bắt buộc bảng kích cỡ', () => {
  // Áo thun basic có thông tin TikTok (leaf Áo thun nam 601226, size_chart_rule = required, commerio-backend#400)
  const push = async () => {
    const res = await call('/channel/shops/shp-002/listings/push', 'POST', { variantIds: ['prd-001-v4'] });
    return ((await res.json()) as { results: { code: string | null }[] }).results[0]!;
  };

  it('chưa có ảnh thì size_chart_missing, có ảnh thì đẩy được', async () => {
    db.shops.find((s) => s.id === 'shp-002')!.status = 'active';
    expect((await push()).code).toBe('size_chart_missing');
    addFile('fil-sc4');
    products.find((p) => p.id === 'prd-001')!.sizeChartFileId = 'fil-sc4';
    expect((await push()).code).toBeNull();
  });
});
