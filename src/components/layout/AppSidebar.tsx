import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Moon, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useColorMode } from '@/theme/ColorModeContext';
import { NavUser } from './NavUser';
import type { NavCount, NavItem, NavSection } from './navigation';

interface AppSidebarProps {
  /** Đã lọc theo phân hệ và quyền */
  sections: NavSection[];
  activeTo: string | null;
  /** Số việc chờ theo `to` của mục; mục không có thì để trống */
  counts?: Map<string, NavCount>;
  brand: ReactNode;
}

/** Nhóm đang thu gọn, nhớ qua lần tải lại (theo tên nhóm) */
const COLLAPSED_KEY = 'commerio.sidebar.collapsed-groups';

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(groups: Set<string>) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...groups]));
  } catch {
    // Trình duyệt chặn lưu (chế độ riêng tư): chỉ không nhớ được, sidebar vẫn chạy
  }
}

/** Mục đang chọn nền --accent chữ xanh, cao 40px bo 8px (`.nav` của Test_UI) */
const NAV_BUTTON =
  'h-10 gap-2.5 rounded-lg px-4 text-sm text-sidebar-foreground transition-colors ease-ant hover:bg-fill hover:text-sidebar-foreground active:bg-fill [&>svg]:text-muted-foreground ' +
  'data-[active=true]:bg-accent data-[active=true]:font-normal data-[active=true]:text-primary-text data-[active=true]:[&>svg]:text-primary-text';

export function AppSidebar({ sections, activeTo, counts, brand }: AppSidebarProps) {
  const { state, isMobile } = useSidebar();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Thu về dạng icon thì mọi nhóm mở: tên nhóm bị ẩn, không bấm mở lại được
  const iconOnly = state === 'collapsed' && !isMobile;

  const setGroupOpen = (title: string, open: boolean) =>
    setCollapsed((prev) => {
      if (open !== prev.has(title)) return prev;
      const next = new Set(prev);
      if (open) next.delete(title);
      else next.add(title);
      writeCollapsed(next);
      return next;
    });

  // Đi tới trang nằm trong nhóm đang thu gọn (bấm chuông, link trong trang) thì mở nhóm đó;
  // lần đầu vào trang thì giữ nguyên nhóm đã thu gọn
  const activeGroup = sections.find((s) => s.items.some((i) => i.to === activeTo))?.title;
  const lastActive = useRef(activeTo);
  useEffect(() => {
    if (lastActive.current === activeTo) return;
    lastActive.current = activeTo;
    if (activeGroup) setGroupOpen(activeGroup, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi đổi trang
  }, [activeTo]);

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="px-2 pt-3 pb-2">{brand}</SidebarHeader>
      <SidebarContent className="gap-0 px-2" data-guide="sidebar-nav">
        {sections.map((section) => {
          const open = iconOnly || !collapsed.has(section.title);
          const hasActive = section.title === activeGroup;
          return (
            <Collapsible
              key={section.title}
              open={open}
              onOpenChange={(o) => setGroupOpen(section.title, o)}
              asChild
            >
              <SidebarGroup className="p-0" data-group={section.title}>
                <SidebarGroupLabel
                  asChild
                  className={cn(
                    'h-auto w-full gap-1.5 rounded-md px-4 pt-4 pb-1 text-xs font-normal text-muted-foreground transition-colors ease-ant hover:text-sidebar-foreground',
                    // Nhóm thu gọn đang chứa trang hiện tại: tên nhóm xanh (`.grp.has-on`)
                    !open && hasActive && 'text-primary-text',
                  )}
                >
                  <CollapsibleTrigger>
                    <span className="truncate">{section.title}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn('ms-auto size-3! transition-transform ease-ant', !open && '-rotate-90')}
                    />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
                  <SidebarMenu className="gap-0.5 py-0.5">
                    {section.items.map((item) => (
                      <NavLinkItem
                        key={item.to}
                        item={item}
                        isActive={item.to === activeTo}
                        count={counts?.get(item.to)}
                      />
                    ))}
                  </SidebarMenu>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="mx-2 gap-0.5 border-t border-sidebar-border px-0 pt-2 pb-3">
        <ThemeToggle />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavLinkItem({ item, isActive, count }: { item: NavItem; isActive: boolean; count?: NavCount }) {
  const { setOpenMobile } = useSidebar();
  const countId = useId();
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled tooltip={`${item.label} (sắp ra mắt)`} className={NAV_BUTTON}>
          <Icon />
          <span>{item.label}</span>
          <Badge variant="secondary" className="ms-auto px-1.5 py-0 text-[10px]">
            Soon
          </Badge>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.label}
        className={cn(NAV_BUTTON, count && 'pe-11')}
      >
        <Link
          to={item.to}
          onClick={() => setOpenMobile(false)}
          aria-current={isActive ? 'page' : undefined}
          aria-describedby={count ? countId : undefined}
        >
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {count && (
        <SidebarMenuBadge
          id={countId}
          aria-label={`${count.count} việc chờ${count.overdue ? ', có việc quá hạn' : ''}`}
          className={cn(
            'end-3 top-2.5 font-normal text-muted-foreground',
            count.overdue && 'font-medium text-destructive',
          )}
        >
          {count.count > 99 ? '99+' : count.count}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/** Nút "Giao diện tối/sáng" ở chân sidebar (chuyển từ Header xuống, như Test_UI) */
function ThemeToggle() {
  const { mode, toggle } = useColorMode();
  const label = mode === 'dark' ? 'Giao diện sáng' : 'Giao diện tối';
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={toggle} tooltip={label} className={NAV_BUTTON}>
          {mode === 'dark' ? <Sun /> : <Moon />}
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
