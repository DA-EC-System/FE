import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useUpdateShop } from '@/api/shops.api';
import type { Shop } from '@/types/shop';
import { shopDisplayName } from './shopList';

/** Giới hạn của BE (CHECK `shops_display_name`, commerio-backend#565) */
export const DISPLAY_NAME_MAX = 60;

interface ShopRenameDialogProps {
  shop: Shop | null;
  onClose: () => void;
  /** 409 version_conflict: nơi gọi nạp lại danh sách */
  onConflict: () => void;
}

/**
 * Đặt tên hiển thị cho gian hàng (FE#464, commerio-backend#565). Tên trên sàn có khi chỉ là mã thô
 * (TikTok sandbox `SANDBOX_VN…`); để trống thì bỏ tên riêng, hiện lại tên trên sàn.
 */
export function ShopRenameDialog({ shop, onClose, onConflict }: ShopRenameDialogProps) {
  return (
    <Dialog open={Boolean(shop)} onOpenChange={(next) => !next && onClose()}>
      {shop && <RenameContent key={shop.id} shop={shop} onClose={onClose} onConflict={onConflict} />}
    </Dialog>
  );
}

function RenameContent({ shop, onClose, onConflict }: { shop: Shop; onClose: () => void; onConflict: () => void }) {
  const update = useUpdateShop();
  const [value, setValue] = useState(shop.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const trimmed = value.trim();
  const unchanged = trimmed === (shop.displayName ?? '').trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed.length > DISPLAY_NAME_MAX) {
      setError(`Tên hiển thị tối đa ${DISPLAY_NAME_MAX} ký tự`);
      return;
    }
    const displayName = trimmed || null;
    update.mutate(
      { id: shop.id, version: shop.version, displayName },
      {
        onSuccess: (saved) => {
          toast.success(displayName ? `Đã đổi tên hiển thị thành ${shopDisplayName(saved)}` : `Đã dùng lại tên trên sàn ${saved.shopName}`);
          onClose();
        },
        onError: (err) => {
          if (problemCode(err) === 'version_conflict') {
            setError(null);
            setNotice('Gian hàng vừa được người khác sửa. Đã nạp lại, bấm Lưu lần nữa để đổi tên.');
            onConflict();
            return;
          }
          setNotice(null);
          setError(getProblem(err)?.errors?.displayName ?? problemMessage(err));
        },
      },
    );
  };

  const describedBy = ['shop-display-name-hint', error ? 'shop-display-name-error' : null].filter(Boolean).join(' ');

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Đổi tên hiển thị</DialogTitle>
          <DialogDescription>
            Tên trên sàn: <span className="font-mono break-all">{shop.shopName}</span>. Tên hiển thị chỉ dùng trong Commerio, không
            đổi tên gian hàng trên sàn.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="shop-display-name">Tên hiển thị</Label>
          <Input
            id="shop-display-name"
            value={value}
            autoComplete="off"
            maxLength={DISPLAY_NAME_MAX + 20}
            placeholder={shop.shopName}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
          <p id="shop-display-name-hint" className="text-xs text-muted-foreground">
            Tối đa {DISPLAY_NAME_MAX} ký tự ({trimmed.length}/{DISPLAY_NAME_MAX}). Để trống để dùng tên trên sàn.
          </p>
          {error && (
            <p id="shop-display-name-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-xs text-warning" data-testid="shop-rename-notice">
              {notice}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" disabled={update.isPending || (unchanged && !notice)}>
            {update.isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
