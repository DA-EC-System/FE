import type { ReactNode } from 'react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import HistoryIcon from '@mui/icons-material/History';
import StoreIcon from '@mui/icons-material/Store';
import CategoryIcon from '@mui/icons-material/Category';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { ModuleKey } from '@/utils/modules';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
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
      { to: ROUTES.platform.overview, label: 'Tổng quan', icon: <DashboardIcon /> },
      { to: ROUTES.platform.companies, label: 'Công ty', icon: <BusinessIcon /> },
      { to: ROUTES.platform.auditLogs, label: 'Nhật ký nền tảng', icon: <HistoryIcon /> },
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
          icon: <DashboardIcon />,
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
          icon: <ShoppingCartIcon />,
          module: 'sales',
          permission: PERMISSIONS.orderView,
          disabled: true,
        },
        {
          to: ROUTES.company.shops(companyId),
          label: 'Kênh bán',
          icon: <StoreIcon />,
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
          icon: <CategoryIcon />,
          module: 'catalog',
          permission: PERMISSIONS.productView,
          disabled: true,
        },
        {
          to: ROUTES.company.inventory(companyId),
          label: 'Kho',
          icon: <Inventory2Icon />,
          module: 'inventory',
          permission: PERMISSIONS.stockView,
          disabled: true,
        },
      ],
    },
  ];
}
