import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDisconnectShop } from '@/api/shops.api';
import { getProblem, type ProblemDetails } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import type { Shop, ShopOpenOrder } from '@/types/shop';
import { isUsable, platformLabel } from './shopSchemas';

/** Chữ phải gõ để xác nhận ngắt */
const CONFIRM_WORD = 'NGAT';

interface Blocked {
  message: string;
  count: number | null;
  orders: ShopOpenOrder[];
}

interface ShopDisconnectDialogProps {
  shop: Shop | null;
  companyId: string;
  onClose: () => void;
  /** 409 version_conflict: nơi gọi nạp lại danh sách */
  onConflict: () => void;
}

/** Hộp ngắt kết nối (Test_UI): mặc định đặt tồn về 0, gõ NGAT để xác nhận; còn đơn chưa xong thì hiện danh sách đơn */
export function ShopDisconnectDialog({ shop, companyId, onClose, onConflict }: ShopDisconnectDialogProps) {
  // Mở lại cho gian hàng khác thì về trạng thái đầu (key theo id)
  return (
    <Dialog open={Boolean(shop)} onOpenChange={(next) => !next && onClose()}>
      {shop && <DisconnectContent key={shop.id} shop={shop} companyId={companyId} onClose={onClose} onConflict={onConflict} />}
    </Dialog>
  );
}

function DisconnectContent({ shop, companyId, onClose, onConflict }: { shop: Shop } & Omit<ShopDisconnectDialogProps, 'shop'>) {
  const usable = isUsable(shop.status);
  const [zeroStock, setZeroStock] = useState(usable);
  const [typed, setTyped] = useState('');
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const disconnect = useDisconnectShop();
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const ordersLink = `${ROUTES.company.orders(companyId)}?shopId=${encodeURIComponent(shop.id)}`;

  const submit = async () => {
    try {
      await disconnect.mutateAsync({ id: shop.id, version: shop.version, zeroStock: usable && zeroStock });
      toast.success(`Đã ngắt kết nối ${shop.shopName}${usable && zeroStock ? ', tồn trên sàn đã về 0' : ''}`);
      onClose();
    } catch (e) {
      const code = problemCode(e);
      if (code === 'shop_has_open_orders') {
        // Gian hàng chưa ngắt: giữ hộp mở, hiện đơn còn dở để mở danh sách đơn từ đây
        // Kèm tối đa 20 đơn chưa xong
        const p = getProblem(e) as (ProblemDetails & { orders?: ShopOpenOrder[] }) | undefined;
        setBlocked({
          message: problemMessage(e),
          count: typeof p?.openOrders === 'number' ? p.openOrders : null,
          orders: p?.orders ?? [],
        });
        return;
      }
      if (code === 'version_conflict') {
        toast.warning(`${shop.shopName} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại danh sách.`);
        onConflict();
      } else {
        toast.error(problemMessage(e));
      }
      onClose();
    }
  };

  if (blocked) {
    const shown = blocked.orders.length;
    return (
      <DialogContent className="sm:max-w-xl" data-testid="disconnect-blocked">
        <DialogHeader>
          <DialogTitle>
            {blocked.count ? `Chưa ngắt được: còn ${blocked.count} đơn chưa xong` : 'Chưa ngắt được: còn đơn chưa xong'}
          </DialogTitle>
          <DialogDescription>{blocked.message}</DialogDescription>
        </DialogHeader>
        {shown > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table aria-label="Đơn chưa xong">
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Mã đơn sàn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocked.orders.map((o) => (
                  <TableRow key={o.id} data-order-id={o.id}>
                    <TableCell>
                      <Link to={ROUTES.company.order(companyId, o.id)} className="font-medium text-primary hover:underline">
                        {o.code}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.externalOrderId ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {blocked.count != null && blocked.count > shown && shown > 0 && (
          <p className="text-sm text-muted-foreground">Hiện {shown} đơn cũ nhất, mở đơn bán để xem đủ.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button asChild>
            <Link to={ordersLink}>Mở đơn bán</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Ngắt kết nối {shop.shopName}?</DialogTitle>
        <DialogDescription asChild>
          <div>
            <p>
              {platformLabel(shop.platform, shop.platformName)}, mã <span className="font-mono">{shop.externalShopId}</span>.
              Commerio ngừng nhận đơn và ngừng đẩy giá, tồn lên gian hàng này; sản phẩm trên sàn được gỡ xuống.
            </p>
            <ul className="mt-2 list-disc ps-5 text-foreground-2">
              <li>Đơn, đối soát và ghép SKU cũ vẫn giữ.</li>
              <li>Kết nối lại đúng gian hàng thì sản phẩm được đưa lên sàn lại.</li>
            </ul>
          </div>
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5">
        <Checkbox
          id="zero-stock"
          checked={usable && zeroStock}
          disabled={!usable}
          onCheckedChange={(v) => setZeroStock(v === true)}
        />
        <Label htmlFor="zero-stock" className="grid gap-0.5 font-normal text-foreground">
          Đặt tồn trên sàn về 0
          <span className="text-xs text-muted-foreground">
            {usable ? 'Tránh khách đặt hàng trong lúc gỡ sản phẩm trên sàn.' : 'Không làm được: sàn đã thu hồi quyền.'}
          </span>
        </Label>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="disconnect-confirm">
          Gõ <span className="font-mono font-semibold">{CONFIRM_WORD}</span> để xác nhận
        </Label>
        <Input
          id="disconnect-confirm"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && confirmed && !disconnect.isPending) void submit();
          }}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={disconnect.isPending} onClick={onClose}>
          Huỷ
        </Button>
        <Button variant="destructive" disabled={!confirmed || disconnect.isPending} onClick={() => void submit()}>
          Ngắt kết nối
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
