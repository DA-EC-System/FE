import { TapTooltip } from '@/components/common/TapTooltip';
import { Badge } from '@/components/ui/badge';
import { PENDING_DROP_HINT } from './shared';

/**
 * Nhãn "Cần lấy ra n": hàng sàn đã huỷ còn trong hộp, kho bỏ ra khi mở kiện. Không hiện khi n = 0, và khi BE chưa trả
 * trường (bản trước commerio-backend#397: `undefined`, tổng thành `NaN`).
 */
export function PendingDropBadge({ qty }: { qty: number }) {
  if (!(qty > 0)) return null;
  return (
    <TapTooltip content={PENDING_DROP_HINT}>
      <Badge variant="warning" tabIndex={0} data-testid="pending-drop">
        Cần lấy ra {qty}
      </Badge>
    </TapTooltip>
  );
}
