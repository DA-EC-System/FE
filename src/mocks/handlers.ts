/**
 * MSW handlers — mock toàn bộ API cho giai đoạn phát triển UI.
 * Tắt bằng VITE_USE_MOCKS=false khi backend thật sẵn sàng.
 *
 * Token mock dạng `mock.<accountId>.<companyId | ->.<ts>`: sau khi chọn công ty,
 * token gắn với công ty đó; các API của công ty đọc companyId từ token (như RLS ở BE).
 * Access token sống 15 phút (docs/21 A2). Refresh token nằm trong cookie `commerio_refresh`.
 * Mock ghi cookie bằng `document.cookie` vì: JS không đặt được cookie HttpOnly, còn header
 * Set-Cookie của MSW bị MSW lưu vào localStorage. BE thật đặt cookie HttpOnly bằng Set-Cookie.
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
import * as catalog from './catalogData';
import type { MockCategory, MockAttribute, MockProduct, MockVariant } from './catalogData';
import { skuPatternError } from '@/utils/sku';
import * as pricing from './pricingData';
import type { MockPricelist } from './pricingData';
import { formatCurrency } from '@/utils/format';
import * as inventory from './inventoryData';
import type { MockReturnOrder, MockStockDoc, MockStockDocLine } from './inventoryData';
import type {
  ReorderRuleInput,
  ReturnOrder,
  ReturnReceiptInput,
  StockDetail,
  StockDoc,
  StockDocCreateInput,
  StockDocLineInput,
  StockDocSummary,
  StockDocType,
  StockDocUpdateInput,
  StockLevel,
  StockListResult,
  StockMove,
} from '@/types/inventory';
import type {
  Pricelist,
  PricelistCreateInput,
  PricelistItem,
  PricelistItemsInput,
  PricelistUpdateInput,
} from '@/types/pricing';
import type {
  Attribute,
  AttributeInput,
  Category,
  CategoryInput,
  ProductCreateInput,
  ProductDetail,
  ProductListItem,
  ProductUpdateInput,
  ProductVariant,
  UploadTicket,
  VariantAttribute,
} from '@/types/catalog';
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

const API = '/api/v1';

/**
 * Thời hạn token của mock, đổi được khi test qua `window.__commerioMock` (không ghi vào storage).
 * Ví dụ đặt `accessTtlMs = 5000` để thấy FE tự làm mới token sau 5 giây (AC-5).
 */
interface MockAuthConfig {
  accessTtlMs: number;
  refreshTtlMs: number;
}
const mockAuth: MockAuthConfig = Object.assign(
  { accessTtlMs: 15 * 60_000, refreshTtlMs: 7 * 24 * 3600_000 },
  (globalThis as { __commerioMock?: Partial<MockAuthConfig> }).__commerioMock,
);
(globalThis as { __commerioMock?: MockAuthConfig }).__commerioMock = mockAuth;
const REFRESH_COOKIE = 'commerio_refresh';
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
  const [prefix, accountId, companyId, issuedAt] = auth.replace(/^Bearer /, '').split('.');
  if (prefix !== 'mock') return null;
  // Hết 15 phút thì BE trả 401, FE phải gọi /identity/refresh
  if (Date.now() - Number(issuedAt) > mockAuth.accessTtlMs) return null;
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) return null;
  return { account, companyId: companyId && companyId !== '-' ? companyId : null };
}

/** Refresh token mock: `<accountId>~<hết hạn lúc>`. Đăng xuất thì thu hồi. */
const revokedRefresh = new Set<string>();

function setRefreshCookie(accountId: string) {
  const value = `${accountId}~${Date.now() + mockAuth.refreshTtlMs}`;
  const maxAge = Math.floor(mockAuth.refreshTtlMs / 1000);
  document.cookie = `${REFRESH_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Strict`;
}

function clearRefreshCookie() {
  document.cookie = `${REFRESH_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
}

/**
 * Cookie trình duyệt gửi kèm request. Service worker không thấy header Cookie,
 * còn handler MSW chạy trong trang nên đọc thẳng `document.cookie`.
 */
function readCookie(name: string): string | undefined {
  const pair = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}

function readRefresh(): Account | null {
  const value = readCookie(REFRESH_COOKIE);
  if (!value || revokedRefresh.has(value)) return null;
  const [accountId, expiresAt] = value.split('~');
  if (Date.now() > Number(expiresAt)) return null;
  return db.accounts.find((a) => a.id === accountId) ?? null;
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
    return { ok: false, response: problem(403, 'Chưa chọn công ty', { code: 'company_not_selected' }) };
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
  http.post(`${API}/identity/login`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as LoginRequest;
    const account = db.accounts.find((a) => a.email === body.email);
    if (!account || passwords[body.email] !== body.password) {
      return problem(401, 'Email hoặc mật khẩu không đúng', { code: 'invalid_credentials' });
    }
    setRefreshCookie(account.id);
    return HttpResponse.json(loginPayload(account));
  }),

  // Mock: credential chính là email Google trả về. BE thật kiểm ID token với Google.
  http.post(`${API}/identity/google`, async ({ request }) => {
    await delay(LATENCY);
    const { credential } = (await request.json()) as GoogleLoginRequest;
    const account = db.accounts.find((a) => a.email === credential.trim().toLowerCase());
    if (!account) {
      return problem(401, 'Chưa có tài khoản', {
        code: 'google_account_not_found',
        detail: `Email ${credential} chưa có tài khoản Commerio. Hệ thống không tự tạo tài khoản; hãy nhờ CEO công ty mời bạn.`,
      });
    }
    setRefreshCookie(account.id);
    return HttpResponse.json(loginPayload(account));
  }),

  // UC-PI-01
  http.post(`${API}/identity/register`, async ({ request }) => {
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
      version: 1,
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
  http.post(`${API}/identity/change-password`, async ({ request }) => {
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

  // docs/21 A2: đổi cookie refresh lấy access token mới (chưa gắn công ty)
  http.post(`${API}/identity/refresh`, async () => {
    await delay(100);
    const account = readRefresh();
    if (!account) {
      return problem(401, 'Phiên đăng nhập đã hết hạn', { code: 'refresh_invalid' });
    }
    return HttpResponse.json({ accessToken: makeToken(account.id, null) });
  }),

  http.post(`${API}/identity/logout`, async () => {
    await delay(100);
    const value = readCookie(REFRESH_COOKIE);
    if (value) revokedRefresh.add(value);
    clearRefreshCookie();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/identity/me`, async ({ request }) => {
    await delay(100);
    const token = readToken(request);
    if (!token) return problem(401, 'Chưa đăng nhập');
    const payload: MeResponse = {
      account: token.account,
      memberships: token.account.isPlatformAdmin ? [] : membershipsOf(token.account.id),
    };
    return HttpResponse.json(payload);
  }),

  http.post(`${API}/identity/select-company`, async ({ request }) => {
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
    if (!company) return problem(404, 'Không tìm thấy', { code: 'not_found' });
    const { reason, version } = (await request.json()) as LockCompanyInput;
    if (!reason?.trim()) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: 'Cần nhập lý do khoá' } });
    }
    if (version !== company.version || company.status === 'locked') {
      return versionConflict({ ...company }, `${company.name} vừa được đổi ở một phiên khác.`);
    }
    company.status = 'locked';
    company.lockReason = reason.trim();
    company.lockedAt = db.now();
    company.version += 1;
    writePlatformLog('company.locked', company.id, guard.value.email, company.lockReason);
    return HttpResponse.json(company);
  }),

  http.post(`${API}/platform/companies/:id/unlock`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requirePlatformAdmin(request);
    if (!guard.ok) return guard.response;
    const company = db.companies.find((c) => c.id === params.id);
    if (!company) return problem(404, 'Không tìm thấy', { code: 'not_found' });
    const { version } = (await request.json().catch(() => ({}))) as { version?: number };
    if (version !== company.version || company.status === 'active') {
      return versionConflict({ ...company }, `${company.name} vừa được đổi ở một phiên khác.`);
    }
    company.status = 'active';
    company.lockReason = undefined;
    company.lockedAt = undefined;
    company.version += 1;
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
      return problem(404, 'Không tìm thấy', {
        code: 'not_found',
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
      return problem(404, 'Không tìm thấy', {
        code: 'not_found',
        detail: 'Vai trò đã bị xoá ở một phiên khác.',
      });
    }
    if (role.companyId === null) {
      return problem(403, 'Vai trò có sẵn không xoá được', { code: 'builtin_role' });
    }
    const rawVersion = new URL(request.url).searchParams.get('version');
    if (!rawVersion) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        code: 'validation_failed',
        errors: { version: 'Thiếu version' },
      });
    }
    const version = Number(rawVersion);
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
    if (!m) return problem(404, 'Không tìm thấy', { code: 'not_found' });
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
      if (!m) return problem(404, 'Không tìm thấy', { code: 'not_found' });
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
  http.get(`${API}/platform/modules`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.moduleManage);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(OPTIONAL_MODULES.map((code) => toCompanyModule(guard.value.companyId, code)));
  }),

  http.put(`${API}/platform/modules/:code`, async ({ params, request }) => {
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
    // Dòng của công ty khác: 404 như không có, không lộ là dòng đó tồn tại (docs/21 C4)
    if (!log || log.companyId !== guard.value.companyId) {
      return problem(404, 'Không tìm thấy', { code: 'not_found' });
    }
    const detail: CompanyAuditLogDetail = { ...toAuditLog(log), before: log.before, after: log.after };
    return HttpResponse.json(detail);
  }),
];

