import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useTasks } from '@/api/tasks.api';
import { usePageGuide } from '@/guides/usePageGuide';
import { useAuth } from '@/hooks/useAuth';
import { MODULE_LABELS, isOptionalModule } from '@/utils/modules';
import { TaskList } from './TaskList';

/** Tổng quan của công ty: việc cần làm theo hạn, vai trò và phân hệ đang bật; số liệu kinh doanh làm sau. */
export function CompanyHomePage() {
  const { companyContext } = useAuth();
  const tasks = useTasks();
  const { startTour } = usePageGuide('company-home', { ready: !tasks.isPending });
  if (!companyContext) return null;
  const optional = companyContext.enabledModules.filter(isOptionalModule);

  return (
    <>
      <PageHeader
        title={companyContext.companyName}
        subtitle="Tổng quan công ty"
        help="Việc cần làm của bạn trong mọi phân hệ, vai trò và phân hệ công ty đang bật."
        onTour={startTour}
      />
      <div className="grid gap-6">
        <div data-guide="home-tasks">
          <TaskList companyId={companyContext.companyId} />
        </div>
        <Card>
          <CardContent className="grid gap-5">
            <div className="grid gap-2" data-guide="home-roles">
              <h2 className="text-sm font-medium text-muted-foreground">Vai trò của bạn</h2>
              <div className="flex flex-wrap gap-2">
                {companyContext.roles.map((r) => (
                  <Badge key={r} variant="outline">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-2" data-guide="home-modules">
              <h2 className="text-sm font-medium text-muted-foreground">Phân hệ tuỳ chọn đang bật</h2>
              {optional.length === 0 ? (
                <p className="text-sm">Chưa bật phân hệ tuỳ chọn nào.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {optional.map((m) => (
                    <Badge key={m} variant="secondary">
                      {MODULE_LABELS[m]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
