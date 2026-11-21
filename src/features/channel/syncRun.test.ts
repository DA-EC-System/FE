import { describe, expect, it } from 'vitest';
import type { SyncRun } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { syncErrorFix, syncErrorTitle, syncRunActive, syncRunHeadline } from './syncRun';

const AT = '2026-11-21T13:15:00.000Z';
const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  id: 'r1',
  shopId: 's1',
  status: 'done',
  requestedAt: AT,
  startedAt: AT,
  finishedAt: AT,
  progress: { processed: 20, total: 20 },
  succeeded: 18,
  failed: 2,
  errors: [],
  error: null,
  ...over,
});

describe('syncRunHeadline (Documents/21 §18.5 SyncRun)', () => {
  it('đang chạy: tiến độ, hoặc đang đọc sàn khi chưa biết tổng', () => {
    expect(syncRunActive(run({ status: 'running' }))).toBe(true);
    expect(syncRunHeadline(run({ status: 'running', progress: { processed: 12, total: 20 } }))).toBe(
      'Đang đồng bộ giá và tồn với sàn… 12 / 20 SKU.',
    );
    expect(syncRunHeadline(run({ status: 'queued', progress: { processed: 0, total: null } }))).toContain('đang đọc trạng thái trên sàn');
  });

  it('xong: số thành công, số lỗi; không có gì cần cập nhật', () => {
    expect(syncRunHeadline(run())).toBe(`Đồng bộ xong lúc ${formatDateTime(AT)}: 18 SKU thành công, 2 SKU lỗi.`);
    expect(syncRunHeadline(run({ failed: 0 }))).toBe(`Đồng bộ xong lúc ${formatDateTime(AT)}: 18 SKU thành công.`);
    expect(syncRunHeadline(run({ succeeded: 0, failed: 0 }))).toContain('không có SKU nào cần cập nhật');
  });

  it('lỗi cả lượt và quá 30 phút', () => {
    expect(syncRunHeadline(run({ status: 'failed', error: { code: 'run_stale', message: '' } }))).toContain('quá 30 phút');
    expect(syncRunHeadline(run({ status: 'failed', error: { code: 'marketplace_unauthorized', message: 'Mất uỷ quyền' } }))).toBe(
      'Đồng bộ không chạy xong: Mất uỷ quyền. Bấm Đồng bộ để thử lại.',
    );
  });
});

describe('dòng lỗi: tên và nút tới chỗ sửa', () => {
  it('tên theo sản phẩm, biến thể; không có thì SKU', () => {
    expect(syncErrorTitle({ productName: 'Áo thun', attributesLabel: 'Đen / L', sku: 'X' })).toBe('Áo thun · Đen / L');
    expect(syncErrorTitle({ productName: null, attributesLabel: null, sku: 'SON-CAM' })).toBe('SON-CAM');
  });

  it('mỗi fix một chỗ sửa', () => {
    expect(syncErrorFix({ fix: 'variant_price', productId: 'p1', variantId: 'v1' }, 'c1')).toEqual({
      label: 'Mở Thông tin SKU, ô Giá muốn thực nhận',
      href: '/c/c1/catalog/products/p1?spec=v1',
    });
    expect(syncErrorFix({ fix: 'variant_price', productId: null, variantId: 'v1' }, 'c1')).toBeNull();
    expect(syncErrorFix({ fix: 'stocktake', productId: null, variantId: null }, 'c1')?.href).toBe('/c/c1/inventory/documents/new?type=stocktake');
    expect(syncErrorFix({ fix: 'platform', productId: null, variantId: null }, 'c1')?.href).toBeNull();
    expect(syncErrorFix({ fix: null, productId: null, variantId: null }, 'c1')).toBeNull();
  });
});