// ---------- Catalog (UC-CP-01, UC-CP-02) và ảnh qua module files ----------
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function companyProducts(companyId: string) {
  return catalog.products.filter((p) => p.companyId === companyId);
}

function toCategory(c: MockCategory): Category {
  return {
    id: c.id,
    name: c.name,
    skuPattern: c.skuPattern,
    skuNextSeq: c.skuNextSeq,
    productCount: catalog.products.filter((p) => p.categoryId === c.id).length,
    version: c.version,
    updatedAt: c.updatedAt,
  };
}

function usedValueIds(companyId: string) {
  return new Set(companyProducts(companyId).flatMap((p) => p.variants.flatMap((v) => v.valueIds)));
}

function toAttribute(a: MockAttribute): Attribute {
  const used = usedValueIds(a.companyId);
  const ids = new Set(a.values.map((v) => v.id));
  return {
    id: a.id,
    name: a.name,
    values: a.values.map((v) => ({ ...v, inUse: used.has(v.id) })),
    productCount: companyProducts(a.companyId).filter((p) =>
      p.variants.some((v) => v.valueIds.some((id) => ids.has(id))),
    ).length,
    version: a.version,
  };
}

function findValue(companyId: string, valueId: string) {
  for (const a of catalog.attributes) {
    if (a.companyId !== companyId) continue;
    const v = a.values.find((x) => x.id === valueId);
    if (v) return { attribute: a, value: v };
  }
  return null;
}

