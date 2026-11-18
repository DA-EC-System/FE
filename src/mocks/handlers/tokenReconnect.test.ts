// Kết nối lại bằng token theo shopId (commerio-backend#398, Documents#162): như BE, token của seller khác là shop_mismatch
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

const paste = (platform: string, body: unknown, company = 'cmp-001') =>
  fetch(`http://localhost/api/v1/channel/shops/${platform}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer mock.acc-001.${company}.${Date.now()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('POST /channel/shops/:platform/token có shopId', () => {
  it('token của seller khác: 409 shop_mismatch kèm expected, actual; không tạo gian hàng, gian hàng cần nối giữ nguyên', async () => {
    const shops = db.shops.length;
    const before = structuredClone(db.shops.find((s) => s.id === 'shp-008'));
    const res = await paste('tiktok', { accessToken: 'tt-token-khac99', shopId: 'shp-008' });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('shop_mismatch');
    expect(body.expected).toEqual({ name: before!.shopName, externalShopId: 'tiktok-abc-outlet' });
    expect(body.actual).toMatchObject({ externalShopId: 'TKN-KHAC99' });
    expect(db.shops).toHaveLength(shops);
    expect(db.shops.find((s) => s.id === 'shp-008')).toEqual(before);
  });

  it('gian hàng của công ty khác, sàn khác hoặc không có: 404', async () => {
    for (const [platform, shopId] of [['mock', 'shp-005'], ['lazada', 'shp-008'], ['tiktok', 'shp-khong-co']]) {
      const res = await paste(platform, { accessToken: `ma:x-${shopId}`, shopId });
      expect(res.status).toBe(404);
    }
  });

  it('shopId rỗng: 422 errors.shopId', async () => {
    const res = await paste('tiktok', { accessToken: 'ma:tiktok-abc-outlet', shopId: '  ' });
    expect(res.status).toBe(422);
    expect((await json(res)).errors).toHaveProperty('shopId');
  });

  it('token của đúng seller (mock: "ma:<mã gian hàng trên sàn>"): nối lại đúng dòng, không tạo dòng mới', async () => {
    const shops = db.shops.length;
    const res = await paste('tiktok', { accessToken: 'ma:tiktok-abc-outlet', shopId: 'shp-008' });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ created: false, shop: { id: 'shp-008' } });
    expect(db.shops).toHaveLength(shops);
    expect(db.shops.find((s) => s.id === 'shp-008')!.status).not.toBe('disconnected');
  });
});
