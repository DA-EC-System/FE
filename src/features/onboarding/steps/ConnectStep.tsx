import { useState } from 'react';
import { Info, KeyRound, RefreshCw, Store, TriangleAlert, Unplug } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShopPlatforms, useShops } from '@/api/shops.api';
import { problemMessage, tokenSourcePhrase } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import type { Shop, ShopPlatform } from '@/types/shop';
import { ShopDisconnectDialog } from '@/features/channel/ShopDisconnectDialog';
import { ShopTokenForm } from '@/features/channel/ShopTokenForm';
import { failureScreen, type ConnectFailure } from '@/features/channel/connectFailure';
import { useStartConnect } from '@/features/channel/useStartConnect';
import { markWelcome } from '@/features/company/welcomeFlow';

const methodsOf = (p: ShopPlatform) => (p.methods?.length ? p.methods : ['oauth']);

/**
 * Bước 2 Kết nối gian hàng (FE#468, design v2.html s2, s2done). Uỷ quyền xong trang callback đưa về wizard; dán
 * token (shop thử) thì ở lại bước, xong gọi `onConnected`. Đã có gian hàng: hiện thẻ gian hàng, mất uỷ quyền thì
 * "Kết nối lại", muốn đổi gian hàng thì "Ngắt, nối gian hàng khác".
 */
