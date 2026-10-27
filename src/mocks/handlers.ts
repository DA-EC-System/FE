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
import {
  CEO_ROLE_ID,
  db,
  passwords,
  permissionCatalog,
  type MockMembership,
  type MockRole,
  type MockShop,
} from './db';
import type {
  ChannelListing,
  ListingMatchInput,
  ListingRow,
  Marketplace,
  PushResult,
  RemoteSku,
  Shop,
  ShopCallbackInput,
  ShopConnectInput,
} from '@/types/shop';
import * as channel from './channelData';
import type { MockListing, MockRemoteSku } from './channelData';
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
import { skuPatternError, valueCode } from '@/utils/sku';
import * as pricing from './pricingData';
import type { MockPricelist } from './pricingData';
import { formatCurrency } from '@/utils/format';
import { appPath } from '@/utils/env';
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
import * as sales from './salesData';
import * as payment from './paymentData';
import type {
  Customer,
  CustomerChannel,
  CustomerSummary,
  CreateOrderInput,
  Order,
  OrderSource,
  OrderStatus,
  OrderSummary,
  OrderVariantOption,
  ShippingAddress,
  UserRef,
} from '@/types/sales';
import * as fulfillment from './fulfillmentData';
import type {
  Batch,
  BatchIssueResult,
  BatchSummary,
  DeliveryStatus,
  FulfillmentOrder,
  IssueOrderResult,
} from '@/types/fulfillment';
import { buildPickList } from '@/features/fulfillment/pickList';
import type {
  Gateway,
  GatewayConfig,
  OrderPayment,
  PaymentLink,
  PaymentStatus,
  PaymentTransaction,
  PaymentTransactionDetail,
} from '@/types/payment';
import * as finance from './financeData';
import { reportRows, type MockReportRow } from './reportData';
import * as settlement from './settlementData';
import type {
  DailyFigures,
  ReportDaily,
  ReportFigures,
  ReportKind,
  ReportOverview,
  ReportShops,
  ShopFigures,
} from '@/types/report';
import type { SettlementFees, SettlementLine, SettlementStatement } from '@/types/settlement';
import type {
  CodOrder,
  CodStatus,
  DocRef,
  Invoice,
  InvoiceSummary,
  OrderRef,
  OrderRefPhone,
  PaymentVoucher,
  Receipt,
  RefundItem,
  RefundListStatus,
  UnmatchedReceipt,
  UnpaidOrder,
  VoucherPurpose,
} from '@/types/finance';

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
  // docs/21 V45: 422 kiểm dữ liệu không có mã riêng thì là validation_failed
  const code = extra.code ?? (status === 422 ? 'validation_failed' : undefined);
  return HttpResponse.json(
    { type: 'about:blank', title, status, ...extra, ...(code ? { code } : {}) },
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
      response: problem(403, 'Tài khoản bị khoá trong công ty này', { code: 'account_locked' }),
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
      return problem(422, 'Dữ liệu gửi lên không hợp lệ', {
        code: 'validation_failed',
        errors: { assistantDataConsent: 'Cần đồng ý gửi dữ liệu tới OpenAI để bật Trợ lý AI' },
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
      return problem(422, 'Dữ liệu gửi lên không hợp lệ', {
        code: 'validation_failed',
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
    // docs/21 C4: không thuộc công ty thì trả 404 như bản ghi của công ty khác
    if (!membership) return problem(404, 'Không tìm thấy công ty', { code: 'not_found' });
    const company = db.companies.find((c) => c.id === companyId)!;
    if (company.status === 'locked') {
      return problem(403, 'Công ty đang bị khoá', {
        code: 'company_locked',
        detail: 'Công ty đã bị quản trị nền tảng khoá, nhân viên không đăng nhập được.',
      });
    }
    if (membership.status === 'locked') {
      return problem(403, 'Tài khoản bị khoá trong công ty này', { code: 'account_locked' });
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

// ---------- Channel: gian hàng và ghép SKU của công ty đang chọn (UC-CH-01, UC-CH-02) ----------
const shopEntity = (s: MockShop) => ({ type: 'channel.shops', id: s.id, label: s.shopName });
function shopSnapshot(s: MockShop): Record<string, unknown> {
  return {
    shopName: s.shopName,
    platform: s.platform,
    externalShopId: s.externalShopId,
    status: s.status,
  };
}

function toShop(s: MockShop): Shop {
  return { ...s, listingCount: channel.listings.filter((l) => l.shopId === s.id).length };
}

function findShop(id: unknown, companyId: string) {
  return db.shops.findIndex((s) => s.id === id && s.companyId === companyId);
}

const MARKETPLACES: Marketplace[] = ['tiktok', 'shopee', 'lazada', 'mock'];
/** Gian hàng còn token dùng được: gọi được API sàn */
const usable = (s: MockShop) => s.status === 'connected' || s.status === 'expiring';
const TOKEN_TTL_MS = 90 * 24 * 3600_000;

function shopNotConnected(s: MockShop) {
  return problem(409, 'Gian hàng chưa kết nối', {
    code: 'shop_not_connected',
    detail: `${s.shopName} cần kết nối lại trước khi thao tác với sàn.`,
  });
}

/** Mã uỷ quyền giả: sàn giả lập gói mã và tên gian hàng người dùng đồng ý */
function decodeMockCode(code: string): { externalShopId: string; shopName: string } | null {
  try {
    const value = JSON.parse(decodeURIComponent(atob(code)));
    return typeof value?.externalShopId === 'string' && typeof value?.shopName === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Giá đẩy lên sàn: bảng giá của gian hàng, thiếu thì lấy giá chuẩn (G5) */
function shopPrice(shop: MockShop, variantId: string) {
  const own = pricing.pricelists.find((p) => p.shopId === shop.id)?.prices[variantId];
  if (own !== undefined) return { price: own, priceSource: 'shop' as const };
  const standard = ensureStandard(shop.companyId).prices[variantId];
  if (standard !== undefined) return { price: standard, priceSource: 'standard' as const };
  return { price: null, priceSource: null };
}

function toListing(l: MockListing): ChannelListing {
  const r = channel.remoteSkus[l.shopId]?.find((x) => x.externalSkuId === l.externalSkuId);
  return {
    id: l.id,
    externalProductId: l.externalProductId,
    externalSkuId: l.externalSkuId,
    sellerSku: r?.sellerSku ?? '',
    lastPushedAt: l.lastPushedAt,
    lastPushedPrice: l.lastPushedPrice,
    version: l.version,
  };
}

const listingEntity = (shop: MockShop, sku: string, id: string) => ({
  type: 'channel.channel_listings',
  id,
  label: `${shop.shopName}: ${sku}`,
});

/** Gian hàng của công ty theo :id, 404 nếu không có (công ty khác cũng là 404) */
function ownShop(id: unknown, companyId: string): { ok: true; value: MockShop } | { ok: false; response: Response } {
  const shop = db.shops.find((s) => s.id === id && s.companyId === companyId);
  return shop ? { ok: true, value: shop } : { ok: false, response: problem(404, 'Không tìm thấy gian hàng') };
}

function sellableVariant(companyId: string, variantId: unknown) {
  return sellableVariants(companyId).find(({ variant }) => variant.id === variantId);
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
    const status = url.searchParams.get('status') ?? '';

    let items = db.shops.filter((s) => s.companyId === guard.value.companyId);
    if (search) {
      items = items.filter(
        (s) =>
          s.shopName.toLowerCase().includes(search) ||
          s.externalShopId.toLowerCase().includes(search),
      );
    }
    if (platform) items = items.filter((s) => s.platform === platform);
    if (status) items = items.filter((s) => s.status === status);
    return HttpResponse.json(paginate(items.map(toShop), page, pageSize));
  }),

  http.post(`${API}/channel/shops/connect`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as ShopConnectInput;
    let shop: MockShop | null = null;
    if (body.shopId) {
      const found = ownShop(body.shopId, guard.value.companyId);
      if (!found.ok) return found.response;
      shop = found.value;
    }
    const platform = shop?.platform ?? body.platform;
    if (!MARKETPLACES.includes(platform)) {
      return problem(422, 'Sàn không hợp lệ', { errors: { platform: 'Chọn sàn để kết nối' } });
    }
    const state = rid('st');
    channel.oauthStates.set(state, {
      companyId: guard.value.companyId,
      accountId: guard.value.account.id,
      platform,
      shopId: shop?.id ?? null,
    });
    // Sàn thật trả trang uỷ quyền của sàn; mock dùng trang sàn giả lập trong SPA
    const params = new URLSearchParams({
      platform,
      state,
      redirect_uri: `${window.location.origin}${appPath('channel/oauth/callback')}`,
    });
    if (shop) {
      params.set('shop_id', shop.externalShopId);
      params.set('shop_name', shop.shopName);
    }
    return HttpResponse.json({ authorizeUrl: `${appPath('mock-oauth/authorize')}?${params}` });
  }),

  http.post(`${API}/channel/shops/oauth/callback`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as ShopCallbackInput;
    const pending = channel.oauthStates.get(body.state);
    const companyId = guard.value.companyId;
    if (!pending || pending.companyId !== companyId || pending.accountId !== guard.value.account.id) {
      return problem(400, 'Phiên kết nối không hợp lệ', {
        code: 'invalid_state',
        detail: 'Phiên kết nối đã hết hạn hoặc không thuộc công ty đang chọn.',
      });
    }
    channel.oauthStates.delete(body.state);
    const granted = decodeMockCode(body.code);
    if (!granted) return problem(400, 'Mã uỷ quyền không hợp lệ', { code: 'invalid_code' });

    const platform = pending.platform as Marketplace;
    if (pending.shopId) {
      const target = db.shops.find((s) => s.id === pending.shopId && s.companyId === companyId);
      if (target && target.externalShopId !== granted.externalShopId) {
        return problem(409, 'Gian hàng không khớp', {
          code: 'shop_mismatch',
          detail: `Bạn vừa uỷ quyền gian hàng ${granted.shopName}, không phải ${target.shopName}.`,
        });
      }
    }
    const idx = db.shops.findIndex(
      (s) => s.companyId === companyId && s.externalShopId === granted.externalShopId,
    );
    const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    if (idx !== -1) {
      const before = shopSnapshot(db.shops[idx]);
      db.shops[idx] = {
        ...db.shops[idx],
        status: 'connected',
        accessExpiresAt: expires,
        updatedAt: db.now(),
        version: db.shops[idx].version + 1,
      };
      writeCompanyLog(guard.value, 'update', shopEntity(db.shops[idx]), before, shopSnapshot(db.shops[idx]));
      return HttpResponse.json({ shop: toShop(db.shops[idx]), created: false });
    }
    const shop: MockShop = {
      id: rid('shp'),
      companyId,
      platform,
      externalShopId: granted.externalShopId,
      shopName: granted.shopName,
      region: 'VN',
      status: 'connected',
      accessExpiresAt: expires,
      createdAt: db.now(),
      updatedAt: db.now(),
      version: 1,
    };
    db.shops.unshift(shop);
    channel.remoteSkus[shop.id] ??= [];
    writeCompanyLog(guard.value, 'create', shopEntity(shop), null, shopSnapshot(shop));
    return HttpResponse.json({ shop: toShop(shop), created: true }, { status: 201 });
  }),

  http.get(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    return HttpResponse.json(toShop(found.value));
  }),

  http.post(`${API}/channel/shops/:id/disconnect`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopDisconnect);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const { version } = (await request.json()) as { version: number };
    const current = db.shops[idx];
    if (version !== current.version) {
      return versionConflict(toShop(current), 'Gian hàng vừa được người khác sửa.');
    }
    if (current.status === 'disconnected') return HttpResponse.json(toShop(current));
    const before = shopSnapshot(current);
    // Ngắt mềm: giữ gian hàng, đơn và ghép SKU để xem lại; xoá token
    db.shops[idx] = {
      ...current,
      status: 'disconnected',
      accessExpiresAt: null,
      updatedAt: db.now(),
      version: current.version + 1,
    };
    writeCompanyLog(guard.value, 'update', shopEntity(db.shops[idx]), before, shopSnapshot(db.shops[idx]));
    return HttpResponse.json(toShop(db.shops[idx]));
  }),

  http.post(`${API}/channel/shops/:id/sync`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopSync);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    if (!usable(db.shops[idx])) return shopNotConnected(db.shops[idx]);
    db.shops[idx] = { ...db.shops[idx], lastOrderSyncAt: db.now(), updatedAt: db.now() };
    return HttpResponse.json({ ok: true, lastOrderSyncAt: db.shops[idx].lastOrderSyncAt });
  }),

  http.get(`${API}/channel/shops/:id/listings`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    const rows: ListingRow[] = sellableVariants(shop.companyId).map(({ product, variant }) => {
      const l = channel.listings.find((x) => x.shopId === shop.id && x.variantId === variant.id);
      return {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        sku: variant.sku,
        attributesLabel: variantAttributes(shop.companyId, variant.valueIds)
          .map((a) => a.value)
          .join(' / '),
        thumbnailUrl: product.imageFileIds[0] ? fileUrl(product.imageFileIds[0]) : null,
        ...shopPrice(shop, variant.id),
        listing: l ? toListing(l) : null,
      };
    });
    return HttpResponse.json(rows);
  }),

  http.get(`${API}/channel/shops/:id/remote-skus`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    const skus: RemoteSku[] = (channel.remoteSkus[shop.id] ?? []).map((r) => ({
      ...r,
      matchedVariantId:
        channel.listings.find((l) => l.shopId === shop.id && l.externalSkuId === r.externalSkuId)?.variantId ??
        null,
    }));
    return HttpResponse.json(skus);
  }),

  http.put(`${API}/channel/shops/:id/listings/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    const target = sellableVariant(shop.companyId, params.variantId);
    if (!target) return problem(404, 'Không tìm thấy biến thể');
    if (!usable(shop)) return shopNotConnected(shop);
    const body = (await request.json()) as ListingMatchInput;
    const sku = (channel.remoteSkus[shop.id] ?? []).find((r) => r.externalSkuId === body.externalSkuId);
    if (!sku) {
      return problem(422, 'SKU sàn không hợp lệ', {
        errors: { externalSkuId: 'Không tìm thấy SKU này trên sàn' },
      });
    }
    const idx = channel.listings.findIndex((l) => l.shopId === shop.id && l.variantId === target.variant.id);
    const existing = idx === -1 ? null : channel.listings[idx];
    if ((existing?.version ?? null) !== (body.version ?? null)) {
      return versionConflict(existing && toListing(existing), 'Ghép SKU của biến thể vừa được người khác sửa.');
    }
    // Ràng buộc unique(company_id, external_sku_id)
    const taken = channel.listings.find(
      (l) =>
        l.companyId === shop.companyId &&
        l.externalSkuId === sku.externalSkuId &&
        l.variantId !== target.variant.id,
    );
    if (taken) {
      return problem(409, 'SKU sàn đã được ghép', {
        code: 'sku_taken',
        detail: `SKU sàn ${sku.sellerSku || sku.externalSkuId} đang ghép với biến thể ${skuOf(shop.companyId, taken.variantId)}.`,
      });
    }
    const next: MockListing = {
      id: existing?.id ?? rid('lst'),
      companyId: shop.companyId,
      shopId: shop.id,
      variantId: target.variant.id,
      externalProductId: sku.externalProductId,
      externalSkuId: sku.externalSkuId,
      lastPushedAt: existing?.externalSkuId === sku.externalSkuId ? existing.lastPushedAt : null,
      lastPushedPrice: existing?.externalSkuId === sku.externalSkuId ? existing.lastPushedPrice : null,
      version: (existing?.version ?? 0) + 1,
    };
    if (existing) channel.listings[idx] = next;
    else channel.listings.push(next);
    writeCompanyLog(
      guard.value,
      existing ? 'update' : 'create',
      listingEntity(shop, target.variant.sku, next.id),
      existing ? { externalSkuId: existing.externalSkuId } : null,
      { externalSkuId: next.externalSkuId, sellerSku: sku.sellerSku },
    );
    return HttpResponse.json(toListing(next));
  }),

  http.delete(`${API}/channel/shops/:id/listings/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    const idx = channel.listings.findIndex((l) => l.shopId === shop.id && l.variantId === params.variantId);
    if (idx === -1) return problem(404, 'Biến thể chưa ghép SKU sàn');
    const existing = channel.listings[idx];
    if (staleVersion(new URL(request.url), existing.version)) {
      return versionConflict(toListing(existing), 'Ghép SKU của biến thể vừa được người khác sửa.');
    }
    channel.listings.splice(idx, 1);
    writeCompanyLog(
      guard.value,
      'delete',
      listingEntity(shop, skuOf(shop.companyId, existing.variantId), existing.id),
      { externalSkuId: existing.externalSkuId },
      null,
    );
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/channel/shops/:id/listings/push`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    const { variantIds } = (await request.json()) as { variantIds: string[] };
    if (!Array.isArray(variantIds) || !variantIds.length) {
      return problem(422, 'Chưa chọn biến thể', { errors: { variantIds: 'Chọn ít nhất một biến thể' } });
    }
    const remoteList = (channel.remoteSkus[shop.id] ??= []);
    const results: PushResult[] = variantIds.map((variantId) => {
      const target = sellableVariant(shop.companyId, variantId);
      if (!target) {
        return { variantId, sku: variantId, outcome: 'failed', code: 'not_found', message: 'Biến thể không còn bán' };
      }
      const sku = target.variant.sku;
      const { price } = shopPrice(shop, variantId);
      if (price === null) {
        return {
          variantId,
          sku,
          outcome: 'failed',
          code: 'price_missing',
          message: 'Chưa có giá: bảng giá gian hàng và bảng giá chuẩn đều trống',
        };
      }
      const l = channel.listings.find((x) => x.shopId === shop.id && x.variantId === variantId);
      if (l) {
        const r = remoteList.find((x) => x.externalSkuId === l.externalSkuId);
        if (r) r.price = price;
        Object.assign(l, { lastPushedAt: db.now(), lastPushedPrice: price, version: l.version + 1 });
        return { variantId, sku, outcome: 'updated', externalSkuId: l.externalSkuId };
      }
      // Biến thể chưa có SKU sàn: sàn tạo sản phẩm mới và trả SKU, lưu ghép luôn
      const created: MockRemoteSku = {
        externalProductId: `${shop.id}-${target.product.id}`,
        externalSkuId: rid(`${shop.id}-sku`),
        title: [target.product.name, variantAttributes(shop.companyId, target.variant.valueIds).map((a) => a.value).join(', ')]
          .filter(Boolean)
          .join(' - '),
        sellerSku: sku,
        price,
      };
      remoteList.push(created);
      channel.listings.push({
        id: rid('lst'),
        companyId: shop.companyId,
        shopId: shop.id,
        variantId,
        externalProductId: created.externalProductId,
        externalSkuId: created.externalSkuId,
        lastPushedAt: db.now(),
        lastPushedPrice: price,
        version: 1,
      });
      return { variantId, sku, outcome: 'created', externalSkuId: created.externalSkuId };
    });
    const done = results.filter((r) => r.outcome !== 'failed');
    if (done.length) {
      writeCompanyLog(guard.value, 'update', shopEntity(shop), null, {
        pushed: done.map((r) => `${r.sku}${r.outcome === 'created' ? ' (tạo mới)' : ''}`),
      });
    }
    return HttpResponse.json({ results });
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
const attributeSnapshot = (a: MockAttribute) => ({
  name: a.name,
  values: a.values.map((v) => `${v.value} (${v.code})`),
});
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

/** Không có hoặc của công ty khác đều 404 not_found, không lộ là bản ghi tồn tại (docs/21 C4) */
function findOwned<T extends { id: string; companyId: string }>(
  list: T[],
  id: unknown,
  companyId: string,
  what: string,
): { ok: true; value: T } | { ok: false; response: Response } {
  const item = list.find((x) => x.id === id);
  if (!item || item.companyId !== companyId) {
    return { ok: false, response: problem(404, `Không tìm thấy ${what}`, { code: 'not_found' }) };
  }
  return { ok: true, value: item };
}

/** Tên trùng trong công ty: 409 name_taken kèm errors.name (docs/21 V24) */
function nameTaken(message: string) {
  return problem(409, 'Tên đã được dùng', { code: 'name_taken', errors: { name: message } });
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
  const patternError = skuPatternError(body.skuPattern ?? '');
  if (patternError) errors.skuPattern = patternError;
  if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
  if (catalog.categories.some((c) => c.companyId === companyId && c.id !== exceptId && sameText(c.name, name))) {
    return nameTaken('Đã có danh mục cùng tên');
  }
  return null;
}

function validateAttribute(body: AttributeInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên thuộc tính';
  else if (name.length > 40) errors.name = 'Tên thuộc tính tối đa 40 ký tự';
  const values = (body.values ?? []).map((v) => v.value.trim());
  if (!values.length) errors.values = 'Thêm ít nhất một giá trị';
  else if (values.some((v) => !v || v.length > 40)) errors.values = 'Mỗi giá trị từ 1 đến 40 ký tự';
  else if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
    errors.values = 'Có giá trị bị trùng';
  }
  // V21: mã bỏ trống thì sinh từ giá trị; trùng mã trong một thuộc tính báo tại ô của dòng sau
  const seen = new Set<string>();
  attributeCodes(body).forEach((code, i) => {
    if (!/^[A-Z0-9]{1,6}$/.test(code)) errors[`values.${i}.code`] = 'Mã chỉ gồm A-Z, 0-9, tối đa 6 ký tự';
    else if (seen.has(code)) errors[`values.${i}.code`] = 'Mã bị trùng';
    seen.add(code);
  });
  if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
  if (catalog.attributes.some((a) => a.companyId === companyId && a.id !== exceptId && sameText(a.name, name))) {
    return nameTaken('Đã có thuộc tính cùng tên');
  }
  return null;
}

function attributeCodes(body: AttributeInput) {
  return (body.values ?? []).map((v) => v.code?.trim().toUpperCase() || valueCode(v.value));
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
  } else {
    const big = list.map((id) => catalog.files.find((x) => x.id === id)!).find((f) => f.sizeBytes > MAX_IMAGE_BYTES);
    if (big) errors.images = `Ảnh ${big.fileName} lớn hơn 5 MB`;
  }
}

function productNameTaken(companyId: string, name: string, exceptId?: string) {
  return companyProducts(companyId).some((p) => !p.archivedAt && p.id !== exceptId && sameText(p.name, name));
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
      values: body.values.map((v, i) => ({ id: rid('val'), value: v.value.trim(), code: attributeCodes(body)[i] })),
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
    const codes = attributeCodes(body);
    // Đổi mã chỉ ảnh hưởng SKU sinh sau này; SKU đã cấp giữ nguyên
    attribute.values = body.values.map((v, i) => ({ id: v.id ?? rid('val'), value: v.value.trim(), code: codes[i] }));
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
    if (productNameTaken(companyId, body.name)) return nameTaken('Đã có sản phẩm cùng tên');

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
    if (productNameTaken(guard.value.companyId, body.name, product.id)) {
      return nameTaken('Đã có sản phẩm cùng tên');
    }
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
    if (!variant || variant.archivedAt) {
      return problem(404, 'Không tìm thấy biến thể đang bán', { code: 'not_found' });
    }
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
    // Kích thước thật có thể khác khai báo khi xin vé (V26)
    file.sizeBytes = bytes.length;
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

function validatePricelistName(name: string | undefined) {
  const value = name?.trim() ?? '';
  if (!value) return 'Nhập tên bảng giá';
  if (value.length > 60) return 'Tên bảng giá tối đa 60 ký tự';
  return null;
}

/** Tên trùng trong công ty: 409 name_taken kèm errors.name (docs/21 V24) */
function pricelistNameTaken(name: string | undefined, companyId: string, exceptId?: string) {
  const value = name?.trim() ?? '';
  if (!pricing.pricelists.some((p) => p.companyId === companyId && p.id !== exceptId && sameText(p.name, value))) {
    return null;
  }
  return problem(409, 'Tên đã được dùng', { code: 'name_taken', errors: { name: 'Đã có bảng giá cùng tên' } });
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
    const nameError = validatePricelistName(body.name);
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
    const taken = pricelistNameTaken(body.name, companyId);
    if (taken) return taken;
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
    const nameError = validatePricelistName(body.name);
    if (nameError) return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { name: nameError } });
    const taken = pricelistNameTaken(body.name, pl.companyId, pl.id);
    if (taken) return taken;
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

// ---------- Bán hàng: khách hàng, đơn (UC-SF-01, 02, 04; hợp đồng đề xuất ở commerio-backend#24) ----------

const PHONE_RE = /^0\d{9}$/;
const MAX_LINE_QTY = 9999;
const MAX_ORDER_LINES = 100;

/** Ngày theo giờ Việt Nam (C6) */
const vnDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

const userRef = (accountId: string | null): UserRef | null => {
  const a = accountId ? db.accounts.find((x) => x.id === accountId) : undefined;
  return a ? { id: a.id, name: a.fullName } : null;
};

const availableOf = (companyId: string, variantId: string) => {
  const level = stockLevelOf(companyId, variantId);
  return level.onHand - level.reserved;
};

function customerStats(c: sales.MockCustomer) {
  const own = sales.orders.filter((o) => o.customerId === c.id);
  const lastOrderAt = own.reduce<string | null>((max, o) => (!max || o.createdAt > max ? o.createdAt : max), null);
  return {
    orderCount: own.length,
    totalSpent: own.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + sales.totalOf(o), 0),
    lastOrderAt,
  };
}

function toCustomerSummary(c: sales.MockCustomer): CustomerSummary {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    channels: c.channels,
    ...customerStats(c),
    createdAt: c.createdAt,
  };
}

const toCustomer = (c: sales.MockCustomer): Customer => ({
  ...toCustomerSummary(c),
  address: c.address,
  note: c.note,
  identities: c.identities,
  version: c.version,
});

function toOrderSummary(o: sales.MockOrder): OrderSummary {
  const customer = o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;
  const shop = o.shopId ? db.shops.find((s) => s.id === o.shopId) : undefined;
  return {
    id: o.id,
    code: o.code,
    source: o.source,
    shop: shop ? { id: shop.id, shopName: shop.shopName, platform: shop.platform } : null,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    status: o.status,
    isShortStock: o.isShortStock,
    paymentMethod: o.paymentMethod,
    total: sales.totalOf(o),
    lineCount: o.lines.length,
    createdAt: o.createdAt,
    createdBy: userRef(o.createdBy),
    version: o.version,
  };
}

function toOrder(o: sales.MockOrder): Order {
  return {
    ...toOrderSummary(o),
    shippingAddress: o.shippingAddress,
    subtotal: sales.subtotalOf(o),
    shippingFee: o.shippingFee,
    note: o.note,
    cancelReason: o.cancelReason,
    lines: o.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      attributesLabel: variantLabel(o.companyId, l.variantId).attributesLabel,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.quantity * l.unitPrice,
      available: availableOf(o.companyId, l.variantId),
    })),
    statusHistory: o.history.map((h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      by: userRef(h.by),
      source: h.source ?? (h.by ? 'user' : o.source === 'marketplace' ? 'marketplace' : 'system'),
      reason: h.reason ?? null,
    })),
  };
}

const orderEntity = (o: sales.MockOrder) => ({ type: 'sales.orders', id: o.id, label: o.code });
const orderSnapshot = (o: sales.MockOrder) => ({
  code: o.code,
  status: o.status,
  paymentMethod: o.paymentMethod,
  total: sales.totalOf(o),
});

function validateAddress(a: Partial<ShippingAddress> | undefined, prefix: string, errors: Record<string, string>) {
  if (!a?.name?.trim()) errors[`${prefix}.name`] = 'Nhập tên người nhận';
  if (!a?.phone?.trim()) errors[`${prefix}.phone`] = 'Nhập số điện thoại';
  else if (!PHONE_RE.test(a.phone.trim())) errors[`${prefix}.phone`] = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (!a?.address?.trim()) errors[`${prefix}.address`] = 'Nhập địa chỉ giao';
}

const salesHandlers = [
  http.get(`${API}/sales/customers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.customerView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const channel = url.searchParams.get('channel');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const items = sales.customers
      .filter((c) => c.companyId === guard.value.companyId)
      .map(toCustomerSummary)
      .filter(
        (c) =>
          (!search ||
            c.name.toLowerCase().includes(search) ||
            c.phone.includes(search) ||
            c.email.toLowerCase().includes(search)) &&
          (!channel || c.channels.includes(channel as CustomerChannel)) &&
          (!from || (c.lastOrderAt !== null && vnDate(c.lastOrderAt) >= from)) &&
          (!to || (c.lastOrderAt !== null && vnDate(c.lastOrderAt) <= to)),
      )
      .sort((a, b) => (b.lastOrderAt ?? b.createdAt).localeCompare(a.lastOrderAt ?? a.createdAt));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/sales/customers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.customerView);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.customers, params.id, guard.value.companyId, 'khách hàng');
    if (!found.ok) return found.response;
    return HttpResponse.json(toCustomer(found.value));
  }),

  http.get(`${API}/sales/orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const q = (key: string) => url.searchParams.get(key);
    const search = q('search')?.trim().toLowerCase() ?? '';
    const items = sales.orders
      .filter((o) => o.companyId === guard.value.companyId)
      .map(toOrderSummary)
      .filter(
        (o) =>
          (!search ||
            o.code.toLowerCase().includes(search) ||
            Boolean(o.customer?.name.toLowerCase().includes(search)) ||
            Boolean(o.customer?.phone.includes(search))) &&
          (!q('status') || o.status === q('status')) &&
          (!q('source') || o.source === q('source')) &&
          (!q('shopId') || o.shop?.id === q('shopId')) &&
          (!q('paymentMethod') || o.paymentMethod === q('paymentMethod')) &&
          (q('shortStock') !== 'true' || o.isShortStock) &&
          (!q('customerId') || o.customer?.id === q('customerId')) &&
          (!q('from') || vnDate(o.createdAt) >= q('from')!) &&
          (!q('to') || vnDate(o.createdAt) <= q('to')!),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/sales/orders/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderView);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    return HttpResponse.json(toOrder(found.value));
  }),

  http.get(`${API}/sales/order-variants`, async ({ request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
    const prices = ensureStandard(companyId).prices;
    const items: OrderVariantOption[] = sellableVariants(companyId)
      .filter(
        ({ product, variant }) =>
          !search || product.name.toLowerCase().includes(search) || variant.sku.toLowerCase().includes(search),
      )
      .slice(0, limit)
      .map(({ product, variant }) => ({
        variantId: variant.id,
        productName: product.name,
        sku: variant.sku,
        attributesLabel: variantLabel(companyId, variant.id).attributesLabel,
        thumbnailUrl: product.imageFileIds[0] ? fileUrl(product.imageFileIds[0]) : null,
        price: prices[variant.id] ?? null,
        available: availableOf(companyId, variant.id),
      }));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/sales/orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as Partial<CreateOrderInput>;
    const errors: Record<string, string> = {};
    let priceMissing = false;

    const customerInput = body.customer;
    const existingId = customerInput && 'id' in customerInput ? customerInput.id : null;
    if (!customerInput) errors.customer = 'Chọn khách hàng';
    else if (!existingId && 'name' in customerInput) {
      if (!customerInput.name?.trim()) errors['customer.name'] = 'Nhập tên khách';
      if (!customerInput.phone?.trim()) errors['customer.phone'] = 'Nhập số điện thoại';
      else if (!PHONE_RE.test(customerInput.phone.trim()))
        errors['customer.phone'] = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
    }
    validateAddress(body.shippingAddress, 'shippingAddress', errors);

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) errors.lines = 'Thêm ít nhất một sản phẩm';
    if (lines.length > MAX_ORDER_LINES) errors.lines = `Tối đa ${MAX_ORDER_LINES} dòng`;
    const sellable = new Map(sellableVariants(companyId).map((x) => [x.variant.id, x]));
    const prices = ensureStandard(companyId).prices;
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      if (!isQty(l.quantity, 1, MAX_LINE_QTY)) errors[`lines.${i}.quantity`] = `Số lượng từ 1 đến ${MAX_LINE_QTY}`;
      if (seen.has(l.variantId)) errors[`lines.${i}.variantId`] = 'Sản phẩm bị lặp';
      else if (!sellable.has(l.variantId)) errors[`lines.${i}.variantId`] = 'Sản phẩm không còn bán';
      else if (prices[l.variantId] == null) {
        errors[`lines.${i}.variantId`] = 'Sản phẩm chưa có giá bán';
        priceMissing = true;
      }
      seen.add(l.variantId);
    });
    const fee = body.shippingFee;
    if (typeof fee !== 'number' || !Number.isInteger(fee) || fee < 0) errors.shippingFee = 'Phí giao là số nguyên không âm';
    if (body.paymentMethod !== 'prepaid' && body.paymentMethod !== 'cod') errors.paymentMethod = 'Chọn cách thanh toán';

    if (Object.keys(errors).length > 0) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors, ...(priceMissing ? { code: 'price_missing' } : {}) });
    }
    let customer: sales.MockCustomer | undefined;
    if (existingId) {
      const found = findOwned(sales.customers, existingId, companyId, 'khách hàng');
      if (!found.ok) return found.response;
      customer = found.value;
    }

    const at = db.now();
    const actorId = guard.value.account.id;
    if (!customer) {
      const input = customerInput as { name: string; phone: string; email?: string; address?: string };
      customer = {
        id: rid('cus'),
        companyId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() ?? '',
        address: input.address?.trim() ?? '',
        note: '',
        channels: ['manual'],
        identities: [],
        createdAt: at,
        version: 1,
      };
      sales.customers.push(customer);
    } else if (!customer.channels.includes('manual')) {
      customer.channels.push('manual');
    }

    const order: sales.MockOrder = {
      id: rid('ord'),
      companyId,
      code: sales.nextOrderCode(companyId),
      source: 'manual',
      shopId: null,
      customerId: customer.id,
      status: 'pending_confirmation',
      isShortStock: false,
      paymentMethod: body.paymentMethod!,
      shippingAddress: {
        name: body.shippingAddress!.name.trim(),
        phone: body.shippingAddress!.phone.trim(),
        address: body.shippingAddress!.address.trim(),
      },
      shippingFee: fee as number,
      note: body.note?.trim() ?? '',
      cancelReason: null,
      // Giá lấy từ bảng giá chuẩn lúc tạo rồi ghi cứng vào dòng; FE không gửi giá
      lines: lines.map((l, i) => {
        const { product, variant } = sellable.get(l.variantId)!;
        return {
          id: `${rid('orl')}-${i}`,
          variantId: l.variantId,
          sku: variant.sku,
          productName: product.name,
          quantity: l.quantity,
          unitPrice: prices[l.variantId] as number,
        };
      }),
      history: [{ from: null, to: 'pending_confirmation', at, by: actorId }],
      createdAt: at,
      createdBy: actorId,
      version: 1,
    };
    sales.orders.push(order);
    writeCompanyLog(guard.value, 'create', orderEntity(order), null, orderSnapshot(order));
    return HttpResponse.json(toOrder(order), { status: 201 });
  }),

  http.post(`${API}/sales/orders/:id/confirm`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(sales.orders, params.id, companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number };
    if (order.source === 'marketplace') {
      return problem(409, 'Đơn sàn tự xác nhận', {
        code: 'not_allowed_for_source',
        detail: 'Đơn sàn tự xác nhận khi giữ được hàng.',
      });
    }
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    if (order.status !== 'pending_confirmation') {
      return problem(409, 'Đơn không còn chờ xác nhận', { code: 'invalid_transition', current: toOrder(order) });
    }
    // Giữ hàng tất cả hoặc không dòng nào (UC-SF-04)
    const shortLines = order.lines
      .map((l) => ({ variantId: l.variantId, sku: l.sku, requested: l.quantity, available: availableOf(companyId, l.variantId) }))
      .filter((l) => l.available < l.requested);
    const before = orderSnapshot(order);
    if (shortLines.length > 0) {
      if (!order.isShortStock) {
        order.isShortStock = true;
        order.version += 1;
      }
      return problem(409, 'Không đủ hàng', {
        code: 'insufficient_stock',
        detail: 'Có sản phẩm không đủ tồn khả dụng.',
        shortLines,
        current: toOrder(order),
      });
    }
    const at = db.now();
    for (const l of order.lines) stockLevelOf(companyId, l.variantId).reserved += l.quantity;
    order.status = 'confirmed';
    order.isShortStock = false;
    order.version += 1;
    order.history.push({ from: 'pending_confirmation', to: 'confirmed', at, by: guard.value.account.id });
    // payment.initOrderPayment: payment tự tạo dòng nếu Sale đã tạo mã trước đó (A8)
    if (order.paymentMethod && !payment.orderPayments.some((p) => p.orderId === order.id)) {
      payment.orderPayments.push({
        companyId,
        orderId: order.id,
        method: order.paymentMethod,
        status: order.paymentMethod === 'cod' ? 'cod_pending' : 'unpaid',
        refundStatus: 'none',
        paidAt: null,
      });
    }
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),
];

// ---------- Thanh toán: cổng, mã thanh toán (UC-PF-01, UC-PF-11; Documents/21 mục 12.3) ----------

const GATEWAY_NAMES: Record<Gateway, string> = { vnpay: 'VNPay', momo: 'MoMo', zalopay: 'ZaloPay', vietqr: 'VietQR' };
const SEPAY_WEBHOOK_BASE = 'https://api.commerio.vn/api/v1/payment/webhooks/sepay';

function gatewayConfigOf(companyId: string, gateway: Gateway) {
  return payment.gatewayConfigs.find((g) => g.companyId === companyId && g.gateway === gateway);
}

/** Không bao giờ trả khoá đầy đủ (T4) */
function toGatewayConfig(companyId: string, gateway: Gateway): GatewayConfig {
  const cfg = gatewayConfigOf(companyId, gateway);
  if (!cfg) {
    return { gateway, configured: false, version: 0, updatedAt: null, updatedBy: null, credentials: null, display: null, webhookUrl: null };
  }
  return {
    gateway,
    configured: true,
    version: cfg.version,
    updatedAt: cfg.updatedAt,
    updatedBy: userRef(cfg.updatedBy),
    credentials: Object.fromEntries(
      Object.entries(cfg.credentials).map(([field, value]) => [field, { last4: value.slice(-4) }]),
    ),
    display:
      gateway === 'vietqr'
        ? {
            bankBin: cfg.credentials.bankBin,
            bankName: payment.BANK_NAMES[cfg.credentials.bankBin] ?? cfg.credentials.bankBin,
            accountName: cfg.credentials.accountName,
          }
        : null,
    webhookUrl: cfg.receiverKey ? `${SEPAY_WEBHOOK_BASE}/${cfg.receiverKey}` : null,
  };
}

function toPaymentLink(l: payment.MockPaymentLink): PaymentLink {
  const cfg = l.gateway === 'vietqr' ? gatewayConfigOf(l.companyId, 'vietqr') : undefined;
  return {
    id: l.id,
    orderId: l.orderId,
    gateway: l.gateway,
    paymentCode: l.paymentCode,
    amount: l.amount,
    payUrl: l.payUrl,
    qrContent: l.qrContent,
    bankTransfer: cfg
      ? {
          bankBin: cfg.credentials.bankBin,
          bankName: payment.BANK_NAMES[cfg.credentials.bankBin] ?? cfg.credentials.bankBin,
          accountNo: cfg.credentials.accountNo,
          accountName: cfg.credentials.accountName,
          content: l.paymentCode,
        }
      : null,
    expiresAt: l.expiresAt,
    status: l.status,
    createdAt: l.createdAt,
    createdBy: userRef(l.createdBy) ?? { id: l.createdBy, name: '—' },
  };
}

/** Đơn chưa có dòng order_payments thì suy trạng thái từ đơn, không 404 (A8) */
function toOrderPayment(o: sales.MockOrder): OrderPayment {
  const row = payment.orderPayments.find((p) => p.orderId === o.id);
  const method = row?.method ?? o.paymentMethod ?? 'prepaid';
  const own = payment.links
    .filter((l) => l.orderId === o.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = own.find((l) => l.status === 'active');
  return {
    orderId: o.id,
    method,
    status: row?.status ?? (method === 'cod' ? 'cod_pending' : 'unpaid'),
    refundStatus: row?.refundStatus ?? 'none',
    amount: sales.totalOf(o),
    paidAt: row?.paidAt ?? null,
    activeLink: active ? toPaymentLink(active) : null,
    links: own.slice(0, 20).map((l) => ({
      id: l.id,
      gateway: l.gateway,
      paymentCode: l.paymentCode,
      amount: l.amount,
      status: l.status,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    })),
  };
}

function gatewayPayUrl(gateway: Gateway, code: string, amount: number) {
  switch (gateway) {
    case 'vnpay':
      return `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${code}&vnp_Amount=${amount * 100}`;
    case 'momo':
      return `https://test-payment.momo.vn/v2/gateway/pay?orderId=${code}`;
    case 'zalopay':
      return `https://sbgateway.zalopay.vn/openinapp?order=${code}`;
    default:
      return null;
  }
}

