import { Link } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { StatusBadge, type StatusMeta } from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTasks } from '@/api/tasks.api';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { TaskItem, TaskSeverity } from '@/types/tasks';

const SEVERITY: Record<TaskSeverity, StatusMeta> = {
  overdue: { label: 'Quá hạn', variant: 'destructive' },
  due_soon: { label: 'Sắp tới hạn', variant: 'warning' },
  info: { label: 'Còn hạn', variant: 'secondary' },
};

/** Đường dẫn tới bản ghi; loại chưa có trang thì hiện chữ thường */
function linkOf(companyId: string, ref: TaskItem['ref']): string | null {
  switch (ref.type) {
    case 'shop':
      return ROUTES.company.shop(companyId, ref.id);
    case 'order':
      return ROUTES.company.order(companyId, ref.id);
    case 'stock_document':
      return ROUTES.company.inventoryDoc(companyId, ref.id);
    default:
      return null;
  }
}

/** Việc cần làm theo hạn, gom từ mọi phân hệ người xem có quyền */
export function TaskList({ companyId }: { companyId: string }) {
  const tasks = useTasks();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Việc cần làm{tasks.data?.length ? ` (${tasks.data.length})` : ''}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.isLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : tasks.isError ? (
          <AlertMessage severity="error">{problemMessage(tasks.error)}</AlertMessage>
        ) : !tasks.data?.length ? (
          <p className="text-sm text-muted-foreground">Không có việc nào tới hạn.</p>
        ) : (
          <ul className="grid divide-y text-sm" data-testid="task-list">
            {tasks.data.map((t) => {
              const to = linkOf(companyId, t.ref);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-kind={t.kind}>
                  <div className="grid gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={t.severity} statuses={SEVERITY} />
                      {to ? (
                        <Link to={to} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{t.title}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {t.group} · {t.detail}
                    </span>
                  </div>
                  {t.dueAt && <span className="text-muted-foreground">Hạn {formatDateTime(t.dueAt)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
