/**
 * Route constants — dùng xuyên suốt app, tránh hardcode path.
 *
 * Hai không gian tách biệt sau khi đăng nhập:
 *  - /platform/*        quản trị nền tảng (UC-PI-08), không có dữ liệu kinh doanh (QT-03)
 *  - /c/:companyId/*    khu làm việc của một công ty, theo quyền và phân hệ đang bật
 */

export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  changePassword: '/change-password',
  selectCompany: '/select-company',
  /** redirect_uri của OAuth sàn: cố định, không chứa companyId */
  shopOAuthCallback: '/channel/oauth/callback',
  /** Trang uỷ quyền của sàn giả lập (chỉ dùng với mock) */
  mockOAuth: '/mock-oauth/authorize',
  platform: {
    root: '/platform',
    overview: '/platform/overview',
    companies: '/platform/companies',
    auditLogs: '/platform/audit-logs',
  },
  company: {
    root: (companyId: string) => `/c/${companyId}`,
    shops: (companyId: string) => `/c/${companyId}/channel/shops`,
    shop: (companyId: string, shopId: string) => `/c/${companyId}/channel/shops/${shopId}`,
    shopOAuthCallback: (companyId: string) => `/c/${companyId}/channel/shops/oauth-callback`,
    catalog: (companyId: string) => `/c/${companyId}/catalog`,
    catalogNew: (companyId: string) => `/c/${companyId}/catalog/products/new`,
    catalogProduct: (companyId: string, productId: string) =>
      `/c/${companyId}/catalog/products/${productId}`,
    catalogSetup: (companyId: string) => `/c/${companyId}/catalog/setup`,
    pricing: (companyId: string) => `/c/${companyId}/pricing`,
    pricelist: (companyId: string, pricelistId: string) => `/c/${companyId}/pricing/${pricelistId}`,
    inventory: (companyId: string) => `/c/${companyId}/inventory`,
    inventoryTab: (companyId: string, tab: 'stock' | 'documents' | 'returns') =>
      tab === 'stock' ? `/c/${companyId}/inventory` : `/c/${companyId}/inventory?tab=${tab}`,
    inventoryDoc: (companyId: string, docId: string) => `/c/${companyId}/inventory/documents/${docId}`,
    inventoryDocNew: (companyId: string, type: 'receipt' | 'issue') =>
      `/c/${companyId}/inventory/documents/new?type=${type}`,
    orders: (companyId: string) => `/c/${companyId}/orders`,
    staff: (companyId: string) => `/c/${companyId}/admin/staff`,
    roles: (companyId: string) => `/c/${companyId}/admin/roles`,
    modules: (companyId: string) => `/c/${companyId}/admin/modules`,
    auditLogs: (companyId: string) => `/c/${companyId}/admin/audit-logs`,
  },
} as const;
