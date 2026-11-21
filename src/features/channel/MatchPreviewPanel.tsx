import { AlertMessage } from '@/components/common/AlertMessage';
import { Skeleton } from '@/components/ui/skeleton';
import { problemMessage } from '@/api/problemMessages';
import { useMatchPreview } from '@/api/shops.api';
import type { ListingMatchPreview } from '@/types/shop';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { FILL_BACK_LABELS } from './remoteLinking';

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
  if (p.platform.price === null) return `App sẽ đẩy giá ${money(p.app.price)}; chưa đọc được giá trên sàn, lần đọc SKU sàn tới sẽ có.`;
  if (Number(p.platform.price) === Number(p.app.price)) return null;
  return `Giá trên sàn ${money(p.platform.price)} sẽ đổi thành ${money(p.app.price)}.`;
}

/** Bảng sàn và app của cặp đang chọn trong hộp ghép, để người dùng thấy số sẽ đẩy trước khi lưu (commerio-backend#460) */
export function MatchPreviewPanel({ shopId, pair }: MatchPreviewPanelProps) {
  const { data, isPending, error } = useMatchPreview(shopId, pair);
  if (isPending) {
    // Giữ chỗ đúng cỡ bảng để hộp không nhảy khi số về
    return (
      <div className="space-y-2 rounded-md border p-3" aria-busy="true" aria-label="Đang đọc số trên sàn và trong kho">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (error) return <AlertMessage severity="error">{problemMessage(error)}</AlertMessage>;

  const price = priceNote(data);
  const held = data.stockHeldReason !== null;
  const stockAfter = held ? data.platform.stock : data.app.stock;
  const priceAfter = data.priceWillPush ? data.app.price : data.platform.price;
  const stockChanges = stockAfter !== data.platform.stock;
  // Chưa đọc được giá trên sàn mà app sẽ đẩy giá cũng là số sẽ đổi
  const priceChanges =
    data.priceWillPush && priceAfter !== null && (data.platform.price === null || Number(priceAfter) !== Number(data.platform.price));
  // Vàng chỉ khi số trên sàn sẽ đổi hay còn thiếu giá; khớp thì xanh; app giữ nguyên tồn thì xanh dương
  const severity = stockChanges || price ? 'warning' : held ? 'info' : 'success';
  /** Ô "Sau khi lưu": khác số trên sàn thì đậm kèm "→", không chỉ dựa vào màu */
  const after = (text: string, changes: boolean) =>
    changes ? <span className="font-semibold">→ {text}</span> : <span>{text}</span>;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="match-preview">
      <table className="w-full">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-normal">
              <span className="sr-only">Chỉ số</span>
            </th>
            <th className="text-right font-normal">Trên sàn</th>
            <th className="text-right font-normal">Sau khi lưu</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr>
            <td className="text-muted-foreground">Tồn</td>
            <td className="text-right">{data.platform.stock}</td>
            <td className="text-right">{after(held ? `${stockAfter} (giữ nguyên)` : String(stockAfter), stockChanges)}</td>
          </tr>
          <tr>
            <td className="text-muted-foreground">Giá</td>
            <td className="text-right">{money(data.platform.price)}</td>
            <td className="text-right">
              {after(data.priceWillPush ? money(priceAfter) : `${money(priceAfter)} (giữ nguyên)`, priceChanges)}
            </td>
          </tr>
        </tbody>
      </table>
      <AlertMessage severity={severity}>{price ? `${stockNote(data)} ${price}` : stockNote(data)}</AlertMessage>
      {data.fillBack && data.fillBack.length > 0 && (
        <div data-testid="match-fill-back">
          <p className="font-medium">Sẽ điền ngược vào sản phẩm (đang trống trong Commerio):</p>
          <ul className="mt-1 grid gap-0.5">
            {data.fillBack.map((f) => (
              <li key={f.field}>
                <span className="text-muted-foreground">{FILL_BACK_LABELS[f.field]}:</span> {f.value ?? 'lấy từ sàn'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Số trên sàn đọc lúc {formatDateTime(data.platform.syncedAt)}.</p>
    </div>
  );
}
