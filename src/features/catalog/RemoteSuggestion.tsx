import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/utils/format';

interface Props {
  platformName: string;
  shopName: string;
  readAt: string;
  /** Giá trị sàn đang ghi, đã đổi sang chữ hiển thị */
  value: string;
  /** null: chỉ xem (không có quyền sửa sản phẩm, sản phẩm đã lưu trữ) */
  onUse: (() => void) | null;
  busy: boolean;
}

/**
 * Dòng "Sàn {X} đang ghi: … [Dùng giá trị này]" dưới một ô của sản phẩm (FE#417 F2, Documents/21 §18.5 `remote`). Chỉ ghi
 * khi người dùng bấm, không tự đè giá trị đang có
 */
export function RemoteSuggestion({ platformName, shopName, readAt, value, onUse, busy }: Props) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-dashed border-primary-border bg-accent/40 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">
        {platformName} đang ghi
        <span className="sr-only">
          {' '}
          (gian hàng {shopName}, đọc lúc {formatDateTime(readAt)})
        </span>
        :
      </span>
      <span className="line-clamp-2 min-w-0 font-medium break-words text-foreground" title={`Gian hàng ${shopName}, đọc lúc ${formatDateTime(readAt)}`}>
        {value}
      </span>
      {onUse && (
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onUse} disabled={busy}>
          {busy ? 'Đang lưu...' : 'Dùng giá trị này'}
        </Button>
      )}
    </div>
  );
}
