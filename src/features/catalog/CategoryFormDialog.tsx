import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCreateCategory, useUpdateCategory } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import { renderSku, skuPatternError } from '@/utils/sku';
import type { Category } from '@/types/catalog';
import { categorySchema, type CategoryForm } from './shared';

interface CategoryFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  category: Category | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-CP-01: danh mục và quy tắc SKU của danh mục (D14, D25) */
export function CategoryFormDialog({ open, category, onClose, onDone }: CategoryFormDialogProps) {
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', skuPattern: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ name: category?.name ?? '', skuPattern: category?.skuPattern ?? '' });
      setVersion(category?.version ?? 0);
      setError(null);
    }
  }, [open, category, reset]);

  const pattern = (useWatch({ control, name: 'skuPattern' }) ?? '').trim().toUpperCase();
  const seq = category?.skuNextSeq ?? 1;
  const preview = skuPatternError(pattern)
    ? null
    : [renderSku(pattern, seq, ['Đen', 'XL']), renderSku(pattern, seq + 1, [])];

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (category) {
        await updateMut.mutateAsync({ id: category.id, version, ...values });
        onDone(`Đã cập nhật danh mục ${values.name}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo danh mục ${values.name}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Category>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name, skuPattern: latest.skuPattern });
        setVersion(latest.version);
        setError('Danh mục vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      if (problem?.errors?.name) setFieldError('name', { message: problem.errors.name });
      if (problem?.errors?.skuPattern) {
        setFieldError('skuPattern', { message: problem.errors.skuPattern });
      }
      if (!problem?.errors) setError(getErrorMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{category ? 'Sửa danh mục' : 'Thêm danh mục'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              label="Tên danh mục"
              fullWidth
              autoFocus
              {...register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <TextField
              label="Quy tắc SKU"
              fullWidth
              placeholder="AO-{SEQ:4}-{VAL}"
              {...register('skuPattern')}
              inputProps={{ style: { fontFamily: 'monospace', textTransform: 'uppercase' } }}
              error={Boolean(errors.skuPattern)}
              helperText={
                errors.skuPattern?.message ??
                '{SEQ:n}: số thứ tự đệm đủ n chữ số; {VAL}: mã giá trị thuộc tính của biến thể'
              }
            />
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                SKU mẫu (biến thể Đen / XL và biến thể không có thuộc tính)
              </Typography>
              <Typography sx={{ fontFamily: 'monospace' }}>
                {preview ? preview.join('   ·   ') : '—'}
              </Typography>
            </Box>
            {category && category.productCount > 0 && (
              <Alert severity="info">
                Đổi quy tắc chỉ áp dụng cho biến thể tạo sau này. SKU đã sinh của{' '}
                {category.productCount} sản phẩm giữ nguyên.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
