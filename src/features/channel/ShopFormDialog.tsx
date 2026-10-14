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
import {
  shopSchema,
  type ShopFormValues,
  PLATFORM_LABELS,
  STATUS_LABELS,
} from './shopSchemas';
import type { Shop } from '@/types/shop';

interface ShopFormDialogProps {
  open: boolean;
  onClose: () => void;
  shop?: Shop | null;
  /** companyId đang active — bắt buộc khi tạo mới */
  companyId: string;
  onSubmit: (values: ShopFormValues) => Promise<void> | void;
  loading?: boolean;
}

export function ShopFormDialog({
  open,
  onClose,
  shop,
  companyId: _companyId,
  onSubmit,
  loading = false,
}: ShopFormDialogProps) {
  const isEdit = Boolean(shop);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ShopFormValues>({
    resolver: zodResolver(shopSchema),
    defaultValues: {
      platform: shop?.platform ?? 'shopee',
      externalShopId: shop?.externalShopId ?? '',
      shopName: shop?.shopName ?? '',
      region: shop?.region ?? 'VN',
      status: shop?.status ?? 'connected',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        platform: shop?.platform ?? 'shopee',
        externalShopId: shop?.externalShopId ?? '',
        shopName: shop?.shopName ?? '',
        region: shop?.region ?? 'VN',
        status: shop?.status ?? 'connected',
      });
    }
  }, [open, shop, reset]);

  const platform = watch('platform');

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>
          {isEdit ? 'Sửa gian hàng' : 'Thêm gian hàng mới'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {platform === 'mock' && !isEdit && (
              <Alert severity="info">
                Sàn giả lập (mock) dùng cho môi trường phát triển — dữ liệu đơn
                và sản phẩm theo định dạng API công khai của sàn.
              </Alert>
            )}
            <Controller
              name="platform"
              control={control}
              render={({ field }) => (
                <TextField {...field} select label="Nền tảng" required fullWidth>
                  {Object.entries(PLATFORM_LABELS).map(([k, label]) => (
                    <MenuItem key={k} value={k}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField
              label="Mã gian hàng trên sàn"
              required
              fullWidth
              placeholder="vd: shopee-abc-fashion"
              {...register('externalShopId')}
              error={Boolean(errors.externalShopId)}
              helperText={errors.externalShopId?.message}
            />
            <TextField
              label="Tên gian hàng hiển thị"
              required
              fullWidth
              {...register('shopName')}
              error={Boolean(errors.shopName)}
              helperText={errors.shopName?.message}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Vùng / Miền"
                required
                fullWidth
                placeholder="vd: VN"
                {...register('region')}
                error={Boolean(errors.region)}
                helperText={errors.region?.message}
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
                    {Object.entries(STATUS_LABELS).map(([k, label]) => (
                      <MenuItem key={k} value={k}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Kết nối gian hàng'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
