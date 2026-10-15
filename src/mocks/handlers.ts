/**
 * MSW handlers — mock toàn bộ API cho giai đoạn phát triển UI.
 * Tắt bằng VITE_USE_MOCKS=false khi backend thật sẵn sàng.
 *
 * Token mock dạng `mock.<accountId>.<companyId | ->.<ts>`: sau khi chọn công ty,
 * token gắn với công ty đó; các API của công ty đọc companyId từ token (như RLS ở BE).
 */

import { http, HttpResponse, delay } from 'msw';
import { CEO_ROLE_ID, db, passwords, permissionCatalog, type MockMembership, type MockRole } from './db';
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
import type {
  ActorRef,
  AuditAction,
  CompanyAuditLog,
  CompanyAuditLogDetail,
  CompanyModule,
  SetModuleInput,
  SetModuleResult,
} from '@/types/companySettings';
import { MODULE_LABELS, type OptionalModuleKey } from '@/utils/modules';
import type {
  InviteStaffInput,
  InviteStaffResult,
  Role,
  RoleInput,
  StaffMember,
} from '@/types/identity';
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
  extra: {
    detail?: string;
    code?: string;
    errors?: Record<string, string>;
    [key: string]: unknown;
  } = {},
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
    roles: rolesOfMember(m).map((r) => r.name),
  };
}

function membershipsOf(accountId: string): Membership[] {
  return db.memberships.filter((m) => m.accountId === accountId).map(toMembership);
}

function rolesOfMember(m: MockMembership): MockRole[] {
  return m.roleIds
    .map((id) => db.roles.find((r) => r.id === id))
    .filter((r): r is MockRole => Boolean(r));
}

function enabledModulesOf(companyId: string) {
  const company = db.companies.find((c) => c.id === companyId)!;
  return [...CORE_MODULES, ...company.optionalModules] as string[];
}

/** Quyền thực có: hợp các vai trò, bỏ quyền của phân hệ công ty chưa bật */
function permissionsOf(m: MockMembership): string[] {
  const enabled = enabledModulesOf(m.companyId);
  return [...new Set(rolesOfMember(m).flatMap((r) => r.permissions))].filter((p) =>
    enabled.includes(p.split('.')[0]),
  );
}

function buildContext(m: MockMembership): CompanyContext {
  const company = db.companies.find((c) => c.id === m.companyId)!;
  return {
    companyId: company.id,
    companyName: company.name,
    roles: rolesOfMember(m).map((r) => r.name),
    permissions: permissionsOf(m),
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
interface CompanyActor {
  companyId: string;
  account: Account;
  membership: MockMembership;
  permissions: string[];
}

function requireCompany(request: Request, permission: string): Guard<CompanyActor> {
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
  return {
    ok: true,
    value: {
      companyId: company.id,
      account: token.account,
      membership,
      permissions: context.permissions,
    },
  };
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
    db.memberships.push({
      accountId,
      companyId,
      roleIds: [CEO_ROLE_ID],
      status: 'active',
      joinedAt: db.now(),
      version: 1,
    });
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
const shopEntity = (s: Shop) => ({ type: 'channel.shops', id: s.id, label: s.shopName });
function shopSnapshot(s: Shop): Record<string, unknown> {
  return {
    shopName: s.shopName,
    platform: s.platform,
    externalShopId: s.externalShopId,
    region: s.region,
    status: s.status,
  };
}

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
    db.shops
      .filter((s) => ids.includes(s.id) && s.companyId === guard.value.companyId)
      .forEach((s) => writeCompanyLog(guard.value, 'delete', shopEntity(s), shopSnapshot(s), null));
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
    writeCompanyLog(guard.value, 'create', shopEntity(newShop), null, shopSnapshot(newShop));
    return HttpResponse.json(newShop, { status: 201 });
  }),

  http.patch(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopUpdate);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const patch = (await request.json()) as ShopUpdateInput;
    const before = shopSnapshot(db.shops[idx]);
    db.shops[idx] = { ...db.shops[idx], ...patch, updatedAt: db.now() };
    writeCompanyLog(guard.value, 'update', shopEntity(db.shops[idx]), before, shopSnapshot(db.shops[idx]));
    return HttpResponse.json(db.shops[idx]);
  }),

  http.delete(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopDisconnect);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const [removed] = db.shops.splice(idx, 1);
    writeCompanyLog(guard.value, 'delete', shopEntity(removed), shopSnapshot(removed), null);
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


