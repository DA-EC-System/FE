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
  /** Cổng trả khách về sau khi trả tiền: trang tĩnh, không cần đăng nhập (Documents/21 T7) */
  paymentResult: '/thanh-toan/ket-qua',
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
    orders: (companyId: string) => `/c/${companyId}/sales/orders`,
    orderNew: (companyId: string) => `/c/${companyId}/sales/orders/new`,
    order: (companyId: string, orderId: string) => `/c/${companyId}/sales/orders/${orderId}`,
    customers: (companyId: string) => `/c/${companyId}/sales/customers`,
    customer: (companyId: string, customerId: string) => `/c/${companyId}/sales/customers/${customerId}`,
    fulfillmentOrders: (companyId: string) => `/c/${companyId}/fulfillment/orders`,
    batches: (companyId: string) => `/c/${companyId}/fulfillment/batches`,
    batch: (companyId: string, batchId: string) => `/c/${companyId}/fulfillment/batches/${batchId}`,
    financeDocuments: (companyId: string, tab: 'invoices' | 'receipts' | 'vouchers' = 'invoices') =>
      tab === 'invoices' ? `/c/${companyId}/finance/documents` : `/c/${companyId}/finance/documents?tab=${tab}`,
    invoice: (companyId: string, id: string) => `/c/${companyId}/finance/invoices/${id}`,
    receipt: (companyId: string, id: string) => `/c/${companyId}/finance/receipts/${id}`,
    paymentVoucher: (companyId: string, id: string) => `/c/${companyId}/finance/payment-vouchers/${id}`,
    cod: (companyId: string) => `/c/${companyId}/finance/cod`,
    refunds: (companyId: string) => `/c/${companyId}/finance/refunds`,
    unmatched: (companyId: string, status?: 'assigned' | 'refunded') =>
      status ? `/c/${companyId}/finance/unmatched?status=${status}` : `/c/${companyId}/finance/unmatched`,
    transactions: (companyId: string) => `/c/${companyId}/payment/transactions`,
    paymentGateways: (companyId: string) => `/c/${companyId}/settings/payment-gateways`,
    staff: (companyId: string) => `/c/${companyId}/admin/staff`,
    roles: (companyId: string) => `/c/${companyId}/admin/roles`,
    modules: (companyId: string) => `/c/${companyId}/admin/modules`,
    auditLogs: (companyId: string) => `/c/${companyId}/admin/audit-logs`,
  },
} as const;
