import { Badge } from '@/components/ui/badge';
import { TapTooltip } from './TapTooltip';

export type BadgeVariant =
  | 'secondary'
  | 'success'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'outline'
  | 'primary'
  | 'neutral'
  | 'purple';

/** Nhãn và màu của một trạng thái; mỗi thực thể khai báo một bảng `Record<Status, StatusMeta>` */
export interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  /** Một câu giải thích trạng thái; có thì rê chuột, Tab tới hoặc chạm vào nhãn để xem */
  hint?: string;
}

/** Nhãn trạng thái theo bảng màu chung; trạng thái lạ hiện nguyên mã */
export function StatusBadge<S extends string>({
  status,
  statuses,
}: {
  status: S;
  statuses: Record<S, StatusMeta>;
}) {
  const meta: StatusMeta = statuses[status] ?? { label: status, variant: 'outline' };
  const badge = (
    <Badge variant={meta.variant} data-status={status} tabIndex={meta.hint ? 0 : undefined}>
      {meta.label}
    </Badge>
  );
  return meta.hint ? <TapTooltip content={meta.hint}>{badge}</TapTooltip> : badge;
}
