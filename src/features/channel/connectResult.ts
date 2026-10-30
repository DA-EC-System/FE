import type { ShopConnectionResult } from '@/types/shop';
import { formatDateTime } from '@/utils/format';

/** Câu báo sau khi kết nối (OAuth hay dán token): tạo mới thì nhắc thiết lập, nối lại thì kể việc đã bù */
export function connectedToast({ shop, created, reconnect, shops }: ShopConnectionResult & { shops?: ShopConnectionResult[] }): string {
  if (shops && shops.length > 1) return `Đã kết nối ${shops.length} gian hàng`;
  // Gian hàng mới chưa bán được cho đến khi xong thiết lập lần đầu (sơ đồ C1)
  if (created) return `Đã kết nối ${shop.shopName}. Hoàn tất thiết lập để bắt đầu bán.`;
  const caughtUp = reconnect
    ? [
        reconnect.jobsRun ? `chạy ${reconnect.jobsRun} việc đang chờ` : null,
        reconnect.relisted ? `đưa lại ${reconnect.relisted} listing lên sàn` : null,
        reconnect.pulledFrom ? `kéo đơn từ ${formatDateTime(reconnect.pulledFrom)}` : null,
      ].filter(Boolean)
    : [];
  return `Đã kết nối lại ${shop.shopName}${caughtUp.length ? `: ${caughtUp.join(', ')}` : ''}`;
}
