import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import type { ActorRef, CompanyAuditLog, CompanyAuditLogDetail, CompanyModule, SetModuleInput, SetModuleResult } from '@/types/companySettings';
import { MODULE_LABELS, OPTIONAL_MODULES, type OptionalModuleKey } from '@/utils/modules';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, buildContext, pageParams, paginate, problem, requireCompany } from './utils';
import { writeCompanyLog } from './identity';

// ---------- Phân hệ tuỳ chọn (UC-PI-02) và nhật ký thao tác (UC-PI-07) ----------
export function actorRef(accountId: string | null): ActorRef | null {
  const a = accountId ? db.accounts.find((x) => x.id === accountId) : undefined;
  return a ? { accountId: a.id, email: a.email, fullName: a.fullName } : null;
}

export function moduleHasData(companyId: string, code: OptionalModuleKey) {
  if (code === 'channel') return db.shops.some((s) => s.companyId === companyId);
  return Boolean(db.moduleData[code]?.includes(companyId));
}

export function toCompanyModule(companyId: string, code: OptionalModuleKey): CompanyModule {
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

export function toAuditLog(l: (typeof db.companyAuditLogs)[number]): CompanyAuditLog {
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

export const companySettingsHandlers = [
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
