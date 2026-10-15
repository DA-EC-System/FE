import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAddVariant } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { renderSku } from '@/utils/sku';
import type { Attribute, Category, ProductDetail } from '@/types/catalog';
import { comboKey, valueNames } from './shared';

interface AddVariantDialogProps {
  open: boolean;
  product: ProductDetail;
  category: Category | undefined;
  attributes: Attribute[];
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-CP-02 bước 5–7: thêm tổ hợp mới; tổ hợp đã có thì báo biến thể đã tồn tại */
export function AddVariantDialog({
  open,
  product,
  category,
  attributes,
  onClose,
  onDone,
}: AddVariantDialogProps) {
  const addMut = useAddVariant();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPicked({});
      setError(null);
    }
  }, [open]);

  // Mọi biến thể của sản phẩm dùng cùng bộ thuộc tính, lấy theo biến thể đầu tiên
  const productAttributes = useMemo(() => {
    const ids = product.variants[0]?.attributes.map((a) => a.attributeId) ?? [];
    return attributes.filter((a) => ids.includes(a.id));
  }, [product, attributes]);

  const names = useMemo(() => valueNames(attributes), [attributes]);
  const ids = productAttributes.map((a) => picked[a.id]).filter(Boolean);
  const complete = productAttributes.length > 0 && ids.length === productAttributes.length;
  const existing = complete
    ? product.variants.find((v) => comboKey(v.attributes.map((a) => a.valueId)) === comboKey(ids))
    : undefined;

  const preview = existing
    ? existing.sku
    : complete && category
      ? renderSku(category.skuPattern, category.skuNextSeq, ids.map((id) => names.get(id) ?? ''))
      : '—';

  const submit = async () => {
    setError(null);
    try {
      const variant = await addMut.mutateAsync({ productId: product.id, attributeValueIds: ids });
      onDone(
        existing
          ? `Đã bán lại biến thể ${variant.sku}`
          : `Đã thêm biến thể ${variant.sku}`,
      );
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onClose={addMut.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Thêm biến thể</DialogTitle>
      <DialogContent dividers>
        {!productAttributes.length ? (
          <Alert severity="info">
            Sản phẩm tạo không có thuộc tính nên chỉ có một biến thể. Muốn bán theo màu, cỡ… hãy tạo
            sản phẩm mới với các thuộc tính đó.
          </Alert>
        ) : (
          <Stack spacing={2}>
            {productAttributes.map((a) => (
              <TextField
                key={a.id}
                select
                label={a.name}
                value={picked[a.id] ?? ''}
                onChange={(e) => setPicked((p) => ({ ...p, [a.id]: e.target.value }))}
              >
                {a.values.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.value}
                  </MenuItem>
                ))}
              </TextField>
            ))}
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {existing ? 'SKU của biến thể' : 'SKU dự kiến'}
              </Typography>
              <Typography sx={{ fontFamily: 'monospace' }}>{preview}</Typography>
            </Box>
            {existing && !existing.archivedAt && (
              <Alert severity="warning">Biến thể này đã tồn tại ({existing.sku}).</Alert>
            )}
            {existing?.archivedAt && (
              <Alert severity="info">Tổ hợp này từng ngừng bán; lưu sẽ bán lại với SKU cũ.</Alert>
            )}
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={addMut.isPending}>
          Huỷ
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!complete || Boolean(existing && !existing.archivedAt) || addMut.isPending}
        >
          {addMut.isPending ? 'Đang lưu...' : existing ? 'Bán lại' : 'Thêm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
