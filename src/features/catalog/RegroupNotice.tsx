import { useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { useRegroupProduct, useSeparateProducts } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import type { Marketplace, Shop } from '@/types/shop';
import { platformLabel } from './platformCategory';
import { regroupErrorText } from './regroupError';

/**
 * Dòng báo "N SKU đang là N sản phẩm riêng trên {Sàn}" theo từng gian hàng (`separateProducts` của
 * `GET /channel/products/:id/listings`). CEO có nút gom; vai trò khác chỉ thấy dòng báo
 */
export function RegroupNotice({ productId, platform, shops }: { productId: string; platform: Marketplace; shops: readonly Shop[] }) {
  const { companyContext } = useAuth();
  const isCeo = Boolean(companyContext?.roles.includes('CEO'));
  const separate = useSeparateProducts(productId);
  const regroup = useRegroupProduct();
  // Gian hàng đã gửi lệnh gom trong phiên này: việc nền gọi sàn nên có thể quá 15 giây mới xong
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const label = platformLabel(platform);
  const items = (separate.data ?? []).filter((s) => s.platform === platform);
  if (!items.length) return null;

  const onRegroup = async (shopId: string) => {
    try {
      await regroup.mutateAsync({ shopId, productId });
      setQueued((q) => new Set(q).add(shopId));
      toast.success(`Đang gom trên ${label}. Danh sách tự tải lại sau khoảng 15 giây.`);
    } catch (e) {
      toast.error(regroupErrorText(getProblem(e)?.code, label, problemMessage(e)));
    }
  };

  return (
    <div className="grid gap-2">
      {items.map((s) => {
        const shopName = shops.find((x) => x.id === s.shopId)?.shopName;
        const pending = regroup.isPending && regroup.variables?.shopId === s.shopId;
        if (queued.has(s.shopId)) {
          return (
            <AlertMessage key={s.shopId} severity="info">
              <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
                <span>
                  <b>Đang gom trên {label}{shopName ? ` (gian hàng ${shopName})` : ''}…</b> App đang tạo sản phẩm mới rồi gỡ các
                  sản phẩm lẻ, có thể mất vài phút.
                </span>
                <Button type="button" size="sm" variant="outline" disabled={separate.isFetching} onClick={() => void separate.refetch()}>
                  {separate.isFetching ? 'Đang tải...' : 'Tải lại'}
                </Button>
              </div>
            </AlertMessage>
          );
        }
        return (
          <AlertMessage key={s.shopId} severity="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>
                  SKU của sản phẩm này đang là {s.productCount} sản phẩm riêng trên {label}
                  {shopName ? ` (gian hàng ${shopName})` : ''}.
                </b>{' '}
                {isCeo
                  ? 'Gom thành một sản phẩm nhiều phân loại: app tạo sản phẩm mới rồi gỡ các sản phẩm lẻ.'
                  : 'CEO có thể gom thành một sản phẩm nhiều phân loại.'}
              </span>
              {isCeo && (
                <Button type="button" size="sm" variant="outline" disabled={regroup.isPending} onClick={() => onRegroup(s.shopId)}>
                  {pending ? 'Đang gửi...' : 'Gom thành một sản phẩm'}
                </Button>
              )}
            </div>
          </AlertMessage>
        );
      })}
    </div>
  );
}
