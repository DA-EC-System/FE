import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/utils/format';
import type { ReturnStatus } from '@/types/returns';
import { respondByState } from './shared';

/** Hạn trả lời của sàn trên yêu cầu còn Chờ phản hồi; còn dưới 24 giờ hay quá hạn thì đổi màu (commerio-backend#392). */
export function RespondByBadge({ status, respondBy }: { status: ReturnStatus; respondBy: string | null | undefined }) {
  const state = respondByState(status, respondBy);
  if (!state) return null;
  const variant = state.overdue ? 'destructive' : state.urgent ? 'warning' : 'outline';
  const text = state.overdue ? `Quá hạn trả lời (${formatDateTime(state.at)})` : `Hạn trả lời ${formatDateTime(state.at)}${state.urgent ? ', còn dưới 24 giờ' : ''}`;
  return (
    <Badge variant={variant} data-testid="return-respond-by">
      {text}
    </Badge>
  );
}
