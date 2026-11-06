import type { ShopCallbackResult, ShopConnectionResult, ShopReconnectSummary } from '@/types/shop';
import { formatDateTime } from '@/utils/format';

/**
 * Màn kết quả sau khi sàn cấp token (OAuth hay dán token):
 * connected: gian hàng mới hoặc còn đang thiết lập, mời thiết lập ngay;
 * reconnected: gian hàng mất quyền hay đã ngắt nay nối lại;
 * already_connected: gian hàng đang chạy, chỉ cấp lại token;
 * multiple: một lần uỷ quyền trả nhiều gian hàng (tài khoản chính).
 */
export type ConnectedOutcome = 'connected' | 'reconnected' | 'already_connected' | 'multiple';

export function connectedOutcome(result: ShopCallbackResult | ShopConnectionResult): ConnectedOutcome {
  if ('shops' in result && result.shops.length > 1) return 'multiple';
  const { shop, created, reconnect, previousStatus } = result;
  if (created || shop.status === 'connecting') return 'connected';
  // BE cũ chưa trả previousStatus: có phần bù việc thì là nối lại
  if (previousStatus === 'needs_reauth' || previousStatus === 'disconnected') return 'reconnected';
  if (previousStatus == null && reconnect) return 'reconnected';
  return 'already_connected';
}

/** Việc BE đã bù khi nối lại, bỏ phần bằng 0 */
export function reconnectSummary(reconnect: ShopReconnectSummary | null): string[] {
  if (!reconnect) return [];
  return [
    reconnect.jobsRun ? `chạy ${reconnect.jobsRun} việc đang chờ` : null,
    reconnect.relisted ? `đưa lại ${reconnect.relisted} listing lên sàn` : null,
    reconnect.pulledFrom ? `kéo đơn từ ${formatDateTime(reconnect.pulledFrom)}` : null,
  ].filter((x): x is string => Boolean(x));
}
