import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { companySettingsHandlers } from './companySettings';
import { db } from '../db';
import { queueLabel } from '@/features/company/deadJobLabels';

const server = setupServer(...companySettingsHandlers);
const snapshot = structuredClone(db.deadJobs);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  db.deadJobs.splice(0, db.deadJobs.length, ...structuredClone(snapshot));
});

// acc-001 là CEO của cmp-001; acc-005 là Sale (không có platform.job.manage)
const call = (path: string, method = 'GET', account = 'acc-001') =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}` },
  });

describe('Việc nền lỗi (§14.5)', () => {
  it('chỉ việc của công ty đang chọn, mới nhất trước, lọc theo hàng', async () => {
    const all = await (await call('/platform/jobs/dead')).json();
    expect(all.total).toBe(4);
    const times = all.items.map((j: { failedAt: string }) => j.failedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(all.items[0]).not.toHaveProperty('companyId');
    const pull = await (await call('/platform/jobs/dead?queue=channel.order_pull')).json();
    expect(pull.items.map((j: { queue: string }) => j.queue)).toEqual(['channel.order_pull']);
  });

  it('chạy lại trả 204, việc rời hàng lỗi; chạy lại lần nữa hoặc việc công ty khác thì 404', async () => {
    const id = snapshot.find((j) => j.companyId === 'cmp-001')!.id;
    expect((await call(`/platform/jobs/dead/${id}/retry`, 'POST')).status).toBe(204);
    expect((await (await call('/platform/jobs/dead')).json()).total).toBe(3);
    const again = await call(`/platform/jobs/dead/${id}/retry`, 'POST');
    expect(again.status).toBe(404);
    expect((await again.json()).code).toBe('not_found');
    const other = snapshot.find((j) => j.companyId === 'cmp-002')!.id;
    expect((await call(`/platform/jobs/dead/${other}/retry`, 'POST')).status).toBe(404);
  });

  it('không có quyền platform.job.manage thì 403', async () => {
    const sale = db.accounts.find((a) => a.email === 'sale@commerio.vn')!.id;
    expect((await call('/platform/jobs/dead', 'GET', sale)).status).toBe(403);
  });

  it('nhãn hàng tiếng Việt, tên lạ hiện nguyên', () => {
    expect(queueLabel('channel.order_pull')).toBe('Lấy đơn');
    expect(queueLabel('channel.open_order_pull')).toBe('Lấy đơn còn mở');
    expect(queueLabel('report.daily_rollup')).toBe('report.daily_rollup');
  });
});
