import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import { fireMarketplaceEvent, marketplaceEventLog, marketplaceEventTypes } from '../engine/marketplace';
import type { FireMarketplaceEventInput } from '@/types/devMarketplace';
import { API, LATENCY, problem, requireCompany } from './utils';

// ---------- Sàn giả lập (FE#55): chỉ có ở mock, BE không làm route này ----------
// Sự kiện của từng phân hệ đăng ký trong handler của phân hệ đó (gian hàng, listing: channel.ts)

export const devMarketplaceHandlers = [
  http.get(`${API}/dev/marketplace/events`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json({
      types: marketplaceEventTypes(),
      log: marketplaceEventLog(guard.value.companyId),
    });
  }),

  http.post(`${API}/dev/marketplace/events`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json().catch(() => ({}))) as Partial<FireMarketplaceEventInput>;
    const shop = body.shopId
      ? db.shops.find((s) => s.id === body.shopId && s.companyId === companyId)
      : null;
    if (body.shopId && !shop) return problem(404, 'Không tìm thấy gian hàng');
    const result = fireMarketplaceEvent(String(body.type ?? ''), {
      companyId,
      shop: shop ?? null,
      params: body.params ?? {},
    });
    if (!result.ok) return problem(422, result.message, { errors: { type: result.message } });
    return HttpResponse.json(result.entry, { status: 201 });
  }),
];
