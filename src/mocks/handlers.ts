/**
 * MSW handlers — mock toàn bộ API cho giai đoạn phát triển UI.
 * Tắt bằng VITE_USE_MOCKS=false khi backend thật sẵn sàng.
 *
 * Token mock dạng `mock.<accountId>.<companyId | ->.<ts>`: sau khi chọn công ty,
 * token gắn với công ty đó; các API của công ty đọc companyId từ token (như RLS ở BE).
 */

import { http, HttpResponse, delay } from 'msw';
import { db, passwords, roles, type MockMembership } from './db';
import type { Shop, ShopCreateInput, ShopUpdateInput } from '@/types/shop';
import type {
  Account,
  ChangePasswordRequest,
  CompanyContext,
  GoogleLoginRequest,
  LoginRequest,
  LoginResponse,
  Membership,
  MeResponse,
  RegisterCompanyRequest,
  RegisterCompanyResponse,
  SelectCompanyResponse,
} from '@/types/auth';
import type { CompanyStatus, LockCompanyInput } from '@/types/company';
import type { PlatformAuditAction } from '@/types/audit';
import type { PlatformOverview } from '@/api/platform.api';
import { CORE_MODULES, OPTIONAL_MODULES } from '@/utils/modules';
import { PERMISSIONS } from '@/utils/permissions';

const API = '/api';
const LATENCY = 350; // ms — để thấy được loading state

// ---------- Tiện ích ----------
function problem(
  status: number,
  title: string,
  extra: { detail?: string; code?: string; errors?: Record<string, string> } = {},
) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

function pageParams(url: URL) {
  return {
    page: Math.max(1, Number(url.searchParams.get('page') ?? '1')),
    pageSize: Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')),
  };
}

interface TokenInfo {
  account: Account;
  companyId: string | null;
}

function readToken(request: Request): TokenInfo | null {
  const auth = request.headers.get('Authorization') ?? '';
  const [prefix, accountId, companyId] = auth.replace(/^Bearer /, '').split('.');
  if (prefix !== 'mock') return null;
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) return null;
  return { account, companyId: companyId && companyId !== '-' ? companyId : null };
}

function makeToken(accountId: string, companyId: string | null) {
  return `mock.${accountId}.${companyId ?? '-'}.${Date.now()}`;
}

function toMembership(m: MockMembership): Membership {
  const company = db.companies.find((c) => c.id === m.companyId)!;
  return {
    companyId: company.id,
    companyName: company.name,
    companyStatus: company.status,
    status: m.status,
    roles: m.roleKeys.map((k) => roles[k].name),
  };
}

function membershipsOf(accountId: string): Membership[] {
  return db.memberships.filter((m) => m.accountId === accountId).map(toMembership);
}

function buildContext(m: MockMembership): CompanyContext {
  const company = db.companies.find((c) => c.id === m.companyId)!;
  return {
    companyId: company.id,
    companyName: company.name,
    roles: m.roleKeys.map((k) => roles[k].name),
    permissions: [...new Set(m.roleKeys.flatMap((k) => roles[k].permissions))],
    enabledModules: [...CORE_MODULES, ...company.optionalModules],
  };
}

type Guard<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Còn mật khẩu trong thư mời: BE chặn mọi chức năng trừ đổi mật khẩu (UC-PI-03 bước 7). */
function passwordChangeRequired(account: Account) {
  return account.mustChangePassword
    ? problem(403, 'Cần đổi mật khẩu trước khi tiếp tục', { code: 'password_change_required' })
    : null;
}

function loginPayload(account: Account): LoginResponse {
  return {
    accessToken: makeToken(account.id, null),
    account,
    memberships: account.isPlatformAdmin ? [] : membershipsOf(account.id),
  };
}

function requirePlatformAdmin(request: Request): Guard<Account> {
  const token = readToken(request);
  if (!token) return { ok: false, response: problem(401, 'Chưa đăng nhập') };
  const blocked = passwordChangeRequired(token.account);
  if (blocked) return { ok: false, response: blocked };
  if (!token.account.isPlatformAdmin) {
    return { ok: false, response: problem(403, 'Chỉ quản trị nền tảng được thực hiện') };
  }
  return { ok: true, value: token.account };
}

