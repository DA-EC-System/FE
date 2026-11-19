/**
 * Hồ sơ công ty đang chọn (FE#267, commerio-backend#292): GET/PUT /platform/company.
 * Giống BE core/platform/service/company-profile.ts: ô trống theo tên, địa chỉ công ty; chỉ ghi ô đổi;
 * không ô nào đổi thì không tăng version, không ghi nhật ký.
 */
import { http, HttpResponse, delay } from 'msw';
import type { CompanyProfile, UpdateCompanyProfileInput } from '@/types/companySettings';
import { PERMISSIONS } from '@/utils/permissions';
import { db } from '../db';
import { COMPANY_ADDRESSES } from '../platformCategoryData';
import { API, LATENCY, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';

type ProfileFields = Pick<CompanyProfile, 'address' | 'responsibleName' | 'responsibleAddress' | 'version'>;
const FIELDS = ['address', 'responsibleName', 'responsibleAddress'] as const;
const MAX = 500;

const profiles = new Map<string, ProfileFields>();

function fieldsOf(companyId: string): ProfileFields {
  let p = profiles.get(companyId);
  if (!p) {
    p = { address: COMPANY_ADDRESSES[companyId] ?? null, responsibleName: null, responsibleAddress: null, version: 1 };
    profiles.set(companyId, p);
  }
  return p;
}

/** Hồ sơ hiệu lực; null khi không có công ty */
export function companyProfileOf(companyId: string): CompanyProfile | null {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) return null;
  const p = fieldsOf(companyId);
  return {
    id: company.id,
    name: company.name,
    taxCode: company.taxCode,
    ...p,
    effectiveResponsible: { name: p.responsibleName ?? company.name, address: p.responsibleAddress ?? p.address },
  };
}

/** Cắt khoảng trắng; chuỗi rỗng hay dài quá 500 thì báo lỗi như schema BE (min 1, max 500) */
function validate(body: Partial<UpdateCompanyProfileInput>) {
  const errors: Record<string, string> = {};
  const patch: Partial<Record<(typeof FIELDS)[number], string | null>> = {};
  for (const k of FIELDS) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === null) {
      patch[k] = null;
      continue;
    }
    const t = String(v).trim();
    if (!t) errors[k] = 'Không được để trống';
    else if (t.length > MAX) errors[k] = `Tối đa ${MAX} ký tự`;
    else patch[k] = t;
  }
  return { errors, patch };
}

export const companyProfileHandlers = [
  http.get(`${API}/platform/company`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.companyManage);
    if (!guard.ok) return guard.response;
    const profile = companyProfileOf(guard.value.companyId);
    if (!profile) return problem(404, 'Không tìm thấy công ty', { code: 'not_found' });
    return HttpResponse.json(profile);
  }),

  http.put(`${API}/platform/company`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.companyManage);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    const current = companyProfileOf(actor.companyId);
    if (!current) return problem(404, 'Không tìm thấy công ty', { code: 'not_found' });
    const body = (await request.json()) as Partial<UpdateCompanyProfileInput>;
    if (typeof body.version !== 'number') {
      return problem(422, 'Dữ liệu không hợp lệ', { code: 'validation_failed', errors: { version: 'Bắt buộc' } });
    }
    const { errors, patch } = validate(body);
    if (Object.keys(errors).length > 0) {
      return problem(422, 'Dữ liệu không hợp lệ', { code: 'validation_failed', errors });
    }
    const fields = fieldsOf(actor.companyId);
    const keys = FIELDS.filter((k) => k in patch && patch[k] !== fields[k]);
    if (keys.length === 0 && fields.version === body.version) return HttpResponse.json(current);
    if (fields.version !== body.version) {
      return versionConflict(current, 'Hồ sơ công ty vừa được đổi ở một phiên khác');
    }
    const before = Object.fromEntries(keys.map((k) => [k, fields[k]]));
    const after = Object.fromEntries(keys.map((k) => [k, patch[k] ?? null]));
    for (const k of keys) fields[k] = patch[k] ?? null;
    fields.version += 1;
    writeCompanyLog(actor, 'update', { type: 'core.companies', id: current.id, label: current.name }, before, after);
    return HttpResponse.json(companyProfileOf(actor.companyId));
  }),
];
