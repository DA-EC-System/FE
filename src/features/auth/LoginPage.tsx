import { useState, useEffect } from 'react';
import logoUrl from '@/assets/logo.png';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Paper,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
  Chip,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useLogin, useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { ROUTES } from '@/router/routes';

const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(3, 'Mật khẩu tối thiểu 3 ký tự'),
});

type LoginForm = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { label: 'Platform Admin', email: 'admin@commerio.vn', password: 'admin' },
  { label: 'CEO công ty', email: 'ceo@commerio.vn', password: 'ceo' },
  { label: 'Sale', email: 'sale@commerio.vn', password: 'sale' },
];

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from
    ?.pathname ?? ROUTES.admin.companies;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (login.isSuccess) {
      navigate(from, { replace: true });
    }
  }, [login.isSuccess, navigate, from]);

  useEffect(() => {
    if (login.error) {
      setError(getErrorMessage(login.error));
    }
  }, [login.error]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit((values) => {
    setError(null);
    login.mutate(values);
  });

  const fillDemo = (email: string, password: string) => {
    setValue('email', email);
    setValue('password', password);
    setError(null);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'stretch',
        background: 'background.default',
      }}
    >
      {/* Left brand panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: 1,
          background:
            'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #A78BFA 100%)',
          color: 'white',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            component="img"
            src={logoUrl}
            alt="Commerio"
            sx={{
              width: 40,
              height: 40,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />
          <Typography variant="h5" fontWeight={800}>
            Commerio
          </Typography>
        </Stack>

        <Box>
          <Typography variant="h3" fontWeight={800} sx={{ mb: 2, lineHeight: 1.1 }}>
            Hệ thống quản lý
            <br />
            đa kênh cho doanh nghiệp
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85, maxWidth: 480 }}>
            Một trang quản lý vận hành bán hàng cho nhiều công ty, đồng bộ sản
            phẩm, tồn kho và đơn hàng từ Shopee, Lazada, TikTok Shop và kênh
            tin nhắn về một nơi duy nhất.
          </Typography>
        </Box>

        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          © 2026 Commerio · Đồ án chuyên ngành — HCMUT
        </Typography>
      </Box>

      {/* Right form */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, md: 6 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 440,
            p: { xs: 3, md: 5 },
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Stack spacing={1} sx={{ mb: 3 }}>
            <Typography variant="h4" fontWeight={800}>
              Đăng nhập
            </Typography>
            <Typography color="text.secondary">
              Chào mừng trở lại! Đăng nhập để tiếp tục quản trị.
            </Typography>
          </Stack>

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
                {...register('email')}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />
              <TextField
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                fullWidth
                {...register('password')}
                error={Boolean(errors.password)}
                helperText={errors.password?.message}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        aria-label="Hiện/ẩn mật khẩu"
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
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

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Tài khoản demo
            </Typography>
          </Divider>

          <Stack spacing={1}>
            {DEMO_ACCOUNTS.map((acc) => (
              <Box
                key={acc.email}
                onClick={() => fillDemo(acc.email, acc.password)}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {acc.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Mật khẩu: {acc.password}
                  </Typography>
                </Box>
                <Chip
                  label={acc.label}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
