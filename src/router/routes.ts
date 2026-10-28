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
    shopSetup: (companyId: string, shopId: string) => `/c/${companyId}/channel/shops/${shopId}/setup`,
    shopOAuthCallback: (companyId: string) => `/c/${companyId}/channel/shops/oauth-callback`,
    catalog: (companyId: string) => `/c/${companyId}/catalog`,
    catalogNew: (companyId: string) => `/c/${companyId}/catalog/products/new`,
    catalogProduct: (companyId: string, productId: string) =>
      `/c/${companyId}/catalog/products/${productId}`,
    catalogSetup: (companyId: string) => `/c/${companyId}/catalog/setup`,
    pricing: (companyId: string) => `/c/${companyId}/pricing`,
    pricelist: (companyId: string, pricelistId: string) => `/c/${companyId}/pricing/${pricelistId}`,
    inventory: (companyId: string) => `/c/${companyId}/inventory`,
    inventoryTab: (companyId: string, tab: 'stock' | 'documents') =>
      tab === 'stock' ? `/c/${companyId}/inventory` : `/c/${companyId}/inventory?tab=${tab}`,
    inventoryDoc: (companyId: string, docId: string) => `/c/${companyId}/inventory/documents/${docId}`,
    inventoryDocNew: (companyId: string, type: 'stocktake' | 'write_off' | 'to_quarantine') =>
      `/c/${companyId}/inventory/documents/new?type=${type}`,
    purchasing: (companyId: string, tab?: 'receipts' | 'returns' | 'suppliers') =>
      tab ? `/c/${companyId}/purchasing?tab=${tab}` : `/c/${companyId}/purchasing`,
    purchaseRequest: (companyId: string, id: string) => `/c/${companyId}/purchasing/requests/${id}`,
    /** from: phiếu trả NCC bù hàng, điền sẵn NCC và dòng */
    purchaseRequestNew: (companyId: string, from?: string) =>
      from ? `/c/${companyId}/purchasing/requests/new?from=${from}` : `/c/${companyId}/purchasing/requests/new`,
    goodsReceipt: (companyId: string, id: string) => `/c/${companyId}/purchasing/receipts/${id}`,
    supplierReturn: (companyId: string, id: string) => `/c/${companyId}/purchasing/returns/${id}`,
    supplierReturnNew: (companyId: string) => `/c/${companyId}/purchasing/returns/new`,
    orders: (companyId: string) => `/c/${companyId}/sales/orders`,
    orderNew: (companyId: string) => `/c/${companyId}/sales/orders/new`,
    order: (companyId: string, orderId: string) => `/c/${companyId}/sales/orders/${orderId}`,
    customers: (companyId: string) => `/c/${companyId}/sales/customers`,
    returns: (companyId: string, tab?: string) =>
      tab ? `/c/${companyId}/sales/returns?tab=${tab}` : `/c/${companyId}/sales/returns`,
    returnRequest: (companyId: string, id: string) => `/c/${companyId}/sales/returns/${id}`,
    customer: (companyId: string, customerId: string) => `/c/${companyId}/sales/customers/${customerId}`,
    packages: (companyId: string) => `/c/${companyId}/fulfillment/packages`,
    package: (companyId: string, id: string) => `/c/${companyId}/fulfillment/packages/${id}`,
    packScan: (companyId: string, id: string) => `/c/${companyId}/fulfillment/packages/${id}/pack`,
    financeDocuments: (companyId: string, tab: 'invoices' | 'receipts' | 'vouchers' = 'invoices') =>
      tab === 'invoices' ? `/c/${companyId}/finance/documents` : `/c/${companyId}/finance/documents?tab=${tab}`,
    invoice: (companyId: string, id: string) => `/c/${companyId}/finance/invoices/${id}`,
    receipt: (companyId: string, id: string) => `/c/${companyId}/finance/receipts/${id}`,
    paymentVoucher: (companyId: string, id: string) => `/c/${companyId}/finance/payment-vouchers/${id}`,
    cod: (companyId: string) => `/c/${companyId}/finance/cod`,
    refunds: (companyId: string) => `/c/${companyId}/finance/refunds`,
    unmatched: (companyId: string, status?: 'assigned' | 'refunded') =>
      status ? `/c/${companyId}/finance/unmatched?status=${status}` : `/c/${companyId}/finance/unmatched`,
    settlements: (companyId: string, tab?: 'discrepancies') =>
      tab ? `/c/${companyId}/finance/settlements?tab=${tab}` : `/c/${companyId}/finance/settlements`,
    settlement: (companyId: string, id: string) => `/c/${companyId}/finance/settlements/${id}`,
    reports: (companyId: string) => `/c/${companyId}/reports`,
    transactions: (companyId: string) => `/c/${companyId}/payment/transactions`,
    paymentGateways: (companyId: string) => `/c/${companyId}/settings/payment-gateways`,
    staff: (companyId: string) => `/c/${companyId}/admin/staff`,
    roles: (companyId: string) => `/c/${companyId}/admin/roles`,
    modules: (companyId: string) => `/c/${companyId}/admin/modules`,
    auditLogs: (companyId: string) => `/c/${companyId}/admin/audit-logs`,
    /** Sàn giả lập, chỉ có khi chạy mock (FE#55) */
    devMarketplace: (companyId: string) => `/c/${companyId}/dev/marketplace`,
  },
} as const;

/** Link tới chứng từ gốc hoặc chứng từ sinh tiếp */
export function docRefPath(
  companyId: string,
  ref: { type: string; id: string },
): string | null {
  const c = ROUTES.company;
  switch (ref.type) {
    case 'shop':
      return c.shop(companyId, ref.id);
    case 'stock_document':
      return c.inventoryDoc(companyId, ref.id);
    case 'order':
      return c.order(companyId, ref.id);
    case 'goods_receipt':
      return c.goodsReceipt(companyId, ref.id);
    case 'supplier_return':
      return c.supplierReturn(companyId, ref.id);
    case 'purchase_request':
      return c.purchaseRequest(companyId, ref.id);
    case 'package':
      return c.package(companyId, ref.id);
    case 'return_request':
      return c.returnRequest(companyId, ref.id);
    case 'return_parcel':
      return c.returns(companyId, 'unmatched');
    default:
      return null;
  }
}