// ---------- Identity: nhân viên và vai trò của công ty đang chọn (UC-PI-05, UC-PI-06) ----------
function companyRoles(companyId: string): MockRole[] {
  return db.roles.filter((r) => r.companyId === null || r.companyId === companyId);
}

function toRole(r: MockRole, companyId: string): Role {
  return {
    id: r.id,
    name: r.name,
    builtIn: r.companyId === null,
    permissions: r.permissions,
    memberCount: db.memberships.filter((m) => m.companyId === companyId && m.roleIds.includes(r.id))
      .length,
    version: r.version,
    updatedAt: r.updatedAt,
  };
}

function toStaff(m: MockMembership): StaffMember {
  const account = db.accounts.find((a) => a.id === m.accountId)!;
  return {
    accountId: account.id,
    email: account.email,
    fullName: account.fullName,
    roles: rolesOfMember(m).map((r) => ({ id: r.id, name: r.name })),
    status: m.status,
    isCeo: m.roleIds.includes(CEO_ROLE_ID),
    pendingFirstLogin: account.mustChangePassword,
    joinedAt: m.joinedAt,
    version: m.version,
  };
}

/** Quyền của phân hệ công ty chưa bật không tính (không ai dùng được) */
function lacking(actor: CompanyActor, permissions: string[]) {
  const enabled = enabledModulesOf(actor.companyId);
  return permissions.filter(
    (p) => enabled.includes(p.split('.')[0]) && !actor.permissions.includes(p),
  );
}

function notHeld() {
  return problem(403, 'Có quyền bạn không có', {
    code: 'permission_not_held',
    detail: 'Chỉ cấp được những quyền bạn đang có.',
  });
}

function versionConflict<T>(current: T, detail: string) {
  return problem(409, 'Dữ liệu vừa được người khác sửa', {
    code: 'version_conflict',
    detail,
    current,
  });
}

/** Ghi audit.audit_logs cho mọi thao tác ghi trong công ty (UC-PI-07) */
function writeCompanyLog(
  actor: CompanyActor,
  action: AuditAction,
  entity: { type: string; id: string; label: string },
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  db.companyAuditLogs.unshift({
    id: `cal-${Date.now().toString(36)}-${db.companyAuditLogs.length}`,
    companyId: actor.companyId,
    actorId: actor.account.id,
    action,
    entityType: entity.type,
    entityId: entity.id,
    entityLabel: entity.label,
    before,
    after,
    createdAt: db.now(),
  });
}

const roleEntity = (r: MockRole) => ({ type: 'access.roles', id: r.id, label: r.name });
const roleSnapshot = (r: MockRole) => ({ name: r.name, permissions: [...r.permissions] });
const staffEntity = (m: MockMembership) => ({
  type: 'staff.memberships',
  id: m.accountId,
  label: toStaff(m).email,
});
function staffSnapshot(m: MockMembership) {
  const s = toStaff(m);
  return { email: s.email, fullName: s.fullName, roles: s.roles.map((r) => r.name), status: s.status };
}

/**
 * Kiểm danh sách vai trò sẽ gán: thuộc công ty, không phải CEO, và mọi vai trò được thêm
 * hoặc gỡ đều chỉ gồm quyền người thao tác đang có.
 */
function checkRoleAssignment(
  actor: CompanyActor,
  roleIds: string[],
  previous: string[] = [],
): Response | null {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return problem(422, 'Dữ liệu không hợp lệ', { errors: { roleIds: 'Chọn ít nhất một vai trò' } });
  }
  const available = companyRoles(actor.companyId);
  const changed = [
    ...roleIds.filter((id) => !previous.includes(id)),
    ...previous.filter((id) => !roleIds.includes(id)),
  ];
  for (const id of roleIds) {
    if (!available.some((r) => r.id === id)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { roleIds: 'Vai trò không tồn tại' } });
    }
  }
  if (changed.includes(CEO_ROLE_ID)) {
    return problem(403, 'Không gán hay gỡ vai trò CEO', { code: 'protected_account' });
  }
  for (const id of changed) {
    const role = available.find((r) => r.id === id);
    if (role && lacking(actor, role.permissions).length) {
      return problem(403, 'Có quyền bạn không có', {
        code: 'permission_not_held',
        detail: `Vai trò "${role.name}" có quyền bạn không có nên bạn không gán hay gỡ được.`,
      });
    }
  }
  return null;
}

