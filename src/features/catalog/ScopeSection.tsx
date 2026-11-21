import { useId, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import type { DataScope } from '@/types/catalog';
import { SCOPE_TEXT } from './scope';

interface ScopeSectionProps {
  scope: DataScope;
  count: number;
  /** Ghi thêm cạnh số dòng, vd "2 đang ẩn" */
  note?: string;
  children: ReactNode;
}

/** Một khối dữ liệu của một tầng: tiêu đề, số dòng, mô tả, rồi bảng */
export function ScopeSection({ scope, count, note, children }: ScopeSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 id={id} className="text-base font-semibold">
          {SCOPE_TEXT[scope].title}
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {count}
          {note && ` · ${note}`}
        </span>
        <p className="w-full text-sm text-muted-foreground">{SCOPE_TEXT[scope].hint}</p>
      </div>
      <Card className="py-0">{children}</Card>
    </section>
  );
}
