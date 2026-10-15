import type { ReactNode } from 'react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import HistoryIcon from '@mui/icons-material/History';
import StoreIcon from '@mui/icons-material/Store';
import CategoryIcon from '@mui/icons-material/Category';
import TuneIcon from '@mui/icons-material/Tune';
import SellIcon from '@mui/icons-material/Sell';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import GroupIcon from '@mui/icons-material/Group';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ExtensionIcon from '@mui/icons-material/Extension';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
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
        },
        {
          to: ROUTES.company.catalogSetup(companyId),
          label: 'Danh mục & thuộc tính',
          icon: <TuneIcon />,
          module: 'catalog',
          permission: PERMISSIONS.catalogSetup,
        },
        {
          to: ROUTES.company.pricing(companyId),
          label: 'Bảng giá',
          icon: <SellIcon />,
          module: 'pricing',
          permission: PERMISSIONS.pricelistView,
        },
        {
          to: ROUTES.company.inventory(companyId),
          label: 'Kho',
          icon: <Inventory2Icon />,
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
          icon: <GroupIcon />,
          module: 'identity',
          permission: PERMISSIONS.staffView,
        },
        {
          to: ROUTES.company.roles(companyId),
          label: 'Vai trò',
          icon: <AdminPanelSettingsIcon />,
          module: 'identity',
          permission: PERMISSIONS.roleView,
        },
        {
          to: ROUTES.company.modules(companyId),
          label: 'Phân hệ',
          icon: <ExtensionIcon />,
          module: 'platform',
          permission: PERMISSIONS.moduleManage,
        },
        {
          to: ROUTES.company.auditLogs(companyId),
          label: 'Nhật ký thao tác',
          icon: <ManageSearchIcon />,
          module: 'platform',
          permission: PERMISSIONS.auditView,
        },
      ],
    },
  ];
}