function findMember(actor: CompanyActor, accountId: unknown) {
  return db.memberships.find((m) => m.companyId === actor.companyId && m.accountId === accountId);
}

/** UC-PI-05: không đổi vai trò hay khoá tài khoản CEO, hay của chính mình */
function protectedMember(actor: CompanyActor, m: MockMembership) {
  if (m.roleIds.includes(CEO_ROLE_ID)) {
    return problem(403, 'Không thao tác được trên tài khoản CEO', { code: 'protected_account' });
  }
  if (m.accountId === actor.account.id) {
    return problem(403, 'Không thao tác được trên tài khoản của chính bạn', {
      code: 'protected_account',
    });
  }
  return null;
}

function roleNameTaken(companyId: string, name: string, exceptId?: string) {
  const key = name.trim().toLocaleLowerCase('vi');
  return companyRoles(companyId).some(
    (r) => r.id !== exceptId && r.name.toLocaleLowerCase('vi') === key,
  );
}

function validateRoleInput(body: RoleInput): Response | null {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên vai trò';
  else if (name.length > 60) errors.name = 'Tên vai trò tối đa 60 ký tự';
  if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
    errors.permissions = 'Chọn ít nhất một quyền';
  } else if (body.permissions.some((p) => !permissionCatalog.some((d) => d.code === p))) {
    errors.permissions = 'Có quyền không tồn tại';
  }
  return Object.keys(errors).length ? problem(422, 'Dữ liệu không hợp lệ', { errors }) : null;
}

