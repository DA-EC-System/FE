import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { fulfillmentHandlers } from './fulfillment';
import { findVariant, parseScannedLines, receivedLines } from './inventory';
import { levelOf } from '../inventoryData';
import * as catalog from '../catalogData';

// Quét nhận hàng về theo số lượng (FE#212). acc-001 là CEO của cmp-001
const server = setupServer(...fulfillmentHandlers);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

const call = (path: string, body?: unknown) =>
  fetch(`http://localhost/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer mock.acc-001.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const variantOf = (companyId: string, skip: string[] = []) =>
  catalog.products.filter((p) => p.companyId === companyId).flatMap((p) => p.variants).find((v) => !skip.includes(v.id))!.id;

describe('parseScannedLines', () => {
  const own = variantOf('cmp-001');
  const foreign = variantOf('cmp-002');

  it('vắng lines là quét đủ; lines sai kiểu hoặc quá 200 dòng bị chặn', () => {
    expect(parseScannedLines(undefined, 'cmp-001')).toEqual({ errors: {}, lines: null });
    expect(parseScannedLines('x', 'cmp-001').errors).toEqual({ lines: 'Danh sách hàng quét không hợp lệ' });
    const many = Array.from({ length: 201 }, () => ({ variantId: own, quantity: 1 }));
    expect(parseScannedLines(many, 'cmp-001').errors).toEqual({ lines: 'Tối đa 200 dòng' });
  });

  it('lỗi từng dòng: biến thể công ty khác, lặp, số âm hoặc lẻ', () => {
    const r = parseScannedLines(
      [
        { variantId: own, quantity: 1 },
        { variantId: own, quantity: -1 },
        { variantId: foreign, quantity: 1.5 },
      ],
      'cmp-001',
    );
    expect(findVariant(foreign)?.product.companyId).toBe('cmp-002');
    expect(r.errors).toEqual({
      'lines.1.variantId': 'Biến thể bị lặp',
      'lines.1.quantity': 'Số lượng là số nguyên không âm',
      'lines.2.variantId': 'Biến thể không thuộc công ty',
      'lines.2.quantity': 'Số lượng là số nguyên không âm',
    });
  });
});

describe('receivedLines', () => {
  const src = [
    { variantId: 'a', quantity: 2 },
    { variantId: 'a', quantity: 1 },
    { variantId: 'b', quantity: 1 },
  ];
  it('gộp theo biến thể, vắng số quét thì quét đủ', () => {
    expect(receivedLines(src, null)).toEqual([
      { variantId: 'a', expected: 3, scanned: 3 },
      { variantId: 'b', expected: 1, scanned: 1 },
    ]);
  });
  it('món không quét là 0, món lạ thành dòng dự kiến 0, bỏ món lạ quét 0', () => {
    const scanned = [
      { variantId: 'a', quantity: 1 },
      { variantId: 'c', quantity: 2 },
      { variantId: 'd', quantity: 0 },
    ];
    expect(receivedLines(src, scanned)).toEqual([
      { variantId: 'a', expected: 3, scanned: 1 },
      { variantId: 'b', expected: 1, scanned: 0 },
      { variantId: 'c', expected: 0, scanned: 2 },
    ]);
  });
});

describe('POST /fulfillment/packages/:id/receive-return', () => {
  it('422 lỗi từng dòng trước khi đổi trạng thái; nhận xong chờ xử lý tăng đúng số quét', async () => {
    let p = await (await call('/fulfillment/packages/pkg-1016')).json();
    const r = await call('/fulfillment/packages/pkg-1016/delivery', { action: 'return', version: p.version });
    expect(r.status).toBe(200);
    p = await (await call('/fulfillment/packages/pkg-1016')).json();
    expect(p.status).toBe('returning');

    const mine = p.lines[0].variantId as string;
    const extra = variantOf('cmp-001', p.lines.map((l: { variantId: string }) => l.variantId));
    const bad = await call('/fulfillment/packages/pkg-1016/receive-return', {
      code: p.code,
      version: p.version,
      lines: [
        { variantId: mine, quantity: 0 },
        { variantId: mine, quantity: 1 },
      ],
    });
    expect(bad.status).toBe(422);
    expect((await bad.json()).errors).toEqual({ 'lines.1.variantId': 'Biến thể bị lặp' });
    expect((await (await call('/fulfillment/packages/pkg-1016')).json()).status).toBe('returning');

    const before = { mine: levelOf('cmp-001', mine).quarantine, extra: levelOf('cmp-001', extra).quarantine };
    const ok = await call('/fulfillment/packages/pkg-1016/receive-return', {
      code: p.code,
      version: p.version,
      lines: [
        { variantId: mine, quantity: 0 },
        { variantId: extra, quantity: 2 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(levelOf('cmp-001', mine).quarantine).toBe(before.mine);
    expect(levelOf('cmp-001', extra).quarantine).toBe(before.extra + 2);
  });
});
