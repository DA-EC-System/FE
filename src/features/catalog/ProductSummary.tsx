import { Skeleton } from '@/components/ui/skeleton';

interface Tile {
  label: string;
  /** null: đang tải; undefined: không hiện ô (thiếu quyền) */
  value: string | null | undefined;
}

/**
 * Hàng số liệu đầu trang sản phẩm (Documents/27 US-SP-11 tiêu chí 1, commerio-backend#467): nhóm hàng, SKU theo trạng
 * thái kinh doanh, tổng có thể bán, số gian hàng đang bán. Ô thiếu quyền thì bỏ, ô đang tải giữ chỗ để không xô trang
 */
export function ProductSummary({ tiles }: { tiles: Tile[] }) {
  const shown = tiles.filter((t) => t.value !== undefined);
  return (
    <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="product-summary">
      {shown.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{t.label}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{t.value === null ? <Skeleton className="h-5 w-20" /> : t.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
