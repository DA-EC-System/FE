import { useNavigate } from 'react-router-dom';
import { PlatformDetail } from '@/components/common/PlatformDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { onPlatform } from '@/lib/machines/channel';
import { ROUTES } from '@/router/routes';
import type { ListingRow, PendingMapping } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import {
  listingStatusHint,
  outsideChangeHint,
  outsideChangeLabel,
  pendingRevisionHint,
  pendingRevisionLabel,
  isWeightError,
  pushErrorText,
  SPEC_FIX_CODES,
} from './listingPush';
import { stockDriftLabel, syncLine } from './listingSync';
import { LISTING_STATUS_LABELS, LISTING_STATUS_VARIANTS } from './shopSchemas';

/** Lỗi đẩy của lượt vừa bấm; giữ `code` để gắn lối sửa (vd mã trong `SPEC_FIX_CODES`) */
export interface PushError {
  code?: string;
  message: string;
}

/** Lỗi đẩy sửa được trong trang sản phẩm: hiện lối sang trang đó (FE#261) */
const PRODUCT_FIX_CODES = new Set<string | undefined>(['images_missing', 'size_chart_missing', 'listing_check_failed']);

interface Props {
  row: ListingRow;
  /** Lỗi đẩy của lượt vừa bấm cho biến thể này */
  pushError?: PushError;
  companyId: string;
  canManage: boolean;
  canEditProduct: boolean;
  /** Sàn duyệt listing (Lazada): đổi câu tooltip trạng thái */
  listingReview: boolean;
  /** Đích của ghép chờ CEO duyệt: SKU biến thể hoặc "Không quản tồn" */
  pendingTarget: (p: PendingMapping) => string;
  /** Gian hàng ở sàn có thông tin sàn của sản phẩm (Lazada, TikTok; commerio-backend#400) */
  specFixable: boolean;
  /** Mở trang đẩy lên sàn của sản phẩm; `fill` là bổ sung thông tin cho listing đã lên sàn */
  onOpenSpec: (fill?: boolean) => void;
}

/**
 * Cột Trạng thái của bảng listing (FE#312), ba tầng từ trên xuống:
 * 1. một nhãn trạng thái listing (hoặc lỗi đẩy của lượt vừa bấm);
 * 2. nhãn cần xử lý, chỉ khi có: chờ duyệt ghép, lý do từ chối, lỗi đẩy, đổi ngoài app, bản sửa, ẩn, Lệch tồn, lỗi cập nhật tồn/giá;
 * 3. một dòng đồng bộ chữ nhỏ (`syncLine`) khi listing ở trên sàn.
 */