function paymentNotAllowed(o: sales.MockOrder, status: PaymentStatus): string | null {
  if (o.source === 'marketplace') return 'Đơn sàn do sàn thu hộ, không tạo mã thanh toán.';
  if (o.paymentMethod === 'cod') return 'Đơn thu tiền khi giao (COD) không cần mã thanh toán.';
  if (o.status === 'cancelled') return 'Đơn đã huỷ.';
  if (status === 'paid') return 'Đơn đã được thanh toán.';
  if (!Number.isInteger(sales.totalOf(o))) return 'Tổng đơn có phần lẻ đồng.';
  return null;
}

const paymentHandlers = [
  http.get(`${API}/payment/gateways`, async ({ request }) => {
    await delay(LATENCY);
    let guard = requireCompany(request, PERMISSIONS.gatewayManage);
    const full = guard.ok;
    if (!guard.ok) guard = requireCompany(request, PERMISSIONS.paymentLinkCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    return HttpResponse.json(
      payment.GATEWAYS.map((gateway) => {
        const cfg = toGatewayConfig(companyId, gateway);
        return full ? cfg : { gateway, configured: cfg.configured };
      }),
    );
  }),

  http.put(`${API}/payment/gateways/:gateway`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.gatewayManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const gateway = params.gateway as Gateway;
    if (!payment.GATEWAYS.includes(gateway)) {
      return problem(404, 'Không tìm thấy cổng thanh toán', { code: 'not_found' });
    }
    const body = (await request.json()) as { credentials?: Record<string, string>; version?: number };
    const current = gatewayConfigOf(companyId, gateway);
    if (body.version !== (current?.version ?? 0)) {
      return versionConflict(toGatewayConfig(companyId, gateway), 'Khoá vừa được người khác đổi.');
    }
    const errors: Record<string, string> = {};
    const credentials: Record<string, string> = {};
    for (const field of payment.CREDENTIAL_FIELDS[gateway]) {
      const value = body.credentials?.[field]?.trim() ?? '';
      if (!value) errors[`credentials.${field}`] = 'Bắt buộc nhập';
      credentials[field] = value;
    }
    if (gateway === 'vietqr' && credentials.bankBin && !/^\d{6}$/.test(credentials.bankBin)) {
      errors['credentials.bankBin'] = 'Mã ngân hàng (BIN) gồm 6 chữ số';
    }
    if (Object.keys(errors).length > 0) return problem(422, 'Dữ liệu không hợp lệ', { errors });

    const at = db.now();
    const accountId = guard.value.account.id;
    if (current) {
      current.credentials = credentials;
      current.version += 1;
      current.updatedAt = at;
      current.updatedBy = accountId;
    } else {
      payment.gatewayConfigs.push({
        companyId,
        gateway,
        credentials,
        receiverKey: gateway === 'vietqr' ? payment.newReceiverKey() : null,
        version: 1,
        updatedAt: at,
        updatedBy: accountId,
      });
    }
    // Nhật ký chỉ ghi "đổi khoá", không ghi giá trị khoá (T4)
    writeCompanyLog(
      guard.value,
      current ? 'update' : 'create',
      { type: 'payment.gateway_configs', id: gateway, label: GATEWAY_NAMES[gateway] },
      null,
      { credentials: 'đổi khoá' },
    );
    return HttpResponse.json(toGatewayConfig(companyId, gateway));
  }),

  http.post(`${API}/payment/orders/:orderId/links`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.paymentLinkCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(sales.orders, params.orderId, companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { gateway?: Gateway };
    const state = toOrderPayment(order);
    const reason = paymentNotAllowed(order, state.status);
    if (reason) return problem(409, 'Không tạo được mã thanh toán', { code: 'payment_not_allowed', detail: reason });

    const at = db.now();
    // Đơn đã có mã còn hạn (kể cả cổng khác): trả mã đó (T10)
    const active = payment.links.find((l) => l.orderId === order.id && l.status === 'active');
    if (active && active.expiresAt > at) return HttpResponse.json(toPaymentLink(active));

    const gateway = body.gateway;
    if (!gateway || !payment.GATEWAYS.includes(gateway)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { gateway: 'Chọn cổng thanh toán' } });
    }
    const cfg = gatewayConfigOf(companyId, gateway);
    if (!cfg) {
      return problem(422, 'Cổng chưa cấu hình', {
        code: 'gateway_not_configured',
        errors: { gateway: 'Cổng này chưa được cấu hình' },
      });
    }
    if (active) active.status = 'expired';
    const code = payment.newPaymentCode();
    const amount = sales.totalOf(order);
    const payUrl = gatewayPayUrl(gateway, code, amount);
    const link: payment.MockPaymentLink = {
      id: rid('pay'),
      companyId,
      orderId: order.id,
      gateway,
      paymentCode: code,
      amount,
      payUrl,
      qrContent:
        gateway === 'vietqr'
          ? payment.vietQrContent(cfg.credentials.bankBin, cfg.credentials.accountNo, amount, code)
          : (payUrl ?? code),
      expiresAt: new Date(Date.now() + payment.LINK_TTL_MS).toISOString(),
      status: 'active',
      createdAt: at,
      createdBy: guard.value.account.id,
    };
    payment.links.push(link);
    if (!payment.orderPayments.some((p) => p.orderId === order.id)) {
      payment.orderPayments.push({
        companyId,
        orderId: order.id,
        method: 'prepaid',
        status: 'unpaid',
        refundStatus: 'none',
        paidAt: null,
      });
    }
    writeCompanyLog(
      guard.value,
      'create',
      { type: 'payment.payment_links', id: link.id, label: `${order.code} · ${code}` },
      null,
      { gateway, paymentCode: code, amount },
    );
    return HttpResponse.json(toPaymentLink(link), { status: 201 });
  }),

  http.get(`${API}/payment/orders/:orderId`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.orderView);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.orderId, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    if (found.value.source === 'marketplace') {
      return problem(404, 'Đơn sàn không có thanh toán trong hệ thống', { code: 'not_found' });
    }
    return HttpResponse.json(toOrderPayment(found.value));
  }),

  // Giả lập khách đã trả tiền (12.11): chạy như webhook, bỏ bước kiểm chữ ký; chỉ có ở môi trường dev
  http.post(`${API}/payment/dev/simulate/:paymentCode`, async ({ params }) => {
    await delay(100);
    const link = payment.links.find((l) => l.paymentCode === params.paymentCode);
    if (!link) return problem(404, 'Không tìm thấy mã thanh toán', { code: 'not_found' });
    const row = payment.orderPayments.find((p) => p.orderId === link.orderId);
    if (link.status === 'active' || (link.status === 'expired' && row?.status === 'unpaid')) {
      link.status = 'paid';
      if (row) {
        row.status = 'paid';
        row.paidAt = db.now();
      }
      recordGatewayPayment(link);
    }
    return HttpResponse.json({ paymentCode: link.paymentCode, status: link.status });
  }),
];

