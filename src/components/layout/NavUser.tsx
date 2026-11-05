import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, KeyRound, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { useAuth, useLogout } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';

/** Chữ cái đầu của từ đầu và từ cuối: "Nguyễn Văn An" → "NA" */
function initials(name: string | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Vai trò hiện dưới tên: vai trò trong công ty đang mở, hoặc quản trị nền tảng */
function useRoleLabel() {
  const { account, companyContext } = useAuth();
  if (companyContext?.roles.length) return companyContext.roles.join(', ');
  if (account?.isPlatformAdmin) return 'Quản trị nền tảng';
  return account?.email ?? '';
}

/** Chữ viết tắt trong vòng tròn (`.ini` của Test_UI) */
function Initials({ name }: { name: string | undefined }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary-text"
    >
      {initials(name)}
    </span>
  );
}

/** Khối tài khoản ở chân sidebar (`.acct`): chữ viết tắt, tên, vai trò; bấm mở menu đổi mật khẩu, đăng xuất */
export function NavUser() {
  const { isMobile } = useSidebar();
  const { account, companyContext } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const role = useRoleLabel();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              data-testid="nav-user"
              className="h-auto gap-2.5 rounded-lg px-3 py-2 hover:bg-fill hover:text-sidebar-foreground data-[state=open]:bg-fill data-[state=open]:hover:bg-fill data-[state=open]:hover:text-sidebar-foreground"
            >
              <Initials name={account?.fullName} />
              <span className="grid flex-1 text-start leading-tight">
                <span className="truncate text-[13px] font-medium">{account?.fullName}</span>
                <span className="truncate text-xs text-muted-foreground">{role}</span>
              </span>
              <ChevronsUpDown className="ms-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <Initials name={account?.fullName} />
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{account?.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">{account?.email}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 px-1 pb-1.5">
                {account?.isPlatformAdmin && <Badge>Quản trị nền tảng</Badge>}
                {companyContext?.roles.map((r) => (
                  <Badge key={r} variant="outline">
                    {r}
                  </Badge>
                ))}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate(ROUTES.changePassword, { state: { from: location } })}
            >
              <KeyRound />
              Đổi mật khẩu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
              <LogOut />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