function variantAttributes(companyId: string, valueIds: string[]): VariantAttribute[] {
  return valueIds
    .map((id) => findValue(companyId, id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map(({ attribute, value }) => ({
      attributeId: attribute.id,
      attributeName: attribute.name,
      valueId: value.id,
      value: value.value,
    }));
}

const toVariant = (companyId: string, v: MockVariant): ProductVariant => ({
  id: v.id,
  sku: v.sku,
  attributes: variantAttributes(companyId, v.valueIds),
  archivedAt: v.archivedAt,
});

function fileUrl(id: string) {
  return catalog.files.find((f) => f.id === id)?.url ?? '';
}

function toProductItem(p: MockProduct): ProductListItem {
  const category = catalog.categories.find((c) => c.id === p.categoryId);
  return {
    id: p.id,
    name: p.name,
    category: { id: p.categoryId, name: category?.name ?? '' },
    variantCount: p.variants.filter((v) => !v.archivedAt).length,
    thumbnailUrl: p.imageFileIds[0] ? fileUrl(p.imageFileIds[0]) : null,
    status: p.archivedAt ? 'archived' : 'active',
    updatedAt: p.updatedAt,
    version: p.version,
  };
}

function toProductDetail(p: MockProduct): ProductDetail {
  return {
    ...toProductItem(p),
    description: p.description,
    images: p.imageFileIds.map((fileId, position) => ({
      id: `${p.id}:${fileId}`,
      fileId,
      url: fileUrl(fileId),
      position,
    })),
    variants: p.variants.map((v) => toVariant(p.companyId, v)),
  };
}

const categoryEntity = (c: MockCategory) => ({ type: 'catalog.categories', id: c.id, label: c.name });
const categorySnapshot = (c: MockCategory) => ({ name: c.name, skuPattern: c.skuPattern });
const attributeEntity = (a: MockAttribute) => ({ type: 'catalog.attributes', id: a.id, label: a.name });
const attributeSnapshot = (a: MockAttribute) => ({ name: a.name, values: a.values.map((v) => v.value) });
const productEntity = (p: MockProduct) => ({ type: 'catalog.products', id: p.id, label: p.name });
function productSnapshot(p: MockProduct) {
  return {
    name: p.name,
    category: catalog.categories.find((c) => c.id === p.categoryId)?.name ?? '',
    description: p.description,
    images: p.imageFileIds.length,
    variants: p.variants.filter((v) => !v.archivedAt).map((v) => v.sku),
  };
}

/** Đối tượng không có: 404; của công ty khác: 403 (UC-CP-01, UC-CP-02 ngoại lệ) */
function findOwned<T extends { id: string; companyId: string }>(
  list: T[],
  id: unknown,
  companyId: string,
  what: string,
): { ok: true; value: T } | { ok: false; response: Response } {
  const item = list.find((x) => x.id === id);
  if (!item) return { ok: false, response: problem(404, `Không tìm thấy ${what}`) };
  if (item.companyId !== companyId) {
    return { ok: false, response: problem(403, `${what[0].toUpperCase()}${what.slice(1)} thuộc công ty khác`) };
  }
  return { ok: true, value: item };
}

function staleVersion(url: URL, current: number) {
  const v = url.searchParams.get('version');
  return v !== null && Number(v) !== current;
}

function validateCategory(body: CategoryInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên danh mục';
  else if (name.length > 60) errors.name = 'Tên danh mục tối đa 60 ký tự';
  else if (
    catalog.categories.some((c) => c.companyId === companyId && c.id !== exceptId && sameText(c.name, name))
  ) {
    errors.name = 'Đã có danh mục cùng tên';
  }
  const patternError = skuPatternError(body.skuPattern ?? '');
  if (patternError) errors.skuPattern = patternError;
  return Object.keys(errors).length ? problem(422, 'Dữ liệu chưa hợp lệ', { errors }) : null;
}

function validateAttribute(body: AttributeInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên thuộc tính';
  else if (name.length > 40) errors.name = 'Tên thuộc tính tối đa 40 ký tự';
  else if (
    catalog.attributes.some((a) => a.companyId === companyId && a.id !== exceptId && sameText(a.name, name))
  ) {
    errors.name = 'Đã có thuộc tính cùng tên';
  }
  const values = (body.values ?? []).map((v) => v.value.trim());
  if (!values.length) errors.values = 'Thêm ít nhất một giá trị';
  else if (values.some((v) => !v || v.length > 40)) errors.values = 'Mỗi giá trị từ 1 đến 40 ký tự';
  else if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
    errors.values = 'Có giá trị bị trùng';
  }
  return Object.keys(errors).length ? problem(422, 'Dữ liệu chưa hợp lệ', { errors }) : null;
}

/** Tập thuộc tính của một tổ hợp; null nếu có giá trị lạ hoặc hai giá trị cùng thuộc tính */
function comboAttributes(companyId: string, valueIds: string[]): string[] | null {
  const attrs: string[] = [];
  for (const id of valueIds) {
    const found = findValue(companyId, id);
    if (!found || attrs.includes(found.attribute.id)) return null;
    attrs.push(found.attribute.id);
  }
  return attrs.sort();
}

const comboKey = (valueIds: string[]) => [...valueIds].sort().join('|');

/** SKU duy nhất trong công ty: trùng (quy tắc hai danh mục giống nhau) thì lấy số kế tiếp */
function nextVariant(category: MockCategory, valueIds: string[]): MockVariant {
  const taken = new Set(companyProducts(category.companyId).flatMap((p) => p.variants.map((v) => v.sku)));
  let variant = catalog.makeVariant(category, valueIds, rid('var'));
  while (taken.has(variant.sku)) variant = catalog.makeVariant(category, valueIds, variant.id);
  return variant;
}

function validateImages(companyId: string, ids: string[] | undefined, errors: Record<string, string>) {
  const list = ids ?? [];
  if (list.length > 9) errors.images = 'Tối đa 9 ảnh';
  else if (new Set(list).size !== list.length) errors.images = 'Ảnh bị trùng';
  else if (
    list.some((id) => {
      const f = catalog.files.find((x) => x.id === id);
      return !f || f.companyId !== companyId || !f.url;
    })
  ) {
    errors.images = 'Có ảnh chưa tải xong hoặc không thuộc công ty';
  }
}

function validateProductText(body: { name?: string; description?: string }, errors: Record<string, string>) {
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên sản phẩm';
  else if (name.length > 200) errors.name = 'Tên sản phẩm tối đa 200 ký tự';
  if ((body.description ?? '').length > 5000) errors.description = 'Mô tả tối đa 5000 ký tự';
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const catalogHandlers = [
  // ----- Danh mục -----
  http.get(`${API}/catalog/categories`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(
      catalog.categories
        .filter((c) => c.companyId === guard.value.companyId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        .map(toCategory),
    );
  }),

  http.post(`${API}/catalog/categories`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as CategoryInput;
    const invalid = validateCategory(body, guard.value.companyId);
    if (invalid) return invalid;
    const category: MockCategory = {
      id: rid('cat'),
      companyId: guard.value.companyId,
      name: body.name.trim(),
      skuPattern: body.skuPattern.trim(),
      skuNextSeq: 1,
      version: 1,
      updatedAt: db.now(),
    };
    catalog.categories.push(category);
    writeCompanyLog(guard.value, 'create', categoryEntity(category), null, categorySnapshot(category));
    return HttpResponse.json(toCategory(category), { status: 201 });
  }),

  http.put(`${API}/catalog/categories/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.categories, params.id, guard.value.companyId, 'danh mục');
    if (!found.ok) return found.response;
    const category = found.value;
    const body = (await request.json()) as CategoryInput & { version: number };
    if (body.version !== category.version) {
      return versionConflict(toCategory(category), 'Danh mục vừa được người khác sửa.');
    }
    const invalid = validateCategory(body, guard.value.companyId, category.id);
    if (invalid) return invalid;
    const before = categorySnapshot(category);
    // Đổi quy tắc chỉ áp dụng cho SKU sinh sau này; SKU cũ giữ nguyên
    category.name = body.name.trim();
    category.skuPattern = body.skuPattern.trim();
    category.version += 1;
    category.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', categoryEntity(category), before, categorySnapshot(category));
    return HttpResponse.json(toCategory(category));
  }),

  http.delete(`${API}/catalog/categories/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.categories, params.id, guard.value.companyId, 'danh mục');
    if (!found.ok) return found.response;
    const category = found.value;
    if (staleVersion(new URL(request.url), category.version)) {
      return versionConflict(toCategory(category), 'Danh mục vừa được người khác sửa.');
    }
    const count = toCategory(category).productCount;
    if (count) {
      return problem(409, 'Danh mục đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được danh mục ${category.name} vì có ${count} sản phẩm đang dùng.`,
      });
    }
    catalog.categories.splice(catalog.categories.indexOf(category), 1);
    writeCompanyLog(guard.value, 'delete', categoryEntity(category), categorySnapshot(category), null);
    return new HttpResponse(null, { status: 204 });
  }),

  // ----- Thuộc tính -----
  http.get(`${API}/catalog/attributes`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(
      catalog.attributes.filter((a) => a.companyId === guard.value.companyId).map(toAttribute),
    );
  }),

  http.post(`${API}/catalog/attributes`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as AttributeInput;
    const invalid = validateAttribute(body, guard.value.companyId);
    if (invalid) return invalid;
    const attribute: MockAttribute = {
      id: rid('att'),
      companyId: guard.value.companyId,
      name: body.name.trim(),
      values: body.values.map((v) => ({ id: rid('val'), value: v.value.trim() })),
      version: 1,
    };
    catalog.attributes.push(attribute);
    writeCompanyLog(guard.value, 'create', attributeEntity(attribute), null, attributeSnapshot(attribute));
    return HttpResponse.json(toAttribute(attribute), { status: 201 });
  }),

  http.put(`${API}/catalog/attributes/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.attributes, params.id, guard.value.companyId, 'thuộc tính');
    if (!found.ok) return found.response;
    const attribute = found.value;
    const body = (await request.json()) as AttributeInput & { version: number };
    if (body.version !== attribute.version) {
      return versionConflict(toAttribute(attribute), 'Thuộc tính vừa được người khác sửa.');
    }
    const invalid = validateAttribute(body, guard.value.companyId, attribute.id);
    if (invalid) return invalid;
    if (body.values.some((v) => v.id && !attribute.values.some((x) => x.id === v.id))) {
      return problem(422, 'Giá trị không thuộc thuộc tính này');
    }
    const used = usedValueIds(guard.value.companyId);
    const removedInUse = attribute.values.filter(
      (v) => used.has(v.id) && !body.values.some((x) => x.id === v.id),
    );
    if (removedInUse.length) {
      return problem(409, 'Giá trị đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được ${removedInUse.map((v) => v.value).join(', ')} vì đã có biến thể dùng.`,
      });
    }
    const before = attributeSnapshot(attribute);
    attribute.name = body.name.trim();
    attribute.values = body.values.map((v) => ({ id: v.id ?? rid('val'), value: v.value.trim() }));
    attribute.version += 1;
    writeCompanyLog(guard.value, 'update', attributeEntity(attribute), before, attributeSnapshot(attribute));
    return HttpResponse.json(toAttribute(attribute));
  }),

  http.delete(`${API}/catalog/attributes/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.attributes, params.id, guard.value.companyId, 'thuộc tính');
    if (!found.ok) return found.response;
    const attribute = found.value;
    if (staleVersion(new URL(request.url), attribute.version)) {
      return versionConflict(toAttribute(attribute), 'Thuộc tính vừa được người khác sửa.');
    }
    const count = toAttribute(attribute).productCount;
    if (count) {
      return problem(409, 'Thuộc tính đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được thuộc tính ${attribute.name} vì có ${count} sản phẩm đang dùng.`,
      });
    }
    catalog.attributes.splice(catalog.attributes.indexOf(attribute), 1);
    writeCompanyLog(guard.value, 'delete', attributeEntity(attribute), attributeSnapshot(attribute), null);
    return new HttpResponse(null, { status: 204 });
  }),

  // ----- Sản phẩm -----
  http.get(`${API}/catalog/products`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase();
    const categoryId = url.searchParams.get('categoryId');
    const status = url.searchParams.get('status') ?? 'active';
    let items = companyProducts(guard.value.companyId).filter((p) =>
      status === 'archived' ? p.archivedAt : !p.archivedAt,
    );
    if (categoryId) items = items.filter((p) => p.categoryId === categoryId);
    if (search) {
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(search)),
      );
    }
    items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return HttpResponse.json(paginate(items.map(toProductItem), page, pageSize));
  }),

  http.get(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    return HttpResponse.json(toProductDetail(found.value));
  }),

  http.post(`${API}/catalog/products`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const body = (await request.json()) as ProductCreateInput;
    const errors: Record<string, string> = {};
    validateProductText(body, errors);
    const category = catalog.categories.find((c) => c.id === body.categoryId && c.companyId === companyId);
    if (!category) errors.categoryId = 'Chọn danh mục';
    validateImages(companyId, body.imageFileIds, errors);

    const combos = (body.variants ?? []).map((v) => v.attributeValueIds ?? []);
    const sets = combos.map((c) => comboAttributes(companyId, c));
    if (!combos.length) errors.variants = 'Cần ít nhất một biến thể';
    else if (combos.length > 100) errors.variants = 'Tối đa 100 biến thể mỗi lần tạo';
    else if (sets.some((x) => x === null)) errors.variants = 'Biến thể có giá trị không hợp lệ';
    else if (new Set(sets.map((x) => x!.join('|'))).size > 1) {
      errors.variants = 'Mọi biến thể phải dùng cùng bộ thuộc tính';
    } else if (new Set(combos.map(comboKey)).size !== combos.length) {
      errors.variants = 'Có tổ hợp thuộc tính bị trùng';
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });

    const product: MockProduct = {
      id: rid('prd'),
      companyId,
      categoryId: category!.id,
      name: body.name.trim(),
      description: body.description ?? '',
      imageFileIds: body.imageFileIds ?? [],
      variants: [],
      archivedAt: null,
      updatedAt: db.now(),
      version: 1,
    };
    product.variants = combos.map((c) => {
      const v = nextVariant(category!, c);
      // nextVariant chỉ thấy sản phẩm đã lưu; giữ SKU duy nhất trong cùng lần tạo
      product.variants.push(v);
      return v;
    });
    catalog.products.unshift(product);
    writeCompanyLog(guard.value, 'create', productEntity(product), null, productSnapshot(product));
    return HttpResponse.json(toProductDetail(product), { status: 201 });
  }),

  http.put(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    const body = (await request.json()) as ProductUpdateInput;
    if (body.version !== product.version) {
      return versionConflict(toProductDetail(product), 'Sản phẩm vừa được người khác sửa.');
    }
    if (product.archivedAt) {
      return problem(409, 'Sản phẩm đã lưu trữ', { code: 'product_archived' });
    }
    const errors: Record<string, string> = {};
    validateProductText(body, errors);
    validateImages(guard.value.companyId, body.imageFileIds, errors);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    const before = productSnapshot(product);
    product.name = body.name.trim();
    product.description = body.description ?? '';
    product.imageFileIds = body.imageFileIds ?? [];
    product.version += 1;
    product.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', productEntity(product), before, productSnapshot(product));
    return HttpResponse.json(toProductDetail(product));
  }),

  http.delete(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    if (staleVersion(new URL(request.url), product.version)) {
      return versionConflict(toProductDetail(product), 'Sản phẩm vừa được người khác sửa.');
    }
    if (product.archivedAt) return problem(409, 'Sản phẩm đã lưu trữ', { code: 'product_archived' });
    if (catalog.productsWithActiveOrders.has(product.id)) {
      return problem(409, 'Sản phẩm đang có đơn hàng', {
        code: 'product_has_active_orders',
        detail: `Không xoá được ${product.name} vì đang có đơn hàng chưa hoàn tất.`,
      });
    }
    const before = productSnapshot(product);
    product.archivedAt = db.now();
    product.version += 1;
    product.updatedAt = db.now();
    writeCompanyLog(guard.value, 'delete', productEntity(product), before, null);
    return new HttpResponse(null, { status: 204 });
  }),

  // ----- Biến thể -----
  http.post(`${API}/catalog/products/:id/variants`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const found = findOwned(catalog.products, params.id, companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    if (product.archivedAt) return problem(409, 'Sản phẩm đã lưu trữ', { code: 'product_archived' });
    const { attributeValueIds = [] } = (await request.json()) as { attributeValueIds: string[] };
    const productAttrs = comboAttributes(companyId, product.variants[0]?.valueIds ?? []) ?? [];
    if (!productAttrs.length) {
      return problem(422, 'Sản phẩm không có thuộc tính', {
        detail: 'Sản phẩm tạo không có thuộc tính nên chỉ có một biến thể.',
      });
    }
    const attrs = comboAttributes(companyId, attributeValueIds);
    if (!attrs || attrs.join('|') !== productAttrs.join('|')) {
      return problem(422, 'Chọn đủ mỗi thuộc tính một giá trị', {
        errors: { attributeValueIds: 'Chọn đủ mỗi thuộc tính một giá trị' },
      });
    }
    const same = product.variants.find((v) => comboKey(v.valueIds) === comboKey(attributeValueIds));
    if (same && !same.archivedAt) {
      return problem(409, 'Biến thể đã tồn tại', {
        code: 'variant_exists',
        detail: `Tổ hợp này đã có biến thể ${same.sku}.`,
      });
    }
    const category = catalog.categories.find((c) => c.id === product.categoryId)!;
    let variant: MockVariant;
    if (same) {
      // Tổ hợp từng ngừng bán: bán lại với SKU cũ, không cấp SKU mới
      same.archivedAt = null;
      variant = same;
    } else {
      variant = nextVariant(category, attributeValueIds);
      product.variants.push(variant);
    }
    // Biến thể là bản ghi riêng: không tăng version của sản phẩm để form đang sửa không bị 409
    product.updatedAt = db.now();
    writeCompanyLog(
      guard.value,
      'create',
      { type: 'catalog.product_variants', id: variant.id, label: variant.sku },
      null,
      { product: product.name, sku: variant.sku, attributes: toVariant(companyId, variant).attributes.map((a) => a.value) },
    );
    return HttpResponse.json(toVariant(companyId, variant), { status: same ? 200 : 201 });
  }),

  http.delete(`${API}/catalog/products/:id/variants/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    const variant = product.variants.find((v) => v.id === params.variantId);
    if (!variant || variant.archivedAt) return problem(404, 'Không tìm thấy biến thể đang bán');
    if (product.variants.filter((v) => !v.archivedAt).length === 1) {
      return problem(409, 'Cần giữ ít nhất một biến thể', {
        code: 'last_variant',
        detail: 'Sản phẩm phải còn ít nhất một biến thể đang bán. Muốn ngừng hẳn thì xoá sản phẩm.',
      });
    }
    variant.archivedAt = db.now();
    // Biến thể là bản ghi riêng: không tăng version của sản phẩm để form đang sửa không bị 409
    product.updatedAt = db.now();
    writeCompanyLog(
      guard.value,
      'delete',
      { type: 'catalog.product_variants', id: variant.id, label: variant.sku },
      { product: product.name, sku: variant.sku },
      null,
    );
    return new HttpResponse(null, { status: 204 });
  }),

  // ----- Ảnh: vé tải lên (presigned) và nơi nhận file thay cho SeaweedFS/S3 -----
  http.post(`${API}/files/uploads`, async ({ request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as { fileName: string; contentType: string; sizeBytes: number };
    if (!IMAGE_TYPES.includes(body.contentType)) {
      return problem(422, 'Chỉ nhận ảnh JPG, PNG hoặc WebP', { code: 'file_type_not_allowed' });
    }
    if (body.sizeBytes > MAX_IMAGE_BYTES) {
      return problem(422, 'Ảnh tối đa 5 MB', { code: 'file_too_large' });
    }
    const id = rid('fil');
    catalog.files.push({ id, companyId: guard.value.companyId, ...body, url: null });
    const ticket: UploadTicket = {
      fileId: id,
      uploadUrl: `${new URL(request.url).origin}${API}/files/uploads/${id}/content`,
      headers: { 'Content-Type': body.contentType },
    };
    return HttpResponse.json(ticket, { status: 201 });
  }),

  http.put(`${API}/files/uploads/:id/content`, async ({ params, request }) => {
    await delay(300);
    const file = catalog.files.find((f) => f.id === params.id);
    if (!file || file.url) return new HttpResponse(null, { status: 403 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    file.url = `data:${file.contentType};base64,${btoa(binary)}`;
    return new HttpResponse(null, { status: 200 });
  }),
];

// ---------- Bảng giá (UC-CP-03, QT-12) ----------
const MAX_PRICE = 10_000_000_000;
const MAX_PRICE_ITEMS = 2000;

/** Mỗi công ty luôn có một bảng giá chuẩn (tạo cùng công ty) */
function ensureStandard(companyId: string): MockPricelist {
  let standard = pricing.pricelists.find((p) => p.companyId === companyId && p.type === 'standard');
  if (!standard) {
    standard = {
      id: rid('pl'),
      companyId,
      name: 'Bảng giá chuẩn',
      type: 'standard',
      shopId: null,
      prices: {},
      version: 1,
      updatedAt: db.now(),
    };
    pricing.pricelists.unshift(standard);
  }
  return standard;
}

/** Biến thể đang bán của sản phẩm đang bán: các dòng của lưới giá */
function sellableVariants(companyId: string) {
  return companyProducts(companyId)
    .filter((p) => !p.archivedAt)
    .flatMap((p) => p.variants.filter((v) => !v.archivedAt).map((v) => ({ product: p, variant: v })));
}

function toPricelist(pl: MockPricelist): Pricelist {
  const shop = pl.shopId ? db.shops.find((s) => s.id === pl.shopId) : undefined;
  const sellable = sellableVariants(pl.companyId);
  return {
    id: pl.id,
    name: pl.name,
    type: pl.type,
    shop: shop ? { id: shop.id, shopName: shop.shopName, platform: shop.platform } : null,
    pricedCount: sellable.filter(({ variant }) => variant.id in pl.prices).length,
    variantCount: sellable.length,
    version: pl.version,
    updatedAt: pl.updatedAt,
  };
}

const pricelistEntity = (pl: MockPricelist) => ({ type: 'pricing.pricelists', id: pl.id, label: pl.name });
function pricelistSnapshot(pl: MockPricelist) {
  const shop = pl.shopId ? db.shops.find((s) => s.id === pl.shopId) : undefined;
  return { name: pl.name, type: pl.type, shop: shop?.shopName ?? null };
}

function skuOf(companyId: string, variantId: string) {
  for (const p of companyProducts(companyId)) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return v.sku;
  }
  return variantId;
}

/** Nhật ký chỉ ghi các giá đổi, mỗi dòng "SKU: giá" */
function priceLines(companyId: string, prices: Record<string, number | null>) {
  return Object.entries(prices).map(
    ([variantId, price]) => `${skuOf(companyId, variantId)}: ${price === null ? '—' : formatCurrency(price)}`,
  );
}

function validatePricelistName(name: string | undefined, companyId: string, exceptId?: string) {
  const value = name?.trim() ?? '';
  if (!value) return 'Nhập tên bảng giá';
  if (value.length > 60) return 'Tên bảng giá tối đa 60 ký tự';
  if (pricing.pricelists.some((p) => p.companyId === companyId && p.id !== exceptId && sameText(p.name, value))) {
    return 'Đã có bảng giá cùng tên';
  }
  return null;
}

const pricingHandlers = [
  http.get(`${API}/pricing/pricelists`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistView);
    if (!guard.ok) return guard.response;
    ensureStandard(guard.value.companyId);
    return HttpResponse.json(
      pricing.pricelists
        .filter((p) => p.companyId === guard.value.companyId)
        // Bảng giá chuẩn đứng đầu, sau đó theo tên
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'vi') : a.type === 'standard' ? -1 : 1))
        .map(toPricelist),
    );
  }),

  http.get(`${API}/pricing/pricelists/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistView);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    return HttpResponse.json(toPricelist(found.value));
  }),

  http.get(`${API}/pricing/pricelists/:id/items`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistView);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    const standard = ensureStandard(pl.companyId);
    const items: PricelistItem[] = sellableVariants(pl.companyId).map(({ product, variant }) => ({
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      sku: variant.sku,
      attributesLabel: variantAttributes(pl.companyId, variant.valueIds)
        .map((a) => a.value)
        .join(' / '),
      categoryId: product.categoryId,
      thumbnailUrl: product.imageFileIds[0] ? fileUrl(product.imageFileIds[0]) : null,
      price: pl.prices[variant.id] ?? null,
      standardPrice: standard.prices[variant.id] ?? null,
    }));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/pricing/pricelists`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const body = (await request.json()) as PricelistCreateInput;
    const errors: Record<string, string> = {};
    const nameError = validatePricelistName(body.name, companyId);
    if (nameError) errors.name = nameError;
    const shop = db.shops.find((s) => s.id === body.shopId && s.companyId === companyId);
    if (!body.shopId) errors.shopId = 'Chọn gian hàng';
    else if (!shop) errors.shopId = 'Không tìm thấy gian hàng';
    else if (shop.status === 'disconnected') errors.shopId = 'Gian hàng đã ngắt kết nối';
    else {
      const taken = pricing.pricelists.find((p) => p.shopId === shop.id);
      if (taken) errors.shopId = `Gian hàng đã có bảng giá "${taken.name}"`;
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    const standard = ensureStandard(companyId);
    const pl: MockPricelist = {
      id: rid('pl'),
      companyId,
      name: body.name.trim(),
      type: 'channel',
      shopId: shop!.id,
      prices: body.copyFromStandard ? { ...standard.prices } : {},
      version: 1,
      updatedAt: db.now(),
    };
    pricing.pricelists.push(pl);
    writeCompanyLog(guard.value, 'create', pricelistEntity(pl), null, pricelistSnapshot(pl));
    return HttpResponse.json(toPricelist(pl), { status: 201 });
  }),

  http.put(`${API}/pricing/pricelists/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    const body = (await request.json()) as PricelistUpdateInput;
    if (body.version !== pl.version) {
      return versionConflict(toPricelist(pl), 'Bảng giá vừa được người khác sửa.');
    }
    const nameError = validatePricelistName(body.name, pl.companyId, pl.id);
    if (nameError) return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { name: nameError } });
    const before = pricelistSnapshot(pl);
    pl.name = body.name.trim();
    pl.version += 1;
    pl.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', pricelistEntity(pl), before, pricelistSnapshot(pl));
    return HttpResponse.json(toPricelist(pl));
  }),

  http.delete(`${API}/pricing/pricelists/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    if (staleVersion(new URL(request.url), pl.version)) {
      return versionConflict(toPricelist(pl), 'Bảng giá vừa được người khác sửa.');
    }
    if (pl.type === 'standard') {
      return problem(409, 'Không xoá được bảng giá chuẩn', {
        code: 'in_use',
        detail: 'Bảng giá chuẩn áp dụng mặc định cho mọi đơn hàng (QT-12).',
      });
    }
    const shop = db.shops.find((s) => s.id === pl.shopId);
    if (shop && shop.status !== 'disconnected') {
      return problem(409, 'Bảng giá đang được sử dụng', {
        code: 'in_use',
        detail: `Đơn từ gian hàng ${shop.shopName} đang lấy giá trong bảng này. Ngắt gian hàng trước khi xoá.`,
      });
    }
    pricing.pricelists.splice(pricing.pricelists.indexOf(pl), 1);
    writeCompanyLog(guard.value, 'delete', pricelistEntity(pl), pricelistSnapshot(pl), null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${API}/pricing/pricelists/:id/items`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    const body = (await request.json()) as PricelistItemsInput;
    if (body.version !== pl.version) {
      return versionConflict(toPricelist(pl), 'Bảng giá vừa được người khác sửa.');
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { items: 'Chưa có giá nào thay đổi' } });
    }
    if (items.length > MAX_PRICE_ITEMS) {
      return problem(422, 'Dữ liệu chưa hợp lệ', {
        errors: { items: `Tối đa ${MAX_PRICE_ITEMS} giá mỗi lần lưu` },
      });
    }
    // Lỗi theo từng dòng: khoá "items.<variantId>"
    const sellable = new Set(sellableVariants(pl.companyId).map(({ variant }) => variant.id));
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const { variantId, price } of items) {
      const key = `items.${variantId}`;
      if (seen.has(variantId)) errors[key] = 'Biến thể bị gửi hai lần';
      else if (!sellable.has(variantId)) errors[key] = 'Biến thể không còn bán';
      else if (price !== null && (typeof price !== 'number' || !Number.isInteger(price))) {
        errors[key] = 'Giá phải là số nguyên đồng';
      } else if (price !== null && price < 0) errors[key] = 'Giá không được âm';
      else if (price !== null && price > MAX_PRICE) errors[key] = 'Giá tối đa 10 tỷ đồng';
      seen.add(variantId);
    }
    if (Object.keys(errors).length) return problem(422, 'Có giá chưa hợp lệ', { errors });

    const before: Record<string, number | null> = {};
    const after: Record<string, number | null> = {};
    for (const { variantId, price } of items) {
      const old = pl.prices[variantId] ?? null;
      if (old === price) continue;
      before[variantId] = old;
      after[variantId] = price;
      if (price === null) delete pl.prices[variantId];
      else pl.prices[variantId] = price;
    }
    // Không giá nào thật sự đổi: không tăng version, không ghi nhật ký
    if (Object.keys(after).length) {
      pl.version += 1;
      pl.updatedAt = db.now();
      writeCompanyLog(
        guard.value,
        'update',
        pricelistEntity(pl),
        { prices: priceLines(pl.companyId, before) },
        { prices: priceLines(pl.companyId, after) },
      );
    }
    return HttpResponse.json(toPricelist(pl));
  }),
];

