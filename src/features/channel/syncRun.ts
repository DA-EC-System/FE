import { ROUTES } from '@/router/routes';
import type { SyncRun, SyncRunError } from '@/types/shop';
import { formatDateTime } from '@/utils/format';

/**
 * Kết quả lượt đồng bộ ở trang gian hàng (Documents/21 §18.5 `SyncRun`; bản phác
 * `.claude/issues/trang-san-pham-tab/design/v2.html` màn 2; CLAUDE.md "Lỗi phải chỉ chỗ sửa").
 */
export const syncRunActive = (run: Pick<SyncRun, 'status'> | null | undefined) => run?.status === 'queued' || run?.status === 'running';

/** Câu chính của hộp kết quả */
export function syncRunHeadline(run: SyncRun): string {
  if (syncRunActive(run)) {
    const { processed, total } = run.progress;
    return total === null
      ? 'Đang đồng bộ giá và tồn với sàn… đang đọc trạng thái trên sàn.'
      : `Đang đồng bộ giá và tồn với sàn… ${processed} / ${total} SKU.`;
  }
  if (run.status === 'failed') {
    if (run.error?.code === 'run_stale') return 'Lượt đồng bộ quá 30 phút chưa xong. Bấm Đồng bộ để chạy lại.';
    return `Đồng bộ không chạy xong: ${run.error?.message ?? 'sàn báo lỗi'}. Bấm Đồng bộ để thử lại.`;
  }
  const at = run.finishedAt ? ` lúc ${formatDateTime(run.finishedAt)}` : '';
  if (!run.succeeded && !run.failed) return `Đồng bộ xong${at}: không có SKU nào cần cập nhật.`;
  return run.failed
    ? `Đồng bộ xong${at}: ${run.succeeded} SKU thành công, ${run.failed} SKU lỗi.`
    : `Đồng bộ xong${at}: ${run.succeeded} SKU thành công.`;
}

/** "Áo thun · Đen / L" hoặc SKU người bán */
export function syncErrorTitle(e: Pick<SyncRunError, 'productName' | 'attributesLabel' | 'sku'>): string {
  if (e.productName) return [e.productName, e.attributesLabel].filter(Boolean).join(' · ');
  return e.sku ?? 'SKU';
}

/** Nút tới chỗ sửa của một dòng lỗi; `href` null là việc làm ngoài app (trang người bán của sàn) */
export function syncErrorFix(
  e: Pick<SyncRunError, 'fix' | 'productId' | 'variantId'>,
  companyId: string,
): { label: string; href: string | null } | null {
  switch (e.fix) {
    case 'variant_price':
      return e.productId && e.variantId
        ? { label: 'Mở Thông tin SKU, ô Giá muốn thực nhận', href: ROUTES.company.catalogProduct(companyId, e.productId, e.variantId) }
        : null;
    case 'stocktake':
      return { label: 'Tạo phiếu kiểm kê', href: ROUTES.company.inventoryDocNew(companyId, 'stocktake') };
    case 'shop_reconnect':
      return { label: 'Kết nối lại gian hàng', href: ROUTES.company.shops(companyId) };
    case 'platform':
      return { label: 'Sửa trên trang người bán của sàn', href: null };
    default:
      return null;
  }
}

/** Lỗi cả lượt do mất uỷ quyền hay gian hàng ngắt (Documents/21 §18.5 `error`): nút kết nối lại gian hàng */
export function syncRunErrorFix(run: Pick<SyncRun, 'status' | 'error'>, companyId: string): { label: string; href: string } | null {
  if (run.status !== 'failed' || !run.error) return null;
  return run.error.code === 'marketplace_unauthorized' || run.error.code === 'shop_not_connected'
    ? { label: 'Kết nối lại gian hàng', href: ROUTES.company.shops(companyId) }
    : null;
}