// ---------- Giao vận: huỷ đơn, lô nhặt, xuất kho, cập nhật giao (UC-SF-06 đến 09; đề xuất commerio-backend#25) ----------

const CANCELLABLE: OrderStatus[] = ['pending_confirmation', 'confirmed', 'picking', 'packing'];
const FULFILLMENT_TABS: OrderStatus[] = ['confirmed', 'picking', 'packing', 'issued'];
const MAX_BATCH_ORDERS = 50;
const MAX_REASON = 500;

const batchOf = (orderId: string) => fulfillment.batches.find((b) => b.orderIds.includes(orderId));

function releaseReserved(o: sales.MockOrder) {
  for (const l of o.lines) {
    const level = stockLevelOf(o.companyId, l.variantId);
    // Seed giữ hàng không khớp từng đơn nên không để âm
    level.reserved = Math.max(0, level.reserved - l.quantity);
  }
}

function pushHistory(o: sales.MockOrder, to: OrderStatus, at: string, by: string, reason: string | null = null) {
  o.history.push({ from: o.status, to, at, by, reason });
  o.status = to;
  o.version += 1;
}

function toFulfillmentOrder(o: sales.MockOrder): FulfillmentOrder {
  const summary = toOrderSummary(o);
  const batch = batchOf(o.id);
  return {
    id: o.id,
    code: o.code,
    source: o.source,
    shop: summary.shop,
    customerName: summary.customer?.name ?? null,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.source === 'marketplace' ? null : toOrderPayment(o).status,
    batch: batch ? { id: batch.id, code: batch.code } : null,
    lineCount: o.lines.length,
    totalQty: o.lines.reduce((sum, l) => sum + l.quantity, 0),
    createdAt: o.createdAt,
    confirmedAt: o.history.find((h) => h.to === 'confirmed')?.at ?? null,
    version: o.version,
    lines: o.lines.map((l) => ({
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      attributesLabel: variantLabel(o.companyId, l.variantId).attributesLabel,
      quantity: l.quantity,
    })),
  };
}

