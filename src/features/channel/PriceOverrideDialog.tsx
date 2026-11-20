import { useEffect, useState } from 'react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatMoneyInput, parseMoney, priceText } from '@/utils/price';
import type { ListingRow } from '@/types/shop';
import { PRICE_SOURCE_LABEL } from './listingPrice';

interface PriceOverrideDialogProps {
  row: ListingRow | null;
  saving: boolean;
  /** Lỗi BE gắn với ô giá (422 `below_floor`, `validation_failed`) */
  fieldError: string | null;
  /** Lỗi chung (409, mạng) */
  error: string | null;
  onSave: (price: number | null) => void;
  onClose: () => void;
}

/**
 * Ghi đè giá tay của một listing (FE#274, BE#225, Documents/21 §18.6.7). Giá ghi đè thay giá theo gian hàng và giá chuẩn
 * cho riêng SKU này; "Bỏ ghi đè" trả về giá theo gian hàng hoặc giá chuẩn
 */
export function PriceOverrideDialog({ row, saving, fieldError, error, onSave, onClose }: PriceOverrideDialogProps) {
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Đặt lại ô khi mở cho biến thể khác; 409 nạp dòng mới cùng biến thể thì giữ chữ đã gõ
  const variantId = row?.variantId;
  useEffect(() => {
    if (!row) return;
    setText(formatMoneyInput(row.price));
    setInputError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId]);

  const submit = () => {
    const parsed = parseMoney(text);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    if (parsed.value === null) {
      setInputError('Nhập giá bán');
      return;
    }
    if (parsed.value <= 0) {
      setInputError('Giá phải lớn hơn 0');
      return;
    }
    setInputError(null);
    onSave(parsed.value);
  };

  const shownError = inputError ?? fieldError;
  const overridden = row?.priceSource === 'override';
  const fallback = row?.shopPrice ?? null;

  return (
    <Dialog open={row !== null} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ghi đè giá</DialogTitle>
          <DialogDescription>
            Giá ghi đè chỉ áp cho {row?.listing?.sellerSku || row?.sku} ở gian hàng này, thay giá theo gian hàng và giá chuẩn.
            Bấm Đồng bộ để đẩy giá mới lên sàn.
          </DialogDescription>
        </DialogHeader>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        {row && (
          <p className="text-sm text-muted-foreground" data-testid="price-current">
            Đang bán {row.price === null ? 'chưa có giá' : priceText(row.price)}
            {row.priceSource ? ` (${PRICE_SOURCE_LABEL[row.priceSource]})` : ''}
            {overridden
              ? fallback !== null
                ? `. Bỏ ghi đè thì về ${priceText(fallback)} theo gian hàng.`
                : '. Bỏ ghi đè thì về giá chuẩn của SKU.'
              : '.'}
          </p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="price-override">Giá bán (đồng)</Label>
          <MoneyInput
            id="price-override"
            value={text}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? 'price-override-error' : undefined}
            onChange={setText}
            onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
          />
          {shownError && (
            <p id="price-override-error" className="text-sm text-destructive" data-testid="price-error">
              {shownError}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {overridden ? (
            <Button variant="outline" disabled={saving} onClick={() => onSave(null)}>
              Bỏ ghi đè
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={onClose}>
              Huỷ
            </Button>
            <Button disabled={saving} onClick={submit}>
              {saving ? 'Đang lưu...' : 'Lưu giá'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
