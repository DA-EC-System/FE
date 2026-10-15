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
  platform: {
    root: '/platform',
    overview: '/platform/overview',
    companies: '/platform/companies',
    auditLogs: '/platform/audit-logs',
  },
  company: {
    root: (companyId: string) => `/c/${companyId}`,
    shops: (companyId: string) => `/c/${companyId}/channel/shops`,
    catalog: (companyId: string) => `/c/${companyId}/catalog`,
    inventory: (companyId: string) => `/c/${companyId}/inventory`,
    orders: (companyId: string) => `/c/${companyId}/orders`,
    staff: (companyId: string) => `/c/${companyId}/admin/staff`,
    roles: (companyId: string) => `/c/${companyId}/admin/roles`,
  },
} as const;
