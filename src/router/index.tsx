import { PendingPricesPage } from '@/features/finance/PendingPricesPage';
import { FinanceConfigsPage } from '@/features/finance/FinanceConfigsPage';
import { FinanceConfigDetailPage } from '@/features/finance/FinanceConfigDetailPage';
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
import { CompanyProfilePage } from '@/features/company/CompanyProfilePage';
import { DeadJobsPage } from '@/features/company/DeadJobsPage';
import { CompanyHomePage } from '@/features/company/CompanyHomePage';
import { WelcomePage } from '@/features/company/WelcomePage';
import { ShopListPage } from '@/features/channel/ShopListPage';
import { ShopListingsPage } from '@/features/channel/ShopListingsPage';
import { ShopSetupPage } from '@/features/channel/ShopSetupPage';
import { LegacyPushRedirect, ProductPublishPage } from '@/features/channel/publish/ProductPublishPage';
import { MockOAuthPage, ShopOAuthCallbackPage, ShopOAuthRedirect } from '@/features/channel/ShopOAuthPages';
import { StaffListPage } from '@/features/identity/StaffListPage';
import { JoinPage } from '@/features/auth/JoinPage';
import { RolesPage } from '@/features/identity/RolesPage';
import { ProductListPage } from '@/features/catalog/ProductListPage';
import { ProductFormPage } from '@/features/catalog/ProductFormPage';
import { CatalogSetupPage } from '@/features/catalog/CatalogSetupPage';
import { CategoryDetailPage } from '@/features/catalog/CategoryDetailPage';
import { ProductSettingsPage } from '@/features/catalog/ProductSettingsPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { StockDocPage } from '@/features/inventory/StockDocPage';
import { PurchasingPage } from '@/features/purchasing/PurchasingPage';
import { PurchaseRequestPage } from '@/features/purchasing/PurchaseRequestPage';
import { GoodsReceiptPage } from '@/features/purchasing/GoodsReceiptPage';
import { ProductDraftPage } from '@/features/purchasing/ProductDraftPage';
import { SupplierReturnPage } from '@/features/purchasing/SupplierReturnPage';
import { OrderListPage } from '@/features/sales/OrderListPage';
import { OrderDetailPage } from '@/features/sales/OrderDetailPage';
import { PackageQueuePage } from '@/features/fulfillment/PackageQueuePage';
import { PackageDetailPage } from '@/features/fulfillment/PackageDetailPage';
import { PackScanPage } from '@/features/fulfillment/PackScanPage';
import { ReturnListPage } from '@/features/returns/ReturnListPage';
import { ReturnDetailPage } from '@/features/returns/ReturnDetailPage';
import { LedgerPage } from '@/features/finance/LedgerPage';
import { SettlementsPage } from '@/features/finance/SettlementsPage';
import { SettlementDetailPage } from '@/features/finance/SettlementDetailPage';
import { NotFoundPage } from '@/components/common/NotFoundPage';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { CATALOG_SETUP_ANY, DRAFT_PERMISSIONS, FINANCE_VIEW_ANY, PERMISSIONS, PURCHASING_PERMISSIONS } from '@/utils/permissions';
import { BASE_PATH } from '@/utils/env';

/** Màn ngoài MVP (Documents/27 mục 8.1): gỡ khỏi menu, URL gõ thẳng hiện câu này trong khung app (FE#249) */
const OUT_OF_SCOPE = {
  sales: (
    <PlaceholderPage
      title="Chưa có trong phiên bản này"
      phase="Commerio chỉ bán qua sàn"
      description="Đơn tạo tay và hồ sơ người mua không thuộc bản này. Đơn từ sàn xem ở Đơn hàng."
    />
  ),
  reports: (
    <PlaceholderPage
      title="Chưa có trong phiên bản này"
      phase="Commerio chỉ bán qua sàn"
      description="Lợi nhuận theo đơn xem ở Sổ giao dịch, số liệu chính ở Tổng quan."
    />
  ),
};

