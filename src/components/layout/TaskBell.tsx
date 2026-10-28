import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTasks } from '@/api/tasks.api';
import { cn } from '@/lib/utils';
import { docRefPath, ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';

/** Số việc hiện trong chuông; xem đủ ở trang Tổng quan */
const SHOWN = 5;

/** Chuông nhắc việc trên thanh trên (theo Test_UI): đếm việc tới hạn, bấm thấy 5 việc gấp nhất */
export function TaskBell({ companyId }: { companyId: string }) {
  const tasks = useTasks();
  const items = tasks.data ?? [];
  const overdue = items.some((t) => t.severity === 'overdue');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-nav-foreground hover:bg-white/15 hover:text-nav-foreground"
          aria-label={`Việc cần làm: ${items.length}`}
          data-testid="task-bell"
        >
          <Bell className="size-5" />
          {items.length > 0 && (
            <span
              className={cn(
                'absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
                overdue ? 'bg-destructive' : 'bg-warning',
              )}
            >
              {items.length > 99 ? '99+' : items.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Việc cần làm</div>
        {items.length ? (
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {items.slice(0, SHOWN).map((t) => {
              const to = docRefPath(companyId, t.ref);
              return (
                <li key={t.id} className="grid gap-0.5 px-3 py-2">
                  {to ? (
                    <Link to={to} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{t.title}</span>
                  )}
                  <span className={cn('text-xs', t.severity === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                    {t.group}
                    {t.dueAt && ` · Hạn ${formatDateTime(t.dueAt)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">Không có việc nào tới hạn.</p>
        )}
        <div className="border-t px-3 py-2 text-sm">
          <Link to={ROUTES.company.root(companyId)} className="text-primary hover:underline">
            Xem tất cả ở Tổng quan
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
