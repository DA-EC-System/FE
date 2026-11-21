import type { ChannelListing } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { priceText } from '@/utils/price';

type SyncFields = Pick<ChannelListing, 'lastPushedAt' | 'lastPushedPrice' | 'priceSync' | 'stockSync' | 'stockSyncError'>;

/**
 * Dòng đồng bộ chữ nhỏ dưới nhãn trạng thái listing (FE#312): gộp giá và tồn thành một câu. Chỉ gọi khi listing ở trên sàn.
 * Lệch tồn (`stockSync = error`) hoặc đẩy tồn lỗi (`stockSyncError`, BE giữ `pending`) đã có nhãn riêng nên câu không nhắc tồn.
 */
export function syncLine(l: SyncFields, lastSyncFailedAt: string | null = null): string {
  // `lastPushedAt` là lần đẩy thành công gần nhất; `lastSyncFailedAt` lần thử lỗi gần nhất (Documents/21 §18.5, 21/11/2026)
  const failed = lastSyncFailedAt ? ` · lần thử ${formatDateTime(lastSyncFailedAt)} lỗi` : '';
  if (l.lastPushedAt === null) return `Chờ đồng bộ giá, tồn lần đầu${failed}`;
  const price = l.priceSync === 'pending';
  const stock = l.stockSync === 'pending' && !l.stockSyncError;
  if (price && stock) return `Chờ đồng bộ giá (sàn đang ${priceText(l.lastPushedPrice)}) và tồn${failed}`;
  if (price) return `Chờ đồng bộ giá mới, sàn đang ${priceText(l.lastPushedPrice)}${failed}`;
  if (stock) return `Chờ đồng bộ tồn · Thành công gần nhất ${formatDateTime(l.lastPushedAt)}${failed}`;
  return `Đồng bộ thành công gần nhất: ${formatDateTime(l.lastPushedAt)}${failed}`;
}

/** Nhãn Lệch tồn kèm số trên sàn. BE chưa trả tồn có thể bán của Commerio trong listings nên chưa nêu số đó */
export const stockDriftLabel = (platformStock: number | null) =>
  platformStock !== null ? `Lệch tồn: sàn ${platformStock}` : 'Lệch tồn';
