import { ClipboardPlus, PackagePlus, ShoppingCart, Store, type LucideIcon } from 'lucide-react';
import { ROUTES } from '@/router/routes';
import type { CompanyContext } from '@/types/auth';
import { PERMISSIONS, hasPermission, isModuleEnabled } from '@/utils/permissions';
import type { ModuleKey } from '@/utils/modules';
import type { NavSection } from './navigation';

/** Một lệnh trong bảng Ctrl K (FE#133) */
export interface PaletteCommand {
  id: string;
  label: string;
  /** Chữ phụ bên phải: tên nhóm của trang */
  hint?: string;
  icon: LucideIcon;
  to: string;
  /** State gửi kèm khi điều hướng, ví dụ mở luôn hộp Thêm gian hàng */
  state?: unknown;
}

/** Bỏ dấu, đổi đ thành d, chữ thường; giữ đúng độ dài để tô chữ khớp trên chuỗi gốc */
export function foldVi(text: string): string {
  return [...text]
    .map((ch) => {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const folded = (base.length === 1 ? base : ch).toLowerCase();
      return folded === 'đ' ? 'd' : folded;
    })
    .join('');
}

/** Vị trí chữ khớp `query` trong `label` (không phân biệt dấu, hoa thường); không khớp thì `null` */
export function matchRange(label: string, query: string): [number, number] | null {
  const q = foldVi(query.trim());
  if (!q) return null;
  const i = foldVi(label).indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}

/**
 * Lọc và xếp lệnh theo chữ gõ: khớp tên trước, khớp tên nhóm sau; trong mỗi loại, khớp đầu chữ lên trước.
 * Chữ gõ rỗng thì giữ nguyên danh sách.
 */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = foldVi(query.trim());
  if (!q) return commands;
  const rank = (c: PaletteCommand) => {
    const label = foldVi(c.label);
    const i = label.indexOf(q);
    if (i === 0) return 0;
    if (i > 0) return label[i - 1] === ' ' ? 1 : 2;
    return c.hint && foldVi(c.hint).includes(q) ? 3 : -1;
  };
  return commands
    .map((c, order) => ({ c, order, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.order - b.order)
    .map((x) => x.c);
}

/** Nhóm "Trang": mọi mục menu đang hiện (đã lọc theo quyền và phân hệ ở AppLayout) */
export function pageCommands(sections: NavSection[]): PaletteCommand[] {
  return sections.flatMap((s) =>
    s.items
      .filter((i) => !i.disabled)
      .map((i) => ({
        id: `page:${i.to}`,
        label: i.label,
        hint: s.title === i.label ? undefined : s.title,
        icon: i.icon,
        to: i.to,
      })),
  );
}

interface QuickActionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  module: ModuleKey;
  permission: string;
  to: (companyId: string) => string;
  state?: unknown;
}

const QUICK_ACTIONS: QuickActionDef[] = [
  {
    id: 'order-new',
    label: 'Tạo đơn',
    icon: ShoppingCart,
    module: 'sales',
    permission: PERMISSIONS.orderCreate,
    to: ROUTES.company.orderNew,
  },
  {
    id: 'purchase-request-new',
    label: 'Tạo đề nghị nhập',
    icon: ClipboardPlus,
    module: 'purchasing',
    permission: PERMISSIONS.purchaseRequestManage,
    to: (companyId) => ROUTES.company.purchaseRequestNew(companyId),
  },
  {
    id: 'product-new',
    label: 'Thêm sản phẩm',
    icon: PackagePlus,
    module: 'catalog',
    permission: PERMISSIONS.productManage,
    to: ROUTES.company.catalogNew,
  },
  {
    id: 'shop-new',
    label: 'Thêm gian hàng',
    icon: Store,
    module: 'channel',
    permission: PERMISSIONS.shopConnect,
    to: ROUTES.company.shops,
    state: { addShop: true },
  },
];

/** Nhóm "Thao tác nhanh": chỉ thao tác có quyền và phân hệ đang bật */
export function quickActions(context: CompanyContext | null): PaletteCommand[] {
  if (!context) return [];
  return QUICK_ACTIONS.filter(
    (a) => isModuleEnabled(context, a.module) && hasPermission(context, a.permission),
  ).map((a) => ({ id: a.id, label: a.label, icon: a.icon, to: a.to(context.companyId), state: a.state }));
}
