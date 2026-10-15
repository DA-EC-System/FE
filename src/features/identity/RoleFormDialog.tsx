import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCreateRole, usePermissionCatalog, useUpdateRole } from '@/api/identity.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { MODULE_LABELS } from '@/utils/modules';
import type { PermissionDef, Role } from '@/types/identity';
import { conflictCurrent, roleSchema, type RoleForm } from './shared';

interface RoleFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  role: Role | null;
  /** Vai trò có sẵn hoặc có quyền mình không có: chỉ xem tập quyền */
  readOnly: boolean;
  readOnlyReason?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-PI-06: tạo, sửa hoặc xem tập quyền của một vai trò */
export function RoleFormDialog({
  open,
  role,
  readOnly,
  readOnlyReason,
  onClose,
  onDone,
}: RoleFormDialogProps) {
  const { companyContext } = useAuth();
  const catalog = usePermissionCatalog();
  const createMut = useCreateRole();
  const updateMut = useUpdateRole();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(role?.version ?? 0);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', permissions: [] },
  });

  useEffect(() => {
    if (open) {
      reset({ name: role?.name ?? '', permissions: role?.permissions ?? [] });
      setVersion(role?.version ?? 0);
      setError(null);
    }
  }, [open, role, reset]);

  const held = useMemo(() => new Set(companyContext?.permissions ?? []), [companyContext]);

  // Nhóm theo phân hệ; khi xem chỉ hiện quyền vai trò đang có
  const groups = useMemo(() => {
    const defs = catalog.data ?? [];
    const shown = readOnly ? defs.filter((d) => role?.permissions.includes(d.code)) : defs;
    const map = new Map<string, PermissionDef[]>();
    shown.forEach((d) => map.set(d.module, [...(map.get(d.module) ?? []), d]));
    return [...map.entries()];
  }, [catalog.data, readOnly, role]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (role) {
        await updateMut.mutateAsync({ id: role.id, version, ...values });
        onDone(`Đã cập nhật vai trò ${values.name.trim()}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo vai trò ${values.name.trim()}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Role>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name, permissions: latest.permissions });
        setVersion(latest.version);
        setError(
          'Vai trò vừa được người khác sửa. Form đã hiện trạng thái hiện tại, chưa có gì thay đổi.',
        );
        return;
      }
      if (problem?.errors?.name) setFieldError('name', { message: problem.errors.name });
      if (problem?.errors?.permissions) {
        setFieldError('permissions', { message: problem.errors.permissions });
      }
      if (!problem?.errors) setError(getErrorMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;
  const title = readOnly ? `Vai trò ${role?.name}` : role ? 'Sửa vai trò' : 'Tạo vai trò';

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          {readOnly && readOnlyReason && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {readOnlyReason}
            </Alert>
          )}
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {catalog.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(catalog.error)}
            </Alert>
          )}
          {!readOnly && (
            <TextField
              label="Tên vai trò"
              fullWidth
              autoFocus
              sx={{ mb: 2 }}
              {...register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
          )}
          {!readOnly && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Chỉ chọn được những quyền bạn đang có.
            </Typography>
          )}
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <Box>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  {groups.map(([module, defs]) => (
                    <Box
                      key={module}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        {MODULE_LABELS[module as keyof typeof MODULE_LABELS] ?? module}
                      </Typography>
                      <Stack>
                        {defs.map((d) => (
                          <FormControlLabel
                            key={d.code}
                            disabled={readOnly || !held.has(d.code)}
                            control={
                              <Checkbox
                                size="small"
                                checked={field.value.includes(d.code)}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.checked
                                      ? [...field.value, d.code]
                                      : field.value.filter((c) => c !== d.code),
                                  )
                                }
                              />
                            }
                            label={<Typography variant="body2">{d.label}</Typography>}
                          />
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Box>
                {errors.permissions && (
                  <FormHelperText error>{errors.permissions.message}</FormHelperText>
                )}
              </Box>
            )}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={busy}>
            {readOnly ? 'Đóng' : 'Huỷ'}
          </Button>
          {!readOnly && (
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Lưu'}
            </Button>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
