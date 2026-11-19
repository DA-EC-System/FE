import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { companyProfileHandlers } from './companyProfile';
import { platformCategoryHandlers } from './platformCategories';

const server = setupServer(...companyProfileHandlers, ...platformCategoryHandlers);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

/** acc-001 là CEO của cmp-001; acc-003 là Nhân viên kho */
const call = (path: string, method = 'GET', body?: unknown, account = 'acc-001') =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('Hồ sơ công ty (FE#267, commerio-backend#292)', () => {
  it('ô trống theo tên, địa chỉ công ty; sửa thì tăng version và điền sẵn thuộc tính sàn', async () => {
    const profile = await (await call('/platform/company')).json();
    expect(profile).toMatchObject({
      name: 'Công ty Cổ phần Thời trang ABC',
      responsibleName: null,
      effectiveResponsible: { name: 'Công ty Cổ phần Thời trang ABC', address: profile.address },
      version: 1,
    });

    const res = await call('/platform/company', 'PUT', { responsibleName: '  Xưởng may ABC  ', version: 1 });
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved).toMatchObject({ responsibleName: 'Xưởng may ABC', version: 2 });
    expect(saved.effectiveResponsible.name).toBe('Xưởng may ABC');

    const leaf = await (await call('/channel/platforms/tiktok/categories/601226')).json();
    expect(leaf.attributes.find((a: { code: string }) => a.code === '101489').defaultValue).toBe('Xưởng may ABC');
  });

  it('không đổi gì thì giữ version; version cũ thì 409 kèm current; ô rỗng 422', async () => {
    const same = await (await call('/platform/company', 'PUT', { responsibleName: 'Xưởng may ABC', version: 2 })).json();
    expect(same.version).toBe(2);

    const stale = await call('/platform/company', 'PUT', { address: 'Khác', version: 1 });
    expect(stale.status).toBe(409);
    const conflict = await stale.json();
    expect(conflict.code).toBe('version_conflict');
    expect(conflict.current.version).toBe(2);

    const blank = await call('/platform/company', 'PUT', { address: '   ', version: 2 });
    expect(blank.status).toBe(422);
    expect((await blank.json()).errors.address).toBeTruthy();
  });

  it('Nhân viên kho không có platform.company.manage: 403', async () => {
    expect((await call('/platform/company', 'GET', undefined, 'acc-003')).status).toBe(403);
  });
});
