import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { pathSegments } from './platformCategory';

/**
 * Đường dẫn category dạng "A › B › C": mọi cấp cùng cỡ chữ, dấu › màu nhạt, cấp cuối đậm; dài thì xuống dòng, không cắt
 * (commerio-backend#467)
 */
export function CategoryPath({ path, className }: { path: string; className?: string }) {
  const parts = pathSegments(path);
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1', className)} aria-label={parts.join(', ')}>
      {parts.map((part, k) => (
        <Fragment key={k}>
          {k > 0 && (
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          )}
          <span className={k === parts.length - 1 ? 'font-semibold' : undefined}>{part}</span>
        </Fragment>
      ))}
    </span>
  );
}
