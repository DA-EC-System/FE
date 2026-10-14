/**
 * MSW handlers — mock toàn bộ API cho giai đoạn phát triển UI.
 * Tắt bằng VITE_USE_MOCKS=false khi backend thật sẵn sàng.
 */

import { http, HttpResponse, delay } from 'msw';
import { db, passwords } from './db';
import type {
  Company,
  CompanyCreateInput,
  CompanyUpdateInput,
} from '@/types/company';
import type {
  Shop,
  ShopCreateInput,
  ShopUpdateInput,
} from '@/types/shop';
import type { LoginRequest, LoginResponse } from '@/types/auth';

const API = '/api';
const LATENCY = 350; // ms — để thấy được loading state

// ---------- Auth ----------
const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as LoginRequest;
    const user = db.users.find((u) => u.email === body.email);
    if (!user || passwords[body.email] !== body.password) {
      return HttpResponse.json(
        { message: 'Email hoặc mật khẩu không đúng' },
        { status: 401 },
      );
    }
    const payload: LoginResponse = {
      accessToken: `mock.${user.id}.${Date.now()}`,
      user,
    };
    return HttpResponse.json(payload, { status: 200 });
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    await delay(50);
    const auth = request.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer mock.')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.split('.')[1];
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return HttpResponse.json({ message: 'User not found' }, { status: 404 });
    }
    return HttpResponse.json(user);
  }),
];

// ---------- Companies ----------
function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: items.slice(start, end),
    total: items.length,
    page,
    pageSize,
  };
}

const companyHandlers = [
  http.get(`${API}/admin/companies`, async ({ request }) => {
    await delay(LATENCY);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();

    let filtered = db.companies;
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.taxCode.toLowerCase().includes(search),
      );
    }

    return HttpResponse.json(paginate(filtered, page, pageSize));
  }),

  http.get(`${API}/admin/companies/:id`, async ({ params }) => {
    await delay(LATENCY);
    const company = db.companies.find((c) => c.id === params.id);
    if (!company) {
      return HttpResponse.json(
        { message: 'Company not found' },
        { status: 404 },
      );
    }
    return HttpResponse.json(company);
  }),

  http.post(`${API}/admin/companies`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as CompanyCreateInput;
    const newCompany: Company = {
      id: `cmp-${Date.now()}`,
      name: body.name,
      taxCode: body.taxCode,
      status: body.status,
      lockReason: body.lockReason,
      lockedAt: body.status === 'locked' ? db.now() : undefined,
      createdAt: db.now(),
      updatedAt: db.now(),
    };
    db.companies.unshift(newCompany);
    return HttpResponse.json(newCompany, { status: 201 });
  }),

  http.patch(`${API}/admin/companies/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const idx = db.companies.findIndex((c) => c.id === params.id);
    if (idx === -1) {
      return HttpResponse.json(
        { message: 'Company not found' },
        { status: 404 },
      );
    }
    const patch = (await request.json()) as CompanyUpdateInput;
    const next: Company = {
      ...db.companies[idx],
      ...patch,
      updatedAt: db.now(),
    };
    if (next.status === 'locked' && !next.lockedAt) {
      next.lockedAt = db.now();
    }
    if (next.status === 'active') {
      next.lockedAt = undefined;
      next.lockReason = undefined;
    }
    db.companies[idx] = next;
    return HttpResponse.json(next);
  }),

  http.delete(`${API}/admin/companies/:id`, async ({ params }) => {
    await delay(LATENCY);
    const idx = db.companies.findIndex((c) => c.id === params.id);
    if (idx === -1) {
      return HttpResponse.json(
        { message: 'Company not found' },
        { status: 404 },
      );
    }
    const removed = db.companies.splice(idx, 1)[0];
    // cascade: xoá luôn shop thuộc company
    db.shops = db.shops.filter((s) => s.companyId !== removed.id);
    return HttpResponse.json(removed);
  }),

  http.post(`${API}/admin/companies/bulk-delete`, async ({ request }) => {
    await delay(LATENCY);
    const { ids } = (await request.json()) as { ids: string[] };
    db.companies = db.companies.filter((c) => !ids.includes(c.id));
    db.shops = db.shops.filter((s) => !ids.includes(s.companyId));
    return HttpResponse.json({ deleted: ids.length });
  }),
];

// ---------- Shops ----------
const shopHandlers = [
  http.get(`${API}/admin/companies/:companyId/shops`, async ({ params, request }) => {
    await delay(LATENCY);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const platform = url.searchParams.get('platform') ?? '';

    let items = db.shops.filter((s) => s.companyId === params.companyId);
    if (search) {
      items = items.filter(
        (s) =>
          s.shopName.toLowerCase().includes(search) ||
          s.externalShopId.toLowerCase().includes(search),
      );
    }
    if (platform) {
      items = items.filter((s) => s.platform === platform);
    }

    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/admin/companies/:companyId/shops`, async ({ params, request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as Omit<ShopCreateInput, 'companyId'>;
    const newShop: Shop = {
      id: `shp-${Date.now()}`,
      companyId: params.companyId as string,
      ...body,
      createdAt: db.now(),
      updatedAt: db.now(),
    };
    db.shops.unshift(newShop);
    return HttpResponse.json(newShop, { status: 201 });
  }),

  http.patch(`${API}/admin/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const idx = db.shops.findIndex((s) => s.id === params.id);
    if (idx === -1) {
      return HttpResponse.json(
        { message: 'Shop not found' },
        { status: 404 },
      );
    }
    const patch = (await request.json()) as ShopUpdateInput;
    db.shops[idx] = { ...db.shops[idx], ...patch, updatedAt: db.now() };
    return HttpResponse.json(db.shops[idx]);
  }),

  http.delete(`${API}/admin/shops/:id`, async ({ params }) => {
    await delay(LATENCY);
    const idx = db.shops.findIndex((s) => s.id === params.id);
    if (idx === -1) {
      return HttpResponse.json(
        { message: 'Shop not found' },
        { status: 404 },
      );
    }
    const [removed] = db.shops.splice(idx, 1);
    return HttpResponse.json(removed);
  }),

  http.post(`${API}/admin/shops/:id/sync`, async ({ params }) => {
    await delay(LATENCY * 2);
    const idx = db.shops.findIndex((s) => s.id === params.id);
    if (idx === -1) {
      return HttpResponse.json(
        { message: 'Shop not found' },
        { status: 404 },
      );
    }
    db.shops[idx] = {
      ...db.shops[idx],
      lastOrderSyncAt: db.now(),
      updatedAt: db.now(),
    };
    return HttpResponse.json({
      ok: true,
      lastOrderSyncAt: db.shops[idx].lastOrderSyncAt,
    });
  }),

  http.post(`${API}/admin/shops/bulk-delete`, async ({ request }) => {
    await delay(LATENCY);
    const { ids } = (await request.json()) as { ids: string[] };
    db.shops = db.shops.filter((s) => !ids.includes(s.id));
    return HttpResponse.json({ deleted: ids.length });
  }),
];

export const handlers = [
  ...authHandlers,
  ...companyHandlers,
  ...shopHandlers,
];