// ---------- Inventory (UC-IN-01..03) ----------
const MAX_QTY = 1_000_000;
const isQty = (n: unknown, min: number, max = MAX_QTY): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

const accountName = (id: string | null) =>
  (id && db.accounts.find((a) => a.id === id)?.fullName) || '—';

/** Biến thể (kể cả đã lưu trữ) của công ty; null nếu không có ở công ty nào */
function findVariant(variantId: string) {
  for (const product of catalog.products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function variantLabel(companyId: string, variantId: string) {
  const found = findVariant(variantId);
  return {
    sku: found?.variant.sku ?? variantId,
    productName: found?.product.name ?? '',
    attributesLabel: found
      ? variantAttributes(companyId, found.variant.valueIds)
          .map((a) => a.value)
          .join(' / ')
      : '',
  };
}

function stockLevelOf(companyId: string, variantId: string) {
  let level = inventory.levels.find((l) => l.companyId === companyId && l.variantId === variantId);
  if (!level) {
    level = { companyId, variantId, onHand: 0, reserved: 0, avgCost: 0 };
    inventory.levels.push(level);
  }
  return level;
}

function toStockLevel(product: MockProduct, variant: MockVariant, canCost: boolean): StockLevel {
  const level = stockLevelOf(product.companyId, variant.id);
  const rule = inventory.reorderRules.find(
    (r) => r.companyId === product.companyId && r.variantId === variant.id,
  );
  const available = level.onHand - level.reserved;
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    sku: variant.sku,
    attributesLabel: variantAttributes(product.companyId, variant.valueIds)
      .map((a) => a.value)
      .join(' / '),
    category: {
      id: product.categoryId,
      name: catalog.categories.find((c) => c.id === product.categoryId)?.name ?? '',
    },
    onHand: level.onHand,
    reserved: level.reserved,
    available,
    minQty: rule?.minQty ?? null,
    belowMin: rule ? available < rule.minQty : false,
    reorderVersion: rule?.version ?? 0,
    avgCost: canCost ? level.avgCost : null,
    stockValue: canCost ? level.onHand * level.avgCost : null,
  };
}

/** Biến thể đang bán của công ty, hoặc lỗi 404/403 */
function ownedVariant(variantId: unknown, companyId: string) {
  const found = findVariant(String(variantId));
  if (!found) return { ok: false as const, response: problem(404, 'Không tìm thấy biến thể') };
  if (found.product.companyId !== companyId) {
    return { ok: false as const, response: problem(403, 'Biến thể thuộc công ty khác') };
  }
  return { ok: true as const, value: found };
}

/** Phiếu nhập tay và nhận hàng: người lập phiếu thấy giá nhập; còn lại là giá vốn, cần quyền giá vốn */
function canSeeLineCost(doc: MockStockDoc, permissions: string[]) {
  if (permissions.includes(PERMISSIONS.costView)) return true;
  return (
    doc.type === 'receipt' &&
    doc.kind !== 'delivery_return' &&
    permissions.includes(PERMISSIONS.stockDocManage)
  );
}

function toStockDocSummary(doc: MockStockDoc): StockDocSummary {
  return {
    id: doc.id,
    number: doc.number,
    type: doc.type,
    kind: doc.kind,
    status: doc.status,
    note: doc.note,
    reference: doc.reference,
    lineCount: doc.lines.length,
    totalQty: doc.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: accountName(doc.createdBy),
    createdAt: doc.createdAt,
    postedBy: doc.postedBy ? accountName(doc.postedBy) : null,
    postedAt: doc.postedAt,
    version: doc.version,
  };
}

function toStockDoc(doc: MockStockDoc, permissions: string[]): StockDoc {
  const showCost = canSeeLineCost(doc, permissions);
  return {
    ...toStockDocSummary(doc),
    lines: doc.lines.map((l) => ({
      variantId: l.variantId,
      ...variantLabel(doc.companyId, l.variantId),
      quantity: l.quantity,
      unitCost: showCost ? l.unitCost : null,
    })),
  };
}

const stockDocEntity = (d: MockStockDoc) => ({
  type: d.type === 'receipt' ? 'inventory.stock_receipts' : 'inventory.stock_issues',
  id: d.id,
  label: d.number,
});
function stockDocSnapshot(d: MockStockDoc) {
  return {
    status: d.status,
    note: d.note,
    lines: d.lines.map(
      (l) =>
        `${skuOf(d.companyId, l.variantId)}: ${l.quantity}` +
        (d.type === 'receipt' && d.kind === 'manual' && l.unitCost !== null
          ? ` × ${formatCurrency(l.unitCost)}`
          : ''),
    ),
  };
}

function nextDocNumber(companyId: string, type: StockDocType) {
  const count = inventory.docs.filter((d) => d.companyId === companyId && d.type === type).length;
  return `${type === 'receipt' ? 'PN' : 'PX'}-${String(count + 1).padStart(6, '0')}`;
}

/** Kiểm dòng phiếu nhập tay, xuất tay; lỗi theo đường dẫn "lines.<i>.<trường>" */
function validateDocInput(
  type: StockDocType,
  body: { note?: string; lines?: StockDocLineInput[] },
  companyId: string,
) {
  const errors: Record<string, string> = {};
  const note = body.note?.trim() ?? '';
  if (note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự';
  else if (type === 'issue' && !note) errors.note = 'Nhập lý do xuất kho';
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) errors.lines = 'Thêm ít nhất một dòng';
  if (lines.length > 200) errors.lines = 'Tối đa 200 dòng một phiếu';
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const found = findVariant(String(line.variantId));
    if (
      !found ||
      found.product.companyId !== companyId ||
      found.product.archivedAt ||
      found.variant.archivedAt
    ) {
      errors[`lines.${i}.variantId`] = 'Biến thể không còn bán';
    } else if (seen.has(line.variantId)) {
      errors[`lines.${i}.variantId`] = 'Biến thể bị lặp';
    }
    seen.add(line.variantId);
    if (!isQty(line.quantity, 1)) errors[`lines.${i}.quantity`] = 'Số lượng là số nguyên từ 1';
    if (type === 'receipt' && !isQty(line.unitCost, 0, MAX_PRICE)) {
      errors[`lines.${i}.unitCost`] = 'Giá nhập là số nguyên đồng, không âm';
    }
  });
  return { errors, note, lines };
}

