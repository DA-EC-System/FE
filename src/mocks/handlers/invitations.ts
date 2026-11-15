import { http, HttpResponse, delay } from 'msw';
import { db, passwords, type MockInvitation, type MockMembership } from '../db';
import type { CreatedInvitation, Invitation, JoinVerifyResult } from '@/types/identity';
import { PERMISSIONS } from '@/utils/permissions';
import { BASE_PATH } from '@/utils/env';
import { API, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { checkRoleAssignment, companyRoles, staffEntity, staffSnapshot, toStaff, versionConflict, writeCompanyLog } from './identity';

/**
 * Mời nhân viên bằng link (US-CT-05..07, Documents/21 §3.1).
 * Không có thư: mã OTP luôn là MOCK_OTP và được in ra console.
 */
export const MOCK_OTP = '123456';
const LINK_HOURS = 72;
/** Gửi lại mã sớm hơn khoảng này thì 429 kèm Retry-After; quá MAX_OTP lần thì 429 không kèm */
const OTP_COOLDOWN_S = 30;
const MAX_OTP = 5;

const otpSentAt = new Map<string, number[]>();
/** registrationToken → lời mời và email đã xác minh (BE thật: JWT sống 30 phút) */
const registrations = new Map<string, { invitationId: string; email: string; next: JoinVerifyResult['next'] }>();

const invalidLink = () =>
  problem(410, 'Link mời không hợp lệ', { code: 'invitation_invalid', detail: 'Link mời không hợp lệ hoặc đã hết hạn' });
const linkUsed = () => problem(409, 'Link mời đã được dùng', { code: 'invitation_used', detail: 'Link mời đã được dùng' });

const isExpired = (inv: MockInvitation) => Date.parse(inv.expiresAt) <= Date.now();

function toInvitation(inv: MockInvitation): Invitation {
  const available = companyRoles(inv.companyId);
  const roles = inv.roleIds.flatMap((id) => {
    const r = available.find((x) => x.id === id);
    return r ? [{ id: r.id, name: r.name }] : [];
  });
  const creator = db.accounts.find((a) => a.id === inv.createdBy);
  return {
    id: inv.id,
    status: inv.status,
    expired: (inv.status === 'open' || inv.status === 'claimed' || inv.status === 'pending') && isExpired(inv),
    email: inv.email,
    fullName: inv.fullName,
    roles,
    outdated: roles.length < inv.roleIds.length,
    existingAccount: inv.existingAccount,
    createdBy: { id: inv.createdBy, fullName: creator?.fullName ?? '' },
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    submittedAt: inv.submittedAt,
    decidedAt: inv.decidedAt,
    version: inv.version,
  };
}

/** Link dùng tiếp được cho /join/check, /join/otp, /join/verify */
function usableInvitation(token: unknown): MockInvitation | Response {
  const inv = db.invitations.find((i) => i.token === token);
  // Link đã huỷ báo như link sai (Documents/21 §3.1)
  if (!inv || inv.status === 'revoked') return invalidLink();
  if (inv.status !== 'open' && inv.status !== 'claimed') return linkUsed();
  if (isExpired(inv)) return invalidLink();
  return inv;
}

const isMember = (companyId: string, email: string) => {
  const account = db.accounts.find((a) => a.email === email);
  return Boolean(account && db.memberships.some((m) => m.companyId === companyId && m.accountId === account.id));
};

const alreadyMember = () =>
  problem(409, 'Đã là nhân viên', { code: 'already_member', detail: 'Bạn đã là nhân viên của công ty này' });

export const invitationHandlers = [
  // ---------- Admin: tạo link, xem, duyệt ----------
  http.post(`${API}/identity/invitations`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.staffManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const { roleIds } = (await request.json()) as { roleIds: string[] };
    const rejected = checkRoleAssignment(actor, roleIds);
    if (rejected) return rejected;
    const id = `inv-${Date.now().toString(36)}`;
    const inv: MockInvitation = {
      id,
      companyId: actor.companyId,
      token: `mock-${id}`,
      status: 'open',
      email: null,
      fullName: null,
      roleIds: [...new Set(roleIds)],
      createdBy: actor.account.id,
      createdAt: db.now(),
      expiresAt: new Date(Date.now() + LINK_HOURS * 3600_000).toISOString(),
      submittedAt: null,
      decidedAt: null,
      existingAccount: false,
      otp: null,
      password: null,
      version: 1,
    };
    db.invitations.unshift(inv);
    writeCompanyLog(actor, 'create', { type: 'core.invitations', id, label: 'Link mời' }, null, {
      roles: toInvitation(inv).roles.map((r) => r.name),
    });
    const payload: CreatedInvitation = {
      id,
      link: `${window.location.origin}${BASE_PATH}tham-gia#${inv.token}`,
      expiresAt: inv.expiresAt,
    };
    return HttpResponse.json(payload, { status: 201 });
  }),

  http.get(`${API}/identity/invitations`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.staffView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    // Nhiều trạng thái cách nhau bằng dấu phẩy, vd `open,claimed`
    const statuses = (url.searchParams.get('status') ?? 'pending').split(',');
    const items = db.invitations
      .filter((i) => i.companyId === guard.value.companyId && statuses.includes(i.status))
      .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
      .map(toInvitation);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  ...(['approve', 'reject'] as const).map((action) =>
    http.post(`${API}/identity/invitations/:id/${action}`, async ({ params, request }) => {
      await delay(LATENCY);
      const guard = requireCompany(request, PERMISSIONS.staffManage);
      if (!guard.ok) return guard.response;
      const actor = guard.value;
      const inv = db.invitations.find((i) => i.id === params.id && i.companyId === actor.companyId);
      if (!inv) return problem(404, 'Không tìm thấy', { code: 'not_found', detail: 'Không tìm thấy lời mời' });
      const { version } = (await request.json()) as { version: number };
      if (version !== inv.version || inv.status !== 'pending') {
        return versionConflict(toInvitation(inv), 'Lời mời vừa được người khác cập nhật');
      }
      const label = inv.email ?? inv.id;
      if (action === 'reject') {
        inv.status = 'rejected';
        inv.decidedAt = db.now();
        inv.version += 1;
        writeCompanyLog(actor, 'update', { type: 'core.invitations', id: inv.id, label }, { status: 'pending' }, { status: 'rejected' });
        return HttpResponse.json({ invitation: toInvitation(inv) });
      }

      const snapshot = toInvitation(inv);
      if (snapshot.outdated) {
        return problem(409, 'Vai trò đã đổi', {
          code: 'invitation_outdated',
          detail: 'Có vai trò của lời mời đã bị xoá: từ chối rồi tạo link mới',
        });
      }
      const email = inv.email!;
      if (isMember(actor.companyId, email)) {
        return problem(409, 'Đã là nhân viên', { code: 'already_member', detail: 'Người này đã là nhân viên của công ty' });
      }
      let account = db.accounts.find((a) => a.email === email);
      if (account && !inv.existingAccount) {
        return problem(409, 'Email đã có tài khoản', { code: 'email_taken', detail: 'Email này đã có tài khoản' });
      }
      if (!account) {
        account = {
          id: `acc-${Date.now().toString(36)}`,
          email,
          fullName: inv.fullName ?? email,
          isPlatformAdmin: false,
          mustChangePassword: false,
        };
        db.accounts.push(account);
        passwords[email] = inv.password ?? '';
      }
      const membership: MockMembership = {
        accountId: account.id,
        companyId: actor.companyId,
        roleIds: [...inv.roleIds],
        status: 'active',
        joinedAt: db.now(),
        version: 1,
      };
      db.memberships.push(membership);
      inv.status = 'approved';
      inv.decidedAt = db.now();
      inv.password = null;
      inv.version += 1;
      writeCompanyLog(actor, 'create', staffEntity(membership), null, staffSnapshot(membership));
      return HttpResponse.json({ invitation: toInvitation(inv), member: toStaff(membership) });
    }),
  ),

  // Huỷ link chưa nộp (US-CT-05 AC 5, 6)
  http.post(`${API}/identity/invitations/:id/revoke`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.staffManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const inv = db.invitations.find((i) => i.id === params.id && i.companyId === actor.companyId);
    if (!inv) return problem(404, 'Không tìm thấy', { code: 'not_found', detail: 'Không tìm thấy lời mời' });
    const { version } = (await request.json()) as { version: number };
    if (version !== inv.version || (inv.status !== 'open' && inv.status !== 'claimed')) {
      return versionConflict(toInvitation(inv), 'Lời mời vừa được người khác cập nhật');
    }
    const before = inv.status;
    inv.status = 'revoked';
    inv.decidedAt = db.now();
    inv.otp = null;
    inv.version += 1;
    writeCompanyLog(actor, 'update', { type: 'core.invitations', id: inv.id, label: inv.email ?? 'Link mời' }, { status: before }, { status: 'revoked' });
    return HttpResponse.json({ invitation: toInvitation(inv) });
  }),

  // ---------- Người được mời: công khai, không bao giờ 401 ----------
  http.post(`${API}/identity/join/check`, async ({ request }) => {
    await delay(LATENCY);
    const { token } = (await request.json()) as { token?: string };
    if (!token) return problem(422, 'Dữ liệu không hợp lệ', { errors: { token: 'Thiếu token' } });
    const inv = usableInvitation(token);
    if (inv instanceof Response) return inv;
    const company = db.companies.find((c) => c.id === inv.companyId);
    return HttpResponse.json({ companyName: company?.name ?? '', expiresAt: inv.expiresAt });
  }),

  http.post(`${API}/identity/join/otp`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as { token: string; email: string; fullName: string };
    const inv = usableInvitation(body.token);
    if (inv instanceof Response) return inv;
    const email = body.email?.trim().toLowerCase() ?? '';
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ';
    if ((body.fullName?.trim().length ?? 0) < 2) errors.fullName = 'Họ tên tối thiểu 2 ký tự';
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });

    const sent = otpSentAt.get(inv.id) ?? [];
    if (sent.length >= MAX_OTP) {
      return problem(429, 'Thử quá nhiều lần', {
        code: 'too_many_requests',
        detail: 'Link này đã gửi đủ 5 mã; nhờ Admin tạo link khác',
      });
    }
    const last = sent.at(-1);
    if (last && Date.now() - last < OTP_COOLDOWN_S * 1000) {
      const retryAfter = Math.ceil((OTP_COOLDOWN_S * 1000 - (Date.now() - last)) / 1000);
      return HttpResponse.json(
        { status: 429, title: 'Thử quá nhiều lần', code: 'too_many_requests', detail: `Đợi ${retryAfter} giây rồi xin mã lại` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
    otpSentAt.set(inv.id, [...sent, Date.now()]);
    inv.status = 'claimed';
    inv.email = email;
    inv.fullName = body.fullName.trim();
    inv.otp = MOCK_OTP;
    console.info(`[mock] Mã xác minh gửi ${email}: ${MOCK_OTP}`);
    return HttpResponse.json({}, { status: 202 });
  }),

  http.post(`${API}/identity/join/verify`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as { token: string; email: string; code: string };
    const inv = usableInvitation(body.token);
    if (inv instanceof Response) return inv;
    const email = body.email?.trim().toLowerCase() ?? '';
    if (!inv.otp || inv.email !== email || body.code !== inv.otp) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        errors: { code: 'Mã không đúng hoặc đã hết hạn; sai 5 lần thì xin mã mới' },
      });
    }
    const account = db.accounts.find((a) => a.email === email);
    if (account?.isPlatformAdmin) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { email: 'Email này không dùng để tham gia công ty được' } });
    }
    if (isMember(inv.companyId, email)) return alreadyMember();
    inv.otp = null;
    const next: JoinVerifyResult['next'] = account ? 'sign_in' : 'set_password';
    const registrationToken = `reg-${inv.id}-${Date.now().toString(36)}`;
    registrations.set(registrationToken, { invitationId: inv.id, email, next });
    return HttpResponse.json({ registrationToken, next } satisfies JoinVerifyResult);
  }),

  http.post(`${API}/identity/join/complete`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as { registrationToken: string; password: string; confirmPassword?: string };
    const reg = registrations.get(body.registrationToken);
    if (!reg) {
      return problem(410, 'Phiên đăng ký hết hạn', {
        code: 'registration_expired',
        detail: 'Phiên đăng ký đã hết hạn, hãy nhập lại mã xác minh',
      });
    }
    const inv = db.invitations.find((i) => i.id === reg.invitationId);
    if (!inv || inv.status === 'revoked') return invalidLink();
    if (inv.status !== 'claimed') return linkUsed();
    if (isMember(inv.companyId, reg.email)) return alreadyMember();
    if (reg.next === 'sign_in') {
      if (passwords[reg.email] !== body.password) {
        return problem(422, 'Dữ liệu không hợp lệ', { errors: { password: 'Mật khẩu không đúng' } });
      }
    } else {
      if (!body.password || body.password.length < 8) {
        return problem(422, 'Dữ liệu không hợp lệ', { errors: { password: 'Mật khẩu tối thiểu 8 ký tự' } });
      }
      if (body.confirmPassword === undefined) {
        return problem(422, 'Dữ liệu không hợp lệ', { errors: { confirmPassword: 'Nhập lại mật khẩu' } });
      }
      if (body.confirmPassword !== body.password) {
        return problem(422, 'Dữ liệu không hợp lệ', { errors: { confirmPassword: 'Mật khẩu nhập lại không khớp' } });
      }
      inv.password = body.password;
    }
    registrations.delete(body.registrationToken);
    inv.status = 'pending';
    inv.existingAccount = reg.next === 'sign_in';
    inv.submittedAt = db.now();
    inv.version += 1;
    return HttpResponse.json({ status: 'pending' });
  }),
];
