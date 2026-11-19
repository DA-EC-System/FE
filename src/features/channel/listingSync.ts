import type { ChannelListing } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { priceText } from '@/utils/price';

type SyncFields = Pick<ChannelListing, 'lastPushedAt' | 'lastPushedPrice' | 'priceSync' | 'stockSync' | 'stockSyncError'>;

/**
 * Dòng đồng bộ chữ nhỏ dưới nhãn trạng thái listing (FE#312): gộp giá và tồn thành một câu. Chỉ gọi khi listing ở trên sàn.
 * Lệch tồn (`stockSync = error`) hoặc đẩy tồn lỗi (`stockSyncError`, BE giữ `pending`) đã có nhãn riêng nên câu không nhắc tồn.
 */
export function syncLine(l: SyncFields): string {
  if (l.lastPushedAt === null) return 'Chờ đẩy giá, tồn lần đầu';
  const price = l.priceSync === 'pending';
  const stock = l.stockSync === 'pending' && !l.stockSyncError;
  if (price && stock) return `Chờ đẩy giá (sàn ${priceText(l.lastPushedPrice)}) và tồn`;
  if (price) return `Chờ đẩy giá mới, trên sàn ${priceText(l.lastPushedPrice)}`;
  if (stock) return `Chờ đẩy tồn · Đẩy lần cuối ${formatDateTime(l.lastPushedAt)}`;
  return `Đã đẩy ${formatDateTime(l.lastPushedAt)}`;
}

/** Nhãn Lệch tồn kèm số trên sàn. BE chưa trả tồn có thể bán của Commerio trong listings nên chưa nêu số đó */
export const stockDriftLabel = (platformStock: number | null) =>
  platformStock !== null ? `Lệch tồn: sàn ${platformStock}` : 'Lệch tồn';
