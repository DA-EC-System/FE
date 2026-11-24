import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Phân trang của các bước thiết lập (design v2.html `pager`): "1–20 trên 410 sản phẩm" */
export function SetupPager({
  page,
  pageSize,
  total,
  unit,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  unit: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} trên {total.toLocaleString('vi-VN')} {unit}
      </span>
      <span className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
        </Button>
        <b className="tabular-nums text-foreground">{page}</b>
        <span>/ {pages}</span>
        <Button size="icon-sm" variant="outline" aria-label="Trang sau" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight />
        </Button>
      </span>
    </div>
  );
}
