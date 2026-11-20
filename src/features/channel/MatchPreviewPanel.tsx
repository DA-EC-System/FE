import { AlertMessage } from '@/components/common/AlertMessage';
import { problemMessage } from '@/api/problemMessages';
import { useMatchPreview } from '@/api/shops.api';
import type { ListingMatchPreview } from '@/types/shop';
import { formatCurrency, formatDateTime } from '@/utils/format';

interface MatchPreviewPanelProps {
  shopId: string;
  pair: { externalSkuId: string; variantId: string };
}

const money = (v: string | null) => (v === null ? '—' : formatCurrency(Number(v)));

/** Câu về tồn: app giữ số trên sàn hay đẩy số nào (Documents/25 §6.4 "Ghép listing có sẵn") */
function stockNote(p: ListingMatchPreview): string {
  if (p.stockHeldReason === 'shop_waiting_opening') {
    return `Gian hàng đang chờ kiểm kê lần đầu: app chưa đẩy tồn, tồn trên sàn giữ ${p.platform.stock}.`;
  }
  if (p.stockHeldReason === 'not_counted') {
    return `Chưa có số tồn: SKU kho chưa nhập, chưa kiểm kê nên app giữ nguyên tồn trên sàn (${p.platform.stock}) tới khi kho có số.`;
  }
  return p.app.stock === p.platform.stock
    ? `Tồn trên sàn ${p.platform.stock} khớp số có thể bán.`
    : `Tồn trên sàn ${p.platform.stock} sẽ đổi thành ${p.app.stock}.`;
}

function priceNote(p: ListingMatchPreview): string | null {
  if (!p.priceWillPush || p.app.price === null) return 'SKU kho chưa có giá bán: app chưa đẩy giá.';
  if (p.platform.price === null) return `App sẽ đẩy giá ${money(p.app.price)}; chưa biết giá trên sàn (bấm Tải lại SKU sàn).`;
  if (Number(p.platform.price) === Number(p.app.price)) return null;
  return `Giá trên sàn ${money(p.platform.price)} sẽ đổi thành ${money(p.app.price)}.`;
}

/** Bảng sàn và app của cặp đang chọn trong hộp ghép, để người dùng thấy số sẽ đẩy trước khi lưu (commerio-backend#460) */
export function MatchPreviewPanel({ shopId, pair }: MatchPreviewPanelProps) {
  const { data, isPending, error } = useMatchPreview(shopId, pair);
  if (isPending) {
    return <p className="text-sm text-muted-foreground">Đang đọc số trên sàn và trong kho...</p>;
  }
  if (error) return <AlertMessage severity="error">{problemMessage(error)}</AlertMessage>;

  const price = priceNote(data);
  const held = data.stockHeldReason !== null;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="match-preview">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="font-normal" />
            <th className="font-normal">Trên sàn</th>
            <th className="font-normal">Sau khi lưu</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr>
            <td className="text-muted-foreground">Tồn</td>
            <td>{data.platform.stock}</td>
            <td>{held ? `${data.platform.stock} (giữ nguyên)` : data.app.stock}</td>
          </tr>
          <tr>
            <td className="text-muted-foreground">Giá</td>
            <td>{money(data.platform.price)}</td>
            <td>{data.priceWillPush ? money(data.app.price) : `${money(data.platform.price)} (giữ nguyên)`}</td>
          </tr>
        </tbody>
      </table>
      <AlertMessage severity={held ? 'info' : 'warning'}>{stockNote(data)}</AlertMessage>
      {price && <AlertMessage severity="warning">{price}</AlertMessage>}
      <p className="text-xs text-muted-foreground">Số trên sàn đọc lúc {formatDateTime(data.platform.syncedAt)}.</p>
    </div>
  );
}