const batchOrders = (b: fulfillment.MockBatch) =>
  b.orderIds.map((id) => sales.orders.find((o) => o.id === id)).filter((o): o is sales.MockOrder => Boolean(o));

function toBatchSummary(b: fulfillment.MockBatch): BatchSummary {
  const own = batchOrders(b);
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    orderCount: own.length,
    totalQty: own.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.quantity, 0), 0),
    createdAt: b.createdAt,
    createdBy: userRef(b.createdBy),
    version: b.version,
  };
}

function toBatch(b: fulfillment.MockBatch): Batch {
  const own = batchOrders(b).map((o) => ({ ...toFulfillmentOrder(o), statusHistory: toOrder(o).statusHistory }));
  return { ...toBatchSummary(b), pickList: buildPickList(own), orders: own };
}

/** Lô hoàn tất khi không còn đơn nào chờ xuất */
function settleBatch(b: fulfillment.MockBatch) {
  if (b.status !== 'done' && batchOrders(b).every((o) => o.status !== 'picking' && o.status !== 'packing')) {
    b.status = 'done';
    b.version += 1;
  }
}

/** Lỗi khi xuất một đơn; null là xuất được */
function issueBlocker(o: sales.MockOrder): { code: string; title: string; detail: string } | null {
  if (o.status !== 'packing') {
    return { code: 'invalid_transition', title: 'Đơn không ở bước đóng gói', detail: 'Đơn không còn chờ xuất kho.' };
  }
  if (o.paymentMethod === 'prepaid' && toOrderPayment(o).status !== 'paid') {
    return {
      code: 'payment_required',
      title: 'Đơn chưa thanh toán',
      detail: 'Đơn trả trước chưa thanh toán đủ, chưa xuất được.',
    };
  }
  return null;
}

/** Lập và ghi sổ phiếu xuất theo đơn, nhả số đang giữ */
function issueOrder(actor: CompanyActor, o: sales.MockOrder) {
  const at = db.now();
  const by = actor.account.id;
  const before = orderSnapshot(o);
  const doc: MockStockDoc = {
    id: rid('sd'),
    companyId: o.companyId,
    number: nextDocNumber(o.companyId, 'issue'),
    type: 'issue',
    kind: 'order',
    status: 'done',
    note: '',
    orderId: o.id,
    reference: o.code,
    lines: o.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: null })),
    createdBy: by,
    createdAt: at,
    postedBy: by,
    postedAt: at,
    version: 1,
  };
  inventory.applyDoc(doc, at, by);
  inventory.docs.push(doc);
  releaseReserved(o);
  pushHistory(o, 'issued', at, by);
  finance.invoices.push({
    id: rid('inv'),
    companyId: o.companyId,
    number: finance.nextFinanceNumber(o.companyId, 'invoice'),
    orderId: o.id,
    status: 'posted',
    issuedAt: at,
    version: 1,
  });
  writeCompanyLog(actor, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
  writeCompanyLog(actor, 'update', orderEntity(o), before, orderSnapshot(o));
  const batch = batchOf(o.id);
  if (batch) settleBatch(batch);
  return { id: doc.id, number: doc.number };
}

