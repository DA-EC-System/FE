import {
  ArrowLeftRight,
  ChartLine,
  Building2,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  Puzzle,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  CreditCard,
  Contact,
  FileText,
  FlaskConical,
  HandCoins,
  Inbox,
  Scale,
  Undo2,
  SlidersHorizontal,
  Store,
  Tags,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS, PURCHASING_PERMISSIONS } from '@/utils/permissions';
import type { ModuleKey } from '@/utils/modules';
import { USE_MOCKS } from '@/utils/env';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Mục "Tổng quan" chỉ sáng khi đúng đường dẫn */
  end?: boolean;
  disabled?: boolean;
  /** Ẩn khi công ty chưa bật phân hệ này */
  module?: ModuleKey;
  /** Ẩn khi thiếu quyền này; danh sách là cần đủ mọi quyền */
  permission?: string | readonly string[];
  /** Ẩn khi không có quyền nào trong danh sách */
  anyPermission?: readonly string[];
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
        {
          to: ROUTES.company.purchasing(companyId),
          label: 'Mua hàng',
          icon: ClipboardList,
          module: 'purchasing',
          anyPermission: PURCHASING_PERMISSIONS,
        },
      ],
    },
    {
      title: 'Giao vận',
      items: [
        {
          to: ROUTES.company.packages(companyId),
          label: 'Kiện hàng',
          icon: Truck,
          module: 'fulfillment',
          permission: PERMISSIONS.fulfillmentProcess,
        },
      ],
    },
    {
      title: 'Tài chính',
      items: [
        {
          to: ROUTES.company.financeDocuments(companyId),
          label: 'Chứng từ',
          icon: FileText,
          module: 'finance',
          permission: PERMISSIONS.financeView,
        },
        {
          to: ROUTES.company.cod(companyId),
          label: 'Thu COD',
          icon: HandCoins,
          module: 'finance',
          permission: PERMISSIONS.financeView,
        },
        {
          to: ROUTES.company.refunds(companyId),
          label: 'Hoàn tiền',
          icon: Undo2,
          module: 'finance',
          permission: PERMISSIONS.financeView,
        },
        {
          to: ROUTES.company.unmatched(companyId),
          label: 'Khoản thu chưa khớp',
          icon: Inbox,
          module: 'finance',
          permission: PERMISSIONS.financeView,
        },
        {
          to: ROUTES.company.settlements(companyId),
          label: 'Đối soát sàn',
          icon: Scale,
          module: 'channel',
          permission: PERMISSIONS.financeView,
        },
        {
          to: ROUTES.company.transactions(companyId),
          label: 'Giao dịch cổng',
          icon: ArrowLeftRight,
          module: 'payment',
          permission: PERMISSIONS.transactionView,
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
    {
      title: 'Báo cáo',
      items: [
        {
          to: ROUTES.company.reports(companyId),
          label: 'Báo cáo kinh doanh',
          icon: ChartLine,
          module: 'report',
          permission: [PERMISSIONS.reportView, PERMISSIONS.financeView],
        },
      ],
    },
    ...(USE_MOCKS
      ? [
          {
            title: 'Dữ liệu giả',
            items: [
              {
                to: ROUTES.company.devMarketplace(companyId),
                label: 'Sàn giả lập',
                icon: FlaskConical,
                module: 'channel',
                permission: PERMISSIONS.shopView,
              } satisfies NavItem,
            ],
          },
        ]
      : []),
  ];
}
