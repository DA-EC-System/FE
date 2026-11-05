import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useTasks } from '@/api/tasks.api';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { hasAllPermissions, hasAnyPermission, isModuleEnabled } from '@/utils/permissions';
import { AppSidebar } from './AppSidebar';
import { AppTitle, CompanySwitcher } from './CompanySwitcher';
import { Header } from './Header';
import {
  PLATFORM_NAV,
  companyNav,
  countTasksByNav,
  findActiveNav,
  type NavSection,
} from './navigation';

interface AppLayoutProps {
  sections: NavSection[];
  /** Đầu sidebar: tên nền tảng, hoặc nút đổi công ty */
  brand: ReactNode;
}

/** Sidebar shadcn ghi trạng thái đóng/mở vào cookie này */
const sidebarDefaultOpen = () => !document.cookie.split('; ').includes('sidebar_state=false');

/** Sidebar rộng 232px như `.side` của Test_UI */
const SIDEBAR_STYLE = { '--sidebar-width': '232px' } as CSSProperties;

/**
 * Khung chung theo Test_UI (`.app`): sidebar trắng có nhóm thu gọn, header trắng có breadcrumb, nội dung đệm 24px
 * rộng tối đa 1280px. Trên mobile sidebar mở bằng Sheet. Mỗi không gian truyền menu riêng.
 */
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

  const active = findActiveNav(visibleSections, location.pathname);

  // Số việc chờ cuối mục, lấy từ danh sách việc (chỉ có trong không gian công ty)
  const tasks = useTasks();
  const companyId = companyContext?.companyId ?? '';
  const counts = useMemo(
    () => (companyId && tasks.data ? countTasksByNav(visibleSections, tasks.data, companyId) : undefined),
    [visibleSections, tasks.data, companyId],
  );

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()} style={SIDEBAR_STYLE}>
      <AppSidebar
        sections={visibleSections}
        activeTo={active?.item.to ?? null}
        counts={counts}
        brand={brand}
      />
      <SidebarInset className="min-w-0 bg-background">
        <Header active={active} />
        <main className="flex-1 px-4 pt-4 pb-16 md:px-6 md:pt-6">
          <div className="w-full max-w-[1280px]">
            <Outlet />
          </div>
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
