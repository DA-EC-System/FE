import {
  ArrowLeftRight,
  ChartLine,
  Building2,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  PackageX,
  Puzzle,
  ScrollText,
  ServerCrash,
  ShieldCheck,
  ShoppingCart,
  CreditCard,
  Contact,
  FileText,
  FlaskConical,
  HandCoins,
  BookOpenText,
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
import { matchPath } from 'react-router-dom';
import { docRefPath, ROUTES } from '@/router/routes';
import type { TaskItem } from '@/types/tasks';
import { FINANCE_VIEW_ANY, PERMISSIONS, PURCHASING_PERMISSIONS } from '@/utils/permissions';
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
  /** Đường dẫn khác cũng thuộc mục này (trang chi tiết không nằm dưới `to`): sáng mục, dựng breadcrumb, đếm việc */
  alsoMatch?: string[];
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

/**
 * Menu khu làm việc của công ty, nhóm theo bản mẫu Test_UI (FE#70); thêm nhóm Quản trị cho trang riêng của app.
 * AppLayout lọc theo phân hệ đang bật và quyền.
 */
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
        {
          to: ROUTES.company.reports(companyId),
          label: 'Báo cáo kinh doanh',
          icon: ChartLine,
          module: 'report',
          permission: [PERMISSIONS.reportView, PERMISSIONS.financeView],
        },
      ],
    },
    {
      title: 'Nhập hàng',
      items: [
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
      title: 'Sản phẩm và kho',
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
          to: ROUTES.company.inventory(companyId),
          label: 'Kho',
          icon: Warehouse,
          module: 'inventory',
          permission: PERMISSIONS.stockView,
        },
      ],
    },
    {
      title: 'Bán trên sàn',
      items: [
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
      title: 'Đơn hàng',
      items: [
        {
          to: ROUTES.company.orders(companyId),
          label: 'Đơn hàng',
          icon: ShoppingCart,
          module: 'sales',
          permission: PERMISSIONS.orderView,
        },
        {
          to: ROUTES.company.packages(companyId),
          label: 'Kiện hàng',
          icon: Truck,
          module: 'fulfillment',
          permission: PERMISSIONS.fulfillmentProcess,
        },
        {
          to: ROUTES.company.returns(companyId),
          label: 'Yêu cầu trả',
          icon: PackageX,
          module: 'sales',
          permission: PERMISSIONS.returnView,
        },
        {
          to: ROUTES.company.customers(companyId),
          label: 'Khách hàng',
          icon: Contact,
          module: 'sales',
          permission: PERMISSIONS.customerView,
        },
      ],
    },
    {
      title: 'Tài chính',
      items: [
        {
          to: ROUTES.company.ledger(companyId),
          label: 'Sổ tiền',
          icon: BookOpenText,
          module: 'finance',
          anyPermission: FINANCE_VIEW_ANY,
        },
        {
          to: ROUTES.company.financeDocuments(companyId),
          label: 'Chứng từ',
          icon: FileText,
          alsoMatch: [
            `/c/${companyId}/finance/invoices`,
            `/c/${companyId}/finance/receipts`,
            `/c/${companyId}/finance/payment-vouchers`,
          ],
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
          module: 'finance',
          anyPermission: FINANCE_VIEW_ANY,
        },
        {
          to: `/c/${companyId}/pricing/pending-prices`, label: 'Giá chờ xác nhận', icon: Tags, module: 'channel', permission: PERMISSIONS.listingManage,
        },
        {
          to: ROUTES.company.financeConfigs(companyId), label: 'Cấu hình phí và thuế', icon: SlidersHorizontal, module: 'finance', anyPermission: FINANCE_VIEW_ANY,
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
        {
          to: ROUTES.company.deadJobs(companyId),
          label: 'Việc nền lỗi',
          icon: ServerCrash,
          module: 'platform',
          permission: PERMISSIONS.jobManage,
        },
        {
          to: ROUTES.company.paymentGateways(companyId),
          label: 'Cổng thanh toán',
          icon: CreditCard,
          module: 'payment',
          permission: PERMISSIONS.gatewayManage,
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

export interface ActiveNav {
  section: NavSection;
  item: NavItem;
}

/** Độ dài đoạn khớp của `pathname` với mục, 0 khi không khớp */
function matchLength(item: NavItem, pathname: string) {
  const own = matchPath({ path: item.to, end: Boolean(item.end) }, pathname) ? item.to.length : 0;
  const extra = (item.alsoMatch ?? [])
    .filter((path) => matchPath({ path, end: false }, pathname))
    .map((path) => path.length);
  return Math.max(own, ...extra);
}

/**
 * Mục khớp dài nhất cùng nhóm của nó: ở /catalog/setup chỉ sáng "Danh mục & thuộc tính", không sáng cả "Sản phẩm".
 * Dùng cho mục đang chọn trên sidebar, breadcrumb trên Header và đếm việc chờ theo mục.
 */
export function findActiveNav(sections: NavSection[], pathname: string): ActiveNav | null {
  let best: ActiveNav | null = null;
  let bestLength = 0;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.disabled) continue;
      const length = matchLength(item, pathname);
      if (length > bestLength) {
        best = { section, item };
        bestLength = length;
      }
    }
  }
  return best;
}

export interface NavCount {
  count: number;
  /** Có việc quá hạn: số hiện màu đỏ */
  overdue: boolean;
}

/**
 * Số việc chờ theo mục menu (theo `to`), từ danh sách việc của tasks.api: việc trỏ tới bản ghi nằm dưới mục nào thì tính cho mục đó.
 * Mục không có việc nào thì không có trong kết quả (để trống, không hiện số 0).
 */
export function countTasksByNav(
  sections: NavSection[],
  tasks: readonly TaskItem[],
  companyId: string,
): Map<string, NavCount> {
  const counts = new Map<string, NavCount>();
  for (const task of tasks) {
    const path = docRefPath(companyId, task.ref)?.split('?')[0];
    const target = path ? findActiveNav(sections, path) : null;
    if (!target) continue;
    const current = counts.get(target.item.to) ?? { count: 0, overdue: false };
    counts.set(target.item.to, {
      count: current.count + 1,
      overdue: current.overdue || task.severity === 'overdue',
    });
  }
  return counts;
}
