import { useEffect, useState } from 'react';
import { Building2, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useColorMode } from '@/theme/ColorModeContext';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeStore } from '@/stores/realtimeStore';
import type { RealtimeStatus } from '@/api/realtime';
import { ProfileDropdown } from './NavUser';

const REALTIME_LABEL: Record<Exclude<RealtimeStatus, 'off'>, string> = {
  open: 'Đang nhận cập nhật tức thời',
  connecting: 'Đang kết nối cập nhật tức thời',
  reconnecting: 'Mất kết nối, đang nối lại',
};

/**
 * Header dính ở đầu nội dung (theo shadcn-admin): nút thu gọn sidebar, tên mục,
 * công ty đang làm việc, đổi sáng/tối, menu tài khoản.
 */
export function Header({ title }: { title?: string }) {
  const { mode, toggle } = useColorMode();
  const { companyContext } = useAuth();
  const realtime = useRealtimeStore((s) => s.status);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(document.documentElement.scrollTop > 10);
    document.addEventListener('scroll', onScroll, { passive: true });
    return () => document.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 rounded-t-[inherit] bg-background/80 px-4 backdrop-blur-lg sm:gap-4',
        scrolled && 'shadow-sm',
      )}
    >
      <SidebarTrigger variant="outline" className="max-md:scale-110" />
      <Separator orientation="vertical" className="h-6!" />
      <span className="truncate text-sm font-medium">{title}</span>
      <div className="ms-auto flex items-center gap-2">
        {companyContext && (
          <span className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground sm:flex">
            <Building2 className="size-4" />
            <span className="max-w-56 truncate font-medium text-foreground">
              {companyContext.companyName}
            </span>
          </span>
        )}
        {realtime !== 'off' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-testid="realtime-status"
                data-status={realtime}
                role="status"
                aria-label={REALTIME_LABEL[realtime]}
                className="flex size-8 items-center justify-center"
              >
                <span
                  className={cn(
                    'size-2.5 rounded-full',
                    realtime === 'open' ? 'bg-emerald-500' : 'animate-pulse bg-amber-500',
                  )}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{REALTIME_LABEL[realtime]}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={toggle}
              aria-label="Đổi giao diện"
            >
              {mode === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{mode === 'dark' ? 'Chuyển sáng' : 'Chuyển tối'}</TooltipContent>
        </Tooltip>
        <ProfileDropdown />
      </div>
    </header>
  );
}
