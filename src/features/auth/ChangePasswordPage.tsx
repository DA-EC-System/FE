import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { AuthShell } from './AuthShell';
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

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { control, setError: setFieldError } = form;

  const back = () => {
    if (from) navigate(`${from.pathname}${from.search}${from.hash}`, { replace: true });
    else navigate(ROUTES.home, { replace: true });
  };

  const onSubmit = form.handleSubmit((v) => {
    setError(null);
    change.mutate(
      { currentPassword: v.currentPassword, newPassword: v.newPassword },
      {
        onSuccess: () => setDone(true),
        onError: (e) => {
          const problem = getProblem(e);
          const fields = problem?.errors ?? {};
          if (fields.currentPassword)
            setFieldError('currentPassword', { message: fields.currentPassword });
          if (fields.newPassword) setFieldError('newPassword', { message: fields.newPassword });
          if (!fields.currentPassword && !fields.newPassword) setError(getErrorMessage(e));
        },
      },
    );
  });

  return (
    <AuthShell title="Đổi mật khẩu" subtitle={account ? `Tài khoản ${account.email}` : undefined}>
      {done && (
        <div className="grid gap-4">
          <AlertMessage severity="success">
            Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.
          </AlertMessage>
          <Button size="lg" onClick={back}>
            Tiếp tục
          </Button>
        </div>
      )}
      {!done && forced && (
        <AlertMessage severity="info" className="mb-4">
          Bạn đang dùng mật khẩu trong thư mời. Hãy đặt mật khẩu mới trước khi bắt đầu làm việc.
        </AlertMessage>
      )}
      {error && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}
      {!done && (
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormTextField
              control={control}
              name="currentPassword"
              label={forced ? 'Mật khẩu trong thư mời' : 'Mật khẩu hiện tại'}
              password
              autoComplete="current-password"
              autoFocus
            />
            <FormTextField
              control={control}
              name="newPassword"
              label="Mật khẩu mới"
              password
              autoComplete="new-password"
              description="Tối thiểu 8 ký tự, có chữ và số."
            />
            <FormTextField
              control={control}
              name="confirmPassword"
              label="Nhập lại mật khẩu mới"
              password
              autoComplete="new-password"
            />
            <Button type="submit" size="lg" className="mt-2" disabled={change.isPending}>
              {change.isPending ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
            </Button>
            {forced ? (
              <Button type="button" variant="ghost" onClick={logout}>
                Đăng xuất
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={back}>
                Huỷ
              </Button>
            )}
          </form>
        </Form>
      )}
    </AuthShell>
  );
}
