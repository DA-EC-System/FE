import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import {
  HomeRedirect,
  RequireAuth,
  RequireCompany,
  RequireModule,
  RequirePlatformAdmin,
  RequireStaff,
} from './guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { SelectCompanyPage } from '@/features/auth/SelectCompanyPage';
import { CompanyLayout, PlatformLayout } from '@/components/layout/AppLayout';
import { PlatformOverviewPage } from '@/features/platform/PlatformOverviewPage';
import { CompanyListPage } from '@/features/platform/CompanyListPage';
import { PlatformAuditLogPage } from '@/features/platform/PlatformAuditLogPage';
import { CompanyHomePage } from '@/features/company/CompanyHomePage';
import { ShopListPage } from '@/features/channel/ShopListPage';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { NotFoundPage } from '@/components/common/NotFoundPage';
import { PERMISSIONS } from '@/utils/permissions';

export const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomeRedirect /> },
  { path: ROUTES.login, element: <LoginPage /> },
  {
    element: <RequireAuth />,
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
  { path: '*', element: <NotFoundPage /> },
]);
