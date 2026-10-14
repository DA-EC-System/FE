import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  MenuItem,
  Alert,
} from '@mui/material';
import { companySchema, type CompanyFormValues } from './companySchemas';
import type { Company } from '@/types/company';

interface CompanyFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Company hiện tại nếu là chế độ sửa, undefined nếu tạo mới */
  company?: Company | null;
  onSubmit: (values: CompanyFormValues) => Promise<void> | void;
  loading?: boolean;
}

export function CompanyFormDialog({
  open,
  onClose,
  company,
  onSubmit,
  loading = false,
}: CompanyFormDialogProps) {
  const isEdit = Boolean(company);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: company?.name ?? '',
      taxCode: company?.taxCode ?? '',
      status: company?.status ?? 'active',
      lockReason: company?.lockReason ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: company?.name ?? '',
        taxCode: company?.taxCode ?? '',
        status: company?.status ?? 'active',
        lockReason: company?.lockReason ?? '',
      });
    }
  }, [open, company, reset]);

  const status = watch('status');

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>
          {isEdit ? 'Sửa thông tin công ty' : 'Thêm công ty mới'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Tên công ty"
              required
              fullWidth
              autoFocus
              {...register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <TextField
              label="Mã số thuế"
              required
              fullWidth
              {...register('taxCode')}
              error={Boolean(errors.taxCode)}
              helperText={errors.taxCode?.message ?? '10-14 chữ số, có thể có dấu gạch ngang'}
            />
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Trạng thái"
                  required
                  fullWidth
                >
                  <MenuItem value="active">Đang hoạt động</MenuItem>
                  <MenuItem value="locked">Đã khoá</MenuItem>
                </TextField>
              )}
            />
            {status === 'locked' && (
              <TextField
                label="Lý do khoá"
                fullWidth
                multiline
                minRows={2}
                {...register('lockReason')}
                error={Boolean(errors.lockReason)}
                helperText={errors.lockReason?.message}
              />
            )}
            {!isEdit && (
              <Alert severity="info">
                Sau khi tạo, bạn có thể vào chi tiết công ty để cấu hình kênh bán
                hàng, danh mục và nhân viên.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo công ty'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
