import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from './routes';
import type { Role } from '@/types/auth';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

interface ProtectedRouteProps {
  roles?: Role[];
  /** true nếu chỉ cho phép platform admin */
  platformAdminOnly?: boolean;
}

export function ProtectedRoute({ roles, platformAdminOnly }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  if (!user) {
    return <Navigate to={ROUTES.login} replace />;
  }

  if (platformAdminOnly && !user.isPlatformAdmin) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4,
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }} elevation={0}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            403 — Không có quyền truy cập
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Trang này chỉ dành cho quản trị nền tảng.
          </Typography>
          <Button component={RouterLink} to={ROUTES.admin.companies} variant="contained">
            Về trang Công ty
          </Button>
        </Paper>
      </Box>
    );
  }

  if (roles && roles.length > 0) {
    const ok = user.isPlatformAdmin || user.roles.some((r) => roles.includes(r));
    if (!ok) {
      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            p: 4,
          }}
        >
          <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }} elevation={0}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              403 — Không có quyền
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Vai trò của bạn không có quyền truy cập trang này.
            </Typography>
            <Button
              component={RouterLink}
              to={ROUTES.admin.companies}
              variant="contained"
            >
              Về trang Công ty
            </Button>
          </Paper>
        </Box>
      );
    }
  }

  return <Outlet />;
}
