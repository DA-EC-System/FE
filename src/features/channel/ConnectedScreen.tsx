import { Check, RefreshCw, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ShopCallbackResult } from '@/types/shop';
import { formatDate } from '@/utils/format';
import { ResultScreen } from './ConnectOutcome';
import {
  connectedOutcome,
  firstConnection,
  itemOutcome,
  reconnectSummary,
  remoteCountsSuffix,
  remoteCountsValue,
} from './connectResult';
import { platformLabel, STATUS_LABELS } from './shopSchemas';
import { shopDisplayName } from './shopList';

interface ConnectedScreenProps {
  result: ShopCallbackResult;
  /** Tên sàn API trả, dùng khi gian hàng chưa có platformName */
  platformName?: string;
  /** Không có thì ẩn nút thiết lập (người chỉ xem) */
  onSetup?: (shopId: string) => void;
  onView: (shopId: string) => void;
  onLater: () => void;
  onAddAnother?: () => void;
}

/** Màn kết quả khi sàn đã cấp token (.result của Test_UI): thay cho toast rồi tự chuyển trang */
export function ConnectedScreen({ result, platformName, onSetup, onView, onLater, onAddAnother }: ConnectedScreenProps) {
  const outcome = connectedOutcome(result);
  // previousStatus, remoteProductCount, remoteSkuCount chỉ có trong shops[] (§18.7.4)
  const first = firstConnection(result);
  const { shop } = first;
  const name = shopDisplayName(shop);
  const later = (
    <Button variant="outline" onClick={onLater}>
      Để sau
    </Button>
  );

  if (outcome === 'multiple') {
    const { shops } = result;
    const BADGE = {
      connected: { label: 'Mới kết nối', variant: 'success' },
      reconnected: { label: 'Kết nối lại', variant: 'secondary' },
      already_connected: { label: 'Đã có sẵn', variant: 'secondary' },
    } as const;
    return (
      <ResultScreen
        outcome="multiple"
        tone="ok"
        icon={Store}
        title={`Một lần uỷ quyền, ${shops.length} gian hàng`}
        description="Tài khoản sàn vừa uỷ quyền quản lý nhiều gian hàng. Gian hàng mới cần thiết lập lần đầu trước khi đồng bộ đơn."
        actions={later}
      >
        <ul className="grid w-full divide-y rounded-lg border text-start" data-testid="connected-shops">
          {shops.map((item) => {
            const badge = BADGE[itemOutcome(item)];
            return (
            <li key={item.shop.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-shop-id={item.shop.id}>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-medium">{shopDisplayName(item.shop)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{item.shop.externalShopId}</span>
                  {item.previousStatus ? ` · trước: ${STATUS_LABELS[item.previousStatus]}` : ''}
                  {remoteCountsSuffix(item)}
                </span>
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {item.shop.status === 'connecting' && onSetup ? (
                <Button size="sm" aria-label={`Thiết lập ${shopDisplayName(item.shop)}`} onClick={() => onSetup(item.shop.id)}>
                  Thiết lập
                </Button>
              ) : (
                <Button size="sm" variant="outline" aria-label={`Xem ${shopDisplayName(item.shop)}`} onClick={() => onView(item.shop.id)}>
                  Xem
                </Button>
              )}
            </li>
            );
          })}
        </ul>
      </ResultScreen>
    );
  }

  const platform = platformLabel(shop.platform, shop.platformName ?? platformName);

  if (outcome === 'connected') {
    return (
      <ResultScreen
        outcome="connected"
        tone="ok"
        icon={Check}
        title={`Đã kết nối ${name}`}
        description="Gian hàng chưa đồng bộ đơn, tồn cho đến khi xong thiết lập lần đầu: liên kết SKU, tồn đầu kỳ và ngày bắt đầu đồng bộ đơn."
        facts={[
          { label: 'Sàn', value: platform },
          { label: 'ID gian hàng', value: <span className="font-mono">{shop.externalShopId}</span> },
          { label: 'Sản phẩm trên sàn', value: remoteCountsValue(first) },
        ]}
        actions={
          <>
            {later}
            {onSetup && <Button onClick={() => onSetup(shop.id)}>Thiết lập ngay</Button>}
          </>
        }
      />
    );
  }

  const expires = shop.refreshExpiresAt ?? shop.accessExpiresAt;
  const before = first.previousStatus ? STATUS_LABELS[first.previousStatus] : null;
  const facts = [
    { label: 'ID gian hàng', value: <span className="font-mono">{shop.externalShopId}</span> },
    ...(before ? [{ label: 'Trạng thái trước', value: before }] : []),
    { label: 'Trạng thái hiện tại', value: STATUS_LABELS[shop.status] },
    ...(expires ? [{ label: 'Hạn uỷ quyền mới', value: formatDate(expires) }] : []),
  ];
  const view = <Button onClick={() => onView(shop.id)}>Xem {name}</Button>;

  if (outcome === 'reconnected') {
    const caughtUp = reconnectSummary(first.reconnect);
    return (
      <ResultScreen
        outcome="reconnected"
        tone="ok"
        icon={RefreshCw}
        title={`Đã kết nối lại ${name}`}
        description={
          caughtUp.length
            ? `Commerio đã ${caughtUp.join(', ')}.`
            : 'Gian hàng đồng bộ đơn và tồn lại như trước, liên kết SKU cũ giữ nguyên.'
        }
        facts={facts}
        actions={
          <>
            {later}
            {view}
          </>
        }
      />
    );
  }

  return (
    <ResultScreen
      outcome="already_connected"
      tone="neutral"
      icon={Store}
      title={`${name} đã có trong Commerio`}
      description={
        shop.status === 'connecting'
          ? 'Gian hàng đã kết nối trước đó và chưa xong thiết lập lần đầu. Commerio chỉ cấp lại token; bấm Tiếp tục thiết lập để làm tiếp.'
          : 'Gian hàng đang chạy nên Commerio chỉ cấp lại token, giữ nguyên liên kết SKU và lịch sử. Muốn thêm gian hàng khác, đăng xuất trên sàn rồi đăng nhập tài khoản của gian hàng đó.'
      }
      facts={facts}
      actions={
        <>
          {shop.status === 'connecting' && onSetup ? (
            <Button onClick={() => onSetup(shop.id)}>Tiếp tục thiết lập</Button>
          ) : (
            view
          )}
          {onAddAnother && (
            <Button variant="outline" onClick={onAddAnother}>
              Thêm gian hàng khác
            </Button>
          )}
        </>
      }
    />
  );
}
