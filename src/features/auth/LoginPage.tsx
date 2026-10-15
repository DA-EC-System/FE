import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, Navigate, useLocation, type Location } from 'react-router-dom';
import { useAuth, useLogin } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { ROUTES } from '@/router/routes';
import type { Account } from '@/types/auth';
import { USE_MOCKS } from '@/utils/env';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
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

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: registeredEmail ?? '', password: '' },
  });

  // Đăng nhập xong store đổi ngay → render lại và chuyển trang tại đây
  if (isAuthenticated) {
    return <Navigate to={redirectTarget(from, account)} replace />;
  }

  const onSubmit = handleSubmit((values) => {
    setError(null);
    login.mutate(values, { onError: (e) => setError(getErrorMessage(e)) });
  });

  const fillDemo = (email: string, password: string) => {
    setValue('email', email);
    setValue('password', password);
    setError(null);
  };

  return (
    <AuthShell title="Đăng nhập" subtitle="Chào mừng trở lại! Đăng nhập để tiếp tục làm việc.">
      {registeredEmail && !error && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Đăng ký công ty thành công. Đăng nhập bằng {registeredEmail} để bắt đầu.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            fullWidth
            autoFocus={!registeredEmail}
            {...register('email')}
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />
          <PasswordField
            label="Mật khẩu"
            autoComplete="current-password"
            autoFocus={Boolean(registeredEmail)}
            {...register('password')}
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isSubmitting || login.isPending}
            sx={{ mt: 1 }}
          >
            {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </Stack>
      </form>

      <Divider sx={{ my: 2.5 }}>
        <Typography variant="caption" color="text.secondary">
          hoặc
        </Typography>
      </Divider>
      <GoogleLoginButton onError={setError} />

      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 3 }}>
        Công ty chưa dùng Commerio?{' '}
        <Link component={RouterLink} to={ROUTES.register} fontWeight={600}>
          Đăng ký công ty
        </Link>
      </Typography>

      {SHOW_DEMO_ACCOUNTS && (
        <>
          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Tài khoản demo
            </Typography>
          </Divider>

          <Stack spacing={1}>
            {DEMO_ACCOUNTS.map((acc) => (
              <ButtonBase
                key={acc.email}
                onClick={() => fillDemo(acc.email, acc.password)}
                sx={{
                  width: '100%',
                  textAlign: 'left',
                  p: 1.5,
                  borderRadius: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: 'primary.main', backgroundColor: 'action.hover' },
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600} component="div">
                    {acc.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Mật khẩu: {acc.password}
                  </Typography>
                </Box>
                <Chip label={acc.label} size="small" variant="outlined" color="primary" />
              </ButtonBase>
            ))}
          </Stack>
        </>
      )}
    </AuthShell>
  );
}
