import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PageSpinner } from '@/components/common/PageSpinner';
import { Button } from '@/components/ui/button';
import { useAuth, useSelectCompany } from '@/hooks/useAuth';
import { authErrorMessage } from '@/features/auth/authErrors';
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

/**
 * Còn dùng mật khẩu trong thư mời → chỉ được ở trang đổi mật khẩu (UC-PI-03 bước 7, UC-PI-04).
 * Đổi xong thì quay lại trang đang định mở.
 */
export function RequirePasswordChanged() {
  const { account } = useAuth();
  const location = useLocation();
  if (account?.mustChangePassword) {
    return <Navigate to={ROUTES.changePassword} replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Trang chỉ dành cho người chưa đăng nhập (đăng ký công ty). */
export function RequireGuest() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to={ROUTES.home} replace />;
  return <Outlet />;
}

/** `/` → không gian phù hợp với tài khoản. */
export function HomeRedirect() {
  const { isAuthenticated, account, companyContext } = useAuth();
  if (!isAuthenticated || !account) return <Navigate to={ROUTES.login} replace />;
  if (account.mustChangePassword) return <Navigate to={ROUTES.changePassword} replace />;
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
      <div className="flex justify-center p-8">
        <div className="grid w-full max-w-md gap-4">
          <AlertMessage severity="error">{authErrorMessage(select.error)}</AlertMessage>
          <Button asChild>
            <Link to={ROUTES.selectCompany}>Chọn công ty khác</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (needsSwitch) {
    return <PageSpinner />;
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
