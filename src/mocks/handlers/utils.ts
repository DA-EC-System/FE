import { HttpResponse } from 'msw';
import { CEO_ROLE_ID, db, type MockMembership, type MockRole } from '../db';
import type { Account, CompanyContext, LoginResponse, Membership } from '@/types/auth';
import type { PlatformAuditAction } from '@/types/audit';
import { CORE_MODULES } from '@/utils/modules';
import type { OwnedRecord, StateMachine } from '@/lib/stateMachine';

export const API = '/api/v1';

/**
 * Thời hạn token của mock, đổi được khi test qua `window.__commerioMock` (không ghi vào storage).
 * Ví dụ đặt `accessTtlMs = 5000` để thấy FE tự làm mới token sau 5 giây (AC-5).
 */
export interface MockAuthConfig {
  accessTtlMs: number;
  refreshTtlMs: number;
  /** Trễ mỗi lời gọi API (ms). Mặc định 350; trình duyệt tự động hoá (E2E Playwright) thì 0 */
  latencyMs?: number;
}
export const mockAuth: MockAuthConfig = Object.assign(
  { accessTtlMs: 15 * 60_000, refreshTtlMs: 7 * 24 * 3600_000 },
  (globalThis as { __commerioMock?: Partial<MockAuthConfig> }).__commerioMock,
);
(globalThis as { __commerioMock?: MockAuthConfig }).__commerioMock = mockAuth;
export const REFRESH_COOKIE = 'commerio_refresh';
// Playwright đặt navigator.webdriver = true: E2E không cần thấy loading nên bỏ trễ (FE#69). Test nào kiểm
// trạng thái loading thì đặt lại `latencyMs` qua `window.__commerioMock` trước khi tải trang.
const E2E = typeof navigator !== 'undefined' && navigator.webdriver === true;
export const LATENCY = mockAuth.latencyMs ?? (E2E ? 0 : 350); // ms — để thấy được loading state
/** Trễ riêng của một handler, theo cùng cách với LATENCY */
export const lag = (ms: number) => (LATENCY === 0 ? 0 : ms);

