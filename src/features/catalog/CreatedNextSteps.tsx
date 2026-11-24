import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { shopUsable } from '@/lib/machines/channel';
import type { ProductDetail } from '@/types/catalog';
import type { Marketplace, Shop } from '@/types/shop';
import { platformLabel } from './platformCategory';
import { usePlatformTab } from './usePlatformTab';

interface CreatedNextStepsProps {
  product: ProductDetail;
  /** null: không có quyền xem gian hàng, bỏ bước "Bổ sung theo sàn" */
  shops: readonly Shop[] | null;
  shopsLoading: boolean;
  /** Mở ô còn thiếu của SKU trong bảng biến thể (FE#475) */
  onOpenSku: ((variantId: string) => void) | null;
  onOpenTab: (platform: Marketplace) => void;
  publishHref: string | null;
  /** Bấm "Đăng sản phẩm": trang gỡ `?created=1` rồi mới chuyển sang `publishHref` */
  onPublish: (href: string) => void;
  publishBlocker: string | null;
  onClose: () => void;
}

/**
 * Khung "Đã tạo sản phẩm · Tiếp theo" ngay dưới tiêu đề, lần đầu sau khi tạo (`?created=1`, FE#463): hoàn thiện SKU, bổ
 * sung theo sàn (mỗi gian hàng một dòng), đăng sản phẩm. Trạng thái theo gian hàng dùng thông tin sàn hiện có
 * (`usePlatformTab`), sẽ đổi sang readiness theo gian hàng khi có commerio-backend#564
 */
export function CreatedNextSteps({
  product,
  shops,
  shopsLoading,
  onOpenSku,
  onOpenTab,
  publishHref,
  onPublish,
  publishBlocker,
  onClose,
}: CreatedNextStepsProps) {
  const incomplete = product.variants.filter((v) => v.businessStatus !== 'archived' && v.readiness === 'incomplete');
  const usable = (shops ?? []).filter((s) => shopUsable(s.status));

  return (
    <section
      aria-labelledby="created-next-title"
      className="mb-4 grid gap-3 rounded-lg border border-success-border bg-success-soft p-4"
      data-testid="created-next-steps"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <h2 id="created-next-title" className="flex-1 text-sm font-semibold">
          Đã tạo sản phẩm · Tiếp theo
        </h2>
        <Button type="button" variant="ghost" size="icon" className="-my-1 size-7" aria-label="Đóng hướng dẫn tiếp theo" onClick={onClose}>
          <X />
        </Button>
      </div>
      <ol className="grid gap-3 text-sm">
        <Step n={1} title="Hoàn thiện SKU" done={incomplete.length === 0}>
          {incomplete.length === 0 ? (
            <span className="text-muted-foreground">Mọi SKU đã có giá, cân nặng, kích thước gói.</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Còn {incomplete.length}/{product.variants.length} SKU thiếu giá, cân nặng hoặc kích thước gói.
              </span>
              {onOpenSku && (
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onOpenSku(incomplete[0].id)}>
                  Điền {incomplete[0].sku}
                  <ArrowRight aria-hidden />
                </Button>
              )}
            </span>
          )}
        </Step>
        {shops !== null && (
          <Step n={2} title="Bổ sung theo sàn">
            {shopsLoading ? (
              <Skeleton className="h-7 w-72" />
            ) : usable.length === 0 ? (
              <span className="text-muted-foreground">Chưa có gian hàng đang kết nối.</span>
            ) : (
              <ul className="grid gap-1.5">
                {usable.map((s) => (
                  <ShopLine key={s.id} product={product} shop={s} shops={shops} onOpenTab={onOpenTab} />
                ))}
              </ul>
            )}
          </Step>
        )}
        <Step n={shops !== null ? 3 : 2} title="Đăng sản phẩm">
          {publishHref ? (
            <Button asChild size="sm" className="h-7">
              <Link
                to={publishHref}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onPublish(publishHref);
                }}
              >
                Đăng sản phẩm
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <span className="text-muted-foreground">{publishBlocker ?? 'Chưa đăng được.'}</span>
          )}
        </Step>
      </ol>
    </section>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
      <span
        className="flex size-6 items-center justify-center rounded-full border bg-background text-xs font-semibold tabular-nums"
        aria-hidden
      >
        {done ? <CheckCircle2 className="size-4 text-success" /> : n}
      </span>
      <span className="self-center font-medium">
        {title}
        {done && <span className="sr-only"> (đã xong)</span>}
      </span>
      <div className="col-start-2">{children}</div>
    </li>
  );
}

/**
 * Một gian hàng: trạng thái thông tin sàn của sản phẩm trên sàn đó, nút sang tab sàn.
 * TODO(commerio-backend#564): trạng thái đang tính theo sàn (spec dùng chung các gian hàng cùng sàn), chưa theo gian
 * hàng; đổi sang readiness theo gian hàng khi BE có
 */
function ShopLine({
  product,
  shop,
  shops,
  onOpenTab,
}: {
  product: ProductDetail;
  shop: Shop;
  shops: readonly Shop[];
  onOpenTab: (platform: Marketplace) => void;
}) {
  const { specQuery, count, noCategory } = usePlatformTab(product, shop.platform, shops);
  const name = platformLabel(shop.platform);
  const status = specQuery.isLoading ? (
    <Skeleton className="inline-block h-4 w-32 align-middle" />
  ) : specQuery.isError ? (
    <span className="text-muted-foreground">chưa tải được thông tin sàn</span>
  ) : noCategory ? (
    <span>chưa chọn category</span>
  ) : count > 0 ? (
    <span>còn thiếu {count} mục thông tin sàn</span>
  ) : (
    <span className="text-muted-foreground">đủ thông tin sàn</span>
  );
  return (
    <li className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1" data-testid="created-next-shop">
      <span>
        <span className="font-medium">
          {name} · {shop.shopName}
        </span>
        : {status}
      </span>
      <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onOpenTab(shop.platform)}>
        Mở tab {name}
        <ArrowRight aria-hidden />
      </Button>
    </li>
  );
}
