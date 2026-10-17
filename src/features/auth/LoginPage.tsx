import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, Navigate, useLocation, type Location } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useAuth, useLogin } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { ROUTES } from '@/router/routes';
import type { Account } from '@/types/auth';
import { USE_MOCKS } from '@/utils/env';
import { AuthShell, DividerText } from './AuthShell';
import { GoogleLoginButton } from './GoogleLoginButton';
import { emailSchema } from './schemas';

const loginSchema = z.object({
  email: emailSchema,
  // Chỉ bắt buộc nhập; quy tắc độ dài mật khẩu thuộc màn đăng ký và đổi mật khẩu
  password: z.string().min(1, 'Nhập mật khẩu'),
});

type LoginForm = z.infer<typeof loginSchema>;

// Chỉ hiện khi chạy với mock, không lộ ra bản dùng backend thật
const SHOW_DEMO_ACCOUNTS = USE_MOCKS;

const DEMO_ACCOUNTS = [
  { label: 'Quản trị nền tảng', email: 'platform@commerio.vn', password: 'platform' },
  { label: 'CEO · 2 công ty', email: 'ceo@commerio.vn', password: 'ceo' },
  { label: 'Admin công ty', email: 'admin@commerio.vn', password: 'admin' },
  { label: 'Sale', email: 'sale@commerio.vn', password: 'sale' },
  { label: 'Nhân viên kho', email: 'kho@commerio.vn', password: 'kho' },
  { label: 'Mới được mời', email: 'moi@commerio.vn', password: 'moi12345' },
];

interface LoginLocationState {
  from?: Location;
  /** Vừa đăng ký công ty xong (UC-PI-01) */
  registeredEmail?: string;
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

  const { from, registeredEmail } = (location.state as LoginLocationState | null) ?? {};

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: registeredEmail ?? '', password: '' },
  });

  // Đăng nhập xong store đổi ngay → render lại và chuyển trang tại đây
  if (isAuthenticated) {
    return <Navigate to={redirectTarget(from, account)} replace />;
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    login.mutate(values, { onError: (e) => setError(getErrorMessage(e)) });
  });

  const fillDemo = (email: string, password: string) => {
    form.setValue('email', email);
    form.setValue('password', password);
    form.clearErrors();
    setError(null);
  };

  return (
    <AuthShell title="Đăng nhập" subtitle="Chào mừng trở lại! Đăng nhập để tiếp tục làm việc.">
      {registeredEmail && !error && (
        <AlertMessage severity="success" className="mb-4">
          Đăng ký công ty thành công. Đăng nhập bằng {registeredEmail} để bắt đầu.
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
            autoFocus={!registeredEmail}
          />
          <FormTextField
            control={form.control}
            name="password"
            label="Mật khẩu"
            password
            autoComplete="current-password"
            autoFocus={Boolean(registeredEmail)}
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

      {SHOW_DEMO_ACCOUNTS && (
        <>
          <DividerText className="my-6">Tài khoản demo</DividerText>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillDemo(acc.email, acc.password)}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-3 text-start transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{acc.email}</div>
                  <div className="text-xs text-muted-foreground">Mật khẩu: {acc.password}</div>
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {acc.label}
                </Badge>
              </button>
            ))}
          </div>
        </>
      )}
    </AuthShell>
  );
}
