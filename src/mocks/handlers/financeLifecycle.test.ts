import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { financeLifecycleHandlers } from './financeLifecycle';
import { configs, payments, bankLines } from '../financeLifecycleData';
const server = setupServer(...financeLifecycleHandlers);
const snapshot = structuredClone({ configs, payments, bankLines });
beforeAll(() => { vi.stubGlobal('location', new URL('http://localhost')); server.listen({ onUnhandledRequest: 'error' }); });
afterAll(() => { server.close(); vi.unstubAllGlobals(); });
beforeEach(() => { configs.splice(0, configs.length, ...structuredClone(snapshot.configs)); payments.splice(0, payments.length, ...structuredClone(snapshot.payments)); bankLines.splice(0, bankLines.length, ...structuredClone(snapshot.bankLines)); });
const call = (path: string, actor = 'acc-001', company = 'cmp-001', body?: unknown) => fetch(`http://localhost/api/v1${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer mock.${actor}.${company}.${Date.now()}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
describe('D4 mock dùng hợp đồng mới', () => {
  it('công ty khác không đọc được chi tiết và không được khớp sao kê hộ', async () => {
    const foreign = payments.find((p) => p.companyId === 'cmp-002')!;
    expect((await call(`/finance/payments/${foreign.orderId}`)).status).toBe(404);
    expect((await call('/finance/ledger/withdraw-cmp-002/bank-match', 'acc-001', 'cmp-001', { bankRef: 'X' })).status).toBe(404);
  });
  it('bank match chỉ ghi một lần, Sale không được đọc', async () => {
    expect((await call('/finance/payments', 'acc-002')).status).toBe(403);
    expect((await call('/finance/ledger/withdraw-cmp-001/bank-match', 'acc-001', 'cmp-001', { bankRef: 'BANK-1' })).status).toBe(200);
    expect((await call('/finance/ledger/withdraw-cmp-001/bank-match', 'acc-001', 'cmp-001', { bankRef: 'BANK-2' })).status).toBe(409);
  });
  it('Admin chờ CEO duyệt; version cũ không ghi; chốt có lịch sử', async () => {
    const row = payments.find((p) => p.companyId === 'cmp-001' && p.needsCeoApproval)!;
    const path = `/finance/payments/${row.orderId}`;
    expect((await call(`${path}/resolve`, 'acc-005', 'cmp-001', { version: row.version, reason: 'Xác minh' })).status).toBe(409);
    expect((await call(`${path}/ceo-approve`, 'acc-001', 'cmp-001', { version: row.version })).status).toBe(200);
    expect((await call(`${path}/resolve`, 'acc-005', 'cmp-001', { version: 1, reason: 'Xác minh' })).status).toBe(409);
    expect((await call(`${path}/resolve`, 'acc-005', 'cmp-001', { version: row.version, reason: 'Xác minh' })).status).toBe(200);
    expect(row.status).toBe('resolved'); expect(row.statusHistory[row.statusHistory.length - 1]?.reason).toBe('Xác minh');
  });
  it('chạy thử không ghi sổ, duyệt hôm nay kích hoạt và giữ dấu tự duyệt', async () => {
    const create = await call('/finance/configs', 'acc-001', 'cmp-001', { kind: 'min_margin', payload: { pct: 10 }, effectiveFrom: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) });
    expect(create.status).toBe(201); let config = await create.json();
    const before = structuredClone(payments);
    expect((await call(`/finance/configs/${config.id}/submit`, 'acc-001', 'cmp-001', { version: config.version })).status).toBe(422);
    config = await (await call(`/finance/configs/${config.id}/dry-run`, 'acc-001', 'cmp-001', { version: config.version })).json();
    expect(payments).toEqual(before);
    config = await (await call(`/finance/configs/${config.id}/submit`, 'acc-001', 'cmp-001', { version: config.version })).json();
    config = await (await call(`/finance/configs/${config.id}/approve`, 'acc-001', 'cmp-001', { version: config.version })).json();
    expect(config.status).toBe('active'); expect(config.selfApproved).toBe(true);
  });
});
