import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Check, ChevronsUpDown } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';

function BrandText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="grid flex-1 text-start text-sm leading-tight">
      <span className="truncate font-bold">{title}</span>
      <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}

/** Đầu sidebar của quản trị nền tảng: logo và tên, không có gì để đổi */
export function AppTitle({ subtitle }: { subtitle: string }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to={ROUTES.home}>
            <BrandLogo size={32} />
            <BrandText title="Commerio" subtitle={subtitle} />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Đổi công ty: chỉ liệt kê công ty còn vào được; đổi qua URL để RequireCompany xin token mới. */
export function CompanySwitcher() {
  const { memberships, companyContext } = useAuth();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  if (!companyContext) return null;

  const usable = memberships.filter((m) => m.companyStatus === 'active' && m.status === 'active');

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <BrandLogo size={32} />
              <BrandText title={companyContext.companyName} subtitle="Commerio" />
              <ChevronsUpDown className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Công ty</DropdownMenuLabel>
            {usable.map((m) => {
              const current = m.companyId === companyContext.companyId;
              return (
                <DropdownMenuItem
                  key={m.companyId}
                  className="gap-2 p-2"
                  onClick={() => {
                    setOpenMobile(false);
                    if (!current) navigate(ROUTES.company.root(m.companyId));
                  }}
                >
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate font-medium">{m.companyName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.roles.join(', ')}
                    </span>
                  </div>
                  {current && <Check className="ms-auto" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link to={ROUTES.selectCompany}>
                <ArrowLeftRight />
                Tất cả công ty
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
