import type { ReactNode } from 'react';
import { Building2, CircleCheck, Lock, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformOverview } from '@/api/platform.api';
import { getErrorMessage } from '@/api/client';
import { MODULE_LABELS } from '@/utils/modules';
import { formatDateTime } from '@/utils/format';
import { AUDIT_ACTION_LABELS } from './auditLabels';

function StatCard({ label, value, icon }: { label: string; value?: number; icon: ReactNode }) {
  return (
    <Card className="py-5">
      <CardContent className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {value === undefined ? (
            <Skeleton className="mt-1 h-7 w-10" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Tổng quan nền tảng: chỉ số liệu về công ty, không có số liệu kinh doanh (QT-03). */
export function PlatformOverviewPage() {
  const { data, error, isError } = usePlatformOverview();

  return (
    <>
      <PageHeader title="Tổng quan nền tảng" subtitle="Tình hình các công ty dùng Commerio" />
      {isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(error)}
        </AlertMessage>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng số công ty" value={data?.totalCompanies} icon={<Building2 />} />
        <StatCard label="Đang hoạt động" value={data?.activeCompanies} icon={<CircleCheck />} />
        <StatCard label="Đang bị khoá" value={data?.lockedCompanies} icon={<Lock />} />
        <StatCard label="Đăng ký trong 30 ngày" value={data?.registeredLast30Days} icon={<Sparkles />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phân hệ tuỳ chọn đang dùng</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data?.optionalModuleUsage.map(({ module, companies }) => {
              const pct = data.totalCompanies ? (companies / data.totalCompanies) * 100 : 0;
              return (
                <div key={module} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{MODULE_LABELS[module]}</span>
                    <span className="text-muted-foreground">
                      {companies}/{data.totalCompanies} công ty
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={MODULE_LABELS[module]}
                    aria-valuenow={Math.round(pct)}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) ?? <Skeleton className="h-32" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hoạt động gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            {data ? (
              <ul className="grid gap-3">
                {data.recentActivities.map((log) => {
                  const action = AUDIT_ACTION_LABELS[log.action];
                  return (
                    <li key={log.id} className="grid gap-0.5">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant={action.variant}>{action.label}</Badge>
                        <span>{log.targetCompanyName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)} · {log.actorEmail}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Skeleton className="h-32" />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
