import { describe, expect, it } from 'vitest';
import { filenameFromDisposition } from '@/api/report.api';
import type { ShopFigures } from '@/types/report';
import {
  FIGURE_KEYS,
  FIGURE_LABELS,
  REPORT_SOURCE_LABELS,
  channelLabel,
  groupBySource,
  hasCost,
  margin,
  presetOf,
  presetRange,
  rangeSchema,
  sortByFigure,
} from './shared';

const firstError = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.error?.issues[0] && { path: r.error.issues[0].path.join('.'), message: r.error.issues[0].message };

const fig = (over: Partial<ShopFigures> = {}): ShopFigures => ({
  source: 'marketplace',
  shop: { id: 'shp-001', shopName: 'ABC', platform: 'shopee' },
  revenue: 1000,
  cashCollected: 900,
  platformFee: 80,
  paymentFee: 0,
  shippingFee: 20,
  cogs: 500,
  profit: 400,
  feesPending: false,
  ...over,
});

describe('nhãn (AC-C2)', () => {
  it('nguồn', () => {
    expect(REPORT_SOURCE_LABELS).toEqual({ marketplace: 'Sàn TMĐT', inbox: 'Hộp thư', manual: 'Tạo tay' });
  });

  it('cột số giống tiêu đề CSV của BE', () => {
    expect(FIGURE_KEYS.map((k) => FIGURE_LABELS[k])).toEqual([
      'Doanh thu',
      'Tiền đã thu',
      'Phí sàn',
      'Phí cổng',
      'Phí vận chuyển',
      'Giá vốn',
      'Lãi',
    ]);
  });

  it('tên kênh: gian hàng kèm sàn, hộp thư, tạo tay, gian hàng đã xoá', () => {
    expect(channelLabel(fig())).toEqual({ name: 'ABC', platform: 'Shopee' });
    expect(channelLabel(fig({ shop: { id: 'x', shopName: 'Lạ', platform: 'sendo' } }))).toEqual({
      name: 'Lạ',
      platform: 'sendo',
    });
    expect(channelLabel(fig({ source: 'inbox', shop: null })).name).toBe('Hộp thư');
    expect(channelLabel(fig({ source: 'manual', shop: null })).name).toBe('Tạo tay');
    expect(channelLabel(fig({ shop: { id: 'x', shopName: null, platform: null } })).name).toBe('Gian hàng đã xoá');
  });
});

describe('biên lãi, gộp, sắp xếp (AC-B4, AC-B5)', () => {
  it('biên lãi làm tròn một chữ số; doanh thu 0 hoặc không có lãi là gạch', () => {
    expect(margin(400, 1000)).toBe('40,0%');
    expect(margin(1, 3)).toBe('33,3%');
    expect(margin(-120000, 300000)).toBe('-40,0%');
    expect(margin(0, 0)).toBe('—');
    expect(margin(null, 1000)).toBe('—');
  });

  it('gộp theo nguồn bằng phép cộng, giữ thứ tự nguồn', () => {
    const rows = groupBySource([
      fig(),
      fig({ shop: { id: 'shp-002', shopName: 'T', platform: 'tiktok' }, revenue: 500, profit: -10, feesPending: true }),
      fig({ source: 'inbox', shop: null, revenue: 300 }),
    ]);
    expect(rows.map((r) => r.source)).toEqual(['marketplace', 'inbox']);
    expect(rows[0]).toMatchObject({ shop: null, revenue: 1500, cashCollected: 1800, cogs: 1000, profit: 390, feesPending: true });
    expect(rows[1].revenue).toBe(300);
  });

  it('gộp khi không có giá vốn thì vẫn null', () => {
    const [g] = groupBySource([fig({ cogs: null, profit: null }), fig({ cogs: null, profit: null })]);
    expect(g.cogs).toBeNull();
    expect(g.profit).toBeNull();
    expect(hasCost(g)).toBe(false);
    expect(hasCost(fig())).toBe(true);
  });

  it('sắp theo cột số, null xếp cuối', () => {
    const items = [fig({ revenue: 2 }), fig({ revenue: 9 }), fig({ revenue: 5 })];
    expect(sortByFigure(items, 'revenue', 'desc').map((x) => x.revenue)).toEqual([9, 5, 2]);
    expect(sortByFigure(items, 'revenue', 'asc').map((x) => x.revenue)).toEqual([2, 5, 9]);
    const m = [fig({ revenue: 0, profit: 0 }), fig({ revenue: 100, profit: 50 }), fig({ revenue: 100, profit: 10 })];
    expect(sortByFigure(m, 'margin', 'desc').map((x) => x.profit)).toEqual([50, 10, 0]);
  });
});

describe('khoảng ngày (AC-B1)', () => {
  const today = '2026-10-20';
  const schema = rangeSchema(today);

  it('nút nhanh', () => {
    expect(presetRange('7d', today)).toEqual({ from: '2026-10-14', to: today });
    expect(presetRange('30d', today)).toEqual({});
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-10-01', to: today });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('nhận ra nút nhanh từ URL', () => {
    expect(presetOf(undefined, undefined, today)).toBe('30d');
    expect(presetOf('2026-10-14', today, today)).toBe('7d');
    expect(presetOf('2026-09-01', '2026-09-30', today)).toBe('lastMonth');
    expect(presetOf('2026-09-02', '2026-09-30', today)).toBe('custom');
  });

  it('hợp lệ, kể cả đúng 366 ngày và đến ngày ở tương lai', () => {
    expect(schema.safeParse({ from: '2026-10-01', to: '2026-10-01' }).success).toBe(true);
    expect(schema.safeParse({ from: '2025-10-20', to: '2026-10-20' }).success).toBe(true);
    expect(schema.safeParse({ from: '2026-10-01', to: '2026-12-31' }).success).toBe(true);
  });

  it('lỗi dưới đúng ô', () => {
    expect(firstError(schema.safeParse({ from: '2026-10-10', to: '2026-10-01' }))).toEqual({
      path: 'from',
      message: 'Từ ngày phải trước hoặc bằng Đến ngày',
    });
    expect(firstError(schema.safeParse({ from: '2025-10-19', to: '2026-10-20' }))).toEqual({
      path: 'to',
      message: 'Khoảng tối đa 366 ngày',
    });
    expect(firstError(schema.safeParse({ from: '2026-10-21', to: '2026-10-25' }))).toEqual({
      path: 'from',
      message: 'Từ ngày không được sau hôm nay',
    });
    expect(firstError(schema.safeParse({ from: '', to: '2026-10-25' }))?.message).toBe('Chọn từ ngày');
  });
});

describe('tên tệp từ Content-Disposition (AC-X1)', () => {
  it('đọc filename trong ngoặc kép, không ngoặc, filename*', () => {
    expect(filenameFromDisposition('attachment; filename="bao-cao-shops-2026-09-21-2026-10-20.csv"', 'x.csv')).toBe(
      'bao-cao-shops-2026-09-21-2026-10-20.csv',
    );
    expect(filenameFromDisposition('attachment; filename=bao-cao.csv', 'x.csv')).toBe('bao-cao.csv');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''b%C3%A1o-c%C3%A1o.csv; filename=\"bc.csv\"", 'x.csv')).toBe(
      'báo-cáo.csv',
    );
  });

  it('không có tiêu đề thì lấy tên dự phòng', () => {
    expect(filenameFromDisposition(undefined, 'bao-cao-overview.csv')).toBe('bao-cao-overview.csv');
    expect(filenameFromDisposition('attachment', 'bao-cao-overview.csv')).toBe('bao-cao-overview.csv');
  });
});
