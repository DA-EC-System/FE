import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProductDetail } from '@/types/catalog';
import type { Marketplace, Shop } from '@/types/shop';
import type { AttentionAction, AttentionItem } from './needsAttention';
import { platformLabel } from './platformCategory';
import { usePlatformTab } from './usePlatformTab';

interface NeedsAttentionBoxProps {
  items: AttentionItem[];
  product: ProductDetail | undefined;
  /** Sàn có tab trên trang: mỗi sàn còn thiếu thông tin thêm một mục */
  platforms: readonly Marketplace[];
  shops: readonly Shop[];
  onAction: (action: AttentionAction) => void;
}

/**
 * Hộp "Cần xử lý trước khi đăng" đầu trang sản phẩm (bản phác `trang-san-pham-tab/design/v2.html` màn 1, chốt v2 câu 7):
 * gom lỗi chặn, mỗi mục một nút tới đúng chỗ sửa. Không còn mục nào thì ẩn (`has-[li]`).
 */
export function NeedsAttentionBox({ items, product, platforms, shops, onAction }: NeedsAttentionBoxProps) {
  return (
    <section
      role="alert"
      aria-labelledby="needs-attention-title"
      className="mb-4 hidden gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 has-[li]:flex"
      data-testid="needs-attention"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 id="needs-attention-title" className="text-sm font-semibold">
          Cần xử lý trước khi đăng
        </h2>
        <ul className="grid gap-1.5 text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{item.text}</span>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onAction(item.action)}>
                {item.actionLabel}
                <ArrowRight aria-hidden />
              </Button>
            </li>
          ))}
          {product &&
            platforms.map((p) => <PlatformNeed key={p} product={product} platform={p} shops={shops} onAction={onAction} />)}
        </ul>
        <p className="text-xs text-muted-foreground">Còn thiếu vẫn lưu được; chỉ chưa đăng được.</p>
      </div>
    </section>
  );
}

function PlatformNeed({
  product,
  platform,
  shops,
  onAction,
}: {
  product: ProductDetail;
  platform: Marketplace;
  shops: readonly Shop[];
  onAction: (action: AttentionAction) => void;
}) {
  const { count, specQuery, spec } = usePlatformTab(product, platform, shops);
  // Sàn chưa có thông tin sàn (chưa định bán ở đó) không tính là lỗi chặn; nhãn ở tab vẫn báo
  if (!specQuery.isSuccess || !spec || count === 0) return null;
  const name = platformLabel(platform);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {name}: còn thiếu {count} mục thông tin sàn
      </span>
      <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onAction({ kind: 'tab', platform })}>
        Mở tab {name}
        <ArrowRight aria-hidden />
      </Button>
    </li>
  );
}
