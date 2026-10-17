import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, KeyRound, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

function AccountIdentity() {
  const { account } = useAuth();
  return (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
          {initials(account?.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-start text-sm leading-tight">
        <span className="truncate font-semibold">{account?.fullName}</span>
        <span className="truncate text-xs text-muted-foreground">{account?.email}</span>
      </div>
    </>
  );
}

/** Nội dung menu tài khoản: vai trò, đổi mật khẩu, đăng xuất. Dùng ở chân sidebar và trên header. */
function AccountMenuItems() {
  const { account, companyContext } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex items-center gap-2 px-1 py-1.5">
          <AccountIdentity />
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
    </>
  );
}

/** Tài khoản ở chân sidebar */
export function NavUser() {
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <AccountIdentity />
              <ChevronsUpDown className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <AccountMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Ảnh đại diện góc phải header (theo ProfileDropdown của shadcn-admin) */
export function ProfileDropdown() {
  const { account } = useAuth();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative size-8 rounded-full" aria-label="Tài khoản">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials(account?.fullName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end" forceMount>
        <AccountMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
