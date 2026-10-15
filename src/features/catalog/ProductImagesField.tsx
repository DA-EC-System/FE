import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { uploadProductImage } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
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
}

/** UC-CP-02, commerio-backend#14: nhiều ảnh, ảnh đầu là ảnh đại diện, đổi thứ tự bằng ←/→ */
export function ProductImagesField({ value, onChange, onBusyChange, disabled }: ProductImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
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
    const problems: string[] = [];
    const room = MAX_IMAGES - value.length;
    if (files.length > room) problems.push(`Chỉ thêm được ${room} ảnh nữa (tối đa ${MAX_IMAGES} ảnh)`);
    const accepted = files.slice(0, Math.max(room, 0)).filter((f) => {
      const message = imageFileError(f);
      if (message) problems.push(message);
      return !message;
    });

    setUploading(accepted.length);
    onBusyChange(accepted.length > 0);
    const results = await Promise.allSettled(accepted.map((f) => uploadProductImage(f)));
    const added: ImageItem[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') added.push({ fileId: r.value, url: URL.createObjectURL(accepted[i]) });
      else problems.push(`${accepted[i].name}: ${getErrorMessage(r.reason)}`);
    });
    setUploading(0);
    onBusyChange(false);
    setErrors(problems);
    if (added.length) onChange([...latest.current, ...added]);
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        {value.map((img, i) => (
          <Box
            key={img.fileId}
            sx={{
              position: 'relative',
              width: 120,
              height: 120,
              borderRadius: 1,
              overflow: 'hidden',
              border: 1,
              borderColor: i === 0 ? 'primary.main' : 'divider',
            }}
          >
            <Box component="img" src={img.url} alt={`Ảnh ${i + 1}`} sx={{ width: 1, height: 1, objectFit: 'cover' }} />
            {i === 0 && (
              <Chip size="small" color="primary" label="Đại diện" sx={{ position: 'absolute', top: 4, left: 4 }} />
            )}
            {!disabled && (
              <>
                <IconButton
                  size="small"
                  aria-label="Bỏ ảnh"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'background.paper' }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.45)' }}
                >
                  <Tooltip title="Đưa lên trước">
                    <span>
                      <IconButton size="small" disabled={i === 0} onClick={() => move(i, i - 1)} sx={{ color: '#fff' }}>
                        <ChevronLeftIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Đưa ra sau">
                    <span>
                      <IconButton
                        size="small"
                        disabled={i === value.length - 1}
                        onClick={() => move(i, i + 1)}
                        sx={{ color: '#fff' }}
                      >
                        <ChevronRightIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </>
            )}
          </Box>
        ))}

        {!disabled && value.length < MAX_IMAGES && (
          <Button
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            sx={{ width: 120, height: 120, flexDirection: 'column', borderStyle: 'dashed' }}
          >
            {uploading > 0 ? (
              <>
                <CircularProgress size={24} />
                <Typography variant="caption" sx={{ mt: 1 }}>
                  Đang tải {uploading} ảnh
                </Typography>
              </>
            ) : (
              <>
                <AddPhotoAlternateIcon />
                <Typography variant="caption" sx={{ mt: 1 }}>
                  Thêm ảnh
                </Typography>
              </>
            )}
          </Button>
        )}
      </Stack>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={IMAGE_TYPES.join(',')}
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = '';
        }}
      />

      {!disabled && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh, {MAX_IMAGES} ảnh. Ảnh đầu tiên là ảnh đại diện.
        </Typography>
      )}
      {errors.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setErrors([])}>
          {errors.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </Alert>
      )}
    </Box>
  );
}
