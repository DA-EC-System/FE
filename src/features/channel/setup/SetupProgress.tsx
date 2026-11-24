import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Loader2, Lock, XCircle } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { StatusBadge, type StatusMeta } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import type { Shop, ShopSetupStep, ShopSetupStepKey, ShopSetupStepStatus } from '@/types/shop';
import { canRedoStocktake, STOCKTAKE_STATUS_TEXT } from '../shopSchemas';
import { openOrdersSkippedNote, setupRunning } from '../setupDecisions';

const SETUP_STEP_LABEL: Record<ShopSetupStepKey, string> = {
  match: 'Liên kết SKU',
  opening_stock: 'Kiểm kho lần đầu',
  open_orders: 'Đồng bộ đơn đang xử lý',
  allocate: 'Tạm giữ hàng cho đơn sau kiểm kho',
  push_stock: 'Đồng bộ tồn lên sàn',
};
const SETUP_STATUS: Record<ShopSetupStepStatus, StatusMeta> = {
  pending: { label: 'Chờ chạy', variant: 'outline' },
  running: { label: 'Đang chạy', variant: 'info' },
  done: { label: 'Hoàn thành', variant: 'success' },
  failed: { label: 'Thất bại', variant: 'destructive' },
  blocked: { label: 'Chờ bước trước', variant: 'warning' },
};

/**
 * Tiến độ việc nền sau khi hoàn tất thiết lập (Documents/21 §18.7.7; design v2.html s6run). Chuyển từ `ShopSetupPage.tsx`
 * để wizard và trang thiết lập dùng chung; khung (thẻ, nút) do nơi dùng đặt.
 */
export function SetupProgress({ shop, companyId, timedOut }: { shop: Shop; companyId: string; timedOut: boolean }) {
  const steps = shop.setup?.steps ?? [];
  const running = setupRunning(shop);
  const unmatched = shop.setup?.unmatchedCount ?? 0;
  return (
    <div className="grid gap-3">
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {running ? 'Đang chạy...' : steps.length ? 'Ngừng tự cập nhật' : 'Hoàn thành'}
      </span>
      {!steps.length && <p className="text-sm text-muted-foreground">Mọi việc thiết lập đã xong.</p>}
      <ol className="grid gap-2" data-testid="setup-progress">
        {steps.map((st) => (
          <ProgressRow key={st.key} step={st} shop={shop} companyId={companyId} />
        ))}
      </ol>
      {timedOut && running && (
        <AlertMessage severity="warning">
          Tác vụ nền chạy lâu hơn 30 phút nên trang ngừng tự cập nhật. Tải lại trang để xem tiến độ mới.
        </AlertMessage>
      )}
      {unmatched > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="setup-unmatched">
          Còn <b className="text-foreground">{unmatched}</b> SKU sàn chưa liên kết.{' '}
          <Link to={ROUTES.company.shop(companyId, shop.id)} className="text-primary underline-offset-4 hover:underline">
            Liên kết ở trang Listing & giá
          </Link>
        </p>
      )}
    </div>
  );
}

/** Viết thường chữ đầu, giữ nguyên chữ viết tắt như SKU */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function ProgressRow({ step, shop, companyId }: { step: ShopSetupStep; shop: Shop; companyId: string }) {
  const Icon =
    step.status === 'done'
      ? CheckCircle2
      : step.status === 'running'
        ? Loader2
        : step.status === 'failed'
          ? XCircle
          : step.status === 'blocked'
            ? Lock
            : CircleDashed;
  const blockedBy =
    step.blockedBy && step.blockedBy in SETUP_STEP_LABEL
      ? `Chờ bước ${lowerFirst(SETUP_STEP_LABEL[step.blockedBy as ShopSetupStepKey])} xong`
      : step.blockedBy
        ? `Đang chờ: ${step.blockedBy}`
        : null;
  const doc = step.key === 'opening_stock' && step.status !== 'done' ? shop.openingStocktake : null;
  const skippedNote = step.key === 'open_orders' ? openOrdersSkippedNote(shop.setup) : null;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5" data-step={step.key} data-step-status={step.status}>
      <Icon
        className={cn(
          'size-4 shrink-0',
          step.status === 'running' && 'animate-spin text-primary',
          step.status === 'done' && 'text-success',
          step.status === 'failed' && 'text-destructive',
          (step.status === 'pending' || step.status === 'blocked') && 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium">{SETUP_STEP_LABEL[step.key] ?? step.key}</span>
        {blockedBy && <span className="text-xs text-muted-foreground">{blockedBy}</span>}
        {skippedNote && (
          <span className="text-xs text-warning" data-testid="setup-open-orders-skipped">
            {skippedNote}
          </span>
        )}
        {doc && canRedoStocktake(doc.status) ? (
          // Phiếu bị từ chối hoặc đã huỷ không đi tiếp được: nút lập lại nằm trên trang gian hàng (§18.6.11)
          <span className="text-xs text-warning" data-testid="setup-stocktake-redo">
            Phiếu {doc.number} {STOCKTAKE_STATUS_TEXT[doc.status]}.{' '}
            <Link to={ROUTES.company.shop(companyId, shop.id)} className="text-primary underline-offset-4 hover:underline">
              Tạo lại phiếu ở trang gian hàng
            </Link>
          </span>
        ) : (
          doc && (
            <Link to={ROUTES.company.inventoryDoc(companyId, doc.documentId)} className="text-xs text-primary underline-offset-4 hover:underline">
              Mở phiếu kiểm kê đầu kỳ {doc.number}
              {doc.status !== 'draft' && ` (${STOCKTAKE_STATUS_TEXT[doc.status]})`}
            </Link>
          )
        )}
      </span>
      <StatusBadge status={step.status} statuses={SETUP_STATUS} />
    </li>
  );
}
