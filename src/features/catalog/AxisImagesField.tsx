import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uploadProductImage } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { ImagePrepareError, prepareProductImage } from './compressImage';
import { SOURCE_IMAGE_TYPES, imageFileError, sourceImageError } from './shared';
import { imageKey, type VariantDraft } from './variantDraft';

const NONE = '__none';

interface AxisImagesFieldProps {
  value: VariantDraft;
  onChange: (draft: VariantDraft) => void;
  /** Đang tải ảnh: form chặn nút Tạo */
  onBusyChange: (busy: boolean) => void;
}

/**
 * Ảnh phân loại khi tạo sản phẩm (Documents/21 §5.5 `imageAxis`, `axes[].values[].imageFileId`): chọn một trục gắn ảnh,
 * mỗi giá trị một ảnh. Thiếu ảnh của vài giá trị vẫn tạo được; mức sẵn sàng báo `variantImages` và sàn chặn đẩy tới khi đủ.
 */
export function AxisImagesField({ value, onChange, onBusyChange }: AxisImagesFieldProps) {
  const axis = value.axes.find((a) => a.key === value.imageAxisKey);
  const named = value.axes.filter((a) => a.name.trim());
  if (!named.length) return null;
  const images = value.axisImages ?? {};
  const filled = axis ? axis.values.filter((v) => images[imageKey(v)]).length : 0;

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="image-axis">Ảnh theo phân loại</Label>
        <Select
          value={axis?.key ?? NONE}
          onValueChange={(k) => onChange({ ...value, imageAxisKey: k === NONE ? null : k, axisImages: {} })}
        >
          <SelectTrigger id="image-axis" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Không dùng</SelectItem>
            {named.map((a) => (
              <SelectItem key={a.key} value={a.key}>
                Theo {a.name.trim()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {axis && axis.values.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filled}/{axis.values.length} giá trị có ảnh
          </span>
        )}
      </div>
      {axis && (
        <>
          {axis.values.length === 0 ? (
            <p className="text-sm text-muted-foreground">Thêm giá trị cho {axis.name} để gắn ảnh.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {axis.values.map((v) => (
                <ValueImage
                  key={imageKey(v)}
                  label={v}
                  image={images[imageKey(v)]}
                  onBusyChange={onBusyChange}
                  onChange={(img) => {
                    const next = { ...images };
                    if (img) next[imageKey(v)] = img;
                    else delete next[imageKey(v)];
                    onChange({ ...value, axisImages: next });
                  }}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Chỉ một phân loại được gắn ảnh. Sàn cần ảnh cho mọi giá trị đang bán; thiếu vẫn tạo được, điền sau.
          </p>
        </>
      )}
    </div>
  );
}

function ValueImage({
  label,
  image,
  onChange,
  onBusyChange,
}: {
  label: string;
  image: { fileId: string; url: string } | undefined;
  onChange: (img: { fileId: string; url: string } | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const source = sourceImageError(file);
    if (source) {
      setProblem(source);
      return;
    }
    setProblem(null);
    setBusy(true);
    onBusyChange(true);
    try {
      const prepared = await prepareProductImage(file);
      const message = imageFileError(prepared);
      if (message) throw new ImagePrepareError(message.slice(prepared.name.length + 2));
      onChange({ fileId: await uploadProductImage(prepared), url: URL.createObjectURL(prepared) });
    } catch (e) {
      setProblem(e instanceof ImagePrepareError ? e.message : getErrorMessage(e));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="grid w-24 gap-1">
      {image ? (
        <div className="relative size-24 overflow-hidden rounded-md border">
          <img src={image.url} alt={`Ảnh ${label}`} className="size-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`Bỏ ảnh ${label}`}
            className="absolute top-1 right-1 size-6"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="size-24 flex-col border-dashed text-xs"
          disabled={busy}
          aria-label={`Thêm ảnh ${label}`}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {busy ? 'Đang tải' : 'Thêm ảnh'}
        </Button>
      )}
      <span className="truncate text-center text-xs" title={label}>
        {label}
      </span>
      {problem && (
        <AlertMessage severity="warning" className="w-56 text-xs" onClose={() => setProblem(null)}>
          {problem}
        </AlertMessage>
      )}
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
