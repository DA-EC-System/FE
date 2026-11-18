import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteShop } from '@/api/shops.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import type { Shop } from '@/types/shop';
import { DELETE_CONFIRM_WORD, deleteConfirmed, platformLabel } from './shopSchemas';

interface ShopDeleteDialogProps {
  /** Gian hàng đang xoá, lấy từ danh sách mới nhất để version theo kịp sau khi nạp lại */
  shop: Shop | null;
  onClose: () => void;
  /** 409: nơi gọi nạp lại danh sách gian hàng */
  onStale: () => void;
}

/** Xoá vĩnh viễn gian hàng đã ngắt (FE#297, commerio-backend#398): gõ XOA để xác nhận */
export function ShopDeleteDialog({ shop, onClose, onStale }: ShopDeleteDialogProps) {
  // Mở cho gian hàng khác thì về trạng thái đầu (key theo id); nạp lại danh sách thì giữ chữ đã gõ
  return (
    <AlertDialog open={Boolean(shop)}>
      {shop && <DeleteContent key={shop.id} shop={shop} onClose={onClose} onStale={onStale} />}
    </AlertDialog>
  );
}

function DeleteContent({ shop, onClose, onStale }: { shop: Shop } & Omit<ShopDeleteDialogProps, 'shop'>) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const del = useDeleteShop();
  const confirmed = deleteConfirmed(typed);
  const pending = del.isPending;

  const close = () => {
    if (!pending) onClose();
  };

  const submit = async () => {
    if (!confirmed || pending) return;
    setError(null);
    try {
      const { deleted } = await del.mutateAsync({ id: shop.id, confirm: DELETE_CONFIRM_WORD, version: shop.version });
      toast.success(
        `Đã xoá ${shop.shopName}: ${deleted.orders} đơn, ${deleted.packages} kiện, ${deleted.listings} listing`,
      );
      onClose();
    } catch (e) {
      const code = problemCode(e);
      // 409: giữ hộp và chữ đã gõ, nạp lại danh sách để biết trạng thái, version mới
      if (code === 'shop_not_disconnected') {
        setError('Gian hàng chưa ngắt kết nối. Đã nạp lại danh sách.');
        onStale();
        return;
      }
      if (code === 'version_conflict') {
        setError(`${shop.shopName} vừa được người khác sửa. Chưa xoá gì, đã nạp lại danh sách; xem lại rồi bấm Xoá vĩnh viễn.`);
        onStale();
        return;
      }
      setError(problemMessage(e));
    }
  };

  return (
    <AlertDialogContent
      className="sm:max-w-md"
      data-testid="shop-delete-dialog"
      // Mở hộp thì con trỏ ở ô gõ XOA, không bao giờ ở nút xoá
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        inputRef.current?.focus();
      }}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Xoá vĩnh viễn {shop.shopName}?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="grid gap-2">
            <p>
              {platformLabel(shop.platform, shop.platformName)}, mã <span className="font-mono">{shop.externalShopId}</span>.
              Mọi dữ liệu của gian hàng này bị xoá và <strong className="text-foreground">không hoàn tác được</strong>:
            </p>
            <ul className="list-disc ps-5 text-foreground-2">
              <li>Đơn, kiện, yêu cầu trả hàng</li>
              <li>Sản phẩm trên sàn (listing) và ghép SKU</li>
              <li>Đối soát, sổ tiền và số liệu báo cáo của gian hàng</li>
            </ul>
            <p>Tồn kho và phiếu kho đã ghi sổ được giữ nguyên.</p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="shop-delete-confirm">
          Gõ <span className="font-mono font-semibold">{DELETE_CONFIRM_WORD}</span> để xác nhận
        </Label>
        <Input
          id="shop-delete-confirm"
          ref={inputRef}
          value={typed}
          autoComplete="off"
          disabled={pending}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>
      {error && (
        <Alert variant="destructive" data-testid="shop-delete-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <Button variant="outline" disabled={pending} onClick={close}>
          Huỷ
        </Button>
        <Button variant="destructive" disabled={!confirmed || pending} onClick={() => void submit()}>
          {pending ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
