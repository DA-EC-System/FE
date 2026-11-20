import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useApplyCategory, useProductListings } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { ProductSpecResult, Shop, SizeChartRule } from '@/types/shop';
import { CategoryPath } from '@/features/catalog/CategoryPath';
import {
  applyCategoryError,
  categoryDrift,
  categoryPollDelay,
  CEO_ONLY_CATEGORY,
} from '@/features/catalog/platformCategory';

const SELLER_CENTER: Record<string, string> = {
  tiktok: 'https://seller-vn.tiktok.com/',
  lazada: 'https://sellercenter.lazada.vn/',
};

interface Props {
  platform: string;
  label: string;
  companyId: string;
  productId: string;
  shops: Shop[];
  /** Category đang chọn ở bước 1 (có thể chưa lưu) */
  draftPath: string;
  draftCategoryId: string;
  /** Spec đã lưu; null khi chưa lưu lần nào */
  saved: ProductSpecResult;
  sizeChartRule: SizeChartRule | null;
  /** Nạp lại bản nháp khi BE báo `version_conflict` */
  onConflict: (current: ProductSpecResult) => void;
}

/** Đường dẫn category trên sàn; chưa có đường dẫn (cây chưa đồng bộ) thì hiện id */
function RemoteCategory({ path, id, className }: { path: string | null; id: string | null; className?: string }) {
  return path ? (
    <CategoryPath path={path} className={className} />
  ) : (
    <span className={`font-mono text-xs ${className ?? ''}`}>{id}</span>
  );
}

/**
 * Dưới ô category đang chọn: "Trên {sàn} đang ở …", khối đổi category khi category trong Commerio khác trên sàn, và trạng
 * thái lượt đổi (commerio-backend#467, Documents/21 §18.5 `apply-category`)
 */
