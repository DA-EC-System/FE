import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Kpi, KpiStrip } from '@/components/common/KpiStrip';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportDaily, useReportOverview } from '@/api/report.api';
import { problemMessage } from '@/api/problemMessages';
import { useTasks } from '@/api/tasks.api';
import { usePageGuide } from '@/guides/usePageGuide';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import { margin, vnToday } from '@/features/report/shared';
import { changePercent, compactMoney, signedPercent } from '@/utils/kpi';
import { MODULE_LABELS, isOptionalModule } from '@/utils/modules';
import { PERMISSIONS } from '@/utils/permissions';
import { RevenueChart } from './RevenueChart';
import { TaskList } from './TaskList';

const CHART_DAYS = [7, 14, 30] as const;
type ChartDays = (typeof CHART_DAYS)[number];

const day = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

/** Khoảng `days` ngày tới hôm nay và khoảng cùng độ dài ngay trước đó */
function ranges(today: string, days: number) {
  const t = dayjs(today);
  return {
    current: { from: day(t.subtract(days - 1, 'day')), to: today },
    previous: { from: day(t.subtract(days * 2 - 1, 'day')), to: day(t.subtract(days, 'day')) },
  };
}

const weekday = (d: string) => {
  const text = dayjs(d).toDate().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Tổng quan công ty theo `v-tong-quan` của Test_UI v4 (FE#134): dải chỉ số, việc cần làm, doanh thu theo ngày,
 * vai trò và phân hệ. Số kinh doanh chỉ hiện khi có quyền báo cáo (D18); ai cũng thấy chỉ số việc cần làm.
 */
export function CompanyHomePage() {
  const { companyContext } = useAuth();
  const can = useCan();
  const reportOn = useModuleEnabled('report');
  const canReport = reportOn && can(PERMISSIONS.reportView) && can(PERMISSIONS.financeView);
  const tasks = useTasks();
  const { startTour } = usePageGuide('company-home', { ready: !tasks.isPending });

  const today = vnToday();
  const week = useMemo(() => ranges(today, 7), [today]);
  const [chartDays, setChartDays] = useState<ChartDays>(14);
  const chartRange = useMemo(() => ranges(today, chartDays).current, [today, chartDays]);

  const overview = useReportOverview(week.current, canReport);
  const previous = useReportOverview(week.previous, canReport);
  const daily = useReportDaily(chartRange, canReport);

  if (!companyContext) return null;
  const optional = companyContext.enabledModules.filter(isOptionalModule);
  const items = tasks.data ?? [];
  const overdue = items.filter((t) => t.severity === 'overdue').length;
  const dueSoon = items.filter((t) => t.severity === 'due_soon').length;

  const revenue = overview.data?.revenue ?? 0;
  const profit = overview.data?.profit ?? null;
  const change = previous.data ? changePercent(revenue, previous.data.revenue) : null;
  const spark = daily.data?.items.slice(-7).map((d) => d.revenue);
  const money = compactMoney(revenue);
  const profitMoney = profit === null ? null : compactMoney(profit);
  const reportLink = ROUTES.company.reports(companyContext.companyId);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        subtitle={`${companyContext.companyName} · ${weekday(today)}`}
        help="Số liệu chính, việc cần làm của bạn trong mọi phân hệ, vai trò và phân hệ công ty đang bật."
        onTour={startTour}
      />
      <div className="grid gap-4">
        <div data-guide="home-kpis">
          <KpiStrip label="Chỉ số chính">
            {canReport && (
              <Kpi
                data-kpi="revenue"
                label="Doanh thu 7 ngày"
                help="Tổng tiền hàng của đơn đã giao xong trong 7 ngày gần nhất, tính cả hôm nay. So với 7 ngày liền trước."
                loading={overview.isLoading}
                value={money.value}
                unit={money.unit}
                spark={spark}
                detail={
                  change === null ? (
                    'Chưa có số 7 ngày trước để so'
                  ) : (
                    <>
                      <span className={cn(change > 0 && 'text-success-text', change < 0 && 'text-destructive')}>
                        {signedPercent(change)}
                      </span>{' '}
                      so với 7 ngày trước
                    </>
                  )
                }
              />
            )}
            {canReport && profitMoney && (
              <Kpi
                data-kpi="profit"
                label="Lãi 7 ngày"
                help="Doanh thu trừ phí sàn, phí cổng, phí vận chuyển và giá vốn. Phí sàn của ngày chưa đối soát đang tính 0."
                value={<span className={cn(profit! < 0 && 'text-destructive')}>{profitMoney.value}</span>}
                unit={profitMoney.unit}
                detail={`Biên lãi ${margin(profit, revenue)}`}
              />
            )}
            <Kpi
              data-kpi="overdue"
              label="Việc quá hạn"
              help="Việc đã quá hạn xử lý trong các phân hệ bạn có quyền."
              loading={tasks.isLoading}
              value={<span className={cn(overdue > 0 && 'text-destructive')}>{overdue}</span>}
              detail={overdue > 0 ? 'Xử lý trước các việc khác' : 'Không có việc trễ hạn'}
            />
            <Kpi
              data-kpi="due-soon"
              label="Việc sắp tới hạn"
              help="Việc còn dưới 24 giờ tới hạn, như kiện phải giao cho sàn hay phiếu chờ duyệt."
              loading={tasks.isLoading}
              value={dueSoon}
              detail={`Trong ${items.length} việc cần làm`}
            />
          </KpiStrip>
        </div>
        {canReport && overview.isError && (
          <AlertMessage severity="error">{problemMessage(overview.error)}</AlertMessage>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-4">
            <div data-guide="home-tasks">
              <TaskList companyId={companyContext.companyId} />
            </div>
            {canReport && (
              <Panel
                title="Doanh thu theo ngày"
                extra={
                  <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Số ngày">
                    {CHART_DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={chartDays === d}
                        onClick={() => setChartDays(d)}
                        className={cn(
                          'h-7 rounded-[5px] px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground',
                          chartDays === d && 'bg-accent font-medium text-accent-foreground',
                        )}
                      >
                        {d} ngày
                      </button>
                    ))}
                  </div>
                }
              >
                {daily.isLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : daily.isError ? (
                  <AlertMessage severity="error">{problemMessage(daily.error)}</AlertMessage>
                ) : (
                  <RevenueChart items={daily.data?.items ?? []} />
                )}
                {reportLink && (
                  <Link to={reportLink} className="mt-3 inline-block text-sm text-primary hover:underline">
                    Xem báo cáo kinh doanh
                  </Link>
                )}
              </Panel>
            )}
          </div>

          <Panel title="Bạn và công ty">
            <dl className="grid gap-4 text-sm">
              <div className="grid gap-2" data-guide="home-roles">
                <dt className="text-muted-foreground">Vai trò của bạn</dt>
                <dd className="flex flex-wrap gap-2">
                  {companyContext.roles.map((r) => (
                    <Badge key={r} variant="outline">
                      {r}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div className="grid gap-2" data-guide="home-modules">
                <dt className="text-muted-foreground">Phân hệ tuỳ chọn đang bật</dt>
                <dd>
                  {optional.length === 0 ? (
                    'Chưa bật phân hệ tuỳ chọn nào.'
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {optional.map((m) => (
                        <Badge key={m} variant="secondary">
                          {MODULE_LABELS[m]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
