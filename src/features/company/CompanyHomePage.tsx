import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { MODULE_LABELS, isOptionalModule } from '@/utils/modules';
import { TaskList } from './TaskList';

/** Tổng quan của công ty: việc cần làm theo hạn, vai trò và phân hệ đang bật; số liệu kinh doanh làm sau. */
export function CompanyHomePage() {
  const { companyContext } = useAuth();
  if (!companyContext) return null;
  const optional = companyContext.enabledModules.filter(isOptionalModule);

  return (
    <>
      <PageHeader title={companyContext.companyName} subtitle="Tổng quan công ty" />
      <div className="grid gap-6">
        <TaskList companyId={companyContext.companyId} />
        <Card>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">Vai trò của bạn</h2>
              <div className="flex flex-wrap gap-2">
                {companyContext.roles.map((r) => (
                  <Badge key={r} variant="outline">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
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
