import dayjs from 'dayjs';
import { z } from 'zod';
import { platformLabel } from '@/features/channel/shopSchemas';
import type { Marketplace } from '@/types/shop';
import type { ReportFigures, ShopFigures } from '@/types/report';
import type { OrderSource } from '@/types/sales';

// ---------- Nhãn (AC-C2) ----------

export const REPORT_SOURCE_LABELS: Record<OrderSource, string> = {
  marketplace: 'Sàn TMĐT',
  inbox: 'Hộp thư',
  manual: 'Tạo tay',
};

export type FigureKey = 'revenue' | 'cashCollected' | 'platformFee' | 'paymentFee' | 'shippingFee' | 'cogs' | 'profit';

/** Cột số theo thứ tự tiêu đề CSV của BE */
export const FIGURE_LABELS: Record<FigureKey, string> = {
  revenue: 'Doanh thu',
  cashCollected: 'Tiền đã thu',
  platformFee: 'Phí sàn',
  paymentFee: 'Phí cổng',
  shippingFee: 'Phí vận chuyển',
  cogs: 'Giá vốn',
  profit: 'Lãi',
};

export const FIGURE_KEYS = Object.keys(FIGURE_LABELS) as FigureKey[];

/** Giá vốn, Lãi là `null` khi người xem thiếu `inventory.cost.view`: ẩn theo dữ liệu, không theo quyền ở FE (AC-B5) */
export const hasCost = (f: Pick<ReportFigures, 'cogs' | 'profit'> | undefined) =>
  Boolean(f && f.cogs !== null && f.profit !== null);

/** Tên kênh trong bảng gian hàng (AC-B4) */
export function channelLabel(item: Pick<ShopFigures, 'source' | 'shop'>): { name: string; platform: string | null } {
  if (item.source !== 'marketplace' || !item.shop) return { name: REPORT_SOURCE_LABELS[item.source], platform: null };
  if (item.shop.shopName === null) return { name: 'Gian hàng đã xoá', platform: null };
  const platform = item.shop.platform;
  return { name: item.shop.shopName, platform: platform ? (platformLabel(platform as Marketplace) ?? platform) : null };
}

// ---------- Tính toán ----------

const percent = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Biên lãi `profit / revenue`, một chữ số thập phân; doanh thu 0 hoặc không có lãi thì "—" (AC-B4) */
export function margin(profit: number | null, revenue: number): string {
  if (profit === null || revenue === 0) return '—';
  return `${percent.format((profit / revenue) * 100)}%`;
}

const MONEY = ['revenue', 'cashCollected', 'platformFee', 'paymentFee', 'shippingFee'] as const;

/** Gộp các dòng cùng nguồn bằng phép cộng (T28); thứ tự nguồn giữ như BE trả */
export function groupBySource(items: ShopFigures[]): ShopFigures[] {
  const groups = new Map<OrderSource, ShopFigures>();
  for (const item of items) {
    const g = groups.get(item.source);
    if (!g) {
      groups.set(item.source, { ...item, shop: null });
      continue;
    }
    for (const k of MONEY) g[k] += item[k];
    g.cogs = g.cogs === null || item.cogs === null ? null : g.cogs + item.cogs;
    g.profit = g.profit === null || item.profit === null ? null : g.profit + item.profit;
    g.feesPending ||= item.feesPending;
  }
  return [...groups.values()];
}

export type SortDir = 'asc' | 'desc';

/** Sắp theo một cột số; `null` (không có giá vốn) xếp cuối */
export function sortByFigure<T extends ReportFigures>(items: T[], key: FigureKey | 'margin', dir: SortDir): T[] {
  const value = (f: T) => (key === 'margin' ? (f.profit === null || f.revenue === 0 ? null : f.profit / f.revenue) : f[key]);
  return [...items].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    return dir === 'asc' ? va - vb : vb - va;
  });
}

// ---------- Khoảng ngày (AC-B1) ----------

export const MAX_RANGE_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Hôm nay theo giờ VN (C6), yyyy-mm-dd */
export const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Số ngày tính cả hai đầu, như `daysBetween` của BE */
export const daysBetween = (from: string, to: string) => dayjs(to).diff(dayjs(from), 'day') + 1;

export type RangePreset = '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom';

export const PRESET_LABELS: Record<RangePreset, string> = {
  '7d': '7 ngày',
  '30d': '30 ngày',
  thisMonth: 'Tháng này',
  lastMonth: 'Tháng trước',
  custom: 'Tuỳ chọn',
};

/** Khoảng của nút nhanh; `30d` là mặc định của BE nên không gửi `from`/`to` */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: string): { from?: string; to?: string } {
  const t = dayjs(today);
  switch (preset) {
    case '7d':
      return { from: t.subtract(6, 'day').format('YYYY-MM-DD'), to: today };
    case '30d':
      return {};
    case 'thisMonth':
      return { from: t.startOf('month').format('YYYY-MM-DD'), to: today };
    case 'lastMonth': {
      const m = t.subtract(1, 'month');
      return { from: m.startOf('month').format('YYYY-MM-DD'), to: m.endOf('month').format('YYYY-MM-DD') };
    }
  }
}

/** Nút nhanh đang chọn theo `from`/`to` trên URL */
export function presetOf(from: string | undefined, to: string | undefined, today: string): RangePreset {
  if (!from && !to) return '30d';
  for (const p of ['7d', 'thisMonth', 'lastMonth'] as const) {
    const r = presetRange(p, today);
    if (r.from === from && r.to === to) return p;
  }
  return 'custom';
}

/** Ô Tuỳ chọn: lỗi dưới đúng ô, không gọi API khi sai */
export const rangeSchema = (today: string) =>
  z
    .object({
      from: z.string().refine((v) => DATE_RE.test(v) && dayjs(v).isValid(), 'Chọn từ ngày'),
      to: z.string().refine((v) => DATE_RE.test(v) && dayjs(v).isValid(), 'Chọn đến ngày'),
    })
    .superRefine(({ from, to }, ctx) => {
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) return;
      if (from > today) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Từ ngày không được sau hôm nay' });
      else if (from > to) {
        ctx.addIssue({ code: 'custom', path: ['from'], message: 'Từ ngày phải trước hoặc bằng Đến ngày' });
      } else if (daysBetween(from, to) > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: `Khoảng tối đa ${MAX_RANGE_DAYS} ngày` });
      }
    });
export type RangeForm = z.input<ReturnType<typeof rangeSchema>>;
