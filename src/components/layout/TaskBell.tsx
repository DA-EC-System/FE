import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTasks } from '@/api/tasks.api';
import { useAuth } from '@/hooks/useAuth';
import { canAddToRequest } from '@/hooks/useRealtime';
import { selectNotices, useStockAlertStore, type StockNotice } from '@/stores/stockAlertStore';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import { docRefPath, ROUTES } from '@/router/routes';
import type { TaskItem } from '@/types/tasks';
import { formatDateTime } from '@/utils/format';

/** Số việc hiện trong chuông; xem đủ ở trang Tổng quan */
const SHOWN = 8;

/** Gom việc theo nhóm hiển thị, giữ thứ tự BE trả (việc gấp trước) */
function byGroup(items: TaskItem[]) {
  const groups = new Map<string, TaskItem[]>();
  for (const t of items) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return [...groups];
}

/**
 * Chuông nhắc việc trên Header, mở panel như `.notif` của Test_UI: tiêu đề, việc gom theo nhóm,
 * mỗi việc có tên việc dẫn tới chứng từ, hạn xử lý.
 */
export function TaskBell({ companyId }: { companyId: string }) {
  const tasks = useTasks();
  const items = tasks.data ?? [];
  const overdue = items.some((t) => t.severity === 'overdue');
  // SKU chạm ngưỡng nhận qua realtime trong phiên này (FE#318)
  const notices = useStockAlertStore(selectNotices(companyId));
  const count = items.length + notices.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 rounded-md px-2 pe-4 text-foreground-2 hover:bg-fill"
          aria-label={tasks.isError ? 'Việc cần làm: chưa tải được' : `Việc cần làm: ${count}`}
          data-testid="task-bell"
          data-guide="task-bell"
        >
          Việc
          {count > 0 && (
            <span
              className={cn(
                'absolute -end-1 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-xs leading-none ring-1 ring-card',
                // Chữ trắng trên #faad14 chỉ 1,9:1; việc sắp tới hạn dùng nền nhạt + chữ -text (đạt 4,5:1)
                overdue
                  ? 'bg-destructive text-white'
                  : 'border border-warning-border bg-warning-soft text-warning',
              )}
            >
              {count > 99 ? '99+' : count}
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
          {count > 0 && <span className="text-sm text-muted-foreground">{count}</span>}
        </div>
        {notices.length > 0 && <StockNotices notices={notices} companyId={companyId} />}
        {tasks.isError ? (
          // Không hiện "Không có việc nào tới hạn" khi chưa đọc được (FE#248)
          <div className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="task-bell-error">
            <p className="font-medium text-foreground">Chưa tải được việc cần làm</p>
            <p className="mt-1">{problemMessage(tasks.error)}</p>
          </div>
        ) : items.length || notices.length ? (
          <div className={cn('min-h-0 flex-1 overflow-y-auto', items.length > 0 && 'pb-1')}>
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

/** Thông báo SKU chạm ngưỡng; nút mở hộp thêm vào đề nghị nhập, không có quyền thì dẫn tới Tồn kho */
function StockNotices({ notices, companyId }: { notices: StockNotice[]; companyId: string }) {
  const { companyContext } = useAuth();
  const openRequest = useStockAlertStore((s) => s.openRequest);
  const dismiss = useStockAlertStore((s) => s.dismiss);
  const clear = useStockAlertStore((s) => s.clear);
  const canRequest = canAddToRequest(companyContext);
  return (
    <section aria-label="Tồn chạm ngưỡng" className="border-b pb-1" data-testid="stock-notices">
      <div className="flex items-center px-4 pt-2.5 pb-1">
        <h3 className="text-xs font-normal text-muted-foreground">Tồn chạm ngưỡng</h3>
        <button
          type="button"
          className="ms-auto text-xs text-primary-text hover:text-primary-hover"
          onClick={clear}
        >
          Bỏ hết
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {notices.map((n) => (
          <li key={n.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2.5" data-notice-id={n.id}>
            <div className="grid gap-1 text-sm">
              <span className="font-medium">{n.text}</span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                {formatDateTime(n.at)}
                {canRequest ? (
                  <button
                    type="button"
                    className="text-primary-text hover:text-primary-hover"
                    onClick={() => openRequest(n.variantId)}
                  >
                    Thêm vào đề nghị nhập
                  </button>
                ) : (
                  <Link to={ROUTES.company.inventory(companyId)} className="text-primary-text hover:text-primary-hover">
                    Xem tồn
                  </Link>
                )}
              </span>
            </div>
            <button
              type="button"
              aria-label="Bỏ thông báo"
              className="h-6 self-start rounded px-1.5 text-xs text-muted-foreground hover:bg-table-head hover:text-foreground"
              onClick={() => dismiss(n.id)}
            >
              Bỏ
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ task, to }: { task: TaskItem; to: string | null }) {
  return (
    <li className="grid gap-3 px-4 py-2.5 transition-colors hover:bg-table-head">
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
