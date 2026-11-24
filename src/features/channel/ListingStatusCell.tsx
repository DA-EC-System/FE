import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PlatformDetail } from '@/components/common/PlatformDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { onPlatform } from '@/lib/machines/channel';
import type { BlockerTarget } from '@/types/blocker';
import type { CategoryChange, ListingRow, PendingMapping, SyncError } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import {
  listingStatusHint,
  outsideChangeHint,
  outsideChangeLabel,
  pendingRevisionHint,
  pendingRevisionLabel,
  pushErrorTarget,
  pushErrorText,
  SPEC_FIX_CODES,
  type PushBlockItem,
} from './listingPush';
import { blockerFix, canUseFix } from './blockerFix';
import { stockDriftLabel, syncLine } from './listingSync';
import { LISTING_STATUS_LABELS, LISTING_STATUS_VARIANTS } from './shopSchemas';

/** Lỗi đẩy của lượt vừa bấm: các lý do chặn, mỗi lý do có câu và chỗ sửa (commerio-backend#566) */
export interface PushError {
  blocks: PushBlockItem[];
}

const CATEGORY_CHANGE_LABELS: Record<CategoryChange['status'], string> = {
  queued: 'Đang đổi category',
  failed: 'Đổi category lỗi',
  mismatch: 'Đổi category cần xem lại',
};