const fulfillmentHandlers = [
  http.post(`${API}/sales/orders/:id/cancel`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCancel);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number; reason?: string };
    if (order.source === 'marketplace') {
      return problem(409, 'Đơn sàn huỷ trên sàn', {
        code: 'not_allowed_for_source',
        detail: 'Đơn sàn chỉ huỷ được trên sàn.',
        current: toOrder(order),
      });
    }
    const reason = body.reason?.trim() ?? '';
    if (!reason) return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: 'Nhập lý do huỷ' } });
    if (reason.length > MAX_REASON) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: `Lý do tối đa ${MAX_REASON} ký tự` } });
    }
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    if (!CANCELLABLE.includes(order.status)) {
      return problem(409, 'Đơn không huỷ được ở trạng thái này', { code: 'invalid_transition', current: toOrder(order) });
    }
    const before = orderSnapshot(order);
    if (order.status !== 'pending_confirmation') releaseReserved(order);
    const batch = batchOf(order.id);
    if (batch && batch.status !== 'done') {
      batch.orderIds = batch.orderIds.filter((id) => id !== order.id);
      batch.version += 1;
      if (batch.orderIds.length === 0) fulfillment.batches.splice(fulfillment.batches.indexOf(batch), 1);
      else settleBatch(batch);
    }
    for (const link of payment.links) {
      if (link.orderId === order.id && link.status === 'active') link.status = 'cancelled';
    }
    const row = payment.orderPayments.find((p) => p.orderId === order.id);
    if (row?.status === 'paid') {
      row.refundStatus = 'pending_refund';
      row.refundRequestedAt = db.now();
    }
    order.cancelReason = reason;
    order.isShortStock = false;
    pushHistory(order, 'cancelled', db.now(), guard.value.account.id, reason);
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),

  http.post(`${API}/fulfillment/orders/:id/delivery`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.deliveryUpdate);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number; status?: DeliveryStatus; reason?: string };
    if (order.source === 'marketplace') {
      return problem(409, 'Trạng thái giao đơn sàn lấy từ sàn', {
        code: 'not_allowed_for_source',
        detail: 'Trạng thái giao của đơn sàn lấy từ sàn.',
        current: toOrder(order),
      });
    }
    const errors: Record<string, string> = {};
    const reason = body.reason?.trim() ?? '';
    if (!body.status || !['in_transit', 'delivered', 'delivery_failed'].includes(body.status)) {
      errors.status = 'Chọn trạng thái giao';
    }
    if (body.status === 'delivery_failed' && !reason) errors.reason = 'Nhập lý do giao không thành công';
    if (reason.length > MAX_REASON) errors.reason = `Lý do tối đa ${MAX_REASON} ký tự`;
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    const allowed: Partial<Record<OrderStatus, DeliveryStatus[]>> = {
      issued: ['in_transit', 'delivered', 'delivery_failed'],
      in_transit: ['delivered', 'delivery_failed'],
    };
    const next = body.status as DeliveryStatus;
    if (!allowed[order.status]?.includes(next)) {
      return problem(409, 'Đơn không chuyển được sang trạng thái này', {
        code: 'invalid_transition',
        current: toOrder(order),
      });
    }
    const at = db.now();
    const before = orderSnapshot(order);
    pushHistory(order, next, at, guard.value.account.id, next === 'delivery_failed' ? reason : null);
    const row = payment.orderPayments.find((p) => p.orderId === order.id);
    if (row?.method === 'cod' && next === 'delivered') row.deliveredAt = at;
    if (row?.method === 'cod' && next === 'delivery_failed') row.status = 'not_collected';
    if (next === 'delivery_failed') {
      const customer = sales.customers.find((c) => c.id === order.customerId);
      // Đơn hiện ở tab Nhập hoàn của Kho (UC-IN-03)
      inventory.returnOrders.push({
        orderId: order.id,
        companyId: order.companyId,
        orderCode: order.code,
        customerName: customer?.name ?? order.shippingAddress.name,
        customerPhone: customer?.phone ?? order.shippingAddress.phone,
        shipmentCode: `GHN-${order.code.replace(/\D/g, '')}`,
        failedReason: reason,
        failedAt: at,
        lines: order.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
    }
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),

  http.get(`${API}/fulfillment/orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const q = (key: string) => url.searchParams.get(key);
    const status = (q('status') ?? 'confirmed') as OrderStatus;
    if (!FULFILLMENT_TABS.includes(status)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { status: 'Trạng thái không hợp lệ' } });
    }
    const search = q('search')?.trim().toLowerCase() ?? '';
    const items = sales.orders
      .filter(
        (o) =>
          o.companyId === guard.value.companyId &&
          o.status === status &&
          (!q('source') || o.source === q('source')) &&
          (!q('shopId') || o.shopId === q('shopId')),
      )
      .map(toFulfillmentOrder)
      .filter((o) => !search || o.code.toLowerCase().includes(search) || Boolean(o.customerName?.toLowerCase().includes(search)))
      // Đơn xác nhận sớm nhặt trước
      .sort((a, b) => (a.confirmedAt ?? a.createdAt).localeCompare(b.confirmedAt ?? b.createdAt));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/fulfillment/orders/:id/issue`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== order.version) {
      return versionConflict(toFulfillmentOrder(order), 'Đơn vừa được người khác cập nhật.');
    }
    const blocker = issueBlocker(order);
    if (blocker) {
      return problem(409, blocker.title, { code: blocker.code, detail: blocker.detail, current: toFulfillmentOrder(order) });
    }
    const issue = issueOrder(guard.value, order);
    const result: IssueOrderResult = { order: toFulfillmentOrder(order), issue, invoice: null };
    return HttpResponse.json(result);
  }),

  http.get(`${API}/fulfillment/batches`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const status = url.searchParams.get('status');
    const items = fulfillment.batches
      .filter((b) => b.companyId === guard.value.companyId && (!status || b.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toBatchSummary);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/fulfillment/batches/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.batches, params.id, guard.value.companyId, 'lô nhặt hàng');
    if (!found.ok) return found.response;
    return HttpResponse.json(toBatch(found.value));
  }),

  http.post(`${API}/fulfillment/batches`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as { orders?: { id: string; version: number }[] };
    const refs = Array.isArray(body.orders) ? body.orders : [];
    if (refs.length === 0) return problem(422, 'Dữ liệu không hợp lệ', { errors: { orders: 'Chọn ít nhất một đơn' } });
    if (refs.length > MAX_BATCH_ORDERS) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { orders: `Mỗi lô tối đa ${MAX_BATCH_ORDERS} đơn` } });
    }
    const picked: sales.MockOrder[] = [];
    const inBatch: string[] = [];
    const moved: string[] = [];
    const stale: string[] = [];
    for (const ref of refs) {
      const found = findOwned(sales.orders, ref.id, companyId, 'đơn hàng');
      if (!found.ok) return found.response;
      const o = found.value;
      if (batchOf(o.id)) inBatch.push(o.id);
      else if (o.status !== 'confirmed') moved.push(o.id);
      else if (o.version !== ref.version) stale.push(o.id);
      picked.push(o);
    }
    if (inBatch.length) {
      return problem(409, 'Có đơn đã nằm trong lô khác', { code: 'already_in_batch', orderIds: inBatch });
    }
    if (moved.length) {
      return problem(409, 'Có đơn không còn chờ nhặt', { code: 'invalid_transition', orderIds: moved });
    }
    if (stale.length) {
      return problem(409, 'Có đơn vừa được cập nhật', { code: 'version_conflict', orderIds: stale });
    }
    const at = db.now();
    const by = guard.value.account.id;
    const batch: fulfillment.MockBatch = {
      id: rid('bat'),
      companyId,
      code: fulfillment.nextBatchCode(companyId),
      status: 'picking',
      orderIds: picked.map((o) => o.id),
      createdAt: at,
      createdBy: by,
      version: 1,
    };
    fulfillment.batches.push(batch);
    for (const o of picked) {
      const before = orderSnapshot(o);
      pushHistory(o, 'picking', at, by);
      writeCompanyLog(guard.value, 'update', orderEntity(o), before, orderSnapshot(o));
    }
    writeCompanyLog(guard.value, 'create', { type: 'fulfillment.batches', id: batch.id, label: batch.code }, null, {
      code: batch.code,
      orders: picked.map((o) => o.code),
    });
    return HttpResponse.json(toBatch(batch), { status: 201 });
  }),

  http.post(`${API}/fulfillment/batches/:id/picked`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.batches, params.id, guard.value.companyId, 'lô nhặt hàng');
    if (!found.ok) return found.response;
    const batch = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== batch.version) return versionConflict(toBatch(batch), 'Lô vừa được người khác cập nhật.');
    if (batch.status !== 'picking') {
      return problem(409, 'Lô không còn đang nhặt', { code: 'invalid_transition', current: toBatch(batch) });
    }
    const at = db.now();
    for (const o of batchOrders(batch).filter((x) => x.status === 'picking')) {
      const before = orderSnapshot(o);
      pushHistory(o, 'packing', at, guard.value.account.id);
      writeCompanyLog(guard.value, 'update', orderEntity(o), before, orderSnapshot(o));
    }
    batch.status = 'packed';
    batch.version += 1;
    return HttpResponse.json(toBatch(batch));
  }),

  http.post(`${API}/fulfillment/batches/:id/issue`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.batches, params.id, guard.value.companyId, 'lô nhặt hàng');
    if (!found.ok) return found.response;
    const batch = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== batch.version) return versionConflict(toBatch(batch), 'Lô vừa được người khác cập nhật.');
    if (batch.status !== 'packed') {
      return problem(409, 'Lô chưa nhặt xong hoặc đã hoàn tất', { code: 'invalid_transition', current: toBatch(batch) });
    }
    // Từng đơn xuất riêng: đơn bị chặn không làm hỏng các đơn còn lại
    const result: BatchIssueResult = { issued: [], failed: [], batch: toBatchSummary(batch) };
    for (const o of batchOrders(batch).filter((x) => x.status === 'packing')) {
      const blocker = issueBlocker(o);
      if (blocker) result.failed.push({ orderId: o.id, code: blocker.code, detail: blocker.detail });
      else result.issued.push({ id: o.id, code: o.code, issue: issueOrder(guard.value, o) });
    }
    result.batch = toBatchSummary(batch);
    return HttpResponse.json(result);
  }),
];

// ---------- Tài chính: chứng từ, phiếu chi, COD, hoàn tiền, khoản thu chưa khớp (UC-PF-03..07; commerio-backend#27) ----------

const MAX_NOTE = 500;
const MAX_COD_BATCH = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Danh sách tài chính của BE: trang 1–100, mặc định 20 */
function financePage(url: URL) {
  const { page, pageSize } = pageParams(url);
  return { page, pageSize: Math.min(100, pageSize) };
}

function listFilter(url: URL) {
  const q = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  return {
    matches: (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q)),
    /** `day` là yyyy-mm-dd theo giờ VN */
    inRange: (day: string) => (!from || day >= from) && (!to || day <= to),
    param: (name: string) => url.searchParams.get(name),
  };
}

const findOrder = (orderId: string | null) => (orderId ? sales.orders.find((o) => o.id === orderId) : undefined);
const customerOf = (o: sales.MockOrder) =>
  o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;

function orderRef(orderId: string | null): OrderRef | null {
  const o = findOrder(orderId);
  return o ? { id: o.id, code: o.code, customerName: customerOf(o)?.name ?? null } : null;
}

function orderRefPhone(orderId: string | null): OrderRefPhone | null {
  const o = findOrder(orderId);
  if (!o) return null;
  const c = customerOf(o);
  return { id: o.id, code: o.code, customerName: c?.name ?? null, customerPhone: c?.phone ?? null };
}

const docRef = (d: { id: string; number: string } | undefined): DocRef | null =>
  d ? { id: d.id, number: d.number } : null;

function toInvoiceSummary(inv: finance.MockInvoice): InvoiceSummary {
  const o = findOrder(inv.orderId);
  return {
    id: inv.id,
    number: inv.number,
    order: orderRef(inv.orderId),
    status: inv.status,
    issuedAt: inv.issuedAt,
    total: o ? sales.totalOf(o) : 0,
    reversalOf: null,
    reversedBy: null,
    version: inv.version,
  };
}

function toInvoice(inv: finance.MockInvoice): Invoice {
  const summary = toInvoiceSummary(inv);
  const lines = (findOrder(inv.orderId)?.lines ?? []).map((l) => ({
    variantId: l.variantId,
    sku: l.sku,
    productName: l.productName,
    attributesLabel: variantLabel(inv.companyId, l.variantId).attributesLabel,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.quantity * l.unitPrice,
  }));
  return {
    ...summary,
    lines,
    shippingFee: summary.total - lines.reduce((sum, l) => sum + l.lineTotal, 0),
    reversalReason: null,
  };
}

const toReceipt = (r: finance.MockReceipt): Receipt => ({
  id: r.id,
  number: r.number,
  source: r.source,
  order: orderRef(r.orderId),
  amount: r.amount,
  status: r.status,
  postedAt: r.postedAt,
  gateway: r.gateway,
  paymentTransactionId: r.paymentTransactionId,
  settlementLineId: r.settlementLineId,
  unmatchedReceiptId: r.unmatchedReceiptId,
  reversalOf: null,
  reversedBy: null,
  reversalReason: null,
  version: r.version,
});

function toVoucher(v: finance.MockVoucher): PaymentVoucher {
  const um = finance.unmatched.find((u) => u.id === v.unmatchedReceiptId);
  return {
    id: v.id,
    number: v.number,
    purpose: v.purpose,
    order: orderRef(v.orderId),
    unmatchedReceipt: um ? { id: um.id, amount: um.amount, transferContent: um.transferContent } : null,
    supplierInvoiceId: null,
    amount: v.amount,
    paidOn: v.paidOn,
    note: v.note,
    status: v.status,
    createdBy: userRef(v.createdBy),
    createdAt: v.createdAt,
    postedBy: userRef(v.postedBy),
    postedAt: v.postedAt,
    reversalOf: null,
    reversedBy: null,
    reversalReason: null,
    version: v.version,
  };
}

function toUnmatched(u: finance.MockUnmatched): UnmatchedReceipt {
  return {
    id: u.id,
    receivedAt: u.receivedAt,
    amount: u.amount,
    transferContent: u.transferContent,
    gateway: u.gateway,
    reason: u.reason,
    status: u.status,
    suggestedOrder: orderRef(u.suggestedOrderId),
    assignedOrder: orderRef(u.assignedOrderId),
    receipt: docRef(finance.receipts.find((r) => r.unmatchedReceiptId === u.id)),
    voucher: docRef(postedVoucherOf({ unmatchedReceiptId: u.id })),
    version: u.version,
  };
}

