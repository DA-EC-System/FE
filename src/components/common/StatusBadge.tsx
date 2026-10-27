import { Badge } from '@/components/ui/badge';

export type BadgeVariant = 'secondary' | 'success' | 'warning' | 'info' | 'destructive' | 'outline';

/** Nhãn và màu của một trạng thái; mỗi thực thể khai báo một bảng `Record<Status, StatusMeta>` */
export interface StatusMeta {
  label: string;
  variant: BadgeVariant;
}

/** Nhãn trạng thái theo bảng màu chung; trạng thái lạ hiện nguyên mã */
export function StatusBadge<S extends string>({
  status,
  statuses,
}: {
  status: S;
  statuses: Record<S, StatusMeta>;
}) {
  const meta = statuses[status] ?? { label: status, variant: 'outline' };
  return (
    <Badge variant={meta.variant} data-status={status}>
      {meta.label}
    </Badge>
  );
}
