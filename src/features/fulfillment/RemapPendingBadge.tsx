import { TapTooltip } from '@/components/common/TapTooltip';
import { Badge } from '@/components/ui/badge';
import { REMAP_PENDING_HINT } from './shared';

/** Nhãn "Đổi liên kết SKU" của dòng kiện `remapPending`: món trong hộp theo liên kết cũ, mở kiện để đổi (commerio-backend#237 PR 2) */
export function RemapPendingBadge({ pending }: { pending: boolean | undefined }) {
  if (!pending) return null;
  return (
    <TapTooltip content={REMAP_PENDING_HINT}>
      <Badge variant="warning" tabIndex={0} className="mt-1" data-testid="remap-pending">
        Đổi liên kết SKU
      </Badge>
    </TapTooltip>
  );
}
