import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSetReorderRule } from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import type { StockLevel } from '@/types/inventory';
import { formatQty, minQtySchema } from './shared';

interface ReorderDialogProps {
  level: StockLevel | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-IN-02: đặt ngưỡng tồn tối thiểu cho một biến thể; ô trống là bỏ ngưỡng */
export function ReorderDialog({ level, onClose, onDone }: ReorderDialogProps) {
  const setMut = useSetReorderRule();
  const [value, setValue] = useState('');
  const [version, setVersion] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (level) {
      setValue(level.minQty === null ? '' : String(level.minQty));
      setVersion(level.reorderVersion);
      setFieldError(null);
      setNotice(null);
    }
  }, [level]);

  const submit = async () => {
    if (!level) return;
    const parsed = minQtySchema.safeParse(value);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Ngưỡng sai định dạng');
      return;
    }
    setNotice(null);
    try {
      const saved = await setMut.mutateAsync({ variantId: level.variantId, minQty: parsed.data, version });
      onDone(
        saved.minQty === null
          ? `Đã bỏ ngưỡng tồn của ${saved.sku}`
          : `Đã đặt ngưỡng ${formatQty(saved.minQty)} cho ${saved.sku}` +
              (saved.belowMin ? '; khả dụng đang dưới ngưỡng' : ''),
      );
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<StockLevel>(e);
      if (problem?.code === 'version_conflict' && latest) {
        setValue(latest.minQty === null ? '' : String(latest.minQty));
        setVersion(latest.reorderVersion);
        setNotice({
          severity: 'warning',
          msg: 'Ngưỡng vừa được người khác sửa. Ô đã hiện số mới nhất, chưa có gì thay đổi.',
        });
        return;
      }
      if (problem?.errors?.minQty) setFieldError(problem.errors.minQty);
      else setNotice({ severity: 'error', msg: getErrorMessage(e) });
    }
  };

  return (
    <Dialog open={Boolean(level)} onClose={setMut.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Ngưỡng tồn tối thiểu</DialogTitle>
      <DialogContent dividers>
        {notice && (
          <Alert severity={notice.severity} sx={{ mb: 2 }}>
            {notice.msg}
          </Alert>
        )}
        {level && (
          <Stack spacing={2}>
            <div>
              <Typography fontWeight={600}>{level.sku}</Typography>
              <Typography variant="body2" color="text.secondary">
                {level.productName}
                {level.attributesLabel && ` · ${level.attributesLabel}`}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Khả dụng hiện tại: <strong>{formatQty(level.available)}</strong>
              </Typography>
            </div>
            <TextField
              label="Ngưỡng tối thiểu"
              value={value}
              autoFocus
              inputProps={{ inputMode: 'numeric' }}
              onChange={(e) => {
                setValue(e.target.value);
                setFieldError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              error={Boolean(fieldError)}
              helperText={
                fieldError ?? 'Khả dụng dưới ngưỡng thì Nhân viên kho và Admin nhận thông báo. Để trống là bỏ ngưỡng.'
              }
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={setMut.isPending}>
          Huỷ
        </Button>
        <Button variant="contained" onClick={submit} disabled={setMut.isPending}>
          {setMut.isPending ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
