import {
  Building2,
  History,
  LayoutDashboard,
  Package,
  Puzzle,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  CreditCard,
  Contact,
  SlidersHorizontal,
  Store,
  Tags,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { ModuleKey } from '@/utils/modules';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Mục "Tổng quan" chỉ sáng khi đúng đường dẫn */
  end?: boolean;
  disabled?: boolean;
  /** Ẩn khi công ty chưa bật phân hệ này */
  module?: ModuleKey;
  /** Ẩn khi thiếu quyền này */
  permission?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const PLATFORM_NAV: NavSection[] = [
  {
    title: 'Quản trị nền tảng',
    items: [
      { to: ROUTES.platform.overview, label: 'Tổng quan', icon: LayoutDashboard },
      { to: ROUTES.platform.companies, label: 'Công ty', icon: Building2 },
      { to: ROUTES.platform.auditLogs, label: 'Nhật ký nền tảng', icon: History },
    ],
  },
];

/** Menu khu làm việc của công ty; Sidebar lọc theo phân hệ đang bật và quyền. */
export function companyNav(companyId: string): NavSection[] {
  return [
    {
      title: 'Tổng quan',
      items: [
        {
          to: ROUTES.company.root(companyId),
          label: 'Tổng quan',
          icon: LayoutDashboard,
          end: true,
        },
      ],
    },
    {
      title: 'Bán hàng',
      items: [
        {
          to: ROUTES.company.orders(companyId),
          label: 'Đơn hàng',
          icon: ShoppingCart,
          module: 'sales',
          permission: PERMISSIONS.orderView,
        },
        {
          to: ROUTES.company.customers(companyId),
          label: 'Khách hàng',
          icon: Contact,
          module: 'sales',
          permission: PERMISSIONS.customerView,
        },
        {
          to: ROUTES.company.shops(companyId),
          label: 'Kênh bán',
          icon: Store,
          module: 'channel',
          permission: PERMISSIONS.shopView,
        },
      ],
    },
    {
      title: 'Hàng hoá',
      items: [
        {
          to: ROUTES.company.catalog(companyId),
          label: 'Sản phẩm',
          icon: Package,
          module: 'catalog',
          permission: PERMISSIONS.productView,
        },
        {
          to: ROUTES.company.catalogSetup(companyId),
          label: 'Danh mục & thuộc tính',
          icon: SlidersHorizontal,
          module: 'catalog',
          permission: PERMISSIONS.catalogSetup,
        },
        {
          to: ROUTES.company.pricing(companyId),
          label: 'Bảng giá',
          icon: Tags,
          module: 'pricing',
          permission: PERMISSIONS.pricelistView,
        },
        {
          to: ROUTES.company.inventory(companyId),
          label: 'Kho',
          icon: Warehouse,
          module: 'inventory',
          permission: PERMISSIONS.stockView,
        },
      ],
    },
    {
      title: 'Quản trị',
      items: [
        {
          to: ROUTES.company.staff(companyId),
          label: 'Nhân viên',
          icon: Users,
          module: 'identity',
          permission: PERMISSIONS.staffView,
        },
        {
          to: ROUTES.company.roles(companyId),
          label: 'Vai trò',
          icon: ShieldCheck,
          module: 'identity',
          permission: PERMISSIONS.roleView,
        },
        {
          to: ROUTES.company.modules(companyId),
          label: 'Phân hệ',
          icon: Puzzle,
          module: 'platform',
          permission: PERMISSIONS.moduleManage,
        },
        {
          to: ROUTES.company.auditLogs(companyId),
          label: 'Nhật ký thao tác',
          icon: ScrollText,
          module: 'platform',
          permission: PERMISSIONS.auditView,
        },
      ],
    },
    {
      title: 'Cài đặt',
      items: [
        {
          to: ROUTES.company.paymentGateways(companyId),
          label: 'Cổng thanh toán',
          icon: CreditCard,
          module: 'payment',
          permission: PERMISSIONS.gatewayManage,
        },
      ],
    },
  ];
}
