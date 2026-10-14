import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CompanyListPage } from '@/features/platform/CompanyListPage';
import { ShopListPage } from '@/features/channel/ShopListPage';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { NotFoundPage } from '@/components/common/NotFoundPage';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to={ROUTES.admin.companies} replace /> },
  { path: ROUTES.login, element: <LoginPage /> },
  {
    path: ROUTES.admin.root,
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="companies" replace /> },
          { path: 'companies', element: <CompanyListPage /> },
          { path: 'companies/:companyId/shops', element: <ShopListPage /> },
          {
            path: 'catalog',
            element: <PlaceholderPage title="Danh mục sản phẩm" phase="Sắp ra mắt" />,
          },
          {
            path: 'inventory',
            element: <PlaceholderPage title="Kho hàng" phase="Sắp ra mắt" />,
          },
          {
            path: 'orders',
            element: <PlaceholderPage title="Đơn hàng" phase="Sắp ra mắt" />,
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
