import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '@/router/routes';
import type { ListingRow, ListingStatus } from '@/types/shop';
import { blockerFix, type BlockerFix, type BlockerFixContext } from './blockerFix';
import { pushErrorTarget, pushErrorText } from './listingPush';

type Row = Pick<ListingRow, 'variantId' | 'productId' | 'sku' | 'listing'> & { shopId?: string; shopName?: string; platform?: string };

interface Ctx {
  companyId: string;
  shopId?: string;
  platform?: string | null;
  shopLabel?: string;
  canFix: boolean;
  /** Trang sản phẩm mở chỗ sửa tại chỗ; trả false thì toast điều hướng theo link */
  onFix?: (to: string) => boolean;
}

/** Một dòng vừa thôi "Đang đăng" trong lượt hỏi lại này */
export interface PushOutcome {
  row: Row;
  status: 'live' | 'under_review' | 'failed';
  /** Câu lỗi (chỉ khi `failed`) */
  text?: string;
  fix?: BlockerFix | null;
}

/** Dòng thôi "Đang đăng" so với lượt trước; lượt nạp đầu (`before` null) không báo */
export function pushOutcomes(
  before: ReadonlyMap<string, ListingStatus> | null,
  rows: readonly Row[],
  keyOf: (r: Row) => string,
  ctx: Ctx,
): PushOutcome[] {
  if (!before) return [];
  const out: PushOutcome[] = [];
  for (const r of rows) {
    const l = r.listing;
    if (!l || before.get(keyOf(r)) !== 'pushing' || l.status === 'pushing') continue;
    if (l.status === 'push_failed' || l.status === 'rejected') {
      const text = l.status === 'rejected' ? (l.rejectReason ?? 'Sàn từ chối sản phẩm.') : l.pushError ? pushErrorText(l.pushError).text : '';
      const fixCtx: BlockerFixContext = {
        companyId: ctx.companyId,
        productId: r.productId,
        platform: r.platform ?? ctx.platform,
        shopId: r.shopId ?? ctx.shopId,
        variantId: l.pushError?.variantId ?? r.variantId,
      };
      // Nút sửa trong toast chỉ cho chỗ sửa ở trang sản phẩm, trang gian hàng (quyền sửa phí kiểm ở ô Trạng thái)
      const found = ctx.canFix ? blockerFix(pushErrorTarget(l.pushError), fixCtx) : null;
      out.push({ row: r, status: 'failed', text, fix: found && found.perm !== 'finance' ? found : null });
    } else if (l.status === 'under_review') out.push({ row: r, status: 'under_review' });
    else if (l.status === 'live') out.push({ row: r, status: 'live' });
  }
  return out;
}

export interface OutcomeToast {
  kind: 'success' | 'error';
  text: string;
  action?: { label: string; to: string };
}

/**
 * Toast của một lượt hỏi lại: một dòng thì báo theo SKU; từ hai dòng thì gom một toast "Đã đăng X SKU, lỗi Y SKU" kèm lối
 * tới tab sàn (review PR #480). Nút sửa chỉ khi có đúng một lỗi.
 */
export function outcomeToast(list: readonly PushOutcome[], ctx: Pick<Ctx, 'companyId' | 'shopLabel' | 'platform'>): OutcomeToast | null {
  if (!list.length) return null;
  const failed = list.filter((o) => o.status === 'failed');
  if (list.length === 1) {
    const o = list[0];
    const where = o.row.shopName ?? ctx.shopLabel;
    const name = where ? `${o.row.sku} lên ${where}` : o.row.sku;
    if (o.status === 'failed')
      return {
        kind: 'error',
        text: `Chưa đăng được ${name}${o.text ? `: ${o.text}` : ''}`,
        ...(o.fix ? { action: { label: o.fix.label, to: o.fix.to } } : {}),
      };
    return { kind: 'success', text: o.status === 'under_review' ? `Đã gửi ${name}, sàn đang duyệt` : `Đã đăng ${name}` };
  }
  const live = list.filter((o) => o.status === 'live').length;
  const review = list.filter((o) => o.status === 'under_review').length;
  const parts = [
    ...(live ? [`đã đăng ${live} SKU`] : []),
    ...(review ? [`${review} SKU chờ sàn duyệt`] : []),
    ...(failed.length ? [`lỗi ${failed.length} SKU`] : []),
  ].join(', ');
  const text = parts.charAt(0).toUpperCase() + parts.slice(1);
  if (!failed.length) return { kind: 'success', text };
  if (failed.length === 1 && failed[0].fix) return { kind: 'error', text, action: { label: failed[0].fix.label, to: failed[0].fix.to } };
  // Lối tới tab sàn khi các dòng lỗi cùng một sản phẩm, một sàn
  const products = new Set(failed.map((o) => o.row.productId));
  const platforms = new Set(failed.map((o) => o.row.platform ?? ctx.platform ?? ''));
  const [productId] = products;
  const [platform] = platforms;
  if (products.size !== 1 || platforms.size !== 1 || !platform) return { kind: 'error', text };
  return {
    kind: 'error',
    text,
    action: { label: 'Xem lỗi ở tab sàn', to: ROUTES.company.catalogProduct(ctx.companyId, productId, { tab: platform }) },
  };
}

/**
 * Toast kết quả khi dòng thôi "Đang đăng" (FE#462, §18.6.4): sàn nhận thì báo thành công, sàn từ chối thì báo câu lỗi kèm
 * nút tới chỗ sửa. Chỉ báo dòng thấy chuyển trạng thái trong lúc trang đang mở, lần nạp đầu không báo.
 * `canFix`: có quyền sửa sản phẩm thì toast lỗi có nút sửa.
 */
export function usePushOutcomeToasts(rows: readonly Row[] | undefined, ctx: Ctx) {
  const navigate = useNavigate();
  const prev = useRef<Map<string, ListingStatus> | null>(null);
  const onFix = useRef(ctx.onFix);
  useEffect(() => {
    onFix.current = ctx.onFix;
  });
  const { companyId, shopId, platform, shopLabel, canFix } = ctx;
  useEffect(() => {
    if (!rows) return;
    const keyOf = (r: Row) => `${r.shopId ?? shopId ?? ''}:${r.variantId}`;
    const before = prev.current;
    const now = new Map<string, ListingStatus>();
    for (const r of rows) if (r.listing) now.set(keyOf(r), r.listing.status);
    prev.current = now;
    const outcomes = pushOutcomes(before, rows, keyOf, { companyId, shopId, platform, shopLabel, canFix });
    const t = outcomeToast(outcomes, { companyId, shopLabel, platform });
    if (!t) return;
    const go = t.action?.to;
    const action =
      t.action && go
        ? {
            label: t.action.label,
            onClick: () => {
              if (!onFix.current?.(go)) navigate(go);
            },
          }
        : undefined;
    if (t.kind === 'error') toast.error(t.text, action ? { action } : undefined);
    else toast.success(t.text, action ? { action } : undefined);
  }, [rows, companyId, shopId, platform, shopLabel, canFix, navigate]);
}
