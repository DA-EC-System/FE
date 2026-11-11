import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Kpi, KpiStrip } from '@/components/common/KpiStrip';
import { Panel } from '@/components/common/Panel';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformOverview } from '@/api/platform.api';
import { getErrorMessage } from '@/api/client';
import { MODULE_LABELS } from '@/utils/modules';
import { formatDateTime } from '@/utils/format';
import { AUDIT_ACTION_LABELS } from './auditLabels';

/** Tổng quan nền tảng: chỉ số liệu về công ty, không có số liệu kinh doanh (QT-03); dáng Test_UI v4 (FE#134) */
export function PlatformOverviewPage() {
  const { data, error, isError, isLoading } = usePlatformOverview();
  const total = data?.totalCompanies ?? 0;

  return (
    <>
      <PageHeader title="Tổng quan nền tảng" subtitle="Tình hình các công ty dùng Commerio" />
      {isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(error)}
        </AlertMessage>
      )}

      <KpiStrip label="Chỉ số nền tảng" className="mb-4">
        <Kpi label="Tổng số công ty" value={data?.totalCompanies} loading={isLoading} />
        <Kpi
          label="Đang hoạt động"
          value={data?.activeCompanies}
          loading={isLoading}
          detail={data && total ? `${Math.round((data.activeCompanies / total) * 100)}% số công ty` : undefined}
        />
        <Kpi
          label="Đang bị khoá"
          help="Công ty bị quản trị nền tảng khoá; người dùng của công ty đó không đăng nhập được."
          value={data?.lockedCompanies}
          loading={isLoading}
        />
        <Kpi label="Đăng ký trong 30 ngày" value={data?.registeredLast30Days} loading={isLoading} />
      </KpiStrip>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Phân hệ tuỳ chọn đang dùng">
          <div className="grid gap-3">
            {data?.optionalModuleUsage.map(({ module, companies }) => {
              const pct = total ? (companies / total) * 100 : 0;
              return (
                <div key={module} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{MODULE_LABELS[module]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {companies}/{total} công ty
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
          </div>
        </Panel>

        <Panel title="Hoạt động gần đây" flush>
          {data ? (
            <ul className="divide-y">
              {data.recentActivities.map((log) => {
                const action = AUDIT_ACTION_LABELS[log.action];
                return (
                  <li key={log.id} className="grid gap-0.5 px-4 py-2.5">
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
            <div className="p-4">
              <Skeleton className="h-32" />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
