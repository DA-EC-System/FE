import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavUser } from './NavUser';
import type { NavItem, NavSection } from './navigation';

interface AppSidebarProps {
  /** Đã lọc theo phân hệ và quyền */
  sections: NavSection[];
  activeTo: string | null;
  brand: ReactNode;
}

export function AppSidebar({ sections, activeTo, brand }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>{brand}</SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
                <NavLinkItem key={item.to} item={item} isActive={item.to === activeTo} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavLinkItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled tooltip={`${item.label} (sắp ra mắt)`}>
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
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link to={item.to} onClick={() => setOpenMobile(false)}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
