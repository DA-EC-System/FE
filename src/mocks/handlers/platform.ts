import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import type { CompanyStatus, LockCompanyInput } from '@/types/company';
import type { PlatformOverview } from '@/api/platform.api';
import { OPTIONAL_MODULES } from '@/utils/modules';
import { API, LATENCY, pageParams, paginate, problem, requirePlatformAdmin, writePlatformLog } from './utils';
import { versionConflict } from './identity';

// ---------- Platform (UC-PI-08) ----------
export const platformHandlers = [
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
