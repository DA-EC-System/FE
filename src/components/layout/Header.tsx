import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useColorMode } from '@/theme/ColorModeContext';

/** Header dính ở đầu nội dung (theo shadcn-admin): nút thu gọn sidebar, tên mục, đổi sáng/tối */
export function Header({ title }: { title?: string }) {
  const { mode, toggle } = useColorMode();
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
      <div className="ms-auto">
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
      </div>
    </header>
  );
}
