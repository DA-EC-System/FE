import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { Alert, Button, Stack } from '@mui/material';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
import { changePasswordSchema, type ChangePasswordForm } from './schemas';
import { useAuth, useChangePassword, useLogout } from '@/hooks/useAuth';
import { getErrorMessage, getProblem } from '@/api/client';
import { ROUTES } from '@/router/routes';

/**
 * UC-PI-04 — Đổi mật khẩu. Khi tài khoản còn dùng mật khẩu trong thư mời, guard đưa về đây
 * và chặn mọi trang khác (UC-PI-03 bước 7); chỉ còn đổi mật khẩu hoặc đăng xuất.
 */
export function ChangePasswordPage() {
  const { account } = useAuth();
  const change = useChangePassword();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const forced = Boolean(account?.mustChangePassword);
  const from = (location.state as { from?: Location } | null)?.from;

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const back = () => {
    if (from) navigate(`${from.pathname}${from.search}${from.hash}`, { replace: true });
    else navigate(ROUTES.home, { replace: true });
  };

  const onSubmit = handleSubmit((v) => {
    setError(null);
    change.mutate(
      { currentPassword: v.currentPassword, newPassword: v.newPassword },
      {
        onSuccess: () => setDone(true),
        onError: (e) => {
          const problem = getProblem(e);
          const fields = problem?.errors ?? {};
          if (fields.currentPassword) setFieldError('currentPassword', { message: fields.currentPassword });
          if (fields.newPassword) setFieldError('newPassword', { message: fields.newPassword });
          if (!fields.currentPassword && !fields.newPassword) setError(getErrorMessage(e));
        },
      },
    );
  });

  return (
    <AuthShell
      title="Đổi mật khẩu"
      subtitle={account ? `Tài khoản ${account.email}` : undefined}
    >
      {done && (
        <Stack spacing={2}>
          <Alert severity="success">Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.</Alert>
          <Button variant="contained" size="large" onClick={back}>
            Tiếp tục
          </Button>
        </Stack>
      )}
      {!done && forced && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Bạn đang dùng mật khẩu trong thư mời. Hãy đặt mật khẩu mới trước khi bắt đầu làm việc.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!done && (
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            <PasswordField
              label={forced ? 'Mật khẩu trong thư mời' : 'Mật khẩu hiện tại'}
              autoComplete="current-password"
              autoFocus
              {...register('currentPassword')}
              error={Boolean(errors.currentPassword)}
              helperText={errors.currentPassword?.message}
            />
            <PasswordField
              label="Mật khẩu mới"
              autoComplete="new-password"
              {...register('newPassword')}
              error={Boolean(errors.newPassword)}
              helperText={errors.newPassword?.message ?? 'Tối thiểu 8 ký tự, có chữ và số.'}
            />
            <PasswordField
              label="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              {...register('confirmPassword')}
              error={Boolean(errors.confirmPassword)}
              helperText={errors.confirmPassword?.message}
            />
            <Button type="submit" variant="contained" size="large" disabled={change.isPending} sx={{ mt: 1 }}>
              {change.isPending ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
            </Button>
            {forced ? (
              <Button onClick={logout}>Đăng xuất</Button>
            ) : (
              <Button onClick={back}>Huỷ</Button>
            )}
          </Stack>
        </form>
      )}
    </AuthShell>
  );
}
