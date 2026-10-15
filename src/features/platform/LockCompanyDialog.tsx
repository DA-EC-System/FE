import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import type { Company } from '@/types/company';

const lockSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Cần nhập lý do khoá')
    .max(500, 'Lý do tối đa 500 ký tự'),
});

type LockForm = z.infer<typeof lockSchema>;

interface LockCompanyDialogProps {
  company: Company | null;
  loading: boolean;
  /** Lỗi theo trường từ BE (422) */
  serverError?: string;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/** UC-PI-08: khoá bắt buộc có lý do, lý do được ghi vào nhật ký nền tảng. */
export function LockCompanyDialog({
  company,
  loading,
  serverError,
  onSubmit,
  onClose,
}: LockCompanyDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LockForm>({ resolver: zodResolver(lockSchema), defaultValues: { reason: '' } });

  useEffect(() => {
    if (company) reset({ reason: '' });
  }, [company, reset]);

  return (
    <Dialog open={Boolean(company)} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit((v) => onSubmit(v.reason))} noValidate>
        <DialogTitle>Khoá công ty {company?.name}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Sau khi khoá:
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              <li>Nhân viên của công ty không đăng nhập được.</li>
              <li>Dữ liệu từ sàn và cổng thanh toán gửi về vẫn được lưu.</li>
              <li>Ngừng đẩy dữ liệu lên sàn và các tác vụ định kỳ của công ty.</li>
            </ul>
          </Alert>
          <TextField
            label="Lý do khoá"
            fullWidth
            multiline
            minRows={3}
            autoFocus
            {...register('reason')}
            error={Boolean(errors.reason || serverError)}
            helperText={errors.reason?.message ?? serverError ?? 'Lý do được ghi vào nhật ký nền tảng.'}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" color="error" disabled={loading}>
            {loading ? 'Đang khoá...' : 'Khoá công ty'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
