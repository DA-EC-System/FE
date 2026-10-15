import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { useInviteStaff, useSetStaffRoles } from '@/api/identity.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import type { Role, StaffMember } from '@/types/identity';
import { RoleChecklist } from './RoleChecklist';
import { conflictCurrent, inviteSchema, type InviteForm } from './shared';

interface InviteStaffDialogProps {
  open: boolean;
  roles: Role[];
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-PI-05: thêm tài khoản nhân viên, gửi thư mời kèm mật khẩu */
export function InviteStaffDialog({ open, roles, onClose, onDone }: InviteStaffDialogProps) {
  const { account } = useAuth();
  const invite = useInviteStaff();
  const setRoles = useSetStaffRoles();
  const [error, setError] = useState<string | null>(null);
  // Email đã có tài khoản trong công ty: hỏi có thêm vai trò vừa chọn không
  const [existing, setExisting] = useState<StaffMember | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    setError: setFieldError,
    formState: { errors },
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', fullName: '', roleIds: [] },
  });

  useEffect(() => {
    if (open) {
      reset({ email: '', fullName: '', roleIds: [] });
      setError(null);
      setExisting(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await invite.mutateAsync(values);
      onDone(
        res.outcome === 'invited'
          ? `Đã tạo tài khoản và gửi thư mời tới ${res.member.email}`
          : `Đã thêm ${res.member.email} vào công ty; người này đăng nhập bằng tài khoản sẵn có`,
      );
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'already_member') {
        setExisting(conflictCurrent<StaffMember>(e, 'member'));
        return;
      }
      const fields = problem?.errors ?? {};
      (['email', 'fullName', 'roleIds'] as const).forEach((name) => {
        if (fields[name]) setFieldError(name, { message: fields[name] });
      });
      if (!Object.keys(fields).length) setError(getErrorMessage(e));
    }
  });

  const addRolesToExisting = async () => {
    if (!existing) return;
    const roleIds = [...new Set([...existing.roles.map((r) => r.id), ...getValues('roleIds')])];
    try {
      await setRoles.mutateAsync({ accountId: existing.accountId, roleIds, version: existing.version });
      onDone(`Đã thêm vai trò cho ${existing.email}`);
    } catch (e) {
      setExisting(null);
      setError(getErrorMessage(e));
    }
  };

  const busy = invite.isPending || setRoles.isPending;
  const existingLocked = existing && (existing.isCeo || existing.accountId === account?.id);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Thêm nhân viên</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {existing ? (
            <Alert severity="warning">
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>{existing.email}</strong> đã có tài khoản trong công ty
                {existing.roles.length > 0 && (
                  <> với vai trò {existing.roles.map((r) => r.name).join(', ')}</>
                )}
                .
              </Typography>
              <Typography variant="body2">
                {existingLocked
                  ? 'Không đổi được vai trò của tài khoản này.'
                  : 'Thêm các vai trò vừa chọn cho tài khoản này, ngoài các vai trò đang có?'}
              </Typography>
            </Alert>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Hệ thống sinh mật khẩu ngẫu nhiên và gửi thư mời tới email. Nhân viên phải đổi mật
                khẩu ở lần đăng nhập đầu.
              </Typography>
              <TextField
                label="Email"
                type="email"
                fullWidth
                autoFocus
                {...register('email')}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />
              <TextField
                label="Họ tên"
                fullWidth
                {...register('fullName')}
                error={Boolean(errors.fullName)}
                helperText={errors.fullName?.message}
              />
              <div>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Vai trò
                </Typography>
                <Controller
                  control={control}
                  name="roleIds"
                  render={({ field }) => (
                    <RoleChecklist
                      roles={roles}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.roleIds?.message}
                    />
                  )}
                />
              </div>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {existing ? (
            <>
              <Button onClick={() => setExisting(null)} disabled={busy}>
                {existingLocked ? 'Quay lại' : 'Không'}
              </Button>
              {!existingLocked && (
                <Button variant="contained" onClick={addRolesToExisting} disabled={busy}>
                  Thêm vai trò
                </Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={onClose} disabled={busy}>
                Huỷ
              </Button>
              <Button type="submit" variant="contained" disabled={busy}>
                {invite.isPending ? 'Đang lưu...' : 'Lưu và gửi thư mời'}
              </Button>
            </>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
