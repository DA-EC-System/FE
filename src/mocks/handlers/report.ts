import { http, HttpResponse, delay } from 'msw';
import { PERMISSIONS } from '@/utils/permissions';
import type { OrderSource } from '@/types/sales';
import { reportRows, type MockReportRow } from '../reportData';
import type { DailyFigures, ReportDaily, ReportFigures, ReportOverview } from '@/types/report';
import { API, CompanyActor, Guard, LATENCY, problem, requireCompany } from './utils';
import { vnDate } from './sales';
import { DATE_RE, invalid } from './finance';

// ---------- Số liệu kinh doanh của trang chủ (UC-RP-01; commerio-backend#29). /reports ngoài MVP, gỡ ở FE#249 ----------

export const REPORT_SOURCES: OrderSource[] = ['marketplace', 'inbox', 'manual'];
export const REPORT_MONEY = ['revenue', 'cashCollected', 'platformFee', 'paymentFee', 'shippingFee', 'cogs'] as const;

export const reportAddDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const reportDaysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** `resolveRange` của BE: thiếu cả hai là 30 ngày tới hôm nay, chỉ `to` thì lùi 29 ngày, chỉ `from` thì tới hôm nay */
export function reportRange(url: URL): { ok: true; from: string; to: string } | { ok: false; response: Response } {
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
export function reportFilter(url: URL): { ok: true; source?: OrderSource; shopId?: string } | { ok: false; response: Response } {
  const source = (url.searchParams.get('source') || undefined) as OrderSource | undefined;
  const shopId = url.searchParams.get('shopId') || undefined;
  if (source && !REPORT_SOURCES.includes(source)) return { ok: false, response: invalid({ source: 'Nguồn không hợp lệ' }) };
  if (shopId && source && source !== 'marketplace') {
    return { ok: false, response: invalid({ shopId: 'Gian hàng chỉ đi với nguồn marketplace' }) };
  }
  return shopId ? { ok: true, shopId, source: 'marketplace' } : { ok: true, source };
}

/** Báo cáo cần cả `report.dashboard.view` và `finance.invoice.view` (D18); quyền phân hệ Báo cáo xét trước */
export function requireReport(request: Request, ...more: string[]): Guard<CompanyActor> {
  const guard = requireCompany(request, PERMISSIONS.reportView);
  if (!guard.ok) return guard;
  if ([PERMISSIONS.financeView, ...more].some((p) => !guard.value.permissions.includes(p))) {
    return { ok: false, response: problem(403, 'Không có quyền thực hiện') };
  }
  return guard;
}

export function sumFigures(rows: MockReportRow[], canCost: boolean): ReportFigures {
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

export function reportData(actor: CompanyActor, from: string, to: string, filter: { source?: OrderSource; shopId?: string } = {}) {
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

export function reportOverview(actor: CompanyActor, from: string, to: string): ReportOverview {
  const { rows, asOf, canCost } = reportData(actor, from, to);
  return { from, to, asOf, ...sumFigures(rows, canCost) };
}

export function reportDaily(
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

export const reportHandlers = [
  http.get(`${API}/report/overview`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireReport(request);
    if (!guard.ok) return guard.response;
    const range = reportRange(new URL(request.url));
    if (!range.ok) return range.response;
    return HttpResponse.json(reportOverview(guard.value, range.from, range.to));
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
];
