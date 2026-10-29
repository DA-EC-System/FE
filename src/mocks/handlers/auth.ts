import { http, HttpResponse, delay } from 'msw';
import { CEO_ROLE_ID, db, passwords } from '../db';
import type { ChangePasswordRequest, GoogleLoginRequest, LoginRequest, MeResponse, RegisterCompanyRequest, RegisterCompanyResponse, SelectCompanyResponse } from '@/types/auth';
import { API, LATENCY, lag, REFRESH_COOKIE, buildContext, clearRefreshCookie, loginPayload, makeToken, membershipsOf, passwordChangeRequired, problem, readCookie, readRefresh, readToken, revokedRefresh, setRefreshCookie, writePlatformLog } from './utils';

// ---------- Auth ----------
export const authHandlers = [
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
    await delay(lag(100));
    const account = readRefresh();
    if (!account) {
      return problem(401, 'Phiên đăng nhập đã hết hạn', { code: 'refresh_invalid' });
    }
    return HttpResponse.json({ accessToken: makeToken(account.id, null) });
  }),

  http.post(`${API}/identity/logout`, async () => {
    await delay(lag(100));
    const value = readCookie(REFRESH_COOKIE);
    if (value) revokedRefresh.add(value);
    clearRefreshCookie();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/identity/me`, async ({ request }) => {
    await delay(lag(100));
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
