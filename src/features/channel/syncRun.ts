import { syncRunActive } from '@/lib/machines/channel';
import { ROUTES } from '@/router/routes';
import type { SyncRun, SyncRunError } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { blockerFix } from './blockerFix';

/**
 * Kết quả lượt đồng bộ ở trang gian hàng (Documents/21 §18.5 `SyncRun`; bản phác
 * `.claude/issues/trang-san-pham-tab/design/v2.html` màn 2; CLAUDE.md "Lỗi phải chỉ chỗ sửa").
 */
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

/** Lượt người vừa bấm Đồng bộ, kèm gian hàng của lượt đó */
export interface StartedRun {
  shopId: string;
  runId: string;
}

/** `runId` của lượt vừa bấm nếu thuộc gian hàng đang mở; gian hàng khác thì null (dùng lượt gần nhất của gian hàng đó) */
export const startedRunId = (started: StartedRun | null, shopId: string): string | null =>
  started && started.shopId === shopId ? started.runId : null;

/**
 * Trạng thái hộp đồng bộ ở trang gian hàng. Đã có `runId` (vừa bấm Đồng bộ) thì chỉ dùng lượt đó, không lấy lượt gần
 * nhất; POST xong mà chưa đọc được lượt thì vẫn là đang chạy. Đọc lượt lỗi thì báo lỗi, không đứng mãi ở "Đang đồng bộ…".
 */
export function syncRunState(input: {
  pending: boolean;
  runId: string | null;
  current: SyncRun | undefined;
  currentError: boolean;
  latest: SyncRun | null | undefined;
}): { run: SyncRun | null; running: boolean; readError: boolean } {
  const run = input.runId ? (input.current ?? null) : (input.latest ?? null);
  const readError = Boolean(input.runId) && input.currentError;
  const running = input.pending || (!readError && ((Boolean(input.runId) && !input.current) || syncRunActive(run)));
  return { run, running, readError };
}

/**
 * Nút tới chỗ sửa của một dòng lỗi; `href` null là việc làm ngoài app (trang người bán của sàn). Không có chỗ sửa riêng
 * mà biết sản phẩm thì mở sản phẩm đó (CLAUDE.md "Lỗi phải chỉ chỗ sửa")
 */
export function syncErrorFix(
  e: Pick<SyncRunError, 'fix' | 'productId' | 'variantId' | 'target'>,
  companyId: string,
  platform?: string | null,
): { label: string; href: string | null } | null {
  const fix = fixOf(e, companyId);
  if (fix || !e.productId) return fix;
  // Chỗ sửa theo `target` (commerio-backend#571, FE#462); phí sàn thì để lối của `fix`
  const byTarget = blockerFix(e.target, { companyId, productId: e.productId, platform, variantId: e.variantId });
  if (byTarget && byTarget.perm !== 'finance') return { label: byTarget.label, href: byTarget.to };
  // Có biến thể thì `?spec=` chọn luôn SKU đó trong bảng biến thể (routes.ts catalogProduct)
  return e.variantId
    ? { label: 'Mở SKU trong bảng biến thể', href: ROUTES.company.catalogProduct(companyId, e.productId, e.variantId) }
    : { label: 'Mở sản phẩm', href: ROUTES.company.catalogProduct(companyId, e.productId) };
}

function fixOf(e: Pick<SyncRunError, 'fix' | 'productId' | 'variantId'>, companyId: string): { label: string; href: string | null } | null {
  switch (e.fix) {
    case 'variant_price':
      return e.productId && e.variantId
        ? {
            label: 'Sửa ô Giá muốn thực nhận của SKU',
            href: ROUTES.company.catalogProduct(companyId, e.productId, e.variantId, 'targetNetPrice'),
          }
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