/** Chỉ phiếu đã ghi sổ mới chặn chi lần hai; phiếu nháp thì không */
function postedVoucherOf(source: { orderId?: string; unmatchedReceiptId?: string }) {
  return finance.vouchers.find(
    (v) =>
      v.status === 'posted' &&
      ((source.orderId && v.purpose === 'customer_refund' && v.orderId === source.orderId) ||
        (source.unmatchedReceiptId && v.unmatchedReceiptId === source.unmatchedReceiptId)),
  );
}

/** Số đã thu của đơn: tổng phiếu thu ghi sổ, chưa có thì lấy tổng đơn */
function paidAmountOf(o: sales.MockOrder) {
  const own = finance.receipts.filter((r) => r.orderId === o.id && r.status === 'posted');
  return own.length ? own.reduce((sum, r) => sum + r.amount, 0) : sales.totalOf(o);
}

function toRefundItem(row: payment.MockOrderPayment): RefundItem {
  const o = findOrder(row.orderId);
  const paidReceipt = finance.receipts.find((r) => r.orderId === row.orderId && r.status === 'posted');
  return {
    order: orderRefPhone(row.orderId),
    paidAmount: o ? paidAmountOf(o) : 0,
    paidVia: paidReceipt?.source === 'unmatched_assignment' ? 'unmatched_assignment' : (paidReceipt?.gateway ?? null),
    paidAt: row.paidAt,
    cancelledAt: row.refundStatus === 'pending_refund' ? (row.refundRequestedAt ?? null) : null,
    refundStatus: row.refundStatus as RefundListStatus,
    voucher: docRef(postedVoucherOf({ orderId: row.orderId })),
  };
}

function toCodOrder(row: payment.MockOrderPayment): CodOrder {
  const o = findOrder(row.orderId);
  return {
    order: orderRefPhone(row.orderId),
    amount: o ? sales.totalOf(o) : 0,
    deliveredAt: row.deliveredAt ?? null,
    status: row.status as CodStatus,
    receipt: docRef(finance.receipts.find((r) => r.orderId === row.orderId && r.source === 'cod')),
  };
}

function toTransaction(t: payment.MockTransaction): PaymentTransaction {
  const o = findOrder(t.orderId);
  return {
    id: t.id,
    gateway: t.gateway,
    gatewayTxnId: t.gatewayTxnId,
    paymentCode: t.paymentCode,
    order: o ? { id: o.id, code: o.code, customerName: customerOf(o)?.name ?? null } : null,
    amount: t.amount,
    source: t.source,
    status: t.status,
    occurredAt: t.occurredAt,
    receipt: docRef(finance.receipts.find((r) => r.paymentTransactionId === t.id)),
    unmatchedReceiptId: finance.unmatched.find((u) => u.paymentTransactionId === t.id)?.id ?? null,
  };
}

const voucherEntity = (v: finance.MockVoucher) => ({ type: 'finance.payment_vouchers', id: v.id, label: v.number });
const voucherSnapshot = (v: finance.MockVoucher) => ({
  purpose: v.purpose,
  amount: v.amount,
  paidOn: v.paidOn,
  note: v.note,
  status: v.status,
});

function pushReceipt(
  actor: CompanyActor,
  fields: Pick<finance.MockReceipt, 'source' | 'orderId' | 'amount'> & Partial<finance.MockReceipt>,
) {
  const r: finance.MockReceipt = {
    id: rid('rct'),
    companyId: actor.companyId,
    number: finance.nextFinanceNumber(actor.companyId, 'receipt'),
    status: 'posted',
    postedAt: db.now(),
    gateway: null,
    paymentTransactionId: null,
    settlementLineId: null,
    unmatchedReceiptId: null,
    version: 1,
    ...fields,
  };
  finance.receipts.push(r);
  writeCompanyLog(actor, 'create', { type: 'finance.receipts', id: r.id, label: r.number }, null, {
    source: r.source,
    amount: r.amount,
  });
  return r;
}

/** Lỗi kiểm ngày chi, ghi chú dùng chung cho phiếu chi, hoàn tiền, hoàn khoản thu */
function validatePaidOn(body: { paidOn?: string; note?: string }, errors: Record<string, string>) {
  if (!body.paidOn || !DATE_RE.test(body.paidOn) || Number.isNaN(Date.parse(body.paidOn))) {
    errors.paidOn = 'Chọn ngày chi';
  }
  if ((body.note ?? '').length > MAX_NOTE) errors.note = `Ghi chú tối đa ${MAX_NOTE} ký tự`;
}

const alreadyProcessed = (v: finance.MockVoucher) =>
  problem(409, 'Chứng từ gốc đã được xử lý', {
    code: 'already_processed',
    detail: `Chứng từ gốc đã có phiếu chi ghi sổ ${v.number}`,
  });

const notPendingRefund = () =>
  problem(409, 'Trạng thái thanh toán đã đổi', {
    code: 'payment_state_changed',
    detail: 'Đơn không ở trạng thái chờ hoàn tiền',
  });

const unmatchedProcessed = () =>
  problem(409, 'Khoản thu đã được xử lý', { code: 'already_processed', detail: 'Khoản thu đã được gán hoặc hoàn lại' });

/**
 * Kiểm chứng từ gốc của phiếu chi: còn chờ hoàn, chưa có phiếu ghi sổ, số tiền bằng số phải chi (T19).
 * Trả về phản hồi lỗi, hoặc null nếu hợp lệ.
 */
function checkVoucherSource(
  companyId: string,
  v: Pick<finance.MockVoucher, 'purpose' | 'orderId' | 'unmatchedReceiptId' | 'amount'>,
  errors: Record<string, string>,
): Response | null {
  if (v.purpose === 'customer_refund') {
    const o = findOrder(v.orderId);
    const row = payment.orderPayments.find((p) => p.orderId === v.orderId);
    if (!o || o.companyId !== companyId) {
      errors.orderId = 'Chọn chứng từ gốc';
      return null;
    }
    const posted = postedVoucherOf({ orderId: o.id });
    if (posted) return alreadyProcessed(posted);
    if (row?.refundStatus !== 'pending_refund') return notPendingRefund();
    const due = paidAmountOf(o);
    if (v.amount !== due) errors.amount = `Số tiền phải bằng số đã thu ${formatCurrency(due)}`;
  } else {
    const um = finance.unmatched.find((u) => u.id === v.unmatchedReceiptId && u.companyId === companyId);
    if (!um) {
      errors.unmatchedReceiptId = 'Chọn chứng từ gốc';
      return null;
    }
    const posted = postedVoucherOf({ unmatchedReceiptId: um.id });
    if (posted) return alreadyProcessed(posted);
    if (um.status !== 'open') return unmatchedProcessed();
    if (v.amount !== um.amount) errors.amount = `Số tiền phải bằng số tiền khoản thu ${formatCurrency(um.amount)}`;
  }
  return null;
}

/** Ghi sổ xong: đơn sang đã hoàn, hoặc khoản thu sang đã hoàn lại */
function settleVoucherSource(v: finance.MockVoucher) {
  if (v.purpose === 'customer_refund') {
    const row = payment.orderPayments.find((p) => p.orderId === v.orderId);
    if (row) row.refundStatus = 'refunded';
  } else {
    const um = finance.unmatched.find((u) => u.id === v.unmatchedReceiptId);
    if (um) {
      um.status = 'refunded';
      um.version += 1;
    }
  }
}

function newVoucher(
  actor: CompanyActor,
  fields: Pick<finance.MockVoucher, 'purpose' | 'orderId' | 'unmatchedReceiptId' | 'amount' | 'paidOn' | 'note'>,
  posted: boolean,
): finance.MockVoucher {
  const at = db.now();
  const by = actor.account.id;
  const v: finance.MockVoucher = {
    id: rid('pv'),
    companyId: actor.companyId,
    number: finance.nextFinanceNumber(actor.companyId, 'voucher'),
    ...fields,
    status: posted ? 'posted' : 'draft',
    createdBy: by,
    createdAt: at,
    postedBy: posted ? by : null,
    postedAt: posted ? at : null,
    version: 1,
  };
  finance.vouchers.push(v);
  if (posted) settleVoucherSource(v);
  writeCompanyLog(actor, 'create', voucherEntity(v), null, voucherSnapshot(v));
  return v;
}

function ownVoucher(id: unknown, companyId: string) {
  return findOwned(finance.vouchers, id, companyId, 'phiếu chi');
}

function draftGuard(v: finance.MockVoucher, version: unknown): Response | null {
  if (version !== undefined && version !== null && Number(version) !== v.version) {
    return versionConflict(toVoucher(v), 'Phiếu chi vừa được người khác cập nhật.');
  }
  if (v.status !== 'draft') {
    return problem(409, 'Phiếu chi không còn là nháp', {
      code: 'not_draft',
      detail: 'Chỉ sửa, xoá, ghi sổ được phiếu chi nháp',
      current: toVoucher(v),
    });
  }
  return null;
}

const invalid = (errors: Record<string, string>) => problem(422, 'Dữ liệu không hợp lệ', { errors });

const byDesc = <T>(key: (x: T) => string | null | undefined) => (a: T, b: T) =>
  (key(b) ?? '').localeCompare(key(a) ?? '');

