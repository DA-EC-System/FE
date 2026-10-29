import { useMemo, type ReactNode } from 'react';
import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { hasAllPermissions, hasAnyPermission, isModuleEnabled } from '@/utils/permissions';
import { AppSidebar } from './AppSidebar';
import { AppTitle, CompanySwitcher } from './CompanySwitcher';
import { Header } from './Header';
import { PLATFORM_NAV, companyNav, type NavItem, type NavSection } from './navigation';

interface AppLayoutProps {
  sections: NavSection[];
  /** Đầu sidebar: tên nền tảng, hoặc nút đổi công ty */
  brand: ReactNode;
}

/** Sidebar shadcn ghi trạng thái đóng/mở vào cookie này */
const sidebarDefaultOpen = () => !document.cookie.split('; ').includes('sidebar_state=false');

/** Khung chung theo shadcn-admin: sidebar thu gọn được + header + nội dung. Mỗi không gian truyền menu riêng. */
export function AppLayout({ sections, brand }: AppLayoutProps) {
  const { companyContext } = useAuth();
  const location = useLocation();

  // Ẩn mục của phân hệ chưa bật hoặc thiếu quyền; bỏ nhóm không còn mục nào
  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (i) =>
              (!i.module || isModuleEnabled(companyContext, i.module)) &&
              (!i.permission || hasAllPermissions(companyContext, i.permission)) &&
              (!i.anyPermission || hasAnyPermission(companyContext, i.anyPermission)),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [sections, companyContext],
  );

  // Mục khớp dài nhất: ở /catalog/setup chỉ sáng "Danh mục & thuộc tính", không sáng cả "Sản phẩm"
  const activeItem = visibleSections
    .flatMap((s) => s.items)
    .filter((i) => matchPath({ path: i.to, end: Boolean(i.end) }, location.pathname))
    .reduce<NavItem | null>((best, i) => (!best || i.to.length > best.to.length ? i : best), null);

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
      <AppSidebar sections={visibleSections} activeTo={activeItem?.to ?? null} brand={brand} />
      <SidebarInset className="min-w-0">
        <Header title={activeItem?.label} />
        <main className="flex-1 px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function PlatformLayout() {
  return <AppLayout sections={PLATFORM_NAV} brand={<AppTitle subtitle="Quản trị nền tảng" />} />;
}

export function CompanyLayout() {
  const { companyContext } = useAuth();
  // Một stream realtime cho cả không gian công ty (FE#81)
  useRealtime();
  // RequireCompany đảm bảo đã có companyContext trước khi render layout
  const companyId = companyContext?.companyId ?? '';
  return <AppLayout sections={companyNav(companyId)} brand={<CompanySwitcher />} />;
}
