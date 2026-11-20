// Nhóm hàng, cài đặt sản phẩm, tạo sản phẩm với trục phân loại (FE#350, Documents/21 §5.2)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import type { ProductDetail, ProductGroup } from '@/types/catalog';
import { attributes, groups, productSettings, products } from '../catalogData';
import { catalogHandlers } from './catalog';

const server = setupServer(...catalogHandlers);
const snap = {
  products: structuredClone(products),
  groups: structuredClone(groups),
  attributes: structuredClone(attributes),
  settings: structuredClone(productSettings),
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
  products.splice(0, products.length, ...structuredClone(snap.products));
  groups.splice(0, groups.length, ...structuredClone(snap.groups));
  attributes.splice(0, attributes.length, ...structuredClone(snap.attributes));
  productSettings.splice(0, productSettings.length, ...structuredClone(snap.settings));
});

const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.acc-001.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const create = (body: Record<string, unknown>) =>
  call('/catalog/products', 'POST', { description: '', imageFileIds: [], groupId: 'cat-ao', ...body });

describe('Nhóm hàng', () => {
  it('GET trả { items } kèm productCount, suggest', async () => {
    const { items } = (await (await call('/catalog/groups')).json()) as { items: ProductGroup[] };
    const ao = items.find((g) => g.id === 'cat-ao')!;
    expect(ao.productCount).toBeGreaterThan(0);
    expect(ao.suggest).toMatchObject({ marginCoefficient: null });
  });

  it('tạo trùng tên không phân biệt hoa thường: 409 name_taken', async () => {
    const res = await call('/catalog/groups', 'POST', { name: 'áo' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('name_taken');
  });

  it('xoá nhóm còn sản phẩm (kể cả lưu trữ): 409 in_use; chuyển hết rồi xoá được', async () => {
    const somi = groups.find((g) => g.id === 'cat-somi')!;
    expect((await call(`/catalog/groups/cat-somi?version=${somi.version}`, 'DELETE')).status).toBe(409);
    const moved = await call('/catalog/groups/cat-somi/move-products', 'POST', { targetGroupId: 'cat-ao' });
    expect(await moved.json()).toEqual({ moved: 1 });
    expect((await call(`/catalog/groups/cat-somi?version=${somi.version}`, 'DELETE')).status).toBe(204);
  });

  it('chuyển sản phẩm không thuộc nhóm nguồn: 422 errors.productIds, không chuyển gì', async () => {
    const res = await call('/catalog/groups/cat-quan/move-products', 'POST', { targetGroupId: 'cat-pk', productIds: ['prd-002', 'prd-001'] });
    expect(res.status).toBe(422);
    expect((await res.json()).errors.productIds).toBe('Có sản phẩm không thuộc nhóm này');
    expect(products.find((p) => p.id === 'prd-002')!.groupId).toBe('cat-quan');
  });
});

describe('POST /catalog/products với axes', () => {
  it('trục có sẵn + trục tự đặt mới: tạo thuộc tính, giá trị cùng lúc; SKU theo mẫu công ty', async () => {
    const res = await create({
      name: 'Áo thun FE350',
      axes: [
        { attributeId: 'att-mau', values: [{ id: 'val-den', value: 'Đen' }, { value: 'Xanh rêu' }] },
        { name: 'Hoạ tiết', values: [{ value: 'Kẻ caro' }] },
      ],
      variants: [{ options: ['Đen', 'Kẻ caro'] }, { options: ['xanh rêu', 'Kẻ caro'] }],
    });
    expect(res.status).toBe(201);
    const product = (await res.json()) as ProductDetail;
    expect(product.group.id).toBe('cat-ao');
    expect(product.variants.map((v) => v.sku)).toEqual(['SP00001-DEN-KECARO', 'SP00002-XANHRE-KECARO']);
    expect(attributes.find((a) => a.name === 'Hoạ tiết')).toMatchObject({ platformKind: null });
    expect(attributes.find((a) => a.id === 'att-mau')!.values.some((v) => v.value === 'Xanh rêu')).toBe(true);
  });

  it('tên trục 16 ký tự, giá trị 21 ký tự, giá trị trùng: 422 theo ô, không tạo thuộc tính', async () => {
    const res = await create({
      name: 'Áo lỗi FE350',
      axes: [
        { name: 'A'.repeat(16), values: [{ value: 'x' }] },
        { name: 'Hoạ tiết', values: [{ value: 'B'.repeat(21) }, { value: 'b'.repeat(21) }] },
      ],
      variants: [{ options: ['x', 'B'.repeat(21)] }],
    });
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(errors['axes.0.name']).toBe('Tên thuộc tính tối đa 15 ký tự');
    expect(errors['axes.1.values']).toBe('Có giá trị bị trùng trong trục');
    expect(errors['axes.1.values.0.value']).toBe('Mỗi giá trị tối đa 20 ký tự');
    expect(attributes.some((a) => a.name === 'Hoạ tiết')).toBe(false);
  });

  it('thiếu nhóm hàng: 422 errors.groupId', async () => {
    const res = await create({ name: 'Không nhóm', groupId: '', axes: [], variants: [{ options: [] }] });
    expect((await res.json()).errors.groupId).toBe('Chọn nhóm hàng');
  });

  it('PUT gửi groupId đổi nhóm hàng', async () => {
    const p = products.find((x) => x.id === 'prd-002')!;
    const res = await call('/catalog/products/prd-002', 'PUT', {
      name: p.name,
      description: p.description,
      imageFileIds: p.imageFileIds,
      groupId: 'cat-pk',
      version: p.version,
    });
    expect(((await res.json()) as ProductDetail).group).toEqual({ id: 'cat-pk', name: 'Phụ kiện' });
  });
});

describe('Cài đặt sản phẩm', () => {
  it('GET trả mẫu SKU, số kế tiếp; PUT mẫu sai: 422 errors.skuPattern', async () => {
    const s = await (await call('/catalog/settings')).json();
    expect(s).toMatchObject({ skuPattern: 'SP{SEQ:5}-{VAL}', skuNextSeq: 1 });
    const bad = await call('/catalog/settings', 'PUT', { skuPattern: 'ao-{SEQ}', version: s.version });
    expect(bad.status).toBe(422);
    expect((await bad.json()).errors.skuPattern).toBeTruthy();
  });
});