export function ConnectStep({ companyId, shopId, onConnected }: { companyId: string; shopId: string | null; onConnected: () => void }) {
  const shops = useShops();
  const platforms = useShopPlatforms();
  const connector = useStartConnect();
  const [disconnecting, setDisconnecting] = useState<Shop | null>(null);

  const live = (shops.data?.items ?? []).filter((s) => s.status !== 'disconnected');
  const shop = live.find((s) => s.id === shopId) ?? live[0] ?? null;
  const list = (platforms.data?.items ?? []).filter((p) => p.connectable);
  const nameOf = (platform: string) => list.find((p) => p.platform === platform)?.name ?? shop?.platformName ?? platform;

  const startOAuth = (platform: string, reconnectShopId?: string) => {
    // Trang callback đọc dấu này để về thẳng wizard
    markWelcome(companyId);
    void connector.start({ platform, ...(reconnectShopId ? { shopId: reconnectShopId } : {}) });
  };

  if (shops.isPending || platforms.isPending) return <Skeleton className="h-32 w-full" />;
  if (shops.isError) return <AlertMessage severity="error">{problemMessage(shops.error)}</AlertMessage>;

  return (
    <div className="grid gap-4">
      {shop ? (
        <ShopCard
          shop={shop}
          platformName={nameOf(shop.platform)}
          reconnecting={connector.pending}
          onReconnect={() => startOAuth(shop.platform, shop.id)}
          onDisconnect={() => setDisconnecting(shop)}
        />
      ) : (
        <>
          <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="grid gap-1">
              <p>
                <b className="font-semibold">Dùng tài khoản người bán</b> (tài khoản vào trang quản lý gian hàng), không dùng tài khoản mua
                hàng. Commerio không lưu mật khẩu sàn.
              </p>
              <p>Quyền sẽ cấp: đọc sản phẩm và đơn hàng, cập nhật tồn và giá của gian hàng.</p>
            </div>
          </div>
          {platforms.isError && <AlertMessage severity="error">{problemMessage(platforms.error)}</AlertMessage>}
          {list.some((p) => methodsOf(p).includes('oauth')) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {list
                .filter((p) => methodsOf(p).includes('oauth'))
                .map((p) => (
                  <button
                    key={p.platform}
                    type="button"
                    disabled={connector.pending}
                    onClick={() => startOAuth(p.platform)}
                    className="flex items-center gap-3 rounded-lg border p-4 text-start transition-colors hover:border-primary hover:bg-accent disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-fill">
                      <Store className="size-5" aria-hidden />
                    </span>
                    <span className="grid gap-0.5">
                      <b className="font-semibold">{p.name}</b>
                      <span className="text-sm text-muted-foreground">
                        {connector.pending && connector.variables?.platform === p.platform
                          ? 'Đang mở trang của sàn...'
                          : `Mở trang uỷ quyền của ${p.name}`}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}
          {platforms.data && !list.length && <AlertMessage severity="warning">Chưa có sàn nào kết nối được.</AlertMessage>}
          <p className="text-sm text-muted-foreground">
            Uỷ quyền xong sẽ về thẳng bước Liên kết SKU sàn. Chưa có sản phẩm trong Commerio cũng được: bước sau tạo SKU kho từ sản phẩm
            đang bán trên sàn.
          </p>
          <TokenBlock platforms={list.filter((p) => methodsOf(p).includes('token'))} onConnected={onConnected} />
        </>
      )}
      <ShopDisconnectDialog
        shop={disconnecting}
        companyId={companyId}
        onClose={() => setDisconnecting(null)}
        onConflict={() => void shops.refetch()}
      />
    </div>
  );
}

function ShopCard({
  shop,
  platformName,
  reconnecting,
  onReconnect,
  onDisconnect,
}: {
  shop: Shop;
  platformName: string;
  reconnecting: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const lost = shop.status === 'needs_reauth';
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 rounded-lg border p-4', lost && 'border-destructive/40 bg-destructive/5')}
      data-testid="wizard-shop-card"
      data-status={shop.status}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-fill">
        {lost ? <TriangleAlert className="size-5 text-destructive" aria-hidden /> : <Store className="size-5" aria-hidden />}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate font-semibold">{shop.shopName}</b>
        <span className="text-sm text-muted-foreground">
          {lost
            ? `${platformName} · Commerio mất quyền truy cập gian hàng (token hết hạn hoặc bị thu hồi). Kết nối lại bằng đúng tài khoản người bán của gian hàng này.`
            : platformName}
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        {lost && (
          <Button size="sm" onClick={onReconnect} disabled={reconnecting}>
            <RefreshCw />
            {reconnecting ? 'Đang mở trang của sàn...' : 'Kết nối lại'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onDisconnect}>
          <Unplug />
          Ngắt, nối gian hàng khác
        </Button>
      </span>
    </div>
  );
}

/**
 * Ô dán token cho sàn có `methods` chứa `token` (shop thử của nhà phát triển, lỗi 15). Gập sẵn; ô Sàn chỉ liệt kê
 * sàn nhận token. Chữ nguồn lấy token theo sàn (`tokenSourcePhrase`), không cứng tên trang của sàn nào.
 */
function TokenBlock({ platforms, onConnected }: { platforms: ShopPlatform[]; onConnected: () => void }) {
  const [platform, setPlatform] = useState(platforms[0]?.platform ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ConnectFailure | null>(null);
  if (!platforms.length) return null;
  const current = platforms.find((p) => p.platform === platform) ?? platforms[0];
  const screen = failure ? failureScreen(failure, current.name) : null;
  return (
    <details className="max-w-2xl rounded-lg border px-4 py-3" data-testid="wizard-token-block">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <KeyRound className="size-4" aria-hidden />
        Kết nối shop thử bằng mã truy cập (access token)
      </summary>
      <div className="mt-3 grid gap-4">
        <p className="text-sm text-muted-foreground">
          Dùng cho shop thử của nhà phát triển, không đi qua trang uỷ quyền. Commerio chỉ lưu token đã mã hoá. Lấy token{' '}
          {tokenSourcePhrase(current.platform)}.
        </p>
        {platforms.length > 1 && (
          <label className="grid max-w-xs gap-1.5 text-sm font-medium">
            Sàn
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
              value={current.platform}
              disabled={busy}
              onChange={(e) => {
                setPlatform(e.target.value);
                setFailure(null);
              }}
            >
              {platforms.map((p) => (
                <option key={p.platform} value={p.platform}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {screen && (
          <AlertMessage severity="error">
            <p className="font-medium">{screen.title}</p>
            <div className="text-sm">{screen.description}</div>
          </AlertMessage>
        )}
        <ShopTokenForm
          key={current.platform}
          platform={current.platform}
          name={current.name}
          backLabel="Dán token khác"
          onBack={() => setFailure(null)}
          onBusyChange={setBusy}
          onDone={() => {
            setFailure(null);
            onConnected();
          }}
          onFailure={setFailure}
        />
      </div>
    </details>
  );
}
