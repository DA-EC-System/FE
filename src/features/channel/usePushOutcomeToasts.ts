import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ListingRow, ListingStatus } from '@/types/shop';
import { blockerFix, type BlockerFixContext } from './blockerFix';
import { pushErrorTarget, pushErrorText } from './listingPush';

type Row = Pick<ListingRow, 'variantId' | 'productId' | 'sku' | 'listing'> & { shopId?: string; shopName?: string; platform?: string };

/**
 * Toast kết quả khi một dòng thôi "Đang đăng" (FE#462, §18.6.4): sàn nhận thì báo thành công, sàn từ chối thì báo câu lỗi
 * kèm nút tới chỗ sửa. Chỉ báo dòng thấy chuyển trạng thái trong lúc trang đang mở, lần nạp đầu không báo.
 * `canFix`: có quyền sửa sản phẩm thì toast lỗi có nút sửa.
 */
export function usePushOutcomeToasts(
  rows: readonly Row[] | undefined,
  ctx: { companyId: string; shopId?: string; platform?: string | null; shopLabel?: string; canFix: boolean },
) {
  const navigate = useNavigate();
  const prev = useRef<Map<string, ListingStatus> | null>(null);
  const { companyId, shopId, platform, shopLabel, canFix } = ctx;
  useEffect(() => {
    if (!rows) return;
    const keyOf = (r: Row) => `${r.shopId ?? shopId ?? ''}:${r.variantId}`;
    const before = prev.current;
    const now = new Map<string, ListingStatus>();
    for (const r of rows) if (r.listing) now.set(keyOf(r), r.listing.status);
    prev.current = now;
    if (!before) return;
    for (const r of rows) {
      const l = r.listing;
      if (!l || before.get(keyOf(r)) !== 'pushing' || l.status === 'pushing') continue;
      const where = r.shopName ?? shopLabel;
      const name = where ? `${r.sku} lên ${where}` : r.sku;
      if (l.status === 'push_failed' || l.status === 'rejected') {
        const text = l.status === 'rejected' ? (l.rejectReason ?? 'Sàn từ chối sản phẩm.') : l.pushError ? pushErrorText(l.pushError).text : '';
        const fixCtx: BlockerFixContext = {
          companyId,
          productId: r.productId,
          platform: r.platform ?? platform,
          shopId: r.shopId ?? shopId,
          variantId: l.pushError?.variantId ?? r.variantId,
        };
        // Nút sửa trong toast chỉ cho chỗ sửa ở trang sản phẩm, trang gian hàng (quyền sửa phí kiểm ở ô Trạng thái)
        const fix = canFix ? blockerFix(pushErrorTarget(l.pushError), fixCtx) : null;
        const action = fix && fix.perm !== 'finance' ? { label: fix.label, onClick: () => navigate(fix.to) } : undefined;
        toast.error(`Chưa đăng được ${name}${text ? `: ${text}` : ''}`, action ? { action } : undefined);
      } else if (l.status === 'under_review') {
        toast.success(`Đã gửi ${name}, sàn đang duyệt`);
      } else if (l.status === 'live') {
        toast.success(`Đã đăng ${name}`);
      }
    }
  }, [rows, companyId, shopId, platform, shopLabel, canFix, navigate]);
}
