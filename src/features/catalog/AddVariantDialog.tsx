import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { problemCode, problemMessage } from '@/api/problemMessages';
import { renderSku } from '@/utils/sku';
import type { Attribute, ProductDetail, ProductSettings } from '@/types/catalog';
import { comboKey, valueIndex } from './shared';

interface AddVariantDialogProps {
  open: boolean;
  product: ProductDetail;
  /** Mẫu SKU và số thứ tự kế tiếp của công ty */
  settings: ProductSettings | undefined;
  attributes: Attribute[];
  /** Danh sách thuộc tính đang tải */
  loading?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Tổ hợp trùng SKU đã lưu trữ: mở hộp Khôi phục SKU đó (§17.2, không bán lại ngầm) */
  onRestore: (variantId: string) => void;
}

/** UC-CP-02 bước 5–7: thêm tổ hợp mới; tổ hợp đã có thì báo biến thể đã tồn tại (AC-12) */
export function AddVariantDialog({
  open,
  product,
  settings,
  attributes,
  loading,
  onClose,
  onDone,
  onRestore,
}: AddVariantDialogProps) {
  const addMut = useAddVariant();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /** 409 variant_archived kèm variantId (người khác vừa lưu trữ đúng tổ hợp này) */
  const [archivedId, setArchivedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPicked({});
      setError(null);
      setArchivedId(null);
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
    : complete && settings
      ? renderSku(settings.skuPattern, settings.skuNextSeq, ids.map((id) => index.get(id)?.code ?? ''))
      : '—';

  const submit = async () => {
    setError(null);
    setArchivedId(null);
    try {
      const variant = await addMut.mutateAsync({ productId: product.id, attributeValueIds: ids });
      onDone(`Đã thêm biến thể ${variant.sku}`);
    } catch (e) {
      if (problemCode(e) === 'variant_archived' && getProblem(e)?.variantId) {
        setArchivedId(getProblem(e)!.variantId!);
        setError(problemMessage(e));
        return;
      }
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

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            Đang tải thuộc tính…
          </p>
        ) : !productAttributes.length ? (
          <AlertMessage severity="info">
            Sản phẩm này không có phân loại (màu, cỡ…) nên chỉ có một SKU. Muốn bán theo màu, cỡ thì tạo
            sản phẩm mới có phân loại.
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
            {existing && existing.businessStatus !== 'archived' && (
              <AlertMessage severity="warning">Variant đã có ({existing.sku}).</AlertMessage>
            )}
            {existing?.businessStatus === 'archived' && (
              <AlertMessage severity="info">
                Phân loại này đã có SKU {existing.sku} (đã lưu trữ). Bấm Khôi phục để bán lại với SKU cũ.
              </AlertMessage>
            )}
          </div>
        )}
        {error && <AlertMessage severity="error">{error}</AlertMessage>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          {existing?.businessStatus === 'archived' || archivedId ? (
            <Button type="button" onClick={() => onRestore(existing?.id ?? archivedId!)}>
              Khôi phục {existing?.sku ?? 'SKU đó'}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={submit}
              disabled={loading || !complete || Boolean(existing) || busy}
            >
              {busy ? 'Đang lưu...' : 'Thêm'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
