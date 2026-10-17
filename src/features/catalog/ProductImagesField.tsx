import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { uploadProductImage } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { cn } from '@/lib/utils';
import { IMAGE_TYPES, MAX_IMAGES, imageFileError } from './shared';

export interface ImageItem {
  fileId: string;
  /** URL của kho hoặc object URL của file vừa chọn */
  url: string;
}

interface ProductImagesFieldProps {
  value: ImageItem[];
  onChange: (next: ImageItem[]) => void;
  /** Đang tải lên: form chặn nút Lưu */
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  /** Lỗi errors.images từ BE (V26) */
  error?: string;
}

/** UC-CP-02, commerio-backend#14: nhiều ảnh, ảnh đầu là ảnh đại diện, đổi thứ tự bằng ←/→ */
export function ProductImagesField({
  value,
  onChange,
  onBusyChange,
  disabled,
  error,
}: ProductImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  // Trong lúc tải, người dùng vẫn đổi thứ tự hoặc bỏ ảnh: nối vào danh sách mới nhất
  const latest = useRef(value);
  latest.current = value;

  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const found: string[] = [];
    // Kiểm từng tệp trước, tệp hợp lệ mới tính vào chỗ còn trống (AC-10)
    const valid = files.filter((f) => {
      const message = imageFileError(f);
      if (message) found.push(message);
      return !message;
    });
    const room = Math.max(MAX_IMAGES - value.length, 0);
    valid.slice(room).forEach((f) => found.push(`${f.name}: vượt quá ${MAX_IMAGES} ảnh mỗi sản phẩm`));
    const accepted = valid.slice(0, room);

    setUploading(accepted.length);
    onBusyChange(accepted.length > 0);
    const results = await Promise.allSettled(accepted.map((f) => uploadProductImage(f)));
    const added: ImageItem[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') added.push({ fileId: r.value, url: URL.createObjectURL(accepted[i]) });
      else found.push(`${accepted[i].name}: ${getErrorMessage(r.reason)}`);
    });
    setUploading(0);
    onBusyChange(false);
    setProblems(found);
    if (added.length) onChange([...latest.current, ...added]);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-3" data-testid="product-images">
        {value.map((img, i) => (
          <div
            key={img.fileId}
            data-image-id={img.fileId}
            className={cn(
              'relative size-30 overflow-hidden rounded-md border',
              i === 0 && 'border-2 border-primary',
            )}
          >
            <img src={img.url} alt={`Ảnh ${i + 1}`} className="size-full object-cover" />
            {i === 0 && <Badge className="absolute top-1 left-1">Đại diện</Badge>}
            {!disabled && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={`Bỏ ảnh ${i + 1}`}
                  className="absolute top-1 right-1 size-6"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Đưa ảnh ${i + 1} lên trước`}
                    title="Đưa lên trước"
                    className="size-7 text-white hover:bg-white/20 hover:text-white"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Đưa ảnh ${i + 1} ra sau`}
                    title="Đưa ra sau"
                    className="size-7 text-white hover:bg-white/20 hover:text-white"
                    disabled={i === value.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {!disabled && value.length < MAX_IMAGES && (
          <Button
            type="button"
            variant="outline"
            className="size-30 flex-col border-dashed text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
          >
            {uploading > 0 ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                Đang tải {uploading} ảnh
              </>
            ) : (
              <>
                <ImagePlus className="size-6" />
                Thêm ảnh
              </>
            )}
          </Button>
        )}
        {disabled && value.length === 0 && <p className="text-sm text-muted-foreground">Chưa có ảnh.</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={IMAGE_TYPES.join(',')}
        data-testid="image-input"
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = '';
        }}
      />

      {!disabled && (
        <p className="text-xs text-muted-foreground">
          JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh, {MAX_IMAGES} ảnh. Ảnh đầu tiên là ảnh đại diện.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {problems.length > 0 && (
        <AlertMessage severity="warning" onClose={() => setProblems([])}>
          {problems.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </AlertMessage>
      )}
    </div>
  );
}
