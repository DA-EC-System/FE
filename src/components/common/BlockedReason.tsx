import type { ReactElement } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { TapTooltip } from './TapTooltip';

interface BlockedReasonProps {
  /** Lý do không bấm được, một câu, vd "Người duyệt phải khác người soạn", "Bạn không có quyền này". Rỗng thì không bọc. */
  reason?: string | null;
  /**
   * Nút đang bị khoá. Nút `disabled` thật không nhận focus và chuột, nên bọc nó trong `span tabIndex={0}`;
   * nút `aria-disabled` (vẫn focus được) thì truyền thẳng.
   */
  children: ReactElement;
}

/**
 * Tooltip lý do cho nút bị khoá, dùng chung cho mọi nơi (FE#131): rê chuột, Tab tới hoặc chạm vào nút thì hiện lý do.
 * Lý do được gắn vào `data-blocked-reason` để test đọc được mà không cần mở tooltip.
 */
export function BlockedReason({ reason, children }: BlockedReasonProps) {
  if (!reason) return children;
  return (
    <TapTooltip content={reason}>
      <Slot data-blocked-reason={reason}>{children}</Slot>
    </TapTooltip>
  );
}