/** Kiểm như BE: token có công ty, công ty còn hoạt động, tài khoản không bị khoá, phân hệ bật, có quyền. */
function requireCompany(
  request: Request,
  permission: string,
): Guard<{ companyId: string }> {
  const token = readToken(request);
  if (!token) return { ok: false, response: problem(401, 'Chưa đăng nhập') };
  const blocked = passwordChangeRequired(token.account);
  if (blocked) return { ok: false, response: blocked };
  if (!token.companyId) {
    return { ok: false, response: problem(403, 'Chưa chọn công ty', { code: 'no_company' }) };
  }
  const membership = db.memberships.find(
    (m) => m.accountId === token.account.id && m.companyId === token.companyId,
  );
  const company = db.companies.find((c) => c.id === token.companyId);
  if (!membership || !company) {
    return { ok: false, response: problem(403, 'Không thuộc công ty này') };
  }
  if (company.status === 'locked') {
    return {
      ok: false,
      response: problem(403, 'Công ty đang bị khoá', { code: 'company_locked' }),
    };
  }
  if (membership.status === 'locked') {
    return {
      ok: false,
      response: problem(403, 'Tài khoản bị khoá trong công ty này', { code: 'company_locked' }),
    };
  }
  const context = buildContext(membership);
  const module = permission.split('.')[0];
  if (!context.enabledModules.includes(module as never)) {
    return { ok: false, response: problem(403, 'Phân hệ chưa bật', { code: 'module_disabled' }) };
  }
  if (!context.permissions.includes(permission)) {
    return { ok: false, response: problem(403, 'Không có quyền thực hiện') };
  }
  return { ok: true, value: { companyId: company.id } };
}

function writePlatformLog(
  action: PlatformAuditAction,
  companyId: string,
  actorEmail: string,
  reason?: string,
) {
  const company = db.companies.find((c) => c.id === companyId)!;
  db.auditLogs.unshift({
    id: `pal-${Date.now()}`,
    action,
    targetCompanyId: company.id,
    targetCompanyName: company.name,
    actorEmail,
    reason,
    createdAt: db.now(),
  });
}