const toDocLines = (type: StockDocType, lines: StockDocLineInput[]): MockStockDocLine[] =>
  lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
    unitCost: type === 'receipt' ? l.unitCost ?? 0 : null,
  }));

function toReturnOrder(o: MockReturnOrder): ReturnOrder {
  const receipt = inventory.docs.find(
    (d) => d.kind === 'delivery_return' && d.orderId === o.orderId && d.status !== 'cancelled',
  );
  return {
    orderId: o.orderId,
    orderCode: o.orderCode,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    shipmentCode: o.shipmentCode,
    failedReason: o.failedReason,
    failedAt: o.failedAt,
    lines: o.lines.map((l) => ({ variantId: l.variantId, ...variantLabel(o.companyId, l.variantId), quantity: l.quantity })),
    receipt: receipt ? { id: receipt.id, number: receipt.number } : null,
  };
}

const inventoryHandlers = [
  http.get(`${API}/inventory/stock`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const canCost = permissions.includes(PERMISSIONS.costView);
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryId = url.searchParams.get('categoryId');
    const belowMin = url.searchParams.get('belowMin') === 'true';
    const all = sellableVariants(companyId).map(({ product, variant }) => toStockLevel(product, variant, canCost));
    const items = all.filter(
      (l) =>
        (!search || l.productName.toLowerCase().includes(search) || l.sku.toLowerCase().includes(search)) &&
        (!categoryId || l.category.id === categoryId) &&
        (!belowMin || l.belowMin),
    );
    const result: StockListResult = {
      ...paginate(items, page, pageSize),
      summary: {
        variantCount: all.length,
        belowMinCount: all.filter((l) => l.belowMin).length,
        totalValue: canCost ? all.reduce((s, l) => s + (l.stockValue ?? 0), 0) : null,
      },
    };
    return HttpResponse.json(result);
  }),

  http.get(`${API}/inventory/stock/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = ownedVariant(params.variantId, companyId);
    if (!found.ok) return found.response;
    const canCost = permissions.includes(PERMISSIONS.costView);
    const { product, variant } = found.value;
    const moves: StockMove[] = inventory.moves
      .filter((m) => m.companyId === companyId && m.variantId === variant.id)
      .sort((a, b) => b.doneAt.localeCompare(a.doneAt) || Number(b.id.slice(3)) - Number(a.id.slice(3)))
      .slice(0, 100)
      .map((m) => {
        const doc = inventory.docs.find((d) => d.id === m.docId)!;
        return {
          id: m.id,
          qtyChange: m.qtyChange,
          onHandAfter: m.onHandAfter,
          document: { id: doc.id, number: doc.number, type: doc.type, kind: doc.kind },
          unitCost: canCost ? m.unitCost : null,
          doneAt: m.doneAt,
          doneBy: accountName(m.doneBy),
        };
      });
    const detail: StockDetail = { level: toStockLevel(product, variant, canCost), moves };
    return HttpResponse.json(detail);
  }),

  http.put(`${API}/inventory/stock/:variantId/reorder-rule`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.reorderManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = ownedVariant(params.variantId, companyId);
    if (!found.ok) return found.response;
    const { product, variant } = found.value;
    const canCost = permissions.includes(PERMISSIONS.costView);
    const body = (await request.json()) as ReorderRuleInput;
    const idx = inventory.reorderRules.findIndex((r) => r.companyId === companyId && r.variantId === variant.id);
    const rule = idx >= 0 ? inventory.reorderRules[idx] : null;
    if (body.version !== (rule?.version ?? 0)) {
      return versionConflict(
        toStockLevel(product, variant, canCost),
        'Ngưỡng tồn vừa được người khác sửa. Xem lại số mới rồi lưu lại.',
      );
    }
    if (body.minQty !== null && !isQty(body.minQty, 0)) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        errors: { minQty: 'Ngưỡng là số nguyên không âm' },
      });
    }
    const before = rule ? { minQty: rule.minQty } : null;
    if (body.minQty === null) {
      if (rule) inventory.reorderRules.splice(idx, 1);
    } else if (rule) {
      rule.minQty = body.minQty;
      rule.version += 1;
      rule.updatedAt = db.now();
    } else {
      inventory.reorderRules.push({
        companyId,
        variantId: variant.id,
        minQty: body.minQty,
        version: 1,
        updatedAt: db.now(),
      });
    }
    const after = body.minQty === null ? null : { minQty: body.minQty };
    if (before?.minQty !== after?.minQty) {
      writeCompanyLog(
        guard.value,
        !before ? 'create' : !after ? 'delete' : 'update',
        { type: 'inventory.reorder_rules', id: variant.id, label: variant.sku },
        before,
        after,
      );
    }
    // Dưới ngưỡng thì BE phát sự kiện để báo Nhân viên kho, Admin (QT-16); mock không gửi thông báo
    return HttpResponse.json(toStockLevel(product, variant, canCost));
  }),

  http.get(`${API}/inventory/documents`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const items = inventory.docs
      .filter(
        (d) =>
          d.companyId === guard.value.companyId &&
          (!type || d.type === type) &&
          (!status || d.status === status) &&
          (!search ||
            d.number.toLowerCase().includes(search) ||
            d.note.toLowerCase().includes(search) ||
            (d.reference ?? '').toLowerCase().includes(search)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toStockDocSummary);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/inventory/documents/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const found = findOwned(inventory.docs, params.id, guard.value.companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    return HttpResponse.json(toStockDoc(found.value, guard.value.permissions));
  }),

  http.post(`${API}/inventory/documents`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as StockDocCreateInput;
    if (body.type !== 'receipt' && body.type !== 'issue') {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { type: 'Chọn phiếu nhập hoặc phiếu xuất' } });
    }
    const { errors, note, lines } = validateDocInput(body.type, body, companyId);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const doc: MockStockDoc = {
      id: rid('sd'),
      companyId,
      number: nextDocNumber(companyId, body.type),
      type: body.type,
      // Phiếu nhập theo đơn mua lập ở UC-PU-05, phiếu xuất theo đơn ở UC-SF-08
      kind: 'manual',
      status: 'draft',
      note,
      orderId: null,
      reference: null,
      lines: toDocLines(body.type, lines),
      createdBy: guard.value.account.id,
      createdAt: db.now(),
      postedBy: null,
      postedAt: null,
      version: 1,
    };
    inventory.docs.push(doc);
    writeCompanyLog(guard.value, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, guard.value.permissions), { status: 201 });
  }),

  http.put(`${API}/inventory/documents/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as StockDocUpdateInput;
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    }
    if (doc.status !== 'draft' || doc.kind !== 'manual') {
      return problem(409, 'Phiếu không còn sửa được', {
        code: 'not_draft',
        detail: 'Chỉ sửa được phiếu nháp lập tay.',
      });
    }
    const { errors, note, lines } = validateDocInput(doc.type, body, companyId);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const before = stockDocSnapshot(doc);
    doc.note = note;
    doc.lines = toDocLines(doc.type, lines);
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions));
  }),

  /** Ghi sổ: Template Method ở BE — kiểm, cập nhật stock_levels, ghi stock_moves, đẩy tồn lên sàn (QT-46) */
  http.post(`${API}/inventory/documents/:id/post`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as { version: number };
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    }
    if (doc.status !== 'draft') {
      return problem(409, 'Phiếu đã ghi sổ hoặc đã huỷ', { code: 'not_draft' });
    }
    if (doc.type === 'issue') {
      // Xuất tay chỉ lấy phần khả dụng, không đụng hàng đang giữ cho đơn (QT-14)
      const errors: Record<string, string> = {};
      doc.lines.forEach((l, i) => {
        const level = stockLevelOf(companyId, l.variantId);
        const available = level.onHand - level.reserved;
        if (l.quantity > available) errors[`lines.${i}.quantity`] = `Chỉ còn ${Math.max(available, 0)} khả dụng`;
      });
      if (Object.keys(errors).length) {
        return problem(422, 'Không đủ hàng khả dụng để xuất', { code: 'insufficient_stock', errors });
      }
    }
    const before = stockDocSnapshot(doc);
    const at = db.now();
    inventory.applyDoc(doc, at, guard.value.account.id);
    doc.status = 'done';
    doc.postedBy = guard.value.account.id;
    doc.postedAt = at;
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions));
  }),

  http.post(`${API}/inventory/documents/:id/cancel`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as { version: number };
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    }
    if (doc.status !== 'draft') {
      return problem(409, 'Chỉ huỷ được phiếu nháp', {
        code: 'not_draft',
        detail: 'Phiếu đã ghi sổ thì lập phiếu ngược lại để điều chỉnh.',
      });
    }
    const before = stockDocSnapshot(doc);
    doc.status = 'cancelled';
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions));
  }),

  http.get(`${API}/inventory/returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const list = inventory.returnOrders
      .filter((o) => o.companyId === guard.value.companyId)
      .map(toReturnOrder)
      // Chưa xử lý lên đầu, mới nhất trước
      .sort((a, b) => Number(Boolean(a.receipt)) - Number(Boolean(b.receipt)) || b.failedAt.localeCompare(a.failedAt));
    return HttpResponse.json(list);
  }),

  /** UC-IN-03: lập và ghi sổ ngay phiếu nhập hoàn, tăng tồn khả dụng (QT-31) */
  http.post(`${API}/inventory/returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const body = (await request.json()) as ReturnReceiptInput;
    const order = inventory.returnOrders.find((o) => o.orderId === body.orderId);
    if (!order) return problem(404, 'Không tìm thấy đơn giao không thành công');
    if (order.companyId !== companyId) return problem(403, 'Đơn thuộc công ty khác');
    const done = toReturnOrder(order).receipt;
    if (done) {
      return problem(409, 'Đơn đã được xử lý', {
        code: 'already_processed',
        detail: `Đơn ${order.orderCode} đã có phiếu nhập hoàn ${done.number}.`,
      });
    }
    const errors: Record<string, string> = {};
    const input = Array.isArray(body.lines) ? body.lines : [];
    const lines = order.lines.map((ol, i) => {
      const got = input.find((l) => l.variantId === ol.variantId);
      if (!got || !isQty(got.quantity, 0, ol.quantity)) {
        errors[`lines.${i}.quantity`] = `Số nguyên từ 0 đến ${ol.quantity}`;
      }
      return { variantId: ol.variantId, quantity: got?.quantity ?? 0, shipped: ol.quantity };
    });
    const note = body.note?.trim() ?? '';
    if (!Object.keys(errors).length) {
      if (lines.every((l) => l.quantity === 0)) errors.lines = 'Không có hàng nào quay về thì không lập phiếu';
      else if (lines.some((l) => l.quantity !== l.shipped) && !note) {
        errors.note = 'Ghi lý do số thực nhận khác số đã xuất';
      }
    }
    if (note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự';
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const at = db.now();
    const doc: MockStockDoc = {
      id: rid('sd'),
      companyId,
      number: nextDocNumber(companyId, 'receipt'),
      type: 'receipt',
      kind: 'delivery_return',
      status: 'done',
      note,
      orderId: order.orderId,
      reference: order.orderCode,
      lines: lines.filter((l) => l.quantity > 0).map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: null })),
      createdBy: guard.value.account.id,
      createdAt: at,
      postedBy: guard.value.account.id,
      postedAt: at,
      version: 1,
    };
    inventory.applyDoc(doc, at, guard.value.account.id);
    inventory.docs.push(doc);
    writeCompanyLog(guard.value, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions), { status: 201 });
  }),
];

export const handlers = [
  ...authHandlers,
  ...platformHandlers,
  ...identityHandlers,
  ...companySettingsHandlers,
  ...catalogHandlers,
  ...pricingHandlers,
  ...inventoryHandlers,
  ...shopHandlers,
];
