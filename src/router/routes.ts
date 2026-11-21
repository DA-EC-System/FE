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
  /** redirect_uri của OAuth sàn: cố định theo sàn, không chứa companyId (§18.4) */
  shopOAuthCallback: '/channel/:platform/callback',
  /** Trang uỷ quyền của sàn giả lập (chỉ dùng với mock) */
  mockOAuth: '/mock-oauth/authorize',
  /** Trang công khai cho người được mời: `/tham-gia#<token>` (US-CT-06) */
  join: '/tham-gia',
  platform: {
    root: '/platform',
    overview: '/platform/overview',
    companies: '/platform/companies',
    auditLogs: '/platform/audit-logs',
  },
  company: {
    root: (companyId: string) => `/c/${companyId}`,
    /** Hướng dẫn thiết lập ban đầu (US-CT-12, Documents/21 mục 23) */
    welcome: (companyId: string) => `/c/${companyId}/welcome`,
    shops: (companyId: string) => `/c/${companyId}/channel/shops`,
    shop: (companyId: string, shopId: string) => `/c/${companyId}/channel/shops/${shopId}`,
    shopSetup: (companyId: string, shopId: string) => `/c/${companyId}/channel/shops/${shopId}/setup`,
    /** Giá chờ xác nhận (§21.4); shopId: lọc theo gian hàng (FE#274) */
    pendingPrices: (companyId: string, shopId?: string) =>
      `/c/${companyId}/channel/pending-prices${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''}`,
    /**
     * Trang 4 bước đẩy sản phẩm lên sàn (commerio-backend#400); shop: gian hàng mở trang; fill: chỉ bổ sung thông tin sàn
     * cho sản phẩm đã có trên sàn (bước cuối là Lưu, không đẩy)
     */
    productPush: (companyId: string, productId: string, platform: string, shopId?: string, fill?: boolean) => {
      const q = new URLSearchParams();
      if (shopId) q.set('shop', shopId);
      if (fill) q.set('mode', 'fill');
      const qs = q.toString();
      return `/c/${companyId}/channel/products/${productId}/push/${platform}${qs ? `?${qs}` : ''}`;
    },
    shopOAuthCallback: (companyId: string, platform: string) => `/c/${companyId}/channel/shops/oauth-callback/${platform}`,
    catalog: (companyId: string) => `/c/${companyId}/catalog`,
    catalogNew: (companyId: string) => `/c/${companyId}/catalog/products/new`,
    /** spec: mở luôn hộp Thông tin SKU của biến thể (FE#326, lối sửa cân nặng từ lỗi đẩy) */
    catalogProduct: (companyId: string, productId: string, spec?: string) =>
      `/c/${companyId}/catalog/products/${productId}${spec ? `?spec=${encodeURIComponent(spec)}` : ''}`,
    catalogSetup: (companyId: string) => `/c/${companyId}/catalog/setup`,
    /** Trang một danh mục sản phẩm: thuộc tính sản phẩm, biến thể theo, ánh xạ sàn (Documents/29 bước 3) */
    catalogCategory: (companyId: string, groupId: string) => `/c/${companyId}/catalog/setup/categories/${groupId}`,
    /** Cài đặt sản phẩm (FE#350): route tạm dưới catalog, menu ở nhóm Quản trị */
    productSettings: (companyId: string) => `/c/${companyId}/catalog/settings`,
    inventory: (companyId: string) => `/c/${companyId}/inventory`,
    inventoryTab: (companyId: string, tab: 'stock' | 'documents') =>
      tab === 'stock' ? `/c/${companyId}/inventory` : `/c/${companyId}/inventory?tab=${tab}`,
    inventoryDoc: (companyId: string, docId: string) => `/c/${companyId}/inventory/documents/${docId}`,
    inventoryDocNew: (companyId: string, type: 'stocktake' | 'write_off' | 'to_quarantine') =>
      `/c/${companyId}/inventory/documents/new?type=${type}`,
    purchasing: (companyId: string, tab?: 'receipts' | 'returns' | 'suppliers') =>
      tab ? `/c/${companyId}/purchasing?tab=${tab}` : `/c/${companyId}/purchasing`,
    purchaseRequest: (companyId: string, id: string) => `/c/${companyId}/purchasing/requests/${id}`,
    /** from: phiếu trả nhà cung cấp bù hàng, điền sẵn nhà cung cấp và dòng */
    purchaseRequestNew: (companyId: string, from?: string) =>
      from ? `/c/${companyId}/purchasing/requests/new?from=${from}` : `/c/${companyId}/purchasing/requests/new`,
    goodsReceipt: (companyId: string, id: string) => `/c/${companyId}/purchasing/receipts/${id}`,
    supplierReturn: (companyId: string, id: string) => `/c/${companyId}/purchasing/returns/${id}`,
    supplierReturnNew: (companyId: string) => `/c/${companyId}/purchasing/returns/new`,
    orders: (companyId: string) => `/c/${companyId}/sales/orders`,
    order: (companyId: string, orderId: string) => `/c/${companyId}/sales/orders/${orderId}`,
    returns: (companyId: string, tab?: string) =>
      tab ? `/c/${companyId}/sales/returns?tab=${tab}` : `/c/${companyId}/sales/returns`,
    returnRequest: (companyId: string, id: string) => `/c/${companyId}/sales/returns/${id}`,
    packages: (companyId: string) => `/c/${companyId}/fulfillment/packages`,
    package: (companyId: string, id: string) => `/c/${companyId}/fulfillment/packages/${id}`,
    packScan: (companyId: string, id: string) => `/c/${companyId}/fulfillment/packages/${id}/pack`,
    ledger: (companyId: string, tab?: 'profit') =>
      tab ? `/c/${companyId}/finance/ledger?tab=${tab}` : `/c/${companyId}/finance/ledger`,
    financeConfigs: (companyId: string) => `/c/${companyId}/finance/configs`,
    financeConfig: (companyId: string, id: string) => `/c/${companyId}/finance/configs/${id}`,
    settlements: (companyId: string, tab?: 'discrepancies') =>
      tab ? `/c/${companyId}/finance/settlements?tab=${tab}` : `/c/${companyId}/finance/settlements`,
    settlement: (companyId: string, id: string) => `/c/${companyId}/finance/settlements/${id}`,
    staff: (companyId: string) => `/c/${companyId}/admin/staff`,
    roles: (companyId: string) => `/c/${companyId}/admin/roles`,
    modules: (companyId: string) => `/c/${companyId}/admin/modules`,
    companyProfile: (companyId: string) => `/c/${companyId}/admin/company`,
    auditLogs: (companyId: string) => `/c/${companyId}/admin/audit-logs`,
    deadJobs: (companyId: string) => `/c/${companyId}/admin/dead-jobs`,
    /** Sàn giả lập, chỉ có khi chạy mock (FE#55) */
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
