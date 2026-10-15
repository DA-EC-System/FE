import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useCreateAttribute, useUpdateAttribute } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import type { Attribute } from '@/types/catalog';
import { attributeSchema, type AttributeForm } from './shared';

interface AttributeFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  attribute: Attribute | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

const toForm = (a: Attribute | null): AttributeForm => ({
  name: a?.name ?? '',
  values: a?.values.map((v) => ({ id: v.id, value: v.value })) ?? [{ value: '' }],
});

/** UC-CP-01: thuộc tính và danh sách giá trị; giá trị đã có biến thể dùng thì không xoá được */
export function AttributeFormDialog({ open, attribute, onClose, onDone }: AttributeFormDialogProps) {
  const createMut = useCreateAttribute();
  const updateMut = useUpdateAttribute();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Attribute | null>(attribute);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<AttributeForm>({
    resolver: zodResolver(attributeSchema),
    defaultValues: toForm(null),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'values', keyName: 'key' });

  useEffect(() => {
    if (open) {
      reset(toForm(attribute));
      setCurrent(attribute);
      setError(null);
    }
  }, [open, attribute, reset]);

  const inUse = useMemo(
    () => new Set(current?.values.filter((v) => v.inUse).map((v) => v.id) ?? []),
    [current],
  );

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (current) {
        await updateMut.mutateAsync({ id: current.id, version: current.version, ...values });
        onDone(`Đã cập nhật thuộc tính ${values.name}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo thuộc tính ${values.name}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Attribute>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset(toForm(latest));
        setCurrent(latest);
        setError('Thuộc tính vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      if (problem?.errors?.name) setFieldError('name', { message: problem.errors.name });
      if (problem?.errors?.values) setFieldError('values', { message: problem.errors.values });
      if (!problem?.errors) setError(getErrorMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;
  const valuesError = errors.values?.message ?? errors.values?.root?.message;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{attribute ? 'Sửa thuộc tính' : 'Thêm thuộc tính'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            label="Tên thuộc tính"
            placeholder="Màu sắc"
            fullWidth
            autoFocus
            sx={{ mb: 2 }}
            {...register('name')}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Giá trị
          </Typography>
          <Stack spacing={1}>
            {fields.map((f, i) => {
              const locked = Boolean(f.id && inUse.has(f.id));
              return (
                <Stack key={f.key} direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={`Giá trị ${i + 1}`}
                    {...register(`values.${i}.value`)}
                    error={Boolean(errors.values?.[i]?.value)}
                    helperText={errors.values?.[i]?.value?.message}
                  />
                  <Tooltip title={locked ? 'Đã có biến thể dùng, không xoá được' : 'Xoá giá trị'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={locked || fields.length === 1}
                        onClick={() => remove(i)}
                        sx={{ mt: 0.5 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
          {valuesError && <FormHelperText error>{valuesError}</FormHelperText>}
          <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => append({ value: '' })}>
            Thêm giá trị
          </Button>
          {inUse.size > 0 && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              Đổi chữ của giá trị đang dùng không đổi SKU đã sinh.
            </Typography>
          )}
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
