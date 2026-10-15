import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import {
  HomeRedirect,
  RequireAuth,
  RequireCompany,
  RequireGuest,
  RequireModule,
  RequirePasswordChanged,
  RequirePlatformAdmin,
  RequireStaff,
} from './guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { SelectCompanyPage } from '@/features/auth/SelectCompanyPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { CompanyLayout, PlatformLayout } from '@/components/layout/AppLayout';
import { PlatformOverviewPage } from '@/features/platform/PlatformOverviewPage';
import { CompanyListPage } from '@/features/platform/CompanyListPage';
import { PlatformAuditLogPage } from '@/features/platform/PlatformAuditLogPage';
import { ModuleSettingsPage } from '@/features/company/ModuleSettingsPage';
import { CompanyAuditLogPage } from '@/features/company/CompanyAuditLogPage';
import { CompanyHomePage } from '@/features/company/CompanyHomePage';
import { ShopListPage } from '@/features/channel/ShopListPage';
import { StaffListPage } from '@/features/identity/StaffListPage';
import { RolesPage } from '@/features/identity/RolesPage';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { NotFoundPage } from '@/components/common/NotFoundPage';
import { PERMISSIONS } from '@/utils/permissions';

export const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomeRedirect /> },
  { path: ROUTES.login, element: <LoginPage /> },
  {
    element: <RequireGuest />,
    children: [{ path: ROUTES.register, element: <RegisterPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: ROUTES.changePassword, element: <ChangePasswordPage /> },
      {
        // Mọi trang khác bị chặn khi còn phải đổi mật khẩu
        element: <RequirePasswordChanged />,
        children: [
          {
            element: <RequireStaff />,
            children: [{ path: ROUTES.selectCompany, element: <SelectCompanyPage /> }],
          },

          // Quản trị nền tảng — không có dữ liệu kinh doanh (QT-03)
          {
            path: ROUTES.platform.root,
            element: <RequirePlatformAdmin />,
            children: [
              {
                element: <PlatformLayout />,
                children: [
                  { index: true, element: <Navigate to="overview" replace /> },
                  { path: 'overview', element: <PlatformOverviewPage /> },
                  { path: 'companies', element: <CompanyListPage /> },
                  { path: 'audit-logs', element: <PlatformAuditLogPage /> },
                ],
              },
            ],
          },

          // Khu làm việc của một công ty
          {
            path: '/c/:companyId',
            element: <RequireCompany />,
            children: [
              {
                element: <CompanyLayout />,
                children: [
                  { index: true, element: <CompanyHomePage /> },
                  {
                    path: 'channel/shops',
                    element: (
                      <RequireModule module="channel" permission={PERMISSIONS.shopView}>
                        <ShopListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'admin/staff',
                    element: (
                      <RequireModule module="identity" permission={PERMISSIONS.staffView}>
                        <StaffListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'admin/roles',
                    element: (
                      <RequireModule module="identity" permission={PERMISSIONS.roleView}>
                        <RolesPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'admin/modules',
                    element: (
                      <RequireModule module="platform" permission={PERMISSIONS.moduleManage}>
                        <ModuleSettingsPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'admin/audit-logs',
                    element: (
                      <RequireModule module="platform" permission={PERMISSIONS.auditView}>
                        <CompanyAuditLogPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'catalog',
                    element: <PlaceholderPage title="Danh mục sản phẩm" />,
                  },
                  {
                    path: 'inventory',
                    element: <PlaceholderPage title="Kho hàng" />,
                  },
                  {
                    path: 'orders',
                    element: <PlaceholderPage title="Đơn hàng" />,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
