import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { PricelistItem } from '@/types/pricing';
import { applyBulk, bulkFormSchema, type BulkForm, type BulkMode, type BulkResult } from './shared';

interface BulkPriceDialogProps {
  open: boolean;
  rows: PricelistItem[];
  isChannel: boolean;
  /** Giá đang hiện trên lưới, đã gồm thay đổi chưa lưu */
  current: (variantId: string) => number | null;
  onClose: () => void;
  onApply: (result: BulkResult) => void;
}

const MODES: { value: BulkMode; label: string; channelOnly?: boolean }[] = [
  { value: 'set', label: 'Đặt cùng một giá' },
  { value: 'percent', label: 'Tăng / giảm theo %' },
  { value: 'amount', label: 'Tăng / giảm số tiền' },
  { value: 'standard', label: 'Chép giá chuẩn', channelOnly: true },
  { value: 'clear', label: 'Bỏ giá' },
];

const EMPTY: BulkForm = { mode: 'set', value: '', roundTo: 1000 };

/** UC-CP-03 bước 6: sửa giá hàng loạt các dòng đã chọn; chỉ đổi bản nháp, bấm "Lưu thay đổi" mới gửi */
export function BulkPriceDialog({ open, rows, isChannel, current, onClose, onApply }: BulkPriceDialogProps) {
  const [form, setForm] = useState<BulkForm>(EMPTY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setTouched(false);
    }
  }, [open]);

  const parsed = bulkFormSchema.safeParse(form);
  const error = parsed.success ? null : parsed.error.issues[0]?.message ?? 'Dữ liệu chưa hợp lệ';
  // Vài nghìn dòng: tính lại mỗi lần gõ vẫn nhanh
  const preview = parsed.success ? applyBulk(rows, current, parsed.data, isChannel) : null;

  const needsValue = form.mode === 'set' || form.mode === 'percent' || form.mode === 'amount';
  const canRound = form.mode === 'percent' || form.mode === 'amount';

  const submit = () => {
    setTouched(true);
    if (preview && preview.changes.size) onApply(preview);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Sửa giá {rows.length} biến thể</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            select
            label="Cách sửa"
            value={form.mode}
            onChange={(e) => {
              setForm({ ...form, mode: e.target.value as BulkMode, value: '' });
              setTouched(false);
            }}
          >
            {MODES.filter((m) => isChannel || !m.channelOnly).map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
          {needsValue && (
            <TextField
              label={form.mode === 'set' ? 'Giá mới' : form.mode === 'percent' ? 'Phần trăm' : 'Số tiền'}
              value={form.value}
              autoFocus
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              error={touched && Boolean(error)}
              helperText={
                touched && error
                  ? error
                  : form.mode === 'set'
                    ? 'Số nguyên đồng, vd 150000'
                    : 'Số âm để giảm, vd -10'
              }
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">{form.mode === 'percent' ? '%' : 'đ'}</InputAdornment>
                ),
              }}
            />
          )}
          {canRound && (
            <TextField
              select
              label="Làm tròn"
              value={form.roundTo}
              onChange={(e) => setForm({ ...form, roundTo: Number(e.target.value) as BulkForm['roundTo'] })}
            >
              <MenuItem value={1}>Không làm tròn</MenuItem>
              <MenuItem value={100}>Tới 100 đ</MenuItem>
              <MenuItem value={1000}>Tới 1.000 đ</MenuItem>
            </TextField>
          )}
          {canRound && isChannel && (
            <Typography variant="body2" color="text.secondary">
              Dòng chưa có giá riêng lấy giá chuẩn làm gốc.
            </Typography>
          )}
          {preview && (
            <Alert severity={preview.changes.size ? 'info' : 'warning'}>
              Sẽ đổi giá {preview.changes.size} biến thể
              {preview.noBase > 0 && `; bỏ qua ${preview.noBase} biến thể chưa có giá để tính`}
              {preview.outOfRange > 0 && `; bỏ qua ${preview.outOfRange} biến thể vì giá ra âm hoặc quá 10 tỷ`}
              .
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={submit} disabled={Boolean(preview && !preview.changes.size)}>
          Áp dụng
        </Button>
      </DialogActions>
    </Dialog>
  );
}
