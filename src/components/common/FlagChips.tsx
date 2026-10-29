import { Badge } from '@/components/ui/badge';
import type { StatusMeta } from './StatusBadge';

/**
 * Cờ đi kèm trạng thái (Cần xử lý, Sắp trễ hạn, Có yêu cầu trả...). Cờ không thay trạng thái
 * mà nằm cạnh nó; cờ chưa khai báo nhãn hiện nguyên mã.
 */
export function FlagChips<F extends string>({
  flags,
  meta,
}: {
  flags: readonly F[];
  meta: Partial<Record<F, StatusMeta>>;
}) {
  if (!flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1" data-testid="flags">
      {flags.map((f) => {
        const m = meta[f] ?? { label: f, variant: 'warning' as const };
        return (
          <Badge key={f} variant={m.variant} data-flag={f}>
            {m.label}
          </Badge>
        );
      })}
    </span>
  );
}
