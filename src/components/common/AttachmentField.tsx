import { useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { uploadFile } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS, attachmentFileError } from '@/utils/files';

export interface AttachmentItem {
  fileId: string;
  name: string;
  /** URL của kho hoặc object URL của tệp vừa chọn */
  url: string;
  contentType: string;
}

interface AttachmentFieldProps {
  value: AttachmentItem[];
  onChange: (next: AttachmentItem[]) => void;
  /** Đang tải lên: form chặn nút Lưu */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  error?: string;
}

/**
 * Đính kèm chứng từ: ảnh hàng lỗi, biên bản giao nhận, mã khiếu nại sàn (FE#55).
 * Cùng cách tải lên với ảnh sản phẩm (catalog/ProductImagesField): xin vé rồi PUT thẳng lên kho.
 */
export function AttachmentField({ value, onChange, onBusyChange, disabled, error }: AttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  // Trong lúc tải, người dùng vẫn bỏ tệp khác: nối vào danh sách mới nhất
  const latest = useRef(value);
  latest.current = value;

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const found: string[] = [];
    const valid = Array.from(list).filter((f) => {
      const message = attachmentFileError(f);
      if (message) found.push(message);
      return !message;
    });
    const room = Math.max(MAX_ATTACHMENTS - value.length, 0);
    valid.slice(room).forEach((f) => found.push(`${f.name}: vượt quá ${MAX_ATTACHMENTS} tệp`));
    const accepted = valid.slice(0, room);

    setUploading(accepted.length);
    onBusyChange?.(accepted.length > 0);
    const results = await Promise.allSettled(accepted.map((f) => uploadFile(f, 'attachment')));
    const added: AttachmentItem[] = [];
    results.forEach((r, i) => {
      const f = accepted[i];
      if (r.status === 'fulfilled') {
        added.push({ fileId: r.value, name: f.name, url: URL.createObjectURL(f), contentType: f.type });
      } else found.push(`${f.name}: ${getErrorMessage(r.reason)}`);
    });
    setUploading(0);
    onBusyChange?.(false);
    setProblems(found);
    if (added.length) onChange([...latest.current, ...added]);
  };

  return (
    <div className="grid gap-2">
      <ul className="flex flex-wrap gap-3" data-testid="attachments">
        {value.map((a) => (
          <li key={a.fileId} data-file-id={a.fileId} className="relative size-24 overflow-hidden rounded-md border">
            <a href={a.url} target="_blank" rel="noreferrer" title={a.name} className="block size-full">
              {a.contentType.startsWith('image/') ? (
                <img src={a.url} alt={a.name} className="size-full object-cover" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-xs">
                  <FileText className="size-6" />
                  <span className="line-clamp-2 break-all">{a.name}</span>
                </span>
              )}
            </a>
            {!disabled && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`Bỏ ${a.name}`}
                className="absolute top-1 right-1 size-6"
                onClick={() => onChange(value.filter((x) => x.fileId !== a.fileId))}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
        {!disabled && value.length < MAX_ATTACHMENTS && (
          <li>
            <Button
              type="button"
              variant="outline"
              className="size-24 flex-col border-dashed text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={uploading > 0}
            >
              {uploading > 0 ? (
                <>
                  <Loader2 className="size-6 animate-spin" />
                  Đang tải {uploading} tệp
                </>
              ) : (
                <>
                  <Paperclip className="size-6" />
                  Đính kèm
                </>
              )}
            </Button>
          </li>
        )}
        {disabled && value.length === 0 && <li className="text-sm text-muted-foreground">Không có tệp đính kèm.</li>}
      </ul>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={ATTACHMENT_TYPES.join(',')}
        data-testid="attachment-input"
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = '';
        }}
      />

      {!disabled && (
        <p className="text-xs text-muted-foreground">
          Ảnh JPG, PNG, WebP hoặc PDF, tối đa 10 MB mỗi tệp, {MAX_ATTACHMENTS} tệp.
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