const financeHandlers = [
  http.get(`${API}/finance/invoices`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const status = f.param('status');
    const items = finance.invoices
      .filter((inv) => inv.companyId === guard.value.companyId)
      .map(toInvoiceSummary)
      .filter(
        (inv) =>
          (!status || inv.status === status) &&
          f.inRange(vnDate(inv.issuedAt)) &&
          f.matches(inv.number, inv.order?.code, inv.order?.customerName),
      )
      .sort(byDesc((inv) => inv.issuedAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/invoices/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.invoices, params.id, guard.value.companyId, 'hoá đơn');
    if (!found.ok) return found.response;
    return HttpResponse.json(toInvoice(found.value));
  }),

  http.get(`${API}/finance/receipts`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [source, status, orderId] = [f.param('source'), f.param('status'), f.param('orderId')];
    const items = finance.receipts
      .filter((r) => r.companyId === guard.value.companyId)
      .map(toReceipt)
      .filter(
        (r) =>
          (!source || r.source === source) &&
          (!status || r.status === status) &&
          (!orderId || r.order?.id === orderId) &&
          f.inRange(vnDate(r.postedAt)) &&
          f.matches(r.number, r.order?.code),
      )
      .sort(byDesc((r) => r.postedAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/receipts/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.receipts, params.id, guard.value.companyId, 'phiếu thu');
    if (!found.ok) return found.response;
    return HttpResponse.json(toReceipt(found.value));
  }),

  http.get(`${API}/finance/payment-vouchers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [purpose, status] = [f.param('purpose'), f.param('status')];
    const items = finance.vouchers
      .filter((v) => v.companyId === guard.value.companyId)
      .filter(
        (v) =>
          (!purpose || v.purpose === purpose) &&
          (!status || v.status === status) &&
          f.inRange(v.paidOn) &&
          f.matches(v.number, v.note, findOrder(v.orderId)?.code),
      )
      .sort(byDesc((v) => v.createdAt))
      .map(toVoucher);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/payment-vouchers/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    return HttpResponse.json(toVoucher(found.value));
  }),

  http.post(`${API}/finance/payment-vouchers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as {
      purpose?: string;
      orderId?: string;
      unmatchedReceiptId?: string;
      amount?: number;
      paidOn?: string;
      note?: string;
    };
    const errors: Record<string, string> = {};
    if (body.purpose !== 'customer_refund' && body.purpose !== 'unmatched_refund') {
      errors.purpose = 'Chọn mục đích chi';
    }
    if (!Number.isInteger(body.amount) || (body.amount ?? 0) <= 0) errors.amount = 'Số tiền phải là số nguyên dương';
    validatePaidOn(body, errors);
    const fields = {
      purpose: body.purpose as VoucherPurpose,
      orderId: body.purpose === 'customer_refund' ? (body.orderId ?? null) : null,
      unmatchedReceiptId: body.purpose === 'unmatched_refund' ? (body.unmatchedReceiptId ?? null) : null,
      amount: body.amount ?? 0,
      paidOn: body.paidOn ?? '',
      note: body.note?.trim() ?? '',
    };
    if (!errors.purpose) {
      const conflict = checkVoucherSource(guard.value.companyId, fields, errors);
      if (conflict) return conflict;
    }
    if (Object.keys(errors).length) return invalid(errors);
    return HttpResponse.json(toVoucher(newVoucher(guard.value, fields, false)), { status: 201 });
  }),

  http.put(`${API}/finance/payment-vouchers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const v = found.value;
    const body = (await request.json()) as { amount?: number; paidOn?: string; note?: string; version?: number };
    const blocked = draftGuard(v, body.version ?? -1);
    if (blocked) return blocked;
    const errors: Record<string, string> = {};
    validatePaidOn(body, errors);
    const amount = body.amount ?? v.amount;
    const conflict = checkVoucherSource(guard.value.companyId, { ...v, amount }, errors);
    if (conflict) return conflict;
    if (Object.keys(errors).length) return invalid(errors);
    const before = voucherSnapshot(v);
    Object.assign(v, { amount, paidOn: body.paidOn!, note: body.note?.trim() ?? '', version: v.version + 1 });
    writeCompanyLog(guard.value, 'update', voucherEntity(v), before, voucherSnapshot(v));
    return HttpResponse.json(toVoucher(v));
  }),

  http.delete(`${API}/finance/payment-vouchers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const v = found.value;
    const blocked = draftGuard(v, new URL(request.url).searchParams.get('version') ?? -1);
    if (blocked) return blocked;
    finance.vouchers.splice(finance.vouchers.indexOf(v), 1);
    writeCompanyLog(guard.value, 'delete', voucherEntity(v), voucherSnapshot(v), null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/finance/payment-vouchers/:id/post`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const v = found.value;
    const body = (await request.json()) as { version?: number };
    const blocked = draftGuard(v, body.version ?? -1);
    if (blocked) return blocked;
    const errors: Record<string, string> = {};
    const conflict = checkVoucherSource(guard.value.companyId, v, errors);
    if (conflict) return conflict;
    if (Object.keys(errors).length) return invalid(errors);
    const before = voucherSnapshot(v);
    Object.assign(v, { status: 'posted', postedBy: guard.value.account.id, postedAt: db.now(), version: v.version + 1 });
    settleVoucherSource(v);
    writeCompanyLog(guard.value, 'update', voucherEntity(v), before, voucherSnapshot(v));
    return HttpResponse.json(toVoucher(v));
  }),

  http.get(`${API}/finance/cod-orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const status = f.param('status') ?? 'cod_pending';
    const items = payment.orderPayments
      .filter(
        (p) =>
          p.companyId === guard.value.companyId &&
          p.method === 'cod' &&
          p.status === status &&
          // Đơn COD chưa giao không hiện ở tab Chờ thu (#27 AC-25)
          (status !== 'cod_pending' || Boolean(p.deliveredAt)),
      )
      .sort((a, b) => {
        if (!a.deliveredAt !== !b.deliveredAt) return a.deliveredAt ? -1 : 1;
        return (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '');
      })
      .map(toCodOrder)
      .filter(
        (c) =>
          (!c.deliveredAt ? !f.param('from') && !f.param('to') : f.inRange(vnDate(c.deliveredAt))) &&
          f.matches(c.order?.code, c.order?.customerName),
      );
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/finance/cod-confirmations`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as { orderIds?: string[] };
    const ids = [...new Set(body.orderIds ?? [])];
    if (ids.length === 0) return invalid({ orderIds: 'Chọn ít nhất một đơn' });
    if (ids.length > MAX_COD_BATCH) return invalid({ orderIds: `Tối đa ${MAX_COD_BATCH} đơn mỗi lần` });
    const own = ids.map((id) => findOrder(id)).filter((o) => o?.companyId === guard.value.companyId);
    if (own.length !== ids.length) return invalid({ orderIds: 'Có đơn không thuộc công ty' });
    const rows = ids.map((id) => payment.orderPayments.find((p) => p.orderId === id));
    const changed = rows
      .map((row, i) => ({ row, order: own[i]! }))
      .filter(({ row }) => row?.method !== 'cod' || row.status !== 'cod_pending' || !row.deliveredAt)
      .map(({ row, order }) => ({ orderId: order.id, code: order.code, status: row?.status ?? 'unpaid' }));
    if (changed.length) {
      return problem(409, 'Trạng thái thanh toán đã đổi', {
        code: 'payment_state_changed',
        detail: 'Có đơn không còn chờ thu COD',
        orders: changed,
      });
    }
    const at = db.now();
    const result = rows.map((row, i) => {
      row!.status = 'cod_collected';
      row!.paidAt = at;
      const r = pushReceipt(guard.value, { source: 'cod', orderId: own[i]!.id, amount: sales.totalOf(own[i]!) });
      return { orderId: own[i]!.id, receipt: { id: r.id, number: r.number } };
    });
    return HttpResponse.json({ receipts: result }, { status: 201 });
  }),

  http.get(`${API}/finance/refunds`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const status = f.param('status') ?? 'pending_refund';
    const items = payment.orderPayments
      .filter((p) => p.companyId === guard.value.companyId && p.refundStatus === status)
      .map(toRefundItem)
      .filter((r) => f.matches(r.order?.code, r.order?.customerName))
      .sort(byDesc((r) => r.cancelledAt ?? r.paidAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/finance/refunds`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as { orderId?: string; paidOn?: string; note?: string };
    const o = findOrder(body.orderId ?? null);
    if (!o || o.companyId !== guard.value.companyId) {
      return problem(404, 'Không tìm thấy đơn hàng', { code: 'not_found' });
    }
    const errors: Record<string, string> = {};
    validatePaidOn(body, errors);
    if (Object.keys(errors).length) return invalid(errors);
    const fields = {
      purpose: 'customer_refund' as const,
      orderId: o.id,
      unmatchedReceiptId: null,
      amount: paidAmountOf(o),
      paidOn: body.paidOn!,
      note: body.note?.trim() ?? '',
    };
    const conflict = checkVoucherSource(guard.value.companyId, fields, errors);
    if (conflict) return conflict;
    return HttpResponse.json(toVoucher(newVoucher(guard.value, fields, true)), { status: 201 });
  }),

  http.get(`${API}/finance/unmatched-receipts`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [status, reason] = [f.param('status') ?? 'open', f.param('reason')];
    const items = finance.unmatched
      .filter(
        (u) =>
          u.companyId === guard.value.companyId &&
          u.status === status &&
          (!reason || u.reason === reason) &&
          f.inRange(vnDate(u.receivedAt)) &&
          f.matches(u.transferContent),
      )
      .sort(byDesc((u) => u.receivedAt))
      .map(toUnmatched);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/finance/unmatched-receipts/:id/assign`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.unmatched, params.id, guard.value.companyId, 'khoản thu');
    if (!found.ok) return found.response;
    const um = found.value;
    const body = (await request.json()) as { orderId?: string; version?: number };
    if (body.version !== um.version) return versionConflict(toUnmatched(um), 'Khoản thu vừa được người khác xử lý.');
    if (um.status !== 'open') return unmatchedProcessed();
    const o = findOrder(body.orderId ?? null);
    if (!o || o.companyId !== guard.value.companyId) return invalid({ orderId: 'Chọn đơn hàng' });
    const row = payment.orderPayments.find((p) => p.orderId === o.id);
    if (o.status === 'cancelled' || o.source === 'marketplace' || row?.status !== 'unpaid') {
      return problem(409, 'Trạng thái thanh toán đã đổi', {
        code: 'payment_state_changed',
        detail: 'Đơn không còn chờ thanh toán',
        current: toOrderPayment(o),
      });
    }
    const total = sales.totalOf(o);
    if (total !== um.amount) {
      return problem(422, 'Số tiền không khớp', {
        code: 'amount_mismatch',
        errors: {
          orderId: `Tổng đơn ${formatCurrency(total)} khác số tiền khoản thu ${formatCurrency(um.amount)}`,
        },
      });
    }
    row.status = 'paid';
    row.paidAt = db.now();
    for (const link of payment.links) {
      if (link.orderId === o.id && link.status === 'active') link.status = 'cancelled';
    }
    um.status = 'assigned';
    um.assignedOrderId = o.id;
    um.version += 1;
    const r = pushReceipt(guard.value, {
      source: 'unmatched_assignment',
      orderId: o.id,
      amount: um.amount,
      gateway: um.gateway,
      paymentTransactionId: um.paymentTransactionId,
      unmatchedReceiptId: um.id,
    });
    return HttpResponse.json({ unmatchedReceipt: toUnmatched(um), receipt: toReceipt(r) });
  }),

  http.post(`${API}/finance/unmatched-receipts/:id/refund`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.unmatched, params.id, guard.value.companyId, 'khoản thu');
    if (!found.ok) return found.response;
    const um = found.value;
    const body = (await request.json()) as { paidOn?: string; note?: string; version?: number };
    if (body.version !== um.version) return versionConflict(toUnmatched(um), 'Khoản thu vừa được người khác xử lý.');
    const errors: Record<string, string> = {};
    const fields = {
      purpose: 'unmatched_refund' as const,
      orderId: null,
      unmatchedReceiptId: um.id,
      amount: um.amount,
      paidOn: body.paidOn ?? '',
      note: body.note?.trim() ?? '',
    };
    const conflict = checkVoucherSource(guard.value.companyId, fields, errors);
    if (conflict) return conflict;
    validatePaidOn(body, errors);
    if (Object.keys(errors).length) return invalid(errors);
    return HttpResponse.json(toVoucher(newVoucher(guard.value, fields, true)), { status: 201 });
  }),

  // Đơn chưa thu cho hộp gán khoản: bỏ đơn huỷ, chỉ dòng order_payments đang `unpaid`
  http.get(`${API}/payment/orders`, async ({ request }) => {
    await delay(200);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const items: UnpaidOrder[] = payment.orderPayments
      .filter((p) => p.companyId === guard.value.companyId && p.status === 'unpaid')
      .map((p) => findOrder(p.orderId))
      .filter((o): o is sales.MockOrder => Boolean(o) && o!.status !== 'cancelled')
      .sort(byDesc((o) => o.createdAt))
      .map((o) => ({ order: orderRef(o.id)!, amount: sales.totalOf(o) }))
      .filter((u) => f.matches(u.order.code, u.order.customerName));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/payment/transactions`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.transactionView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [gateway, status] = [f.param('gateway'), f.param('status')];
    const items = payment.transactions
      .filter(
        (t) =>
          t.companyId === guard.value.companyId &&
          (!gateway || t.gateway === gateway) &&
          (!status || t.status === status) &&
          f.inRange(vnDate(t.occurredAt)),
      )
      .map(toTransaction)
      .filter((t) => f.matches(t.paymentCode, t.gatewayTxnId, t.order?.code))
      .sort(byDesc((t) => t.occurredAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/payment/transactions/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.transactionView);
    if (!guard.ok) return guard.response;
    const found = findOwned(payment.transactions, params.id, guard.value.companyId, 'giao dịch');
    if (!found.ok) return found.response;
    const detail: PaymentTransactionDetail = { ...toTransaction(found.value), rawPayload: found.value.rawPayload };
    return HttpResponse.json(detail);
  }),
];


/** Webhook thành công (giả lập): ghi giao dịch cổng và phiếu thu nguồn cổng */
function recordGatewayPayment(link: payment.MockPaymentLink) {
  const at = db.now();
  const txn: payment.MockTransaction = {
    id: rid('txn'),
    companyId: link.companyId,
    gateway: link.gateway,
    gatewayTxnId: `SBX-${Date.now().toString(36).toUpperCase()}`,
    paymentCode: link.paymentCode,
    orderId: link.orderId,
    amount: link.amount,
    source: link.gateway === 'vietqr' ? 'sepay' : 'webhook',
    status: 'succeeded',
    occurredAt: at,
    rawPayload: { paymentCode: link.paymentCode, amount: link.amount, simulated: true, sandbox: true },
  };
  payment.transactions.push(txn);
  finance.receipts.push({
    id: rid('rct'),
    companyId: link.companyId,
    number: finance.nextFinanceNumber(link.companyId, 'receipt'),
    source: 'gateway',
    orderId: link.orderId,
    amount: link.amount,
    status: 'posted',
    postedAt: at,
    gateway: link.gateway,
    paymentTransactionId: txn.id,
    settlementLineId: null,
    unmatchedReceiptId: null,
    version: 1,
  });
}

// ---------- Báo cáo kinh doanh (UC-RP-01, UC-RP-02; commerio-backend#29) ----------

const REPORT_SOURCES: OrderSource[] = ['marketplace', 'inbox', 'manual'];
/** Nhãn nguồn trong CSV của BE (`report/domain/csv.ts`) */
const REPORT_SOURCE_CSV: Record<OrderSource, string> = {
  marketplace: 'Sàn',
  inbox: 'Hộp thư',
  manual: 'Đơn tạo tay',
};
const REPORT_MONEY = ['revenue', 'cashCollected', 'platformFee', 'paymentFee', 'shippingFee', 'cogs'] as const;
const REPORT_KINDS: ReportKind[] = ['overview', 'shops', 'daily'];

const reportAddDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const reportDaysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** `resolveRange` của BE: thiếu cả hai là 30 ngày tới hôm nay, chỉ `to` thì lùi 29 ngày, chỉ `from` thì tới hôm nay */
function reportRange(url: URL): { ok: true; from: string; to: string } | { ok: false; response: Response } {
  const qFrom = url.searchParams.get('from') || undefined;
  const qTo = url.searchParams.get('to') || undefined;
  const bad = [qFrom && ['from', qFrom], qTo && ['to', qTo]].find((x) => x && !DATE_RE.test(x[1])) as
    | [string, string]
    | undefined;
  if (bad) return { ok: false, response: invalid({ [bad[0]]: 'Ngày không hợp lệ' }) };
  const today = vnDate(new Date().toISOString());
  if (qFrom && !qTo && qFrom > today) return { ok: false, response: invalid({ from: 'Từ ngày không được sau hôm nay' }) };
  const to = qTo ?? today;
  const from = qFrom ?? reportAddDays(to, -29);
  if (from > to) return { ok: false, response: invalid({ from: 'Từ ngày phải trước hoặc bằng đến ngày' }) };
  if (reportDaysBetween(from, to) > 366) return { ok: false, response: invalid({ to: 'Khoảng ngày tối đa 366 ngày' }) };
  return { ok: true, from, to };
}