export const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomeRedirect /> },
  { path: ROUTES.login, element: <LoginPage /> },
  // Trang uỷ quyền của sàn giả lập: đứng ngoài app như trang của sàn thật
  { path: ROUTES.mockOAuth, element: <MockOAuthPage /> },
  // Link mời nhân viên: công khai, mở được cả khi đang đăng nhập tài khoản khác (US-CT-06)
  { path: ROUTES.join, element: <JoinPage /> },
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
              // Hướng dẫn thiết lập ban đầu: trang riêng, không có thanh bên (FE#419)
              { path: 'welcome', element: <WelcomePage /> },
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
                    path: 'channel/shops/oauth-callback/:platform',
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
                    // Lối cũ của trang đẩy từng sàn: chuyển sang màn Đăng sản phẩm
                    path: 'channel/products/:productId/push/:platform',
                    element: <LegacyPushRedirect />,
                  },
                  {
                    path: 'catalog/products/:productId/publish',
                    element: (
                      <RequireModule module="channel" permission={PERMISSIONS.listingManage}>
                        <ProductPublishPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'channel/shops/:shopId/setup',
                    element: (
                      <RequireModule module="channel" permission={PERMISSIONS.shopConnect}>
                        <ShopSetupPage />
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
                    path: 'admin/company',
                    element: (
                      <RequireModule module="platform" permission={PERMISSIONS.companyManage}>
                        <CompanyProfilePage />
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
                    path: 'admin/dead-jobs',
                    element: (
                      <RequireModule module="platform" permission={PERMISSIONS.jobManage}>
                        <DeadJobsPage />
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
                      <RequireModule module="catalog" anyPermission={CATALOG_SETUP_ANY}>
                        <CatalogSetupPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'catalog/setup/categories/:groupId',
                    element: (
                      <RequireModule module="catalog" anyPermission={CATALOG_SETUP_ANY}>
                        <CategoryDetailPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'catalog/settings',
                    element: (
                      <RequireModule module="catalog" permission={PERMISSIONS.productView}>
                        <ProductSettingsPage />
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
                    path: 'purchasing',
                    element: (
                      <RequireModule module="purchasing" anyPermission={PURCHASING_PERMISSIONS}>
                        <PurchasingPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'purchasing/requests/:requestId',
                    element: (
                      <RequireModule module="purchasing" anyPermission={PURCHASING_PERMISSIONS}>
                        <PurchaseRequestPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'purchasing/receipts/:receiptId',
                    element: (
                      <RequireModule module="purchasing" anyPermission={PURCHASING_PERMISSIONS}>
                        <GoodsReceiptPage />
                      </RequireModule>
                    ),
                  },
                  {
                    // Xem đề nghị hoặc quản lý sản phẩm (Admin không có quyền nhập hàng vẫn soạn được, Documents/21 §16.3)
                    path: 'purchasing/product-drafts/:draftId',
                    element: (
                      <RequireModule module="catalog" anyPermission={DRAFT_PERMISSIONS}>
                        <ProductDraftPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'purchasing/returns/:returnId',
                    element: (
                      <RequireModule module="purchasing" anyPermission={PURCHASING_PERMISSIONS}>
                        <SupplierReturnPage />
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
                  // Ngoài MVP: giữ route tĩnh để URL cũ không rơi vào `sales/orders/:orderId` với id "new"
                  { path: 'sales/orders/new', element: OUT_OF_SCOPE.sales },
                  {
                    path: 'sales/orders/:orderId',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.orderView}>
                        <OrderDetailPage />
                      </RequireModule>
                    ),
                  },
                  { path: 'sales/customers/*', element: OUT_OF_SCOPE.sales },
                  {
                    path: 'sales/returns',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.returnView}>
                        <ReturnListPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'sales/returns/:returnId',
                    element: (
                      <RequireModule module="sales" permission={PERMISSIONS.returnView}>
                        <ReturnDetailPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'fulfillment/packages',
                    element: (
                      <RequireModule module="fulfillment" permission={PERMISSIONS.fulfillmentProcess}>
                        <PackageQueuePage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'fulfillment/packages/:packageId',
                    element: (
                      <RequireModule module="fulfillment" permission={PERMISSIONS.fulfillmentProcess}>
                        <PackageDetailPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'fulfillment/packages/:packageId/pack',
                    element: (
                      <RequireModule module="fulfillment" permission={PERMISSIONS.fulfillmentProcess}>
                        <PackScanPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'finance/ledger',
                    element: (
                      <RequireModule module="finance" anyPermission={FINANCE_VIEW_ANY}>
                        <LedgerPage />
                      </RequireModule>
                    ),
                  },
                  { path: 'channel/pending-prices', element: <RequireModule module="channel" permission={PERMISSIONS.listingManage}><PendingPricesPage /></RequireModule> },
                  { path: 'finance/configs', element: <RequireModule module="finance" anyPermission={FINANCE_VIEW_ANY}><FinanceConfigsPage /></RequireModule> },
                  { path: 'finance/configs/:id', element: <RequireModule module="finance" anyPermission={FINANCE_VIEW_ANY}><FinanceConfigDetailPage /></RequireModule> },
                  {
                    path: 'finance/settlements',
                    element: (
                      <RequireModule module="finance" anyPermission={FINANCE_VIEW_ANY}>
                        <SettlementsPage />
                      </RequireModule>
                    ),
                  },
                  {
                    path: 'finance/settlements/:id',
                    element: (
                      <RequireModule module="finance" anyPermission={FINANCE_VIEW_ANY}>
                        <SettlementDetailPage />
                      </RequireModule>
                    ),
                  },
                  { path: 'reports', element: OUT_OF_SCOPE.reports },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
], { basename: BASE_PATH.replace(/\/$/, '') || '/' });