// ---------- Auth ----------
const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as LoginRequest;
    const account = db.accounts.find((a) => a.email === body.email);
    if (!account || passwords[body.email] !== body.password) {
      return problem(401, 'Email hoặc mật khẩu không đúng');
    }
    return HttpResponse.json(loginPayload(account));
  }),

  // Mock: credential chính là email Google trả về. BE thật kiểm ID token với Google.
  http.post(`${API}/auth/google`, async ({ request }) => {
    await delay(LATENCY);
    const { credential } = (await request.json()) as GoogleLoginRequest;
    const account = db.accounts.find((a) => a.email === credential.trim().toLowerCase());
    if (!account) {
      return problem(401, 'Chưa có tài khoản', {
        code: 'google_account_not_found',
        detail: `Email ${credential} chưa có tài khoản Commerio. Hệ thống không tự tạo tài khoản; hãy nhờ CEO công ty mời bạn.`,
      });
    }
    return HttpResponse.json(loginPayload(account));
  }),

  // UC-PI-01
  http.post(`${API}/auth/register`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as RegisterCompanyRequest;
    const email = body.ceo.email.trim().toLowerCase();
    if (db.accounts.some((a) => a.email === email)) {
      return problem(409, 'Email đã được dùng', {
        code: 'email_taken',
        errors: { 'ceo.email': 'Email này đã có tài khoản' },
      });
    }
    if (body.optionalModules.includes('assistant') && !body.assistantDataConsent) {
      return problem(422, 'Chưa đồng ý gửi dữ liệu tới OpenAI', {
        errors: { assistantDataConsent: 'Cần đồng ý để bật Trợ lý AI' },
      });
    }
    const seq = String(db.companies.length + 1).padStart(3, '0');
    const companyId = `cmp-${seq}-${Date.now().toString(36)}`;
    const accountId = `acc-${Date.now().toString(36)}`;
    db.companies.push({
      id: companyId,
      name: body.company.name.trim(),
      taxCode: body.company.taxCode.trim(),
      ceoName: body.ceo.fullName.trim(),
      ceoEmail: email,
      optionalModules: body.optionalModules,
      status: 'active',
      createdAt: db.now(),
    });
    db.accounts.push({
      id: accountId,
      email,
      fullName: body.ceo.fullName.trim(),
      isPlatformAdmin: false,
      mustChangePassword: false,
    });
    db.memberships.push({ accountId, companyId, roleKeys: ['ceo'], status: 'active' });
    passwords[email] = body.ceo.password;
    writePlatformLog('company.registered', companyId, email);
    const payload: RegisterCompanyResponse = { companyId, email };
    return HttpResponse.json(payload, { status: 201 });
  }),

  // UC-PI-04
  http.post(`${API}/auth/change-password`, async ({ request }) => {
    await delay(LATENCY);
    const token = readToken(request);
    if (!token) return problem(401, 'Chưa đăng nhập');
    const body = (await request.json()) as ChangePasswordRequest;
    if (passwords[token.account.email] !== body.currentPassword) {
      return problem(422, 'Mật khẩu hiện tại không đúng', {
        errors: { currentPassword: 'Mật khẩu hiện tại không đúng' },
      });
    }
    passwords[token.account.email] = body.newPassword;
    token.account.mustChangePassword = false;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    await delay(100);
    const token = readToken(request);
    if (!token) return problem(401, 'Chưa đăng nhập');
    const payload: MeResponse = {
      account: token.account,
      memberships: token.account.isPlatformAdmin ? [] : membershipsOf(token.account.id),
    };
    return HttpResponse.json(payload);
  }),

  http.post(`${API}/auth/select-company`, async ({ request }) => {
    await delay(LATENCY);
    const token = readToken(request);
    if (!token) return problem(401, 'Chưa đăng nhập');
    const blocked = passwordChangeRequired(token.account);
    if (blocked) return blocked;
    const { companyId } = (await request.json()) as { companyId: string };
    const membership = db.memberships.find(
      (m) => m.accountId === token.account.id && m.companyId === companyId,
    );
    if (!membership) return problem(403, 'Không thuộc công ty này');
    const company = db.companies.find((c) => c.id === companyId)!;
    if (company.status === 'locked') {
      return problem(403, 'Công ty đang bị khoá', {
        code: 'company_locked',
        detail: 'Công ty đã bị quản trị nền tảng khoá, nhân viên không đăng nhập được.',
      });
    }
    if (membership.status === 'locked') {
      return problem(403, 'Tài khoản bị khoá trong công ty này', { code: 'company_locked' });
    }
    const payload: SelectCompanyResponse = {
      accessToken: makeToken(token.account.id, companyId),
      context: buildContext(membership),
    };
    return HttpResponse.json(payload);
  }),
];