/** `shopId` chỉ đi với nguồn sàn; bỏ trống nguồn thì hiểu là sàn (BE plan #29 A10) */
function reportFilter(url: URL): { ok: true; source?: OrderSource; shopId?: string } | { ok: false; response: Response } {
  const source = (url.searchParams.get('source') || undefined) as OrderSource | undefined;
  const shopId = url.searchParams.get('shopId') || undefined;
  if (source && !REPORT_SOURCES.includes(source)) return { ok: false, response: invalid({ source: 'Nguồn không hợp lệ' }) };
  if (shopId && source && source !== 'marketplace') {
    return { ok: false, response: invalid({ shopId: 'Gian hàng chỉ đi với nguồn marketplace' }) };
  }
  return shopId ? { ok: true, shopId, source: 'marketplace' } : { ok: true, source };
}

/** Báo cáo cần cả `report.dashboard.view` và `finance.invoice.view` (D18); quyền phân hệ Báo cáo xét trước */
function requireReport(request: Request, ...more: string[]): Guard<CompanyActor> {
  const guard = requireCompany(request, PERMISSIONS.reportView);
  if (!guard.ok) return guard;
  if ([PERMISSIONS.financeView, ...more].some((p) => !guard.value.permissions.includes(p))) {
    return { ok: false, response: problem(403, 'Không có quyền thực hiện') };
  }
  return guard;
}

function sumFigures(rows: MockReportRow[], canCost: boolean): ReportFigures {
  const sum = Object.fromEntries(REPORT_MONEY.map((k) => [k, rows.reduce((acc, r) => acc + r[k], 0)])) as Record<
    (typeof REPORT_MONEY)[number],
    number
  >;
  return {
    revenue: sum.revenue,
    cashCollected: sum.cashCollected,
    platformFee: sum.platformFee,
    paymentFee: sum.paymentFee,
    shippingFee: sum.shippingFee,
    cogs: canCost ? sum.cogs : null,
    profit: canCost ? sum.revenue - sum.cogs - sum.platformFee - sum.paymentFee - sum.shippingFee : null,
    feesPending: rows.some((r) => r.feesPending),
  };
}

function reportShopRef(shopId: string): ShopFigures['shop'] {
  const shop = db.shops.find((s) => s.id === shopId);
  return { id: shopId, shopName: shop?.shopName ?? null, platform: shop?.platform ?? null };
}

function reportData(actor: CompanyActor, from: string, to: string, filter: { source?: OrderSource; shopId?: string } = {}) {
  const rows = reportRows.filter(
    (r) =>
      r.companyId === actor.companyId &&
      r.day >= from &&
      r.day <= to &&
      (!filter.source || r.source === filter.source) &&
      (!filter.shopId || r.shopId === filter.shopId),
  );
  const asOf = rows.reduce<string | null>((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null);
  return { rows, asOf, canCost: actor.permissions.includes(PERMISSIONS.costView) };
}

function reportOverview(actor: CompanyActor, from: string, to: string): ReportOverview {
  const { rows, asOf, canCost } = reportData(actor, from, to);
  return { from, to, asOf, ...sumFigures(rows, canCost) };
}

function reportShops(actor: CompanyActor, from: string, to: string): ReportShops {
  const { rows, asOf, canCost } = reportData(actor, from, to);
  const groups = new Map<string, MockReportRow[]>();
  for (const r of rows) {
    const key = `${r.source}|${r.shopId ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const items: ShopFigures[] = [...groups.values()].map((g) => ({
    source: g[0].source,
    shop: g[0].shopId ? reportShopRef(g[0].shopId) : null,
    ...sumFigures(g, canCost),
  }));
  items.sort(
    (a, b) =>
      REPORT_SOURCES.indexOf(a.source) - REPORT_SOURCES.indexOf(b.source) ||
      (a.shop?.shopName ?? '').localeCompare(b.shop?.shopName ?? ''),
  );
  return { from, to, asOf, items, total: sumFigures(rows, canCost) };
}

function reportDaily(
  actor: CompanyActor,
  from: string,
  to: string,
  filter: { source?: OrderSource; shopId?: string },
): ReportDaily {
  const { rows, asOf, canCost } = reportData(actor, from, to, filter);
  const items: DailyFigures[] = Array.from({ length: reportDaysBetween(from, to) }, (_, i) => {
    const day = reportAddDays(from, i);
    return { day, ...sumFigures(rows.filter((r) => r.day === day), canCost) };
  });
  return { from, to, asOf, items };
}

type CsvCell = string | number | null;

/** `csvCell` của BE: chữ bắt đầu bằng `= + - @` thêm nháy, bọc ngoặc kép khi có dấu phẩy, ngoặc kép, xuống dòng */
function csvCell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function figuresCsv<T extends ReportFigures>(
  lead: [string, (row: T) => CsvCell][],
  rows: T[],
  canCost: boolean,
  total?: ReportFigures,
): string {
  const figures: [string, (f: ReportFigures) => CsvCell][] = [
    ['Doanh thu', (f) => f.revenue],
    ['Tiền đã thu', (f) => f.cashCollected],
    ['Phí sàn', (f) => f.platformFee],
    ['Phí cổng', (f) => f.paymentFee],
    ['Phí vận chuyển', (f) => f.shippingFee],
    ...(canCost
      ? ([
          ['Giá vốn', (f) => f.cogs],
          ['Lãi', (f) => f.profit],
        ] as [string, (f: ReportFigures) => CsvCell][])
      : []),
    ['Phí sàn chờ đối soát', (f) => (f.feesPending ? 'có' : 'không')],
  ];
  const body = rows.map((row) => [...lead.map(([, cell]) => cell(row)), ...figures.map(([, cell]) => cell(row))]);
  const footer = total ? [['Tổng', ...lead.slice(1).map(() => null), ...figures.map(([, cell]) => cell(total))]] : [];
  const all = [[...lead, ...figures].map(([label]) => label), ...body, ...footer];
  return `﻿${all.map((r) => `${r.map(csvCell).join(',')}\r\n`).join('')}`;
}

const reportHandlers = [
  http.get(`${API}/report/overview`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireReport(request);
    if (!guard.ok) return guard.response;
    const range = reportRange(new URL(request.url));
    if (!range.ok) return range.response;
    return HttpResponse.json(reportOverview(guard.value, range.from, range.to));
  }),

  http.get(`${API}/report/shops`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireReport(request);
    if (!guard.ok) return guard.response;
    const range = reportRange(new URL(request.url));
    if (!range.ok) return range.response;
    return HttpResponse.json(reportShops(guard.value, range.from, range.to));
  }),

  http.get(`${API}/report/daily`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireReport(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const range = reportRange(url);
    if (!range.ok) return range.response;
    const filter = reportFilter(url);
    if (!filter.ok) return filter.response;
    return HttpResponse.json(reportDaily(guard.value, range.from, range.to, filter));
  }),

  http.get(`${API}/report/export`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireReport(request, PERMISSIONS.reportExport);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const report = url.searchParams.get('report') as ReportKind | null;
    if (!report || !REPORT_KINDS.includes(report)) return invalid({ report: 'Loại báo cáo không hợp lệ' });
    const range = reportRange(url);
    if (!range.ok) return range.response;
    const actor = guard.value;
    const canCost = actor.permissions.includes(PERMISSIONS.costView);
    let csv: string;
    if (report === 'overview') {
      const o = reportOverview(actor, range.from, range.to);
      csv = figuresCsv(
        [
          ['Từ ngày', () => o.from],
          ['Đến ngày', () => o.to],
        ],
        [o],
        canCost,
      );
    } else if (report === 'shops') {
      const s = reportShops(actor, range.from, range.to);
      csv = figuresCsv(
        [
          ['Nguồn', (r) => REPORT_SOURCE_CSV[r.source]],
          ['Sàn', (r) => r.shop?.platform ?? null],
          ['Gian hàng', (r) => r.shop?.shopName ?? null],
        ],
        s.items,
        canCost,
        s.total,
      );
    } else {
      const filter = reportFilter(url);
      if (!filter.ok) return filter.response;
      const d = reportDaily(actor, range.from, range.to, filter);
      csv = figuresCsv([['Ngày', (r) => r.day]], d.items, canCost);
    }
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bao-cao-${report}-${range.from}-${range.to}.csv"`,
      },
    });
  }),
];

// ---------- Đối soát tiền sàn (UC-PF-10; commerio-backend#30) ----------

/** Đối soát cần thêm phân hệ Kênh bán (BE `settlement-routes.ts`) */
function requireSettlement(request: Request, permission: string = PERMISSIONS.financeView): Guard<CompanyActor> {
  const guard = requireCompany(request, permission);
  if (!guard.ok) return guard;
  if (!enabledModulesOf(guard.value.companyId).includes('channel')) {
    return { ok: false, response: problem(403, 'Phân hệ Kênh bán đang tắt', { code: 'module_disabled' }) };
  }
  return guard;
}

const statementOf = (id: string) => settlement.statements.find((s) => s.id === id)!;
const settlementReceiptOf = (lineId: string) =>
  finance.receipts.find((r) => r.settlementLineId === lineId && r.status === 'posted');
const settlementFeeTotal = (fees: SettlementFees) => Object.values(fees).reduce((a, b) => a + b, 0);

function statementView(s: settlement.MockStatement): SettlementStatement {
  const lines = settlement.settlementLines.filter((l) => l.statementId === s.id);
  const count = (status: SettlementLine['matchStatus']) => lines.filter((l) => l.matchStatus === status).length;
  const shop = db.shops.find((x) => x.id === s.shopId);
  return {
    id: s.id,
    shop: { id: s.shopId, shopName: shop?.shopName ?? null, platform: shop?.platform ?? null },
    externalStatementId: s.externalStatementId,
    statementTime: s.statementTime,
    settlementAmount: lines.reduce((a, l) => a + l.settlement, 0),
    paymentStatus: s.paymentStatus,
    lineCount: lines.length,
    matchedCount: count('matched'),
    discrepancyCount: count('discrepancy'),
    refundTaggedCount: count('refund_tagged'),
    receiptTotal: lines.reduce((a, l) => a + (settlementReceiptOf(l.id)?.amount ?? 0), 0),
  };
}

function settlementLineView(l: settlement.MockSettlementLine): SettlementLine {
  const order = findOrder(l.orderId);
  const receipt = settlementReceiptOf(l.id);
  return {
    id: l.id,
    statementId: l.statementId,
    kind: l.kind,
    externalTransactionId: l.externalTransactionId,
    externalOrderId: l.externalOrderId,
    order: orderRef(l.orderId),
    revenue: l.revenue,
    fees: { ...l.fees },
    feeTotal: settlementFeeTotal(l.fees),
    shippingCost: l.shippingCost,
    adjustment: l.adjustment,
    settlement: l.settlement,
    orderTotal: order ? sales.totalOf(order) : null,
    matchStatus: l.matchStatus,
    discrepancyReason: l.discrepancyReason,
    receipt: docRef(receipt),
    // `needsReceipt` của BE khi bảng kê đã PAID, mà bảng kê chưa PAID
    receiptPending:
      !receipt &&
      statementOf(l.statementId).paymentStatus !== 'PAID' &&
      l.matchStatus !== 'discrepancy' &&
      l.settlement > 0,
  };
}

/** Lần chạy đối soát giả: còn chạy thì trả 409 `run_in_progress` */
let settlementRunUntil = 0;
const SETTLEMENT_RUN_MS = 4000;

const settlementHandlers = [
  http.get(`${API}/finance/settlements`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const shopId = f.param('shopId');
    const paymentStatus = f.param('paymentStatus');
    const items = settlement.statements
      .filter(
        (s) =>
          s.companyId === guard.value.companyId &&
          (!shopId || s.shopId === shopId) &&
          (!paymentStatus || s.paymentStatus === paymentStatus) &&
          f.inRange(vnDate(s.statementTime)),
      )
      .sort(byDesc((s) => s.statementTime))
      .map(statementView);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/settlements/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request);
    if (!guard.ok) return guard.response;
    const found = findOwned(settlement.statements, params.id, guard.value.companyId, 'bảng kê');
    if (!found.ok) return found.response;
    return HttpResponse.json(statementView(found.value));
  }),

  http.get(`${API}/finance/settlement-lines`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const statementId = f.param('statementId');
    const matchStatus = f.param('matchStatus');
    const shopId = f.param('shopId');
    const orderId = f.param('orderId');
    const items = settlement.settlementLines
      .filter((l) => {
        const s = statementOf(l.statementId);
        return (
          l.companyId === guard.value.companyId &&
          (!statementId || l.statementId === statementId) &&
          (!matchStatus || l.matchStatus === matchStatus) &&
          (!shopId || s.shopId === shopId) &&
          (!orderId || l.orderId === orderId) &&
          f.inRange(vnDate(s.statementTime))
        );
      })
      .sort(
        (a, b) =>
          statementOf(b.statementId).statementTime.localeCompare(statementOf(a.statementId).statementTime) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .map(settlementLineView);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  // BE chưa có (#30 phần 2): FE chỉ hiện nút với mock hoặc khi bật VITE_SETTLEMENT_RUN
  http.post(`${API}/finance/settlements/run`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json().catch(() => ({}))) as { shopId?: string };
    if (
      body.shopId &&
      !db.shops.some((s) => s.id === body.shopId && s.companyId === guard.value.companyId)
    ) {
      return invalid({ shopId: 'Không tìm thấy gian hàng' });
    }
    if (Date.now() < settlementRunUntil) {
      return problem(409, 'Lần đối soát trước chưa chạy xong', { code: 'run_in_progress' });
    }
    settlementRunUntil = Date.now() + SETTLEMENT_RUN_MS;
    return new HttpResponse(null, { status: 202 });
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
  ...salesHandlers,
  ...paymentHandlers,
  ...fulfillmentHandlers,
  ...financeHandlers,
  ...reportHandlers,
  ...settlementHandlers,
];
