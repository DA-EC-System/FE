import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useGuideStore } from '@/guides/guideStore';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumbStore } from '@/hooks/useBreadcrumb';
import { useRealtimeStore } from '@/stores/realtimeStore';
import type { RealtimeStatus } from '@/api/realtime';
import type { ActiveNav } from './navigation';
import { TaskBell } from './TaskBell';

const REALTIME_LABEL: Record<Exclude<RealtimeStatus, 'off'>, string> = {
  open: 'Đang nhận cập nhật tức thời',
  connecting: 'Đang kết nối cập nhật tức thời',
  reconnecting: 'Mất kết nối, đang nối lại',
};

interface Crumb {
  label: string;
  to?: string;
}

/** `Nhóm / Trang` lấy từ navigation.ts; trang chi tiết thêm mắt cuối qua useBreadcrumb. Nhóm trùng tên mục thì bỏ nhóm. */
function buildCrumbs(active: ActiveNav | null, detail: string | null): Crumb[] {
  if (!active) return detail ? [{ label: detail }] : [];
  const { section, item } = active;
  const crumbs: Crumb[] = section.title === item.label ? [] : [{ label: section.title }];
  if (detail) crumbs.push({ label: item.label, to: item.to }, { label: detail });
  else crumbs.push({ label: item.label });
  return crumbs;
}

/**
 * Thanh trên trắng cao 56px (`.top` của Test_UI): nút mở sidebar, breadcrumb; bên phải trạng thái realtime
 * chuông việc cần làm và nút "?" mở hướng dẫn của trang (FE#132). Chừa sẵn chỗ cho ô tìm kiếm Ctrl K (FE#133).
 */
export function Header({ active }: { active: ActiveNav | null }) {
  const { companyContext } = useAuth();
  const realtime = useRealtimeStore((s) => s.status);
  const detail = useBreadcrumbStore((s) => s.detail);
  const crumbs = buildCrumbs(active, detail);
  const guideKey = useGuideStore((s) => s.page?.key);
  const openIntro = useGuideStore((s) => s.openIntro);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
      <SidebarTrigger className="-ms-1 size-8 text-foreground-2 hover:bg-fill" />
      <nav aria-label="Vị trí" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${i}-${c.label}`}>
                {i > 0 && (
                  <li aria-hidden className="text-faint max-sm:hidden">
                    /
                  </li>
                )}
                <li
                  className={cn('min-w-0', last ? 'truncate text-foreground' : 'shrink-0 max-sm:hidden')}
                  aria-current={last ? 'page' : undefined}
                >
                  {c.to && !last ? (
                    <Link to={c.to} className="transition-colors hover:text-foreground">
                      {c.label}
                    </Link>
                  ) : (
                    c.label
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
      {/* FE#133: ô tìm kiếm mở bảng lệnh Ctrl K đặt ở đây (`.search`, rộng tối thiểu 240px) */}
      <div className="ms-auto flex shrink-0 items-center gap-1.5">
        {realtime !== 'off' && (
          <span
            data-testid="realtime-status"
            data-status={realtime}
            role="status"
            aria-label={REALTIME_LABEL[realtime]}
            title={REALTIME_LABEL[realtime]}
            className="flex h-8 items-center gap-2 pe-2 text-sm text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                'size-1.5 rounded-full',
                realtime === 'open' ? 'bg-success' : 'animate-pulse bg-warning',
              )}
            />
            <span aria-hidden className="max-md:hidden">
              {realtime === 'open' ? 'Đang cập nhật tức thời' : REALTIME_LABEL[realtime]}
            </span>
          </span>
        )}
        {companyContext && <TaskBell companyId={companyContext.companyId} />}
        {guideKey && (
          <Button
            variant="ghost"
            size="icon"
            data-guide="guide-help"
            aria-label="Hướng dẫn trang này"
            title="Hướng dẫn trang này"
            className="text-foreground-2 hover:bg-fill"
            onClick={() => openIntro(guideKey)}
          >
            <CircleHelp className="size-[18px]" />
          </Button>
        )}
      </div>
    </header>
  );
}
