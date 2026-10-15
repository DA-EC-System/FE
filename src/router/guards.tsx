import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth, useSelectCompany } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { hasPermission, isModuleEnabled } from '@/utils/permissions';
import { MODULE_LABELS, type ModuleKey } from '@/utils/modules';
import { ForbiddenPage } from '@/components/common/ForbiddenPage';
import { ROUTES } from './routes';

/** Chưa đăng nhập → /login, giữ lại trang đang mở để quay lại. */
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** `/` → không gian phù hợp với tài khoản. */
export function HomeRedirect() {
  const { isAuthenticated, account, companyContext } = useAuth();
  if (!isAuthenticated || !account) return <Navigate to={ROUTES.login} replace />;
  if (account.isPlatformAdmin) return <Navigate to={ROUTES.platform.root} replace />;
  if (companyContext) {
    return <Navigate to={ROUTES.company.root(companyContext.companyId)} replace />;
  }
  return <Navigate to={ROUTES.selectCompany} replace />;
}

export function RequirePlatformAdmin() {
  const { account } = useAuth();
  if (!account?.isPlatformAdmin) {
    return <ForbiddenPage message="Trang này chỉ dành cho quản trị nền tảng." />;
  }
  return <Outlet />;
}

/** Trang chọn công ty chỉ dành cho nhân viên; quản trị nền tảng không thuộc công ty nào. */
export function RequireStaff() {
  const { account } = useAuth();
  if (account?.isPlatformAdmin) return <Navigate to={ROUTES.platform.root} replace />;
  return <Outlet />;
}

/**
 * Khu làm việc của công ty. Nếu `:companyId` trên URL khác công ty đang chọn
 * (mở link từ tab khác, đổi công ty) thì xin token mới cho công ty đó trước khi hiện trang.
 */
export function RequireCompany() {
  const { companyId = '' } = useParams<{ companyId: string }>();
  const { account, memberships, companyContext } = useAuth();
  const select = useSelectCompany();

  const membership = memberships.find((m) => m.companyId === companyId);
  const needsSwitch =
    !account?.isPlatformAdmin && Boolean(membership) && companyContext?.companyId !== companyId;

  // Ghi nhớ công ty đã xin token để không gọi lặp (StrictMode chạy effect hai lần)
  const requested = useRef<string | null>(null);
  const { mutate } = select;
  useEffect(() => {
    if (!needsSwitch) {
      requested.current = null;
    } else if (requested.current !== companyId) {
      requested.current = companyId;
      mutate(companyId);
    }
  }, [needsSwitch, companyId, mutate]);
  const switchFailed = select.isError && select.variables === companyId;

  if (account?.isPlatformAdmin) {
    return (
      <ForbiddenPage
        message="Quản trị nền tảng không xem dữ liệu kinh doanh của công ty."
        backTo={ROUTES.platform.root}
        backLabel="Về trang quản trị nền tảng"
      />
    );
  }
  if (!membership) return <Navigate to={ROUTES.selectCompany} replace />;

  if (switchFailed) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <Alert severity="error">{getErrorMessage(select.error)}</Alert>
          <Button component={RouterLink} to={ROUTES.selectCompany} variant="contained">
            Chọn công ty khác
          </Button>
        </Stack>
      </Box>
    );
  }
  if (needsSwitch) {
    return (
      <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  return <Outlet />;
}

interface RequireModuleProps {
  module: ModuleKey;
  permission?: string;
  children: ReactNode;
}

/** Chặn trang khi phân hệ chưa bật hoặc thiếu quyền. BE vẫn kiểm lại mọi yêu cầu. */
export function RequireModule({ module, permission, children }: RequireModuleProps) {
  const { companyContext } = useAuth();
  const backTo = companyContext ? ROUTES.company.root(companyContext.companyId) : ROUTES.home;

  if (!isModuleEnabled(companyContext, module)) {
    return (
      <ForbiddenPage
        title="Phân hệ chưa bật"
        message={`Công ty chưa bật phân hệ ${MODULE_LABELS[module]}. CEO có thể bật phân hệ tuỳ chọn trong phần cài đặt công ty.`}
        backTo={backTo}
        backLabel="Về tổng quan"
      />
    );
  }
  if (permission && !hasPermission(companyContext, permission)) {
    return (
      <ForbiddenPage
        message="Vai trò của bạn trong công ty này không có quyền mở trang này."
        backTo={backTo}
        backLabel="Về tổng quan"
      />
    );
  }
  return <>{children}</>;
}
