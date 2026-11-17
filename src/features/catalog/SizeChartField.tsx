import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { uploadProductImage } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { ImagePrepareError, prepareProductImage } from './compressImage';
import type { ImageItem } from './ProductImagesField';
import { SOURCE_IMAGE_TYPES, imageFileError, sourceImageError } from './shared';

interface SizeChartFieldProps {
  value: ImageItem | null;
  onChange: (next: ImageItem | null) => void;
  /** Đang tải lên: form chặn nút Lưu */
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  /** Lỗi errors.sizeChart từ BE */
  error?: string;
}

/** FE#261, commerio-backend#347: một ảnh bảng kích cỡ cho cả sản phẩm, tải lên như ảnh sản phẩm */
export function SizeChartField({ value, onChange, onBusyChange, disabled, error }: SizeChartFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const wrongType = sourceImageError(file);
    if (wrongType) {
      setProblem(wrongType);
      return;
    }
    setProblem(null);
    setUploading(true);
    onBusyChange(true);
    try {
      const prepared = await prepareProductImage(file);
      const message = imageFileError(prepared);
      if (message) throw new ImagePrepareError(message.slice(prepared.name.length + 2));
      const fileId = await uploadProductImage(prepared);
      onChange({ fileId, url: URL.createObjectURL(prepared) });
    } catch (e) {
      setProblem(`${file.name}: ${e instanceof ImagePrepareError ? e.message : getErrorMessage(e)}`);
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-3" data-testid="size-chart">
        {value && (
          <div className="relative size-30 overflow-hidden rounded-md border" data-image-id={value.fileId}>
            {value.url ? (
              <img src={value.url} alt="Ảnh bảng kích cỡ" className="size-full object-contain" />
            ) : (
              <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                Đã có ảnh, chưa xem trước được
              </div>
            )}
            {!disabled && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Bỏ ảnh bảng kích cỡ"
                className="absolute top-1 right-1 size-6"
                onClick={() => onChange(null)}
              >
                <X />
              </Button>
            )}
          </div>
        )}

        {!disabled && (
          <Button
            type="button"
            variant="outline"
            className="size-30 flex-col border-dashed text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                Đang tải ảnh
              </>
            ) : (
              <>
                <ImagePlus className="size-6" />
                {value ? 'Đổi ảnh' : 'Thêm ảnh'}
              </>
            )}
          </Button>
        )}
        {disabled && !value && <p className="text-sm text-muted-foreground">Chưa có ảnh bảng kích cỡ.</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept={SOURCE_IMAGE_TYPES.join(',')}
        data-testid="size-chart-input"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {!disabled && (
        <p className="text-xs text-muted-foreground">
          JPG hoặc PNG, một ảnh dùng chung cho mọi SKU. Ảnh lớn hơn 1 MB tự nén trước khi tải.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {problem && (
        <AlertMessage severity="warning" onClose={() => setProblem(null)}>
          {problem}
        </AlertMessage>
      )}
    </div>
  );
}
