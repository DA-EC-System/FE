import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, Navigate, useLocation, type Location } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useAuth, useLogin } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { Account } from '@/types/auth';
import { authErrorMessage } from './authErrors';
import { AuthShell, DividerText } from './AuthShell';
import { GoogleLoginButton } from './GoogleLoginButton';
import { emailSchema } from './schemas';

const loginSchema = z.object({
  email: emailSchema,
  // Chỉ bắt buộc nhập; quy tắc độ dài mật khẩu thuộc màn đăng ký và đổi mật khẩu
  password: z.string().min(1, 'Nhập mật khẩu'),
});

type LoginForm = z.infer<typeof loginSchema>;

interface LoginLocationState {
  from?: Location;
  /** Vừa nộp yêu cầu tham gia qua link mời, chờ Admin duyệt (US-CT-06) */
  joinedEmail?: string;
}

/**
 * Trang quay lại sau đăng nhập. Bỏ qua trang thuộc không gian khác của tài khoản
 * (ví dụ phiên trước là quản trị nền tảng, giờ đăng nhập bằng nhân viên) để không rơi vào 403.
 */
function redirectTarget(from: Location | undefined, account: Account | null): string {
  if (!from || !account) return ROUTES.home;
  const path = `${from.pathname}${from.search}${from.hash}`;
  const isPlatformPath = from.pathname.startsWith(ROUTES.platform.root);
  return account.isPlatformAdmin === isPlatformPath ? path : ROUTES.home;
}

export function LoginPage() {
  const { isAuthenticated, account } = useAuth();
  const login = useLogin();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  const { from, joinedEmail } = (location.state as LoginLocationState | null) ?? {};

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: joinedEmail ?? '', password: '' },
  });

  // Đăng nhập xong store đổi ngay → render lại và chuyển trang tại đây
  if (isAuthenticated) {
    return <Navigate to={redirectTarget(from, account)} replace />;
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    login.mutate(values, { onError: (e) => setError(authErrorMessage(e)) });
  });



  return (
    <AuthShell title="Đăng nhập" subtitle="Chào mừng trở lại! Đăng nhập để tiếp tục làm việc.">
      {joinedEmail && !error && (
        <AlertMessage severity="info" className="mb-4">
          Đã gửi yêu cầu tham gia. Khi Admin công ty duyệt, đăng nhập bằng {joinedEmail}.
        </AlertMessage>
      )}
      {error && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormTextField
            control={form.control}
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus={!joinedEmail}
          />
          <FormTextField
            control={form.control}
            name="password"
            label="Mật khẩu"
            password
            autoComplete="current-password"
            autoFocus={Boolean(joinedEmail)}
          />
          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={form.formState.isSubmitting || login.isPending}
          >
            {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
      </Form>

      <DividerText className="my-5">hoặc</DividerText>
      <GoogleLoginButton onError={setError} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Công ty chưa dùng Commerio?{' '}
        <Link to={ROUTES.register} className="font-semibold text-primary hover:underline">
          Đăng ký công ty
        </Link>
      </p>
    </AuthShell>
  );
}
