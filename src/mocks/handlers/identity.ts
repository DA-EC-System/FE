import { http, HttpResponse, delay } from 'msw';
import { CEO_ROLE_ID, db, passwords, permissionCatalog, type MockMembership, type MockRole } from '../db';
import type { AuditAction } from '@/types/companySettings';
import type { InviteStaffInput, InviteStaffResult, Role, RoleInput, StaffMember } from '@/types/identity';
import { PERMISSIONS } from '@/utils/permissions';
import { API, CompanyActor, LATENCY, lag, enabledModulesOf, pageParams, paginate, problem, requireCompany, rolesOfMember } from './utils';

// ---------- Identity: nhân viên và vai trò của công ty đang chọn (UC-PI-05, UC-PI-06) ----------
export function companyRoles(companyId: string): MockRole[] {
  return db.roles.filter((r) => r.companyId === null || r.companyId === companyId);
}

export function toRole(r: MockRole, companyId: string): Role {
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

export function toStaff(m: MockMembership): StaffMember {
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
export function lacking(actor: CompanyActor, permissions: string[]) {
  const enabled = enabledModulesOf(actor.companyId);
  return permissions.filter(
    (p) => enabled.includes(p.split('.')[0]) && !actor.permissions.includes(p),
  );
}

export function notHeld() {
  return problem(403, 'Có quyền bạn không có', {
    code: 'permission_not_held',
    detail: 'Chỉ cấp được những quyền bạn đang có.',
  });
}

export function versionConflict<T>(current: T, detail: string) {
  return problem(409, 'Dữ liệu vừa được người khác sửa', {
    code: 'version_conflict',
    detail,
    current,
  });
}

/** Ghi audit.audit_logs cho mọi thao tác ghi trong công ty (UC-PI-07) */
export function writeCompanyLog(
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

export const roleEntity = (r: MockRole) => ({ type: 'access.roles', id: r.id, label: r.name });
export const roleSnapshot = (r: MockRole) => ({ name: r.name, permissions: [...r.permissions] });
export const staffEntity = (m: MockMembership) => ({
  type: 'staff.memberships',
  id: m.accountId,
  label: toStaff(m).email,
});
export function staffSnapshot(m: MockMembership) {
  const s = toStaff(m);
  return { email: s.email, fullName: s.fullName, roles: s.roles.map((r) => r.name), status: s.status };
}

/**
 * Kiểm danh sách vai trò sẽ gán: thuộc công ty, không phải CEO, và mọi vai trò được thêm
 * hoặc gỡ đều chỉ gồm quyền người thao tác đang có.
 */
export function checkRoleAssignment(
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

export function findMember(actor: CompanyActor, accountId: unknown) {
  return db.memberships.find((m) => m.companyId === actor.companyId && m.accountId === accountId);
}

/** UC-PI-05: không đổi vai trò hay khoá tài khoản CEO, hay của chính mình */
export function protectedMember(actor: CompanyActor, m: MockMembership) {
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

export function roleNameTaken(companyId: string, name: string, exceptId?: string) {
  const key = name.trim().toLocaleLowerCase('vi');
  return companyRoles(companyId).some(
    (r) => r.id !== exceptId && r.name.toLocaleLowerCase('vi') === key,
  );
}

export function validateRoleInput(body: RoleInput): Response | null {
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

export const identityHandlers = [
  http.get(`${API}/identity/permissions`, async ({ request }) => {
    await delay(lag(100));
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