// ---------- Tiện ích ----------
export function problem(
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

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

export function pageParams(url: URL) {
  return {
    page: Math.max(1, Number(url.searchParams.get('page') ?? '1')),
    pageSize: Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')),
  };
}

export interface TokenInfo {
  account: Account;
  companyId: string | null;
}

export function readToken(request: Request): TokenInfo | null {
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
export const revokedRefresh = new Set<string>();

export function setRefreshCookie(accountId: string) {
  const value = `${accountId}~${Date.now() + mockAuth.refreshTtlMs}`;
  const maxAge = Math.floor(mockAuth.refreshTtlMs / 1000);
  document.cookie = `${REFRESH_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Strict`;
}

export function clearRefreshCookie() {
  document.cookie = `${REFRESH_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
}

/**
 * Cookie trình duyệt gửi kèm request. Service worker không thấy header Cookie,
 * còn handler MSW chạy trong trang nên đọc thẳng `document.cookie`.
 */
export function readCookie(name: string): string | undefined {
  const pair = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}

export function readRefresh(): Account | null {
  const value = readCookie(REFRESH_COOKIE);
  if (!value || revokedRefresh.has(value)) return null;
  const [accountId, expiresAt] = value.split('~');
  if (Date.now() > Number(expiresAt)) return null;
  return db.accounts.find((a) => a.id === accountId) ?? null;
}

export function makeToken(accountId: string, companyId: string | null) {
  return `mock.${accountId}.${companyId ?? '-'}.${Date.now()}`;
}

export function toMembership(m: MockMembership): Membership {
  const company = db.companies.find((c) => c.id === m.companyId)!;
  return {
    companyId: company.id,
    companyName: company.name,
    companyStatus: company.status,
    status: m.status,
    roles: rolesOfMember(m).map((r) => r.name),
  };
}

export function membershipsOf(accountId: string): Membership[] {
  return db.memberships.filter((m) => m.accountId === accountId).map(toMembership);
}

export function rolesOfMember(m: MockMembership): MockRole[] {
  return m.roleIds
    .map((id) => db.roles.find((r) => r.id === id))
    .filter((r): r is MockRole => Boolean(r));
}

export function enabledModulesOf(companyId: string) {
  const company = db.companies.find((c) => c.id === companyId)!;
  return [...CORE_MODULES, ...company.optionalModules] as string[];
}

/** Quyền thực có: hợp các vai trò, bỏ quyền của phân hệ công ty chưa bật */
export function permissionsOf(m: MockMembership): string[] {
  const enabled = enabledModulesOf(m.companyId);
  return [...new Set(rolesOfMember(m).flatMap((r) => r.permissions))].filter((p) =>
    enabled.includes(p.split('.')[0]),
  );
}

export function buildContext(m: MockMembership): CompanyContext {
  const company = db.companies.find((c) => c.id === m.companyId)!;
  return {
    companyId: company.id,
    companyName: company.name,
    roles: rolesOfMember(m).map((r) => r.name),
    permissions: permissionsOf(m),
    enabledModules: [...CORE_MODULES, ...company.optionalModules],
    // Như canSelfApprove của BE: CEO, hoặc công ty chỉ có một thành viên đang hoạt động
    canSelfApprove:
      m.roleIds.includes(CEO_ROLE_ID) ||
      db.memberships.filter((x) => x.companyId === m.companyId && x.status === 'active').length === 1,
  };
}

export type Guard<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Còn mật khẩu trong thư mời: BE chặn mọi chức năng trừ đổi mật khẩu (UC-PI-03 bước 7). */
export function passwordChangeRequired(account: Account) {
  return account.mustChangePassword
    ? problem(403, 'Cần đổi mật khẩu trước khi tiếp tục', { code: 'password_change_required' })
    : null;
}

export function loginPayload(account: Account): LoginResponse {
  return {
    accessToken: makeToken(account.id, null),
    account,
    memberships: account.isPlatformAdmin ? [] : membershipsOf(account.id),
  };
}

export function requirePlatformAdmin(request: Request): Guard<Account> {
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
export interface CompanyActor {
  companyId: string;
  account: Account;
  membership: MockMembership;
  permissions: string[];
  canSelfApprove: boolean;
}

/** `permission` null: chỉ cần là thành viên công ty (trang Tổng quan, Việc cần làm) */
export function requireCompany(request: Request, permission: string | null): Guard<CompanyActor> {
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
  const module = permission?.split('.')[0];
  if (module && !context.enabledModules.includes(module as never)) {
    return { ok: false, response: problem(403, 'Phân hệ chưa bật', { code: 'module_disabled' }) };
  }
  if (permission && !context.permissions.includes(permission)) {
    return { ok: false, response: problem(403, 'Không có quyền thực hiện') };
  }
  return {
    ok: true,
    value: {
      companyId: company.id,
      account: token.account,
      membership,
      permissions: context.permissions,
      canSelfApprove: Boolean(context.canSelfApprove),
    },
  };
}

export function writePlatformLog(
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

/**
 * Kiểm thao tác theo bảng chuyển trạng thái (lib/stateMachine.ts) trước khi ghi.
 * Sai trạng thái trả 409 kèm trạng thái hiện tại; thiếu quyền 403; người lập tự duyệt 409; thiếu lý do 422.
 */
export function checkTransition<S extends string, A extends string, R extends OwnedRecord>(
  machine: StateMachine<S, A, R>,
  from: S,
  action: A,
  actor: CompanyActor,
  record: R,
  reason?: string | null,
): Guard<S> {
  const result = machine.check(from, action, {
    actor: {
      accountId: actor.account.id,
      permissions: actor.permissions,
      canSelfApprove: actor.canSelfApprove,
    },
    record,
    reason,
  });
  if (result.ok) return { ok: true, value: result.to };
  const { code } = result;
  if (code === 'forbidden') return { ok: false, response: problem(403, 'Không có quyền', { code }) };
  if (code === 'reason_required') {
    return { ok: false, response: problem(422, 'Thiếu lý do', { code, errors: { reason: 'Nhập lý do' } }) };
  }
  return { ok: false, response: problem(409, 'Không chuyển được trạng thái', { code, current: from }) };
}
