/**
 * Route constants — dùng xuyên suốt app, tránh hardcode path.
 */

export const ROUTES = {
  login: '/login',
  admin: {
    root: '/admin',
    companies: '/admin/companies',
    companyShops: (companyId: string) =>
      `/admin/companies/${companyId}/shops`,
    catalog: '/admin/catalog',
    inventory: '/admin/inventory',
    orders: '/admin/orders',
  },
} as const;