export function CategoryChangeBlock({
  platform,
  label,
  companyId,
  productId,
  shops,
  draftPath,
  draftCategoryId,
  saved,
  sizeChartRule,
  onConflict,
}: Props) {
  const { companyContext } = useAuth();
  const can = useCan();
  const isCeo = Boolean(companyContext?.roles.includes('CEO'));
  const canManage = can(PERMISSIONS.listingManage);
  const pollFrom = useRef<number | null>(null);
  const { rows, isLoading } = useProductListings(
    shops.map((s) => s.id),
    productId,
    (items) => {
      const now = Date.now();
      const delay = categoryPollDelay(items, pollFrom.current ?? now, now);
      if (delay === false) pollFrom.current = null;
      else pollFrom.current ??= now;
      return delay;
    },
  );
  const apply = useApplyCategory();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dòng "Trên sàn đang ở": các category khác nhau của listing còn bán trên sàn này
  const onPlatform = rows.filter(({ row }) => row.listing?.externalProductId && row.listing.status !== 'delisted');
  const remotes = [
    ...new Map(
      onPlatform
        .map(({ row }) => ({ path: row.externalCategoryPath ?? null, id: row.externalCategoryId ?? null }))
        .filter((c) => c.path || c.id)
        .map((c) => [c.id ?? c.path, c] as const),
    ).values(),
  ];

  const drift = categoryDrift(rows, { id: draftCategoryId, path: draftPath });
  const dirty = !saved.spec || saved.spec.externalCategoryId !== draftCategoryId;
  const changeRows = rows.filter(({ row }) => row.categoryChange);
  const queued = changeRows.filter(({ row }) => row.categoryChange?.status === 'queued');
  const failed = changeRows.filter(({ row }) => row.categoryChange?.status === 'failed');
  const mismatch = changeRows.filter(({ row }) => row.categoryChange?.status === 'mismatch');
  const auditing = onPlatform.filter(({ row }) => row.listing?.pendingRevision?.status === 'auditing');
  const revisionFailed = onPlatform.filter(({ row }) => row.listing?.pendingRevision?.status === 'failed');
  const queuedProducts = new Set(queued.map(({ shopId, row }) => `${shopId}/${row.listing?.externalProductId}`)).size;

  const platformOwned = drift.some((d) => d.platformOwned);
  const ceoBlocked = platformOwned && !isCeo;
  const shopName = (id: string) => shops.find((s) => s.id === id)?.shopName ?? '';

  const confirm = async () => {
    if (!saved.spec) return;
    setError(null);
    try {
      const res = await apply.mutateAsync({ productId, platform, version: saved.spec.version });
      const sent = res.items.filter((i) => !i.code);
      const offline = res.items.filter((i) => i.code === 'shop_not_connected');
      if (sent.length) toast.success(`Đã gửi ${sent.length} sản phẩm lên ${label}`);
      if (offline.length) {
        toast.warning(`${offline.map((i) => i.shopName).join(', ')} chưa kết nối nên chưa gửi được. Kết nối lại rồi bấm lại.`);
      }
      setConfirming(false);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict' && problem.current) onConflict(problem.current as ProductSpecResult);
      if (problem?.code === 'size_chart_missing') setError(problem.code);
      else toast.error(applyCategoryError(problem?.code, label) ?? problemMessage(e));
      setConfirming(false);
    }
  };

  if (isLoading && !rows.length) return null;
  if (!onPlatform.length) return null;

  const showWarning = drift.length > 0;
  return (
    <div className="grid gap-3" data-testid="category-change">
      <p className="text-sm text-muted-foreground">
        Trên {label} đang ở:{' '}
        {remotes.length ? (
          <span className="inline-flex flex-col gap-0.5 align-top">
            {remotes.map((c) => (
              <RemoteCategory key={c.id ?? c.path} path={c.path} id={c.id} className="text-foreground" />
            ))}
          </span>
        ) : (
          <span>chưa rõ (cây category của sàn chưa đồng bộ hoặc sản phẩm chưa có category)</span>
        )}
      </p>

      {queued.length > 0 && (
        <AlertMessage severity="info">
          <span data-testid="category-queued">
            Đang gửi lên {label} ({queuedProducts} sản phẩm)… Trang tự cập nhật khi xong.
          </span>
        </AlertMessage>
      )}
      {queued.length === 0 && auditing.length > 0 && (
        <AlertMessage severity="info">
          {label} đang duyệt bản sửa mới; bản cũ vẫn bán.
        </AlertMessage>
      )}
      {failed.map(({ shopId, row }) => (
        <AlertMessage key={row.variantId} severity="error">
          {shopName(shopId)}: {row.categoryChange?.message ?? 'Sàn không nhận bản đổi category.'}
        </AlertMessage>
      ))}
      {mismatch.map(({ shopId, row }) => (
        <AlertMessage key={row.variantId} severity="warning">
          {shopName(shopId)}: {row.categoryChange?.message ?? 'Sau khi đổi category, sản phẩm trên sàn lệch với Commerio.'}{' '}
          {SELLER_CENTER[platform] && (
            <a className="font-medium underline" href={SELLER_CENTER[platform]} target="_blank" rel="noreferrer">
              Mở Seller Center
            </a>
          )}
        </AlertMessage>
      ))}
      {revisionFailed.map(({ shopId, row }) => (
        <AlertMessage key={`rev-${row.variantId}`} severity="error">
          {shopName(shopId)}: {label} không duyệt bản sửa
          {row.listing?.pendingRevision?.rejectReason ? `: ${row.listing.pendingRevision.rejectReason}` : '.'}
        </AlertMessage>
      ))}
      {error === 'size_chart_missing' && (
        <AlertMessage severity="error">
          Category mới bắt buộc bảng size. Thêm bảng size ở{' '}
          <Link className="font-medium underline" to={ROUTES.company.catalogProduct(companyId, productId)}>
            trang sản phẩm
          </Link>{' '}
          rồi thử lại.
        </AlertMessage>
      )}

      {showWarning && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm" data-testid="category-drift">
          <p className="font-semibold">
            Category trong Commerio khác trên {label} ở {drift.length} sản phẩm.
          </p>
          <p className="mt-1">
            Trong Commerio: <CategoryPath path={draftPath} />
          </p>
          <p>
            Trên {label}: <RemoteCategory path={drift[0]!.fromPath} id={drift[0]!.fromId} />
            {new Set(drift.map((d) => d.fromId ?? d.fromPath)).size > 1 && <span className="text-muted-foreground"> (và category khác)</span>}
          </p>
          <div className="mt-2">
            {ceoBlocked ? (
              <p className="text-muted-foreground">{CEO_ONLY_CATEGORY}.</p>
            ) : !canManage ? (
              <p className="text-muted-foreground">Cần quyền đăng bán để đổi category trên {label}.</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={dirty || queued.length > 0 || apply.isPending}
                onClick={() => setConfirming(true)}
              >
                {failed.length || mismatch.length ? 'Thử lại: ' : ''}Đổi category trên {label}
              </Button>
            )}
            {dirty && !ceoBlocked && canManage && <p className="mt-1 text-xs text-muted-foreground">Lưu thông tin sàn trước.</p>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Đổi category trên ${label}?`}
        confirmLabel="Đổi category"
        loading={apply.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => void confirm()}
        message={
          <div className="grid gap-2 text-sm">
            <p>
              Sang <CategoryPath path={draftPath} /> cho {drift.length} sản phẩm:
            </p>
            <ul className="list-disc pl-5">
              {drift.map((d) => (
                <li key={`${d.shopId}/${d.externalProductId}`}>
                  {shopName(d.shopId)} · <span className="font-mono text-xs">{d.externalProductId}</span> (
                  {d.status === 'live' ? 'đang bán' : 'đang ẩn'})
                </li>
              ))}
            </ul>
            <AlertMessage severity="info">
              {label} sẽ duyệt lại sản phẩm; trong lúc duyệt bản cũ vẫn bán. Commerio chỉ đổi category và attribute, giữ nguyên
              tên, mô tả, ảnh, SKU, giá, tồn trên sàn.
            </AlertMessage>
            {sizeChartRule === 'required' && (
              <AlertMessage severity="warning">
                Category mới bắt buộc bảng size; nếu sản phẩm trên {label} chưa có, Commerio sẽ gửi bảng size của sản phẩm này lên.
              </AlertMessage>
            )}
          </div>
        }
      />
    </div>
  );
}
