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
import { ShopListingsPage } from '@/features/channel/ShopListingsPage';
import { MockOAuthPage, ShopOAuthCallbackPage, ShopOAuthRedirect } from '@/features/channel/ShopOAuthPages';
import { StaffListPage } from '@/features/identity/StaffListPage';
import { RolesPage } from '@/features/identity/RolesPage';
import { ProductListPage } from '@/features/catalog/ProductListPage';
import { ProductFormPage } from '@/features/catalog/ProductFormPage';
import { CatalogSetupPage } from '@/features/catalog/CatalogSetupPage';
import { PricelistListPage } from '@/features/pricing/PricelistListPage';
import { PricelistDetailPage } from '@/features/pricing/PricelistDetailPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { StockDocPage } from '@/features/inventory/StockDocPage';
import { OrderListPage } from '@/features/sales/OrderListPage';
import { OrderCreatePage } from '@/features/sales/OrderCreatePage';
import { OrderDetailPage } from '@/features/sales/OrderDetailPage';
import { CustomerListPage } from '@/features/sales/CustomerListPage';
import { CustomerDetailPage } from '@/features/sales/CustomerDetailPage';
import { PaymentGatewaysPage } from '@/features/payment/PaymentGatewaysPage';
import { PaymentResultPage } from '@/features/payment/PaymentResultPage';
import { NotFoundPage } from '@/components/common/NotFoundPage';
import { PERMISSIONS } from '@/utils/permissions';

export const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomeRedirect /> },
  { path: ROUTES.login, element: <LoginPage /> },
  // Trang uỷ quyền của sàn giả lập: đứng ngoài app như trang của sàn thật
  { path: ROUTES.mockOAuth, element: <MockOAuthPage /> },
  // Khách được cổng thanh toán trả về đây, không có phiên đăng nhập
  { path: ROUTES.paymentResult, element: <PaymentResultPage /> },
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
          // redirect_uri của sàn: URL cố định, chưa có companyId
          { path: ROUTES.shopOAuthCallback, element: <ShopOAuthRedirect /> },

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
                    path: 'channel/shops/oauth-callback',
                    element: (
                      <RequireModule module="channel" permission={PERMISSIONS.shopConnect}>
                        <ShopOAuthCallbackPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'channel/shops/:shopId',
                    element: (
                      <RequireModule module="channel" permission={PERMISSIONS.shopView}>
                        <ShopListingsPage />
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
                    element: (
                      <RequireModule module="catalog" permission={PERMISSIONS.productView}>
                        <ProductListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'catalog/products/new',
                    element: (
                      <RequireModule module="catalog" permission={PERMISSIONS.productManage}>
                        <ProductFormPage key="new" />
                      </RequireModule>
                    ),
                  },
                  {
                    // key khác trang tạo mới: không giữ state cũ khi chuyển từ tạo sang sửa
                    path: 'catalog/products/:productId',
                    element: (
                      <RequireModule module="catalog" permission={PERMISSIONS.productView}>
                        <ProductFormPage key="edit" />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'catalog/setup',
                    element: (
                      <RequireModule module="catalog" permission={PERMISSIONS.catalogSetup}>
                        <CatalogSetupPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'pricing',
                    element: (
                      <RequireModule module="pricing" permission={PERMISSIONS.pricelistView}>
                        <PricelistListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'pricing/:pricelistId',
                    element: (
                      <RequireModule module="pricing" permission={PERMISSIONS.pricelistView}>
                        <PricelistDetailPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'inventory',
                    element: (
                      <RequireModule module="inventory" permission={PERMISSIONS.stockView}>
                        <InventoryPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'inventory/documents/:docId',
                    element: (
                      <RequireModule module="inventory" permission={PERMISSIONS.stockView}>
                        <StockDocPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'sales/orders',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.orderView}>
                        <OrderListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'sales/orders/new',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.orderCreate}>
                        <OrderCreatePage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'sales/orders/:orderId',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.orderView}>
                        <OrderDetailPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'sales/customers',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.customerView}>
                        <CustomerListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'sales/customers/:customerId',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.customerView}>
                        <CustomerDetailPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'settings/payment-gateways',
                    element: (
                      <RequireModule module="payment" permission={PERMISSIONS.gatewayManage}>
                        <PaymentGatewaysPage />
                      </RequireModule>
                    ),
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
