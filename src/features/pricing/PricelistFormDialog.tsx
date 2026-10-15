import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useCreatePricelist, useUpdatePricelist } from '@/api/pricing.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import type { Shop } from '@/types/shop';
import type { Pricelist } from '@/types/pricing';
import {
  pricelistCreateSchema,
  pricelistRenameSchema,
  type PricelistCreateForm,
  type PricelistRenameForm,
} from './shared';

interface CreateDialogProps {
  open: boolean;
  /** Gian hàng còn kết nối và chưa có bảng giá */
  shops: Shop[];
  onClose: () => void;
  onDone: (created: Pricelist) => void;
}

/** UC-CP-03 bước 3: tạo bảng giá theo gian hàng (D15); bảng giá chuẩn có sẵn, không tạo thêm */
export function CreatePricelistDialog({ open, shops, onClose, onDone }: CreateDialogProps) {
  const createMut = useCreatePricelist();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    setError: setFieldError,
    formState: { errors },
  } = useForm<PricelistCreateForm>({
    resolver: zodResolver(pricelistCreateSchema),
    defaultValues: { name: '', shopId: '', copyFromStandard: true },
  });

  useEffect(() => {
    if (open) {
      reset({ name: '', shopId: '', copyFromStandard: true });
      setError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      onDone(await createMut.mutateAsync(values));
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.errors?.name) setFieldError('name', { message: problem.errors.name });
      if (problem?.errors?.shopId) setFieldError('shopId', { message: problem.errors.shopId });
      if (!problem?.errors) setError(getErrorMessage(e));
    }
  });

  return (
    <Dialog open={open} onClose={createMut.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Tạo bảng giá theo gian hàng</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {!shops.length && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Mọi gian hàng đang kết nối đều đã có bảng giá.
            </Alert>
          )}
          <Stack spacing={2}>
            <Controller
              name="shopId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Gian hàng"
                  fullWidth
                  disabled={!shops.length}
                  onChange={(e) => {
                    field.onChange(e);
                    // Gợi ý tên theo gian hàng nếu người dùng chưa gõ
                    const shop = shops.find((s) => s.id === e.target.value);
                    if (shop && !getValues('name').trim()) {
                      setValue('name', `Giá ${shop.shopName}`, { shouldValidate: true });
                    }
                  }}
                  error={Boolean(errors.shopId)}
                  helperText={errors.shopId?.message ?? 'Đơn từ gian hàng này lấy giá trong bảng mới'}
                >
                  {shops.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.shopName} ({PLATFORM_LABELS[s.platform]})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField
              label="Tên bảng giá"
              fullWidth
              {...register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <Controller
              name="copyFromStandard"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="Chép giá từ bảng giá chuẩn"
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={createMut.isPending}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={createMut.isPending || !shops.length}>
            {createMut.isPending ? 'Đang tạo...' : 'Tạo'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

interface RenameDialogProps {
  pricelist: Pricelist | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function RenamePricelistDialog({ pricelist, onClose, onDone }: RenameDialogProps) {
  const updateMut = useUpdatePricelist();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<PricelistRenameForm>({
    resolver: zodResolver(pricelistRenameSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (pricelist) {
      reset({ name: pricelist.name });
      setVersion(pricelist.version);
      setError(null);
    }
  }, [pricelist, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!pricelist) return;
    setError(null);
    try {
      await updateMut.mutateAsync({ id: pricelist.id, version, name: values.name });
      onDone(`Đã đổi tên thành ${values.name}`);
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Pricelist>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name });
        setVersion(latest.version);
        setError('Bảng giá vừa được người khác sửa. Form đã hiện tên mới nhất, chưa có gì thay đổi.');
        return;
      }
      if (problem?.errors?.name) setFieldError('name', { message: problem.errors.name });
      else setError(getErrorMessage(e));
    }
  });

  return (
    <Dialog open={Boolean(pricelist)} onClose={updateMut.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Đổi tên bảng giá</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            label="Tên bảng giá"
            fullWidth
            autoFocus
            {...register('name')}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={updateMut.isPending}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={updateMut.isPending}>
            {updateMut.isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
