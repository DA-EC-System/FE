import { describe, expect, it } from 'vitest';
import type { SyncRun } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { startedRunId, syncErrorFix, syncErrorTitle, syncRunErrorFix, syncRunHeadline, syncRunState } from './syncRun';

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

  it('không có chỗ sửa riêng mà biết sản phẩm: nút dự phòng mở Thông tin SKU hoặc sản phẩm', () => {
    expect(syncErrorFix({ fix: null, productId: 'p1', variantId: 'v1' }, 'c1')).toEqual({
      label: 'Mở Thông tin SKU',
      href: '/c/c1/catalog/products/p1?spec=v1',
    });
    expect(syncErrorFix({ fix: null, productId: 'p1', variantId: null }, 'c1')).toEqual({
      label: 'Mở sản phẩm',
      href: '/c/c1/catalog/products/p1',
    });
  });
});

describe('syncRunState (hộp đồng bộ ở trang gian hàng)', () => {
  const base = { pending: false, runId: null, current: undefined, currentError: false, latest: undefined };

  it('chưa bấm: dùng lượt gần nhất, đang chạy theo trạng thái lượt', () => {
    expect(syncRunState({ ...base, latest: run() })).toEqual({ run: run(), running: false, readError: false });
    expect(syncRunState({ ...base, latest: run({ status: 'running' }) }).running).toBe(true);
    expect(syncRunState(base)).toEqual({ run: null, running: false, readError: false });
  });

  it('POST xong mà chưa đọc được lượt: vẫn đang chạy, không lấy lượt gần nhất', () => {
    expect(syncRunState({ ...base, runId: 'r2', latest: run() })).toEqual({ run: null, running: true, readError: false });
    expect(syncRunState({ ...base, pending: true, latest: run() }).running).toBe(true);
  });

  it('có runId: chỉ dùng lượt đó', () => {
    const cur = run({ id: 'r2', status: 'queued' });
    expect(syncRunState({ ...base, runId: 'r2', current: cur, latest: run() })).toEqual({ run: cur, running: true, readError: false });
  });

  it('bấm Đồng bộ ở gian hàng A rồi sang B: B không dùng lượt của A, quay về lượt gần nhất của B', () => {
    const started = { shopId: 'A', runId: 'rA' };
    expect(startedRunId(started, 'A')).toBe('rA');
    expect(startedRunId(started, 'B')).toBeNull();
    expect(startedRunId(null, 'A')).toBeNull();
    const latestB = run({ id: 'rB', shopId: 'B' });
    expect(syncRunState({ ...base, runId: startedRunId(started, 'B'), latest: latestB })).toEqual({ run: latestB, running: false, readError: false });
  });

  it('đọc lượt lỗi: báo lỗi, không còn đang chạy', () => {
    expect(syncRunState({ ...base, runId: 'r2', currentError: true })).toEqual({ run: null, running: false, readError: true });
    expect(syncRunState({ ...base, runId: 'r2', currentError: true, current: run({ status: 'running' }) }).running).toBe(false);
  });
});

describe('syncRunErrorFix (lỗi cả lượt)', () => {
  it('mất uỷ quyền, gian hàng ngắt: kết nối lại; lỗi khác hoặc lượt chưa lỗi: không có nút', () => {
    expect(syncRunErrorFix(run({ status: 'failed', error: { code: 'marketplace_unauthorized', message: '' } }), 'c1')).toEqual({
      label: 'Kết nối lại gian hàng',
      href: '/c/c1/channel/shops',
    });
    expect(syncRunErrorFix(run({ status: 'failed', error: { code: 'run_stale', message: '' } }), 'c1')).toBeNull();
    expect(syncRunErrorFix(run(), 'c1')).toBeNull();
  });
});