const identityHandlers = [
  http.get(`${API}/identity/permissions`, async ({ request }) => {
    await delay(100);
    const guard = requireCompany(request, PERMISSIONS.roleView);
    if (!guard.ok) return guard.response;
    const enabled = enabledModulesOf(guard.value.companyId);
    return HttpResponse.json(permissionCatalog.filter((p) => enabled.includes(p.module)));
  }),

  http.get(`${API}/identity/roles`, async ({ request }) => {
    await delay(LATENCY);
    // Màn nhân viên cũng cần danh sách vai trò để chọn khi mời
    const viaRoles = requireCompany(request, PERMISSIONS.roleView);
    const guard = viaRoles.ok ? viaRoles : requireCompany(request, PERMISSIONS.staffView);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    // Có sẵn trước, rồi vai trò tuỳ biến theo tên
    const items = companyRoles(companyId)
      .map((r) => toRole(r, companyId))
      .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || (a.builtIn ? 0 : a.name.localeCompare(b.name, 'vi')));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/identity/roles`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.roleManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const body = (await request.json()) as RoleInput;
    const invalid = validateRoleInput(body);
    if (invalid) return invalid;
    if (roleNameTaken(actor.companyId, body.name)) {
      return problem(409, 'Tên vai trò đã được dùng', {
        code: 'role_name_taken',
        errors: { name: 'Tên vai trò đã được dùng trong công ty' },
      });
    }
    if (lacking(actor, body.permissions).length) return notHeld();
    const role: MockRole = {
      id: `role-${Date.now().toString(36)}`,
      companyId: actor.companyId,
      name: body.name.trim(),
      permissions: [...new Set(body.permissions)],
      version: 1,
      updatedAt: db.now(),
    };
    db.roles.push(role);
    writeCompanyLog(actor, 'create', roleEntity(role), null, roleSnapshot(role));
    return HttpResponse.json(toRole(role, actor.companyId), { status: 201 });
  }),

  http.put(`${API}/identity/roles/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.roleManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const role = companyRoles(actor.companyId).find((r) => r.id === params.id);
    if (!role) {
      return problem(404, 'Vai trò không còn', {
        code: 'role_not_found',
        detail: 'Vai trò đã bị xoá ở một phiên khác.',
      });
    }
    if (role.companyId === null) {
      return problem(403, 'Vai trò có sẵn không sửa được', { code: 'builtin_role' });
    }
    const body = (await request.json()) as RoleInput & { version: number };
    if (body.version !== role.version) {
      return versionConflict(toRole(role, actor.companyId), `Vai trò "${role.name}" vừa được người khác sửa.`);
    }
    if (lacking(actor, role.permissions).length) return notHeld();
    const invalid = validateRoleInput(body);
    if (invalid) return invalid;
    if (roleNameTaken(actor.companyId, body.name, role.id)) {
      return problem(409, 'Tên vai trò đã được dùng', {
        code: 'role_name_taken',
        errors: { name: 'Tên vai trò đã được dùng trong công ty' },
      });
    }
    if (lacking(actor, body.permissions).length) return notHeld();
    const before = roleSnapshot(role);
    role.name = body.name.trim();
    role.permissions = [...new Set(body.permissions)];
    role.version += 1;
    role.updatedAt = db.now();
    writeCompanyLog(actor, 'update', roleEntity(role), before, roleSnapshot(role));
    return HttpResponse.json(toRole(role, actor.companyId));
  }),

  http.delete(`${API}/identity/roles/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.roleManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const role = companyRoles(actor.companyId).find((r) => r.id === params.id);
    if (!role) {
      return problem(404, 'Vai trò không còn', {
        code: 'role_not_found',
        detail: 'Vai trò đã bị xoá ở một phiên khác.',
      });
    }
    if (role.companyId === null) {
      return problem(403, 'Vai trò có sẵn không xoá được', { code: 'builtin_role' });
    }
    const version = Number(new URL(request.url).searchParams.get('version'));
    if (version !== role.version) {
      return versionConflict(toRole(role, actor.companyId), `Vai trò "${role.name}" vừa được người khác sửa.`);
    }
    if (lacking(actor, role.permissions).length) return notHeld();
    const inUse = toRole(role, actor.companyId).memberCount;
    if (inUse) {
      return problem(409, 'Vai trò đang được dùng', {
        code: 'role_in_use',
        detail: `Còn ${inUse} tài khoản đang mang vai trò "${role.name}". Gỡ vai trò khỏi các tài khoản này trước khi xoá.`,
      });
    }
    db.roles.splice(db.roles.indexOf(role), 1);
    writeCompanyLog(actor, 'delete', roleEntity(role), roleSnapshot(role), null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/identity/staff`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.staffView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const status = url.searchParams.get('status');
    const roleId = url.searchParams.get('roleId');

    let items = db.memberships
      .filter((m) => m.companyId === guard.value.companyId)
      .map(toStaff)
      // CEO đầu tiên, còn lại theo tên
      .sort((a, b) => Number(b.isCeo) - Number(a.isCeo) || a.fullName.localeCompare(b.fullName, 'vi'));
    if (search) {
      items = items.filter(
        (m) => m.fullName.toLowerCase().includes(search) || m.email.includes(search),
      );
    }
    if (status) items = items.filter((m) => m.status === status);
    if (roleId) items = items.filter((m) => m.roles.some((r) => r.id === roleId));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/identity/staff`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.staffManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const body = (await request.json()) as InviteStaffInput;
    const email = body.email?.trim().toLowerCase() ?? '';
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ';
    if (!body.fullName?.trim()) errors.fullName = 'Nhập họ tên';
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const rejected = checkRoleAssignment(actor, body.roleIds);
    if (rejected) return rejected;

    const existing = db.accounts.find((a) => a.email === email);
    if (existing?.isPlatformAdmin) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        errors: { email: 'Email này không mời làm nhân viên được' },
      });
    }
    const already = existing && findMember(actor, existing.id);
    if (already) {
      // UC-PI-05: hỏi có thêm vai trò vừa chọn cho tài khoản này không
      return problem(409, 'Email đã có tài khoản trong công ty', {
        code: 'already_member',
        member: toStaff(already),
      });
    }

    let outcome: InviteStaffResult['outcome'] = 'added';
    let account = existing;
    if (!account) {
      outcome = 'invited';
      account = {
        id: `acc-${Date.now().toString(36)}`,
        email,
        fullName: body.fullName.trim(),
        isPlatformAdmin: false,
        mustChangePassword: true,
      };
      db.accounts.push(account);
      passwords[email] = `moi${Math.random().toString(36).slice(2, 8)}1`;
      // Không có email trong mock: in mật khẩu thư mời ra console để thử đăng nhập
      console.info(`[mock] Thư mời gửi ${email}, mật khẩu: ${passwords[email]}`);
    }
    const membership: MockMembership = {
      accountId: account.id,
      companyId: actor.companyId,
      roleIds: [...new Set(body.roleIds)],
      status: 'active',
      joinedAt: db.now(),
      version: 1,
    };
    db.memberships.push(membership);
    writeCompanyLog(actor, 'create', staffEntity(membership), null, {
      ...staffSnapshot(membership),
      invited: outcome === 'invited',
    });
    const payload: InviteStaffResult = { outcome, member: toStaff(membership) };
    return HttpResponse.json(payload, { status: 201 });
  }),

  http.put(`${API}/identity/staff/:accountId/roles`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.staffManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const m = findMember(actor, params.accountId);
    if (!m) return problem(403, 'Tài khoản không thuộc công ty này');
    const blocked = protectedMember(actor, m);
    if (blocked) return blocked;
    const body = (await request.json()) as { roleIds: string[]; version: number };
    if (body.version !== m.version) {
      return versionConflict(toStaff(m), 'Tài khoản vừa được người khác sửa.');
    }
    const rejected = checkRoleAssignment(actor, body.roleIds, m.roleIds);
    if (rejected) return rejected;
    const before = { roles: staffSnapshot(m).roles };
    m.roleIds = [...new Set(body.roleIds)];
    m.version += 1;
    writeCompanyLog(actor, 'update', staffEntity(m), before, { roles: staffSnapshot(m).roles });
    return HttpResponse.json(toStaff(m));
  }),

  ...(['lock', 'unlock'] as const).map((action) =>
    http.post(`${API}/identity/staff/:accountId/${action}`, async ({ params, request }) => {
      await delay(LATENCY);
      const guard = requireCompany(request, PERMISSIONS.staffManage);
      if (!guard.ok) return guard.response;
      const actor = guard.value;
      const m = findMember(actor, params.accountId);
      if (!m) return problem(403, 'Tài khoản không thuộc công ty này');
      const blocked = protectedMember(actor, m);
      if (blocked) return blocked;
      const { version } = (await request.json()) as { version: number };
      const target = action === 'lock' ? 'locked' : 'active';
      if (version !== m.version || m.status === target) {
        return versionConflict(toStaff(m), 'Tài khoản vừa được người khác sửa.');
      }
      m.status = target;
      m.version += 1;
      writeCompanyLog(
        actor,
        'update',
        staffEntity(m),
        { status: action === 'lock' ? 'active' : 'locked' },
        { status: target },
      );
      return HttpResponse.json(toStaff(m));
    }),
  ),
];


// ---------- Phân hệ tuỳ chọn (UC-PI-02) và nhật ký thao tác (UC-PI-07) ----------
function actorRef(accountId: string | null): ActorRef | null {
  const a = accountId ? db.accounts.find((x) => x.id === accountId) : undefined;
  return a ? { accountId: a.id, email: a.email, fullName: a.fullName } : null;
}

function moduleHasData(companyId: string, code: OptionalModuleKey) {
  if (code === 'channel') return db.shops.some((s) => s.companyId === companyId);
  return Boolean(db.moduleData[code]?.includes(companyId));
}

function toCompanyModule(companyId: string, code: OptionalModuleKey): CompanyModule {
  const company = db.companies.find((c) => c.id === companyId)!;
  const state = db.moduleStates[`${companyId}:${code}`];
  const enabled = company.optionalModules.includes(code);
  return {
    code,
    enabled,
    enabledAt: enabled ? state?.enabledAt ?? null : null,
    enabledBy: enabled ? actorRef(state?.enabledBy ?? null) : null,
    aiConsentAt: enabled ? state?.aiConsentAt ?? null : null,
    aiConsentBy: enabled ? actorRef(state?.aiConsentBy ?? null) : null,
    hasData: moduleHasData(companyId, code),
  };
}

function toAuditLog(l: (typeof db.companyAuditLogs)[number]): CompanyAuditLog {
  return {
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    entityLabel: l.entityLabel,
    actor: actorRef(l.actorId) ?? { accountId: l.actorId, email: '', fullName: 'Tài khoản đã xoá' },
    createdAt: l.createdAt,
  };
}

const companySettingsHandlers = [
  http.get(`${API}/company/modules`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.moduleManage);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(OPTIONAL_MODULES.map((code) => toCompanyModule(guard.value.companyId, code)));
  }),

  http.put(`${API}/company/modules/:code`, async ({ params, request }) => {
    await delay(LATENCY);
    // UC-PI-02 bước 4: chỉ CEO của công ty (quyền này chỉ vai trò CEO có)
    const guard = requireCompany(request, PERMISSIONS.moduleManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const code = params.code as OptionalModuleKey;
    if (!OPTIONAL_MODULES.includes(code)) {
      return problem(404, 'Không có phân hệ tuỳ chọn này', { code: 'module_not_found' });
    }
    const body = (await request.json()) as Omit<SetModuleInput, 'code'>;
    const company = db.companies.find((c) => c.id === actor.companyId)!;
    const current = toCompanyModule(company.id, code);
    if (current.enabled === body.enabled) {
      return problem(409, 'Phân hệ vừa được đổi ở phiên khác', {
        code: 'module_state_changed',
        detail: `${MODULE_LABELS[code]} hiện đang ${current.enabled ? 'bật' : 'tắt'}. Chưa có gì thay đổi.`,
        current,
      });
    }
    if (body.enabled && code === 'assistant' && body.aiConsent !== true) {
      return problem(422, 'Cần đồng ý gửi dữ liệu tới OpenAI', {
        code: 'ai_consent_required',
        detail: 'Bật Trợ lý AI cần CEO đồng ý gửi câu hỏi và dữ liệu liên quan tới OpenAI.',
      });
    }
    if (!body.enabled && current.hasData) {
      return problem(409, 'Phân hệ đã có dữ liệu', {
        code: 'module_has_data',
        detail: `${MODULE_LABELS[code]} đã có dữ liệu của công ty nên không tắt được.`,
        current,
      });
    }

    const key = `${company.id}:${code}`;
    if (body.enabled) {
      company.optionalModules = [...company.optionalModules, code];
      db.moduleStates[key] = {
        enabledAt: db.now(),
        enabledBy: actor.account.id,
        aiConsentAt: code === 'assistant' ? db.now() : null,
        aiConsentBy: code === 'assistant' ? actor.account.id : null,
      };
    } else {
      company.optionalModules = company.optionalModules.filter((m) => m !== code);
    }
    const module = toCompanyModule(company.id, code);
    writeCompanyLog(
      actor,
      'update',
      { type: 'platform.company_modules', id: code, label: MODULE_LABELS[code] },
      { enabled: current.enabled },
      code === 'assistant' && body.enabled
        ? { enabled: true, aiConsentAt: module.aiConsentAt }
        : { enabled: module.enabled },
    );
    const payload: SetModuleResult = { module, enabledModules: buildContext(actor.membership).enabledModules };
    return HttpResponse.json(payload);
  }),

  http.get(`${API}/audit/logs`, async ({ request }) => {
    await delay(LATENCY);
    // UC-PI-07 bước 2: CEO hoặc Admin (quyền này chỉ hai vai trò có sẵn đó có)
    const guard = requireCompany(request, PERMISSIONS.auditView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const actorId = url.searchParams.get('actorId');
    const entityType = url.searchParams.get('entityType');
    const action = url.searchParams.get('action');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let items = db.companyAuditLogs
      .filter((l) => l.companyId === guard.value.companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (actorId) items = items.filter((l) => l.actorId === actorId);
    if (entityType) items = items.filter((l) => l.entityType === entityType);
    if (action) items = items.filter((l) => l.action === action);
    if (from) items = items.filter((l) => l.createdAt.slice(0, 10) >= from);
    if (to) items = items.filter((l) => l.createdAt.slice(0, 10) <= to);
    return HttpResponse.json(paginate(items.map(toAuditLog), page, pageSize));
  }),

  http.get(`${API}/audit/logs/:id`, async ({ params, request }) => {
    await delay(100);
    const guard = requireCompany(request, PERMISSIONS.auditView);
    if (!guard.ok) return guard.response;
    const log = db.companyAuditLogs.find((l) => l.id === params.id);
    // Dòng của công ty khác: 403, không lộ là dòng đó có tồn tại
    if (!log || log.companyId !== guard.value.companyId) {
      return problem(403, 'Không xem được dòng nhật ký này');
    }
    const detail: CompanyAuditLogDetail = { ...toAuditLog(log), before: log.before, after: log.after };
    return HttpResponse.json(detail);
  }),
];

export const handlers = [
  ...authHandlers,
  ...platformHandlers,
  ...identityHandlers,
  ...companySettingsHandlers,
  ...shopHandlers,
];