export function ListingStatusCell({
  row: r,
  pushError: err,
  companyId,
  canManage,
  canEditProduct,
  listingReview,
  pendingTarget,
  specFixable,
  onOpenSpec,
}: Props) {
  const canFixSpec = canManage && specFixable;
  if (err) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="text-destructive" data-testid="push-error">
          {err.message}
        </span>
        {err.code && SPEC_FIX_CODES.has(err.code) && canFixSpec && (
          <SpecLink label="Sửa thông tin sàn" onClick={() => onOpenSpec()} />
        )}
        {PRODUCT_FIX_CODES.has(err.code) && canEditProduct && <EditProductLink companyId={companyId} productId={r.productId} />}
        {isWeightError(err) && canEditProduct && (
          <EditProductLink companyId={companyId} productId={r.productId} spec={r.variantId} label="Sửa cân nặng" />
        )}
      </div>
    );
  }
  const l = r.listing;
  if (!l) return <Badge variant="info">Chưa lên sàn</Badge>;
  const live = onPlatform(l.status);
  const pushErr = (l.status === 'push_failed' || l.status === 'pushing') && l.pushError ? pushErrorText(l.pushError) : null;
  const note =
    l.status === 'rejected'
      ? l.rejectReason
      : pushErr
        ? l.status === 'pushing'
          ? `Đang thử lại (${l.pushAttempts} lần): ${pushErr.text}`
          : pushErr.text
        : null;
  return (
    <div className="grid justify-items-start gap-1">
      {/* Tầng 1: trạng thái listing */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={LISTING_STATUS_VARIANTS[l.status]}
            data-testid="listing-status"
            tabIndex={0}
            aria-describedby={`listing-hint-${r.variantId}`}
          >
            {LISTING_STATUS_LABELS[l.status]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent id={`listing-hint-${r.variantId}`} className="max-w-64" data-testid="listing-hint">
          {listingStatusHint(l, listingReview)}
        </TooltipContent>
      </Tooltip>

      {/* Tầng 2: cần xử lý */}
      {l.pendingMapping && (
        <PendingBadge id={`pending-${r.variantId}`} pending={l.pendingMapping} target={pendingTarget(l.pendingMapping)} />
      )}
      {note && (
        <span className="text-xs text-destructive" data-testid="listing-note">
          {note}
        </span>
      )}
      <PlatformDetail text={pushErr?.platformMessage} />
      {l.status === 'push_failed' && l.pushError && PRODUCT_FIX_CODES.has(l.pushError.code) && canEditProduct && (
        <EditProductLink companyId={companyId} productId={r.productId} />
      )}
      {l.status === 'push_failed' && isWeightError(l.pushError) && canEditProduct && (
        <EditProductLink companyId={companyId} productId={r.productId} spec={r.variantId} label="Sửa cân nặng" />
      )}
      {l.status === 'push_failed' && l.pushError && SPEC_FIX_CODES.has(l.pushError.code) && canFixSpec && (
        <SpecLink label="Sửa thông tin sàn" onClick={() => onOpenSpec()} />
      )}
      {live && r.specStatus !== 'complete' && canFixSpec && (
        <SpecLink label="Bổ sung thông tin sàn" onClick={() => onOpenSpec(true)} testId="fill-spec" />
      )}
      {l.outsideChange && (
        <SyncBadge
          id={`outside-change-${r.variantId}`}
          variant="warning"
          label={outsideChangeLabel(l.outsideChange)}
          hint={outsideChangeHint(l.outsideChange)}
          testId="outside-change"
        />
      )}
      {l.pendingRevision && (
        <SyncBadge
          id={`pending-revision-${r.variantId}`}
          variant={l.pendingRevision.status === 'failed' ? 'destructive' : 'secondary'}
          label={pendingRevisionLabel(l.pendingRevision)}
          hint={pendingRevisionHint(l.pendingRevision)}
          testId="pending-revision"
        />
      )}
      {l.pendingRevision?.status === 'failed' && (
        <span className="text-xs text-destructive" data-testid="revision-reason">
          {l.pendingRevision.rejectReason ? `Sàn báo: ${l.pendingRevision.rejectReason}` : 'Sàn không nêu lý do'}
        </span>
      )}
      {l.status === 'hidden' && !l.outsideChange && l.hiddenBy !== 'zero_stock' && (
        <SyncBadge
          id={`hidden-paused-${r.variantId}`}
          variant="secondary"
          label="Vì SKU tạm ngừng"
          hint="Bỏ tạm ngừng ở trang sản phẩm thì SKU tự hiện lại trên sàn. Không ẩn hoặc hiện tay ở đây."
          testId="hidden-paused"
        />
      )}
      {l.status === 'hidden' && l.hiddenBy === 'zero_stock' && (
        <SyncBadge
          id={`hidden-zero-${r.variantId}`}
          variant="secondary"
          label="Đang ẩn bằng tồn 0"
          hint="Sàn không ẩn riêng từng phân loại nên Commerio đẩy tồn 0 để khách không đặt được SKU này."
          testId="hidden-zero"
        />
      )}
      {live && l.stockSync === 'error' && (
        <SyncBadge
          id={`stock-drift-${r.variantId}`}
          variant="destructive"
          label={stockDriftLabel(l.platformStock)}
          hint="Số tồn trên sàn khác Commerio hai lượt đối chiếu liền. Lượt đẩy tồn sau sẽ ghi đè số trên sàn."
          testId="stock-sync"
        />
      )}
      {/* Lỗi đẩy của riêng SKU này: câu của sàn hiện nguyên văn trong tooltip (§18.4, §18.6.6) */}
      {[
        { key: 'stock', label: 'Cập nhật tồn lên sàn lỗi', err: l.stockSyncError },
        { key: 'price', label: 'Đẩy giá lỗi', err: l.priceSyncError },
      ].map(
        ({ key, label, err }) =>
          err && (
            <SyncBadge
              key={key}
              id={`sync-error-${key}-${r.variantId}`}
              variant="destructive"
              label={label}
              hint={`${err.message} · ${formatDateTime(err.at)}`}
              testId="sync-error"
            />
          ),
      )}
      {l.qcAlert && (
        <span className="text-xs text-warning" data-testid="qc-alert">
          Sàn cảnh báo QC: {l.qcAlert.reason}
        </span>
      )}

      {/* Tầng 3: một dòng đồng bộ giá và tồn */}
      {live && (
        <span className="text-xs text-muted-foreground" data-testid="sync-line">
          {syncLine(l)}
        </span>
      )}
    </div>
  );
}

/** Lối sang trang đẩy lên sàn của sản phẩm để sửa hoặc bổ sung thông tin sàn (commerio-backend#400) */
function SpecLink({ label, onClick, testId = 'open-spec' }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    >
      {label}
    </Button>
  );
}

/** Lối sang trang sản phẩm; `spec`: mở luôn hộp Thông tin SKU của biến thể (Sửa cân nặng, FE#326) */
export function EditProductLink({
  companyId,
  productId,
  spec,
  label = 'Sửa sản phẩm',
}: {
  companyId: string;
  productId: string;
  spec?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={(e) => {
        e.stopPropagation();
        navigate(ROUTES.company.catalogProduct(companyId, productId, spec));
      }}
      data-testid={spec ? 'edit-weight' : 'edit-product'}
    >
      {label}
    </Button>
  );
}

/** Nhãn "Chờ CEO duyệt" của ghép chờ (§18.6.5): tooltip nêu người xin, lúc xin và đích ghép */
export function PendingBadge({ id, pending, target }: { id: string; pending: PendingMapping; target: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" data-testid="pending-mapping" tabIndex={0} aria-describedby={id}>
          Chờ CEO duyệt
        </Badge>
      </TooltipTrigger>
      <TooltipContent id={id} className="max-w-64" data-testid="pending-mapping-hint">
        {pending.requestedBy.name} xin ghép với {target} · {formatDateTime(pending.requestedAt)}
      </TooltipContent>
    </Tooltip>
  );
}

/** Nhãn cần xử lý của một listing (§18.6.6); rê chuột, Tab tới hoặc chạm để xem lý do */
function SyncBadge({
  id,
  variant,
  label,
  hint,
  testId,
}: {
  id: string;
  variant: 'secondary' | 'destructive' | 'warning';
  label: string;
  hint: string;
  testId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} data-testid={testId} tabIndex={0} aria-describedby={id}>
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent id={id} className="max-w-64" data-testid={`${testId}-hint`}>
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
