import { useEffect, useMemo, useState } from 'react';
import { AlertMessage } from '@/components/common/AlertMessage';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAddVariant } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { renderSku } from '@/utils/sku';
import type { Attribute, Category, ProductDetail } from '@/types/catalog';
import { comboKey, valueIndex } from './shared';

interface AddVariantDialogProps {
  open: boolean;
  product: ProductDetail;
  category: Category | undefined;
  attributes: Attribute[];
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-CP-02 bước 5–7: thêm tổ hợp mới; tổ hợp đã có thì báo biến thể đã tồn tại (AC-12) */
export function AddVariantDialog({
  open,
  product,
  category,
  attributes,
  onClose,
  onDone,
}: AddVariantDialogProps) {
  const addMut = useAddVariant();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPicked({});
      setError(null);
    }
  }, [open]);

  // Mọi biến thể của sản phẩm dùng cùng bộ thuộc tính, lấy theo biến thể đầu tiên
  const productAttributes = useMemo(() => {
    const ids = product.variants[0]?.attributes.map((a) => a.attributeId) ?? [];
    return attributes.filter((a) => ids.includes(a.id));
  }, [product, attributes]);

  const index = useMemo(() => valueIndex(attributes), [attributes]);
  const ids = productAttributes.map((a) => picked[a.id]).filter(Boolean);
  const complete = productAttributes.length > 0 && ids.length === productAttributes.length;
  const existing = complete
    ? product.variants.find((v) => comboKey(v.attributes.map((a) => a.valueId)) === comboKey(ids))
    : undefined;

  const preview = existing
    ? existing.sku
    : complete && category
      ? renderSku(category.skuPattern, category.skuNextSeq, ids.map((id) => index.get(id)?.code ?? ''))
      : '—';

  const submit = async () => {
    setError(null);
    try {
      const variant = await addMut.mutateAsync({ productId: product.id, attributeValueIds: ids });
      onDone(existing ? `Đã bán lại biến thể ${variant.sku}` : `Đã thêm biến thể ${variant.sku}`);
    } catch (e) {
      // V23: thiếu hoặc thừa thuộc tính so với các biến thể đang có
      setError(getProblem(e)?.errors?.attributeValueIds ?? problemMessage(e));
    }
  };

  const busy = addMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm biến thể</DialogTitle>
          <DialogDescription>Chọn một giá trị cho từng thuộc tính của sản phẩm.</DialogDescription>
        </DialogHeader>

        {!productAttributes.length ? (
          <AlertMessage severity="info">
            Sản phẩm tạo không có thuộc tính nên chỉ có một biến thể. Muốn bán theo màu, cỡ… hãy tạo
            sản phẩm mới với các thuộc tính đó.
          </AlertMessage>
        ) : (
          <div className="grid gap-4">
            {productAttributes.map((a) => (
              <div key={a.id} className="grid gap-1.5">
                <Label htmlFor={`attr-${a.id}`}>{a.name}</Label>
                <Select
                  value={picked[a.id] ?? ''}
                  onValueChange={(v) => setPicked((p) => ({ ...p, [a.id]: v }))}
                >
                  <SelectTrigger id={`attr-${a.id}`} className="w-full" aria-label={a.name}>
                    <SelectValue placeholder={`Chọn ${a.name.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {a.values.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="rounded-md bg-muted p-3" data-testid="variant-sku-preview">
              <p className="text-xs text-muted-foreground">
                {existing ? 'SKU của biến thể' : 'SKU dự kiến'}
              </p>
              <p className="font-mono text-sm">{preview}</p>
            </div>
            {existing && !existing.archivedAt && (
              <AlertMessage severity="warning">Biến thể đã tồn tại ({existing.sku}).</AlertMessage>
            )}
            {existing?.archivedAt && (
              <AlertMessage severity="info">
                Tổ hợp này từng ngừng bán; lưu sẽ bán lại với SKU cũ.
              </AlertMessage>
            )}
          </div>
        )}
        {error && <AlertMessage severity="error">{error}</AlertMessage>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!complete || Boolean(existing && !existing.archivedAt) || busy}
          >
            {busy ? 'Đang lưu...' : existing ? 'Bán lại' : 'Thêm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