function categoryChangeHint(c: CategoryChange) {
  const to = c.toCategoryPath ? ` sang ${c.toCategoryPath}` : '';
  if (c.status === 'queued') return `Đang gửi lên sàn đổi category${to}.`;
  // Câu lỗi đã hiện ngay dưới nhãn (khi có), gợi ý chỉ nói đổi sang đâu và lúc nào
  return `${c.message ? `Đổi category${to}` : 'Sàn không nhận bản đổi category.'} · ${formatDateTime(c.at)}`;
}

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
  /** Sàn và gian hàng của dòng: dựng lối tới tab sàn, trang gian hàng cho nút sửa (FE#462) */
  platform?: string | null;
  shopId?: string;
  /** Sửa được phí sàn: nút Cài phí sàn của lỗi thiếu phí */
  canEditFinance?: boolean;
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
  platform,
  shopId,
  canEditFinance = false,
}: Props) {
  const canFixSpec = canManage && specFixable;
  /** Nút tới chỗ sửa theo `target`; mã thông tin sàn của bản ghi cũ (không có `target`) đi lối Sửa thông tin sàn */
  const fixFor = (target: BlockerTarget | null, code: string | undefined, key: string, variantId = r.variantId) => {
    const fix = blockerFix(target, { companyId, productId: r.productId, platform, shopId, variantId });
    if (fix && canUseFix(fix, { product: canEditProduct, finance: canEditFinance }))
      return <FixLink key={key} label={fix.label} to={fix.to} />;
    if (!target && code && SPEC_FIX_CODES.has(code) && canFixSpec)
      return <SpecLink key={key} label="Sửa thông tin sàn" onClick={() => onOpenSpec()} />;
    return null;
  };
  if (err) {
    return (
      <div className="flex flex-col items-start gap-1" data-testid="push-error">
        {err.blocks.map((b, i) => (
          <div key={`${b.code}-${i}`} className="flex flex-col items-start gap-0.5">
            <span className="text-destructive">{b.label}</span>
            {fixFor(b.target, b.code, 'fix')}
          </div>
        ))}
      </div>
    );
  }
  const l = r.listing;
  if (!l) return <Badge variant="info">Chưa đăng bán</Badge>;
  const live = onPlatform(l.status);
  const pushErr = (l.status === 'push_failed' || l.status === 'pushing') && l.pushError ? pushErrorText(l.pushError) : null;
  const errFix = (e: SyncError | null | undefined, key: string) =>
    e ? fixFor(pushErrorTarget(e), e.code, key, e.variantId ?? r.variantId) : null;
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
            {l.status === 'pushing' && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
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
      {l.status === 'push_failed' && errFix(l.pushError, 'push-fix')}
      <PlatformDetail text={pushErr?.platformMessage} />
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
      {l.categoryChange && (
        <SyncBadge
          id={`category-change-${r.variantId}`}
          variant={l.categoryChange.status === 'failed' ? 'destructive' : l.categoryChange.status === 'mismatch' ? 'warning' : 'secondary'}
          label={CATEGORY_CHANGE_LABELS[l.categoryChange.status]}
          hint={categoryChangeHint(l.categoryChange)}
          testId="category-change"
        />
      )}
      {l.categoryChange && l.categoryChange.status !== 'queued' && l.categoryChange.message && (
        <span className="text-xs text-destructive" data-testid="category-change-message">
          {l.categoryChange.message}
        </span>
      )}
      {l.status === 'hidden' && !l.outsideChange && l.hiddenBy !== 'zero_stock' && (
        <SyncBadge
          id={`hidden-paused-${r.variantId}`}
          variant="secondary"
          label="Vì SKU ngừng bán"
          hint="Bỏ tạm ngừng ở trang sản phẩm thì SKU tự hiện lại trên sàn. Không ẩn hoặc hiện tay ở đây."
          testId="hidden-paused"
        />
      )}
      {l.status === 'hidden' && l.hiddenBy === 'zero_stock' && (
        <SyncBadge
          id={`hidden-zero-${r.variantId}`}
          variant="secondary"
          label="Tạm ẩn (đặt tồn 0)"
          hint="Sàn không ẩn riêng từng phân loại nên Commerio đặt tồn 0 để khách không đặt được SKU này."
          testId="hidden-zero"
        />
      )}
      {live && l.stockSync === 'error' && (
        <SyncBadge
          id={`stock-drift-${r.variantId}`}
          variant="destructive"
          label={stockDriftLabel(l.platformStock)}
          hint="Số tồn trên sàn khác Commerio hai lượt đối chiếu liền. Lượt đồng bộ tồn sau sẽ ghi đè số trên sàn."
          testId="stock-sync"
        />
      )}
      {/* Lỗi đẩy tồn, giá của riêng SKU này: câu BE dựng trong tooltip, mã gốc của sàn trong "Chi tiết từ sàn" (#571) */}
      {[
        { key: 'stock', label: 'Đồng bộ tồn lỗi', err: l.stockSyncError },
        { key: 'price', label: 'Đồng bộ giá lỗi', err: l.priceSyncError },
      ].map(({ key, label, err }) => {
        if (!err) return null;
        const t = pushErrorText(err);
        return (
          <div key={key} className="grid justify-items-start gap-1">
            <SyncBadge
              id={`sync-error-${key}-${r.variantId}`}
              variant="destructive"
              label={label}
              hint={`${t.text} · ${formatDateTime(err.at)}`}
              testId="sync-error"
            />
            {errFix(err, `${key}-fix`)}
            <PlatformDetail text={t.platformMessage} />
          </div>
        );
      })}
      {l.qcAlert && (
        <span className="text-xs text-warning" data-testid="qc-alert">
          Sàn cảnh báo chất lượng (QC): {l.qcAlert.reason}
        </span>
      )}

      {/* Tầng 3: một dòng đồng bộ giá và tồn */}
      {live && (
        <span className="text-xs text-muted-foreground" data-testid="sync-line">
          {syncLine(l, r.lastSyncFailedAt ?? null)}
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

/** Nút tới chỗ sửa của lỗi (FE#462): trang sản phẩm đúng tab, đúng ô; Phí sàn; trang gian hàng */
function FixLink({ label, to }: { label: string; to: string }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={(e) => {
        e.stopPropagation();
        navigate(to);
      }}
      data-testid="error-fix"
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
        {pending.requestedBy.name} xin liên kết với {target} · {formatDateTime(pending.requestedAt)}
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
