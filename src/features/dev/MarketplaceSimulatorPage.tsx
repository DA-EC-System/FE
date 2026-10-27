import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFireMarketplaceEvent, useMarketplaceEvents } from '@/api/devMarketplace.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import { formatDateTime } from '@/utils/format';
import type { MarketplaceEventType } from '@/types/devMarketplace';

/**
 * Trang dev: phát sự kiện sàn đẩy về (đơn mới, đổi trạng thái vận chuyển, yêu cầu trả,
 * thu hồi quyền...) để trình bày luồng do sàn khởi phát. Chỉ có route khi chạy mock.
 */
export function MarketplaceSimulatorPage() {
  const events = useMarketplaceEvents();
  const shops = useShops({ pageSize: 100 });
  const fire = useFireMarketplaceEvent();
  const [shopId, setShopId] = useState('');
  const shop = shops.data?.items.find((s) => s.id === shopId);
  const shopName = (id: string | null) => shops.data?.items.find((s) => s.id === id)?.shopName;

  const groups = useMemo(() => {
    const map = new Map<string, MarketplaceEventType[]>();
    for (const t of events.data?.types ?? []) map.set(t.group, [...(map.get(t.group) ?? []), t]);
    return [...map];
  }, [events.data]);

  const disabledReason = (t: MarketplaceEventType) => {
    if (t.needsShop && !shop) return 'Chọn gian hàng';
    if (shop && t.platforms && !t.platforms.includes(shop.platform)) return 'Sàn này không có sự kiện này';
    return null;
  };

  const onFire = async (t: MarketplaceEventType) => {
    try {
      const entry = await fire.mutateAsync({ type: t.type, shopId: shop?.id });
      toast.success(entry.message);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  if (events.isLoading) return <PageSpinner />;
  return (
    <>
      <PageHeader title="Sàn giả lập" subtitle="Phát sự kiện mà sàn đẩy về. Chỉ có khi chạy dữ liệu giả." />
      {events.isError && <AlertMessage severity="error">{problemMessage(events.error)}</AlertMessage>}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-4">
          <div className="grid max-w-sm gap-2">
            <Label htmlFor="sim-shop">Gian hàng</Label>
            <Select value={shopId} onValueChange={setShopId}>
              <SelectTrigger id="sim-shop" data-testid="sim-shop">
                <SelectValue placeholder="Chọn gian hàng" />
              </SelectTrigger>
              <SelectContent>
                {shops.data?.items.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.shopName} · {PLATFORM_LABELS[s.platform]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {groups.map(([group, types]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="text-base">{group}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {types.map((t) => {
                  const reason = disabledReason(t);
                  return (
                    <div key={t.type} className="flex flex-wrap items-center justify-between gap-3" data-event={t.type}>
                      <div className="grid gap-0.5">
                        <span className="font-medium">{t.label}</span>
                        <span className="text-sm text-muted-foreground">{t.description}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(reason) || fire.isPending}
                        title={reason ?? undefined}
                        onClick={() => onFire(t)}
                      >
                        Phát
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle className="text-base">Đã phát</CardTitle>
          </CardHeader>
          <CardContent>
            {!events.data?.log.length ? (
              <p className="text-sm text-muted-foreground">Chưa phát sự kiện nào.</p>
            ) : (
              <ol className="grid gap-3 text-sm" data-testid="sim-log">
                {events.data.log.map((e) => (
                  <li key={e.id} className="grid gap-1 border-s-2 ps-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{e.label}</Badge>
                      {e.shopId && <span className="text-muted-foreground">{shopName(e.shopId)}</span>}
                    </span>
                    <span>{e.message}</span>
                    <span className="text-muted-foreground">{formatDateTime(e.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
