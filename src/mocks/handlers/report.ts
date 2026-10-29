import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import type { OrderSource } from '@/types/sales';
import { reportRows, type MockReportRow } from '../reportData';
import type { DailyFigures, ReportDaily, ReportFigures, ReportKind, ReportOverview, ReportShops, ShopFigures } from '@/types/report';
import { API, CompanyActor, Guard, LATENCY, problem, requireCompany } from './utils';
import { vnDate } from './sales';
import { DATE_RE, invalid } from './finance';

// ---------- Báo cáo kinh doanh (UC-RP-01, UC-RP-02; commerio-backend#29) ----------

export const REPORT_SOURCES: OrderSource[] = ['marketplace', 'inbox', 'manual'];
/** Nhãn nguồn trong CSV của BE (`report/domain/csv.ts`) */
export const REPORT_SOURCE_CSV: Record<OrderSource, string> = {
  marketplace: 'Sàn',
  inbox: 'Hộp thư',
  manual: 'Đơn tạo tay',
};
export const REPORT_MONEY = ['revenue', 'cashCollected', 'platformFee', 'paymentFee', 'shippingFee', 'cogs'] as const;
export const REPORT_KINDS: ReportKind[] = ['overview', 'shops', 'daily'];

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

export function reportShopRef(shopId: string): ShopFigures['shop'] {
  const shop = db.shops.find((s) => s.id === shopId);
  return { id: shopId, shopName: shop?.shopName ?? null, platform: shop?.platform ?? null };
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

export function reportShops(actor: CompanyActor, from: string, to: string): ReportShops {
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

export type CsvCell = string | number | null;

/** `csvCell` của BE: chữ bắt đầu bằng `= + - @` thêm nháy, bọc ngoặc kép khi có dấu phẩy, ngoặc kép, xuống dòng */
export function csvCell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function figuresCsv<T extends ReportFigures>(
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
  return `${String.fromCharCode(0xfeff)}${all.map((r) => `${r.map(csvCell).join(',')}\r\n`).join('')}`;
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
