import { Link } from 'react-router-dom';
import { BlockedReason } from '@/components/common/BlockedReason';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { focusField } from './focusField';
import type { MissingItem } from './completion';
import type { ShopReadiness } from '@/types/blocker';
import { shopMissing, shopState, shopTitle } from '@/features/channel/readiness';

interface ProductCompletionRailProps {
  items: MissingItem[];
  /** Nút Lưu gửi form `product-form` */
  saveLabel: string;
  saveDisabled: boolean;
  /** Có thì hiện nút "Lưu và sang sản phẩm kế" (mở từ bộ lọc Chờ hoàn thiện) */
  onSaveNext?: () => void;
  /** null: sản phẩm mới hoặc không đăng được vì lý do ở `publishBlocker` */
  publishHref: string | null;
  publishBlocker: string | null;
  /** Đang tạo sản phẩm mới: chưa có `missing` của BE */
  isNew: boolean;
  /** Readiness theo gian hàng (commerio-backend#564); undefined khi chưa tải hoặc không có quyền xem gian hàng */
  shops?: readonly ShopReadiness[];
  /** Bấm dòng gian hàng còn thiếu: mở tab sàn của gian hàng đó */
  onOpenPlatform?: (platform: string) => void;
}

/**
 * Cột phải của form sản phẩm (phương án 2A, Documents/29 bước 3): "Còn thiếu" liệt kê trường còn thiếu, bấm thì nhảy tới ô;
 * nút Lưu và Đăng sản phẩm. Còn thiếu vẫn lưu được (Documents/25 §5.1). Không dùng icon (Thành chốt 22/11/2026).
 */
export function ProductCompletionRail({
  items,
  saveLabel,
  saveDisabled,
  onSaveNext,
  publishHref,
  publishBlocker,
  isNew,
  shops,
  onOpenPlatform,
}: ProductCompletionRailProps) {
  // "Sẵn sàng" chỉ khi có gian hàng đăng được, nói rõ gian hàng nào (FE#458); chưa có readiness thì theo phần chung
  const readyShops = (shops ?? []).filter((s) => shopState(s) === 'ready');
  const noShopReady = Boolean(shops?.length) && !readyShops.length && shops!.some((s) => shopState(s) === 'blocked');
  const warn = items.length > 0 || noShopReady;
  const title = items.length
    ? `Còn thiếu ${items.length} mục`
    : isNew
      ? 'Đã điền đủ phần chung'
      : noShopReady
        ? 'Chưa đăng được gian hàng nào'
        : 'Sẵn sàng';
  const doneText = isNew
    ? 'Tạo xong, các biến thể còn cần giá, cân nặng, kích thước gói sẽ hiện ở đây.'
    : readyShops.length
      ? `Đủ thông tin để đăng lên ${readyShops.map(shopTitle).join(', ')}.`
      : noShopReady
        ? 'Phần chung đã đủ. Bổ sung theo từng gian hàng bên dưới.'
        : shops && !shops.length
          ? 'Đủ thông tin chung. Chưa có gian hàng nào để đăng.'
          : 'Đủ thông tin chung.';
  const publish = (
    <Button type="button" variant="outline" className="w-full" disabled={!publishHref} asChild={Boolean(publishHref)}>
      {publishHref ? <Link to={publishHref}>Đăng sản phẩm</Link> : 'Đăng sản phẩm'}
    </Button>
  );

  return (
    <aside aria-label="Độ hoàn thiện" className="grid gap-3 lg:sticky lg:top-4 lg:self-start">
      <section
        aria-labelledby="completion-title"
        className={cn(
          'grid gap-2 rounded-lg border p-3',
          warn ? 'border-warning-border bg-warning-soft' : 'border-success-border bg-success-soft',
        )}
      >
        <h2 id="completion-title" className="text-sm font-semibold">
          {title}
        </h2>
        {items.length > 0 ? (
          <ol className="grid gap-0.5 text-sm">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="min-h-6 cursor-pointer text-left font-medium text-primary-text underline underline-offset-2"
                  onClick={() => focusField(item.target)}
                >
                  {item.label}
                </button>
                {item.skuCount !== undefined && <span className="text-muted-foreground"> · {item.skuCount} biến thể</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{doneText}</p>
        )}
        {items.length > 0 && <p className="text-xs text-muted-foreground">Còn thiếu vẫn lưu được; chỉ chưa đăng được.</p>}
        {!isNew && shops && shops.length > 0 && (
          <div className="grid gap-1 border-t pt-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Theo gian hàng</h3>
            <ul className="grid gap-0.5 text-sm" data-testid="rail-shops">
              {shops.map((s) => {
                const st = shopState(s);
                return (
                  <li key={s.shopId} data-shop-state={st}>
                    {st === 'blocked' && onOpenPlatform ? (
                      <button
                        type="button"
                        className="min-h-6 cursor-pointer text-left underline underline-offset-2"
                        onClick={() => onOpenPlatform(s.platform)}
                      >
                        {shopTitle(s)}: còn {shopMissing(s)} mục
                      </button>
                    ) : (
                      <span>
                        {shopTitle(s)}:{' '}
                        {st === 'ready' ? (
                          <span className="text-success-text">sẵn sàng</span>
                        ) : st === 'listed' ? (
                          <span className="text-muted-foreground">đã đăng đủ</span>
                        ) : (
                          `còn ${shopMissing(s)} mục`
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <Button type="submit" form="product-form" className="w-full" disabled={saveDisabled}>
        {saveLabel}
      </Button>
      {onSaveNext && (
        <Button type="button" variant="outline" className="w-full" disabled={saveDisabled} onClick={onSaveNext}>
          Lưu và sang sản phẩm kế
        </Button>
      )}
      {publishBlocker ? (
        <BlockedReason reason={publishBlocker}>
          <span tabIndex={0} className="grid">
            {publish}
          </span>
        </BlockedReason>
      ) : (
        publish
      )}
      {publishBlocker && <p className="text-xs text-muted-foreground">{publishBlocker}</p>}
    </aside>
  );
}
