import { Link } from 'react-router-dom';
import { BlockedReason } from '@/components/common/BlockedReason';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { focusField } from './focusField';
import type { MissingItem } from './completion';

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
}: ProductCompletionRailProps) {
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
          items.length ? 'border-warning-border bg-warning-soft' : 'border-success-border bg-success-soft',
        )}
      >
        <h2 id="completion-title" className="text-sm font-semibold">
          {items.length ? `Còn thiếu ${items.length} mục` : isNew ? 'Đã điền đủ phần chung' : 'Sẵn sàng'}
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
          <p className="text-sm text-muted-foreground">
            {isNew ? 'Tạo xong, các biến thể còn cần giá, cân nặng, kích thước gói sẽ hiện ở đây.' : 'Đủ thông tin để đăng lên gian hàng.'}
          </p>
        )}
        {items.length > 0 && <p className="text-xs text-muted-foreground">Còn thiếu vẫn lưu được; chỉ chưa đăng được.</p>}
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
