import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleAlert, CircleDot, Clock } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Panel } from '@/components/common/Panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTasks } from '@/api/tasks.api';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import { docRefPath } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { TaskSeverity } from '@/types/tasks';

/** Trang chủ hiện vài việc gấp nhất; danh sách dài làm trang và tour hướng dẫn tràn màn hình */
const SHOWN = 6;

const SEVERITY: Record<TaskSeverity, { label: string; icon: typeof Clock; tone: string }> = {
  overdue: { label: 'Quá hạn', icon: CircleAlert, tone: 'text-destructive' },
  due_soon: { label: 'Sắp tới hạn', icon: Clock, tone: 'text-warning' },
  info: { label: 'Còn hạn', icon: CircleDot, tone: 'text-muted-foreground' },
};

/** Việc cần làm theo hạn, gom từ mọi phân hệ người xem có quyền; dáng `.todo` của Test_UI v4 (FE#134) */
export function TaskList({ companyId }: { companyId: string }) {
  const tasks = useTasks();
  const items = tasks.data ?? [];
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <Panel
      title="Việc cần làm"
      extra={items.length > 0 && <span className="font-mono text-xs text-muted-foreground">{items.length}</span>}
      flush
    >
      {tasks.isLoading ? (
        <div className="grid gap-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : tasks.isError ? (
        <div className="p-4">
          <AlertMessage severity="error">{problemMessage(tasks.error)}</AlertMessage>
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Không có việc nào tới hạn.</p>
      ) : (
        <ul className="divide-y" data-testid="task-list">
          {shown.map((t) => {
            const to = docRefPath(companyId, t.ref);
            const s = SEVERITY[t.severity];
            const Icon = s.icon;
            return (
              <li
                key={t.id}
                data-kind={t.kind}
                data-severity={t.severity}
                className="group grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-fill/50"
              >
                <span className="grid size-[30px] place-items-center rounded-md bg-fill" title={s.label}>
                  <Icon className={cn('size-4', s.tone)} aria-label={s.label} />
                </span>
                <div className="min-w-0">
                  <b className="block truncate text-[13.5px] font-semibold">{t.title}</b>
                  <span className="block text-[12.5px] text-muted-foreground">
                    {t.group} · {t.detail}
                    {t.dueAt && (
                      <>
                        {' · '}
                        <span className={cn(t.severity === 'overdue' && 'text-destructive')}>
                          Hạn {formatDateTime(t.dueAt)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                {to ? (
                  <Button asChild variant="outline" size="sm" aria-label={`Mở ${t.title}`}>
                    <Link to={to}>
                      Mở
                      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > SHOWN && (
        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? 'Thu gọn' : `Xem tất cả ${items.length} việc`}
          </Button>
        </div>
      )}
    </Panel>
  );
}
