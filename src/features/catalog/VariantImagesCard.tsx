import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uploadProductImage, useRemoveValueImage, useSetValueImage, useUpdateProduct } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import type { ProductDetail } from '@/types/catalog';
import { ImagePrepareError, prepareProductImage } from './compressImage';
import { SOURCE_IMAGE_TYPES, imageFileError, productPatchBody, sourceImageError } from './shared';
import { productAxes } from './valueImages';

const NONE = '__none';

interface VariantImagesCardProps {
  product: ProductDetail;
  readOnly: boolean;
  /** Bản mới sau khi đổi thuộc tính gắn ảnh (version tăng): form cập nhật version đang giữ */
  onSaved: (p: ProductDetail) => void;
}

/**
 * Ảnh phân loại trên trang sản phẩm (Documents/21 §17.2, commerio-backend#340): chọn một trục gắn ảnh, mỗi giá trị một
 * ảnh. Ảnh lưu ngay khi tải, không cần bấm Lưu. Đổi trục gắn ảnh thì BE gỡ mọi ảnh của trục cũ nên hỏi trước.
 */
export function VariantImagesCard({ product, readOnly, onSaved }: VariantImagesCardProps) {
  const axes = productAxes(product);
  const updateMut = useUpdateProduct();
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  if (!axes.length) return null;

  const current = axes.find((a) => a.attributeId === product.imageAttributeId) ?? null;
  const images = new Map((product.attributeValueImages ?? []).map((i) => [i.attributeValueId, i]));
  const imageCount = current ? current.values.filter((v) => images.has(v.id)).length : 0;

  const applyAxis = async (next: string | null) => {
    setPending(undefined);
    try {
      const saved = await updateMut.mutateAsync({ id: product.id, ...productPatchBody(product, { imageAttributeId: next }) });
      onSaved(saved);
      toast.success(next ? 'Đã chọn thuộc tính gắn ảnh' : 'Đã bỏ ảnh theo phân loại');
    } catch (e) {
      toast[problemCode(e) === 'version_conflict' ? 'warning' : 'error'](
        problemCode(e) === 'version_conflict'
          ? 'Người khác vừa sửa sản phẩm này. Tải lại trang rồi chọn lại.'
          : (getProblem(e)?.errors?.imageAttributeId ?? problemMessage(e)),
      );
    }
  };
  const choose = (value: string) => {
    const next = value === NONE ? null : value;
    if (next === (product.imageAttributeId ?? null)) return;
    if (imageCount > 0) setPending(next);
    else void applyAxis(next);
  };

  return (
    <Card id="product-field-variant-images">
      <CardHeader>
        <CardTitle>Ảnh theo phân loại</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="image-attribute">Gắn ảnh theo</Label>
          <Select value={current?.attributeId ?? NONE} onValueChange={choose} disabled={readOnly || updateMut.isPending}>
            <SelectTrigger id="image-attribute" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Không dùng</SelectItem>
              {axes.map((a) => (
                <SelectItem key={a.attributeId} value={a.attributeId}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current && (
            <span className="text-xs text-muted-foreground">
              {imageCount}/{current.values.length} giá trị có ảnh
            </span>
          )}
        </div>
        {current ? (
          <>
            <div className="flex flex-wrap gap-3">
              {current.values.map((v) => (
                <ValueImage
                  key={v.id}
                  productId={product.id}
                  valueId={v.id}
                  label={v.value}
                  url={images.get(v.id)?.url ?? null}
                  hasImage={images.has(v.id)}
                  readOnly={readOnly}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Ảnh lưu ngay khi tải lên. Sàn cần ảnh cho mọi giá trị đang bán; thiếu một phần thì sản phẩm chưa &lsquo;Sẵn
              sàng&rsquo; và chưa đẩy được.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chọn một phân loại (thường là màu) để mỗi giá trị có ảnh riêng trên sàn. Không bắt buộc.
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={pending !== undefined}
        title="Đổi thuộc tính gắn ảnh?"
        message={`Đổi thuộc tính gắn ảnh sẽ bỏ ${imageCount} ảnh phân loại đang có.`}
        confirmLabel="Đổi"
        destructive
        loading={updateMut.isPending}
        onConfirm={() => void applyAxis(pending ?? null)}
        onClose={() => setPending(undefined)}
      />
    </Card>
  );
}

function ValueImage({
  productId,
  valueId,
  label,
  url,
  hasImage,
  readOnly,
}: {
  productId: string;
  valueId: string;
  label: string;
  url: string | null;
  hasImage: boolean;
  readOnly: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setMut = useSetValueImage();
  const removeMut = useRemoveValueImage();
  const [uploading, setUploading] = useState(false);
  const busy = uploading || setMut.isPending || removeMut.isPending;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const source = sourceImageError(file);
    if (source) {
      toast.warning(source);
      return;
    }
    setUploading(true);
    try {
      const prepared = await prepareProductImage(file);
      const message = imageFileError(prepared);
      if (message) throw new ImagePrepareError(message.slice(prepared.name.length + 2));
      const fileId = await uploadProductImage(prepared);
      await setMut.mutateAsync({ productId, attributeValueId: valueId, fileId });
    } catch (e) {
      const errs = getProblem(e)?.errors;
      toast.warning(
        `${label}: ${e instanceof ImagePrepareError ? e.message : (errs?.image ?? errs?.attributeValueId ?? getErrorMessage(e))}`,
      );
    } finally {
      setUploading(false);
    }
  };
  const remove = async () => {
    try {
      await removeMut.mutateAsync({ productId, attributeValueId: valueId });
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  return (
    <div className="grid w-24 gap-1">
      {hasImage ? (
        <div className="relative size-24 overflow-hidden rounded-md border bg-muted">
          {url ? (
            <img src={url} alt={`Ảnh ${label}`} className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-xs text-muted-foreground">Đã có ảnh</span>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={`Gỡ ảnh ${label}`}
              className="absolute top-1 right-1 h-6 px-1.5 text-xs"
              disabled={busy}
              onClick={() => void remove()}
            >
              {removeMut.isPending ? 'Đang gỡ' : 'Gỡ'}
            </Button>
          )}
        </div>
      ) : readOnly ? (
        <div className="grid size-24 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Chưa có</div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="size-24 flex-col border-dashed text-xs"
          disabled={busy}
          aria-label={`Thêm ảnh ${label}`}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Đang tải' : 'Thêm ảnh'}
        </Button>
      )}
      <span className="truncate text-center text-xs" title={label}>
        {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={SOURCE_IMAGE_TYPES.join(',')}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
