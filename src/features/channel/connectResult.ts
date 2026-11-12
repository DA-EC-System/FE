import type { ShopCallbackResult, ShopConnectionResult, ShopReconnectSummary } from '@/types/shop';
import { formatDateTime } from '@/utils/format';

/**
 * Màn kết quả sau khi sàn cấp token (OAuth hay dán token), theo bảng Documents/21 §18.7.4:
 * multiple: một lần uỷ quyền trả nhiều gian hàng (kiểm trước);
 * connected: created = true, gian hàng mới, mời thiết lập;
 * already_connected: created = false, gian hàng đã có, chỉ cấp lại token;
 * reconnected: một dạng của already_connected khi trước đó mất quyền hoặc đã ngắt.
 */
export type ConnectedOutcome = 'connected' | 'reconnected' | 'already_connected' | 'multiple';

/** Phần tử đầu của shops[]: `previousStatus`, `remoteProductCount`, `remoteSkuCount` chỉ có ở đây, không ở gốc response */
export function firstConnection(result: ShopCallbackResult): ShopConnectionResult {
  return (
    result.shops[0] ?? {
      shop: result.shop,
      created: result.created,
      reconnect: result.reconnect,
      previousStatus: null,
      remoteProductCount: null,
      remoteSkuCount: null,
    }
  );
}

type RemoteCounts = Pick<ShopConnectionResult, 'remoteProductCount' | 'remoteSkuCount'>;

/**
 * Hàng trên sàn lúc nối, một cụm cho mọi sàn (§18.7.4): "305 sản phẩm · 812 phân loại";
 * chưa có số phân loại thì "305 sản phẩm"; chưa có số sản phẩm thì null
 */
export function remoteCountsText({ remoteProductCount, remoteSkuCount }: RemoteCounts): string | null {
  if (remoteProductCount == null) return null;
  const products = `${remoteProductCount} sản phẩm`;
  return remoteSkuCount != null ? `${products} · ${remoteSkuCount} phân loại` : products;
}

/** Cụm ở màn nhiều gian hàng: chưa có số sản phẩm thì bỏ cả cụm */
export function remoteCountsSuffix(item: RemoteCounts): string {
  const text = remoteCountsText(item);
  return text ? ` · ${text}` : '';
}

/** Ô "Hàng trên sàn" ở màn một gian hàng: chưa có số sản phẩm thì "—" */
export function remoteCountsValue(item: RemoteCounts): string {
  return remoteCountsText(item) ?? '—';
}

/** Màn cho một phần tử shops[] */
export function itemOutcome(item: ShopConnectionResult): Exclude<ConnectedOutcome, 'multiple'> {
  if (item.created) return 'connected';
  if (item.previousStatus === 'needs_reauth' || item.previousStatus === 'disconnected') return 'reconnected';
  return 'already_connected';
}

export function connectedOutcome(result: ShopCallbackResult): ConnectedOutcome {
  if (result.shops.length > 1) return 'multiple';
  return itemOutcome(firstConnection(result));
}

/** Việc BE đã bù khi nối lại, bỏ phần bằng 0 */
export function reconnectSummary(reconnect: ShopReconnectSummary | null): string[] {
  if (!reconnect) return [];
  return [
    reconnect.jobsRun ? `chạy ${reconnect.jobsRun} việc đang chờ` : null,
    reconnect.relisted ? `đưa lại ${reconnect.relisted} sản phẩm lên sàn` : null,
    reconnect.pulledFrom ? `kéo đơn từ ${formatDateTime(reconnect.pulledFrom)}` : null,
  ].filter((x): x is string => Boolean(x));
}