// ---------- Platform (UC-PI-08) ----------
const platformHandlers = [
  http.get(`${API}/platform/overview`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requirePlatformAdmin(request);
    if (!guard.ok) return guard.response;
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const payload: PlatformOverview = {
      totalCompanies: db.companies.length,
      activeCompanies: db.companies.filter((c) => c.status === 'active').length,
      lockedCompanies: db.companies.filter((c) => c.status === 'locked').length,
      registeredLast30Days: db.companies.filter((c) => Date.parse(c.createdAt) >= since).length,
      optionalModuleUsage: OPTIONAL_MODULES.map((module) => ({
        module,
        companies: db.companies.filter((c) => c.optionalModules.includes(module)).length,
      })),
      recentActivities: [...db.auditLogs]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    };
    return HttpResponse.json(payload);
  }),

  http.get(`${API}/platform/companies`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requirePlatformAdmin(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const status = url.searchParams.get('status') as CompanyStatus | null;

    let items = [...db.companies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (search) {
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.taxCode.includes(search) ||
          c.ceoEmail.toLowerCase().includes(search),
      );
    }
    if (status) items = items.filter((c) => c.status === status);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/platform/companies/:id/lock`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requirePlatformAdmin(request);
    if (!guard.ok) return guard.response;
    const company = db.companies.find((c) => c.id === params.id);
    if (!company) return problem(404, 'Không tìm thấy công ty');
    const { reason } = (await request.json()) as LockCompanyInput;
    if (!reason?.trim()) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: 'Cần nhập lý do khoá' } });
    }
    if (company.status === 'locked') {
      return problem(409, 'Trạng thái công ty đã thay đổi', {
        code: 'state_conflict',
        detail: `${company.name} đã bị khoá ở một phiên khác.`,
      });
    }
    company.status = 'locked';
    company.lockReason = reason.trim();
    company.lockedAt = db.now();
    writePlatformLog('company.locked', company.id, guard.value.email, company.lockReason);
    return HttpResponse.json(company);
  }),

  http.post(`${API}/platform/companies/:id/unlock`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requirePlatformAdmin(request);
    if (!guard.ok) return guard.response;
    const company = db.companies.find((c) => c.id === params.id);
    if (!company) return problem(404, 'Không tìm thấy công ty');
    if (company.status === 'active') {
      return problem(409, 'Trạng thái công ty đã thay đổi', {
        code: 'state_conflict',
        detail: `${company.name} đã được mở khoá ở một phiên khác.`,
      });
    }
    company.status = 'active';
    company.lockReason = undefined;
    company.lockedAt = undefined;
    writePlatformLog('company.unlocked', company.id, guard.value.email);
    return HttpResponse.json(company);
  }),

  http.get(`${API}/platform/audit-logs`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requirePlatformAdmin(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const action = url.searchParams.get('action');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let items = [...db.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (action) items = items.filter((l) => l.action === action);
    if (search) {
      items = items.filter(
        (l) =>
          l.targetCompanyName.toLowerCase().includes(search) ||
          l.actorEmail.toLowerCase().includes(search),
      );
    }
    if (from) items = items.filter((l) => l.createdAt.slice(0, 10) >= from);
    if (to) items = items.filter((l) => l.createdAt.slice(0, 10) <= to);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),
];

// ---------- Channel: gian hàng của công ty đang chọn ----------
function findShop(id: unknown, companyId: string) {
  return db.shops.findIndex((s) => s.id === id && s.companyId === companyId);
}

const shopHandlers = [
  http.get(`${API}/channel/shops`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const platform = url.searchParams.get('platform') ?? '';

    let items = db.shops.filter((s) => s.companyId === guard.value.companyId);
    if (search) {
      items = items.filter(
        (s) =>
          s.shopName.toLowerCase().includes(search) ||
          s.externalShopId.toLowerCase().includes(search),
      );
    }
    if (platform) items = items.filter((s) => s.platform === platform);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/channel/shops/bulk-delete`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopDisconnect);
    if (!guard.ok) return guard.response;
    const { ids } = (await request.json()) as { ids: string[] };
    const before = db.shops.length;
    db.shops = db.shops.filter(
      (s) => !(ids.includes(s.id) && s.companyId === guard.value.companyId),
    );
    return HttpResponse.json({ deleted: before - db.shops.length });
  }),

  http.post(`${API}/channel/shops`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as Omit<ShopCreateInput, 'companyId'>;
    const newShop: Shop = {
      id: `shp-${Date.now()}`,
      companyId: guard.value.companyId,
      ...body,
      createdAt: db.now(),
      updatedAt: db.now(),
    };
    db.shops.unshift(newShop);
    return HttpResponse.json(newShop, { status: 201 });
  }),

  http.patch(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopUpdate);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const patch = (await request.json()) as ShopUpdateInput;
    db.shops[idx] = { ...db.shops[idx], ...patch, updatedAt: db.now() };
    return HttpResponse.json(db.shops[idx]);
  }),

  http.delete(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopDisconnect);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const [removed] = db.shops.splice(idx, 1);
    return HttpResponse.json(removed);
  }),

  http.post(`${API}/channel/shops/:id/sync`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopSync);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    db.shops[idx] = { ...db.shops[idx], lastOrderSyncAt: db.now(), updatedAt: db.now() };
    return HttpResponse.json({ ok: true, lastOrderSyncAt: db.shops[idx].lastOrderSyncAt });
  }),
];

export const handlers = [...authHandlers, ...platformHandlers, ...shopHandlers];
