import { Link } from 'react-router-dom';
import { AlarmClock, Bell, CheckCheck, CircleAlert, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTasks } from '@/api/tasks.api';
import { cn } from '@/lib/utils';
import { docRefPath, ROUTES } from '@/router/routes';
import type { TaskItem, TaskSeverity } from '@/types/tasks';
import { formatDateTime } from '@/utils/format';

/** Số việc hiện trong chuông; xem đủ ở trang Tổng quan */
const SHOWN = 8;

const SEVERITY_ICON: Record<TaskSeverity, { icon: typeof Info; className: string }> = {
  overdue: { icon: CircleAlert, className: 'bg-destructive-soft text-destructive' },
  due_soon: { icon: AlarmClock, className: 'bg-warning-soft text-warning' },
  info: { icon: Info, className: 'bg-fill text-foreground-2' },
};

/** Gom việc theo nhóm hiển thị, giữ thứ tự BE trả (việc gấp trước) */
function byGroup(items: TaskItem[]) {
  const groups = new Map<string, TaskItem[]>();
  for (const t of items) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return [...groups];
}

/**
 * Chuông nhắc việc trên Header, mở panel như `.notif` của Test_UI: tiêu đề, việc gom theo nhóm,
 * mỗi việc có icon theo mức gấp, tên việc dẫn tới chứng từ, hạn xử lý.
 */
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
          className="relative size-8 rounded-md text-foreground-2 hover:bg-fill"
          aria-label={`Việc cần làm: ${items.length}`}
          data-testid="task-bell"
          data-guide="task-bell"
        >
          <Bell className="size-[18px]" />
          {items.length > 0 && (
            <span
              className={cn(
                'absolute -end-1 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-xs leading-none ring-1 ring-card',
                // Chữ trắng trên #faad14 chỉ 1,9:1; việc sắp tới hạn dùng nền nhạt + chữ -text (đạt 4,5:1)
                overdue
                  ? 'bg-destructive text-white'
                  : 'border border-warning-border bg-warning-soft text-warning',
              )}
            >
              {items.length > 99 ? '99+' : items.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Việc cần làm"
        className="flex max-h-[min(620px,calc(100dvh-80px))] w-[min(400px,calc(100vw-24px))] flex-col rounded-xl border-0 p-0 shadow-popover"
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm font-semibold">Việc cần làm</span>
          {items.length > 0 && <span className="text-sm text-muted-foreground">{items.length}</span>}
        </div>
        {items.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto pb-1">
            {byGroup(items.slice(0, SHOWN)).map(([group, list]) => (
              <section key={group} aria-label={group}>
                <h3 className="px-4 pt-2.5 pb-1 text-xs font-normal text-muted-foreground">{group}</h3>
                <ul>
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} to={docRefPath(companyId, t.ref)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <CheckCheck aria-hidden className="mx-auto mb-2 size-7 text-faint" />
            Không có việc nào tới hạn.
          </div>
        )}
        <div className="border-t px-4 py-2.5 text-sm">
          <Link to={ROUTES.company.root(companyId)} className="text-primary-text hover:text-primary-hover">
            Xem tất cả ở Tổng quan
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TaskRow({ task, to }: { task: TaskItem; to: string | null }) {
  const { icon: Icon, className } = SEVERITY_ICON[task.severity];
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 px-4 py-2.5 transition-colors hover:bg-table-head">
      <span aria-hidden className={cn('flex size-8 items-center justify-center rounded-full', className)}>
        <Icon className="size-4" />
      </span>
      <div className="grid gap-0.5 text-sm">
        {to ? (
          <Link to={to} className="font-medium hover:text-primary-text">
            {task.title}
          </Link>
        ) : (
          <span className="font-medium">{task.title}</span>
        )}
        {task.dueAt && (
          <span className={cn('text-xs', task.severity === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
            Hạn {formatDateTime(task.dueAt)}
          </span>
        )}
      </div>
    </li>
  );
}
