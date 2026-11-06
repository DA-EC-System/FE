import { Badge } from '@/components/ui/badge';

/**
 * Nhãn "Tự duyệt": bước cần người duyệt khác đi theo ngoại lệ tự duyệt (CEO, hoặc công ty một người;
 * Documents/25 mục 11, Documents/21 mục 14.1). Dùng ở lịch sử trạng thái, nhật ký thao tác, báo cáo CEO.
 */
export function SelfApprovedTag() {
  return (
    <Badge variant="purple" data-testid="self-approved" title="CEO hoặc công ty một người tự duyệt bước cần người duyệt khác">
      Tự duyệt
    </Badge>
  );
}
