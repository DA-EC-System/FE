import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, TriangleAlert } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FilterSelect } from '@/components/common/FilterBar';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useExportReport,
  useReportDaily,
  useReportOverview,
  useReportShops,
  type DailyParams,
  type RangeParams,
} from '@/api/report.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissions';
import type { ReportFigures, ReportKind, ShopFigures } from '@/types/report';
import type { OrderSource } from '@/types/sales';
import {
  FIGURE_KEYS,
  FIGURE_LABELS,
  PRESET_LABELS,
  REPORT_SOURCE_LABELS,
  channelLabel,
  groupBySource,
  hasCost,
  margin,
  presetOf,
  presetRange,
  rangeSchema,
  sortByFigure,
  vnToday,
  type FigureKey,
  type RangeForm,
  type RangePreset,
  type SortDir,
} from './shared';

const PRESETS: RangePreset[] = ['7d', '30d', 'thisMonth', 'lastMonth', 'custom'];
const SOURCES = Object.keys(REPORT_SOURCE_LABELS) as OrderSource[];
const EXPORTS: { report: ReportKind; label: string }[] = [
  { report: 'overview', label: 'Tổng quan' },
  { report: 'shops', label: 'Lãi theo gian hàng' },
  { report: 'daily', label: 'Theo ngày' },
];
const COST_KEYS: FigureKey[] = ['cogs', 'profit'];

/** Cột số còn hiện: Giá vốn, Lãi ẩn khi dữ liệu là `null` (AC-B5) */
const figureKeys = (withCost: boolean) => FIGURE_KEYS.filter((k) => withCost || !COST_KEYS.includes(k));

const dayText = (day: string) => formatDate(day, 'DD/MM/YYYY');

/** UC-RP-01, UC-RP-02 — Báo cáo kinh doanh: thẻ số, biểu đồ theo ngày, lãi theo gian hàng, xuất CSV (AC-B1 đến AC-X2) */
export function ReportPage() {
  const companyId = useAuth().companyContext?.companyId ?? '';
  const can = useCan();
  const canOpenSettlements = useModuleEnabled('channel') && can(PERMISSIONS.financeView);
  const [params, setParams] = useSearchParams();
  const today = vnToday();

  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const sourceParam = params.get('source') as OrderSource | null;
  const source = sourceParam && SOURCES.includes(sourceParam) ? sourceParam : undefined;
  const shopId = source === 'inbox' || source === 'manual' ? undefined : (params.get('shopId') ?? undefined);

  const range: RangeParams = useMemo(() => ({ from, to }), [from, to]);
  // Gian hàng luôn đi với `source=marketplace` (§12.7)
  const dailyParams: DailyParams = useMemo(
    () => ({ ...range, source: shopId ? 'marketplace' : source, shopId }),
    [range, source, shopId],
  );

  const overview = useReportOverview(range);
  const shops = useReportShops(range);
  const daily = useReportDaily(dailyParams);
  const exporter = useExportReport();

  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );

  const preset = presetOf(from, to, today);
  const [customOpen, setCustomOpen] = useState(preset === 'custom');
  const activePreset: RangePreset = customOpen ? 'custom' : preset;

  const choosePreset = (p: RangePreset) => {
    if (p === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    const r = presetRange(p, today);
    update({ from: r.from, to: r.to });
  };

  // 422 của khoảng ngày hiện dưới ô, không hiện thành lỗi chung
  const rangeErrors = getProblem(overview.error)?.errors;
  const hasRangeError = Boolean(rangeErrors?.from || rangeErrors?.to);
  const pageError = [overview, shops].find((q) => q.isError)?.error;

  const runExport = (report: ReportKind) => {
    const p = report === 'daily' ? dailyParams : range;
    exporter.mutate(
      { report, ...p },
      {
        onSuccess: () => toast.success('Đã xuất báo cáo'),
        onError: (e) => toast.error(problemMessage(e)),
      },
    );
  };

  const data = overview.data;
  const rangeText = data ? `${dayText(data.from)} – ${dayText(data.to)}` : null;

  return (
    <div>
      <PageHeader
        title="Báo cáo kinh doanh"
        subtitle={rangeText ?? 'Doanh thu, chi phí và lãi theo khoảng ngày.'}
        action={
          can(PERMISSIONS.reportExport) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={exporter.isPending}>
                  {exporter.isPending ? <Loader2 className="animate-spin" aria-label="Đang xuất" /> : <Download />}
                  Xuất CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {EXPORTS.map((x) => (
                  <DropdownMenuItem key={x.report} onSelect={() => runExport(x.report)}>
                    {x.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Khoảng ngày">
        {PRESETS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={activePreset === p ? 'default' : 'outline'}
            aria-pressed={activePreset === p}
            onClick={() => choosePreset(p)}
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      {(customOpen || hasRangeError) && (
        <CustomRange
          today={today}
          from={from}
          to={to}
          serverErrors={rangeErrors}
          onApply={(v) => update({ from: v.from, to: v.to })}
        />
      )}

      {pageError && !hasRangeError ? (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(pageError)}
        </AlertMessage>
      ) : (
        !hasRangeError && (
          <>
            <Overview data={overview.data} loading={overview.isLoading} companyId={companyId} canOpenSettlements={canOpenSettlements} />
            <Card className="mb-6 gap-0">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <CardTitle>Theo ngày</CardTitle>
                <div className="flex flex-col gap-3 md:flex-row">
                  <FilterSelect
                    label="Nguồn"
                    value={source ?? ''}
                    onChange={(v) => update(v === 'inbox' || v === 'manual' ? { source: v, shopId: undefined } : { source: v })}
                    options={SOURCES.map((s) => ({ value: s, label: REPORT_SOURCE_LABELS[s] }))}
                  />
                  <FilterSelect
                    label="Gian hàng"
                    value={shopId ?? ''}
                    disabled={source === 'inbox' || source === 'manual'}
                    onChange={(v) => update({ shopId: v })}
                    options={shopOptions(shops.data?.items ?? [])}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {daily.isError ? (
                  <AlertMessage severity="error">{problemMessage(daily.error)}</AlertMessage>
                ) : daily.isLoading ? (
                  <Skeleton className="h-72 w-full" />
                ) : (
                  <DailyChart items={daily.data?.items ?? []} />
                )}
              </CardContent>
            </Card>
            <ShopTable data={shops.data} loading={shops.isLoading} />
          </>
        )
      )}
    </div>
  );
}

/** Ô Tuỳ chọn: zod kiểm trước, sai thì không gọi API; 422 của BE hiện dưới đúng ô (AC-B1) */
function CustomRange({
  today,
  from,
  to,
  serverErrors,
  onApply,
}: {
  today: string;
  from?: string;
  to?: string;
  serverErrors?: Record<string, string>;
  onApply: (v: RangeForm) => void;
}) {
  const form = useForm<RangeForm>({
    resolver: zodResolver(rangeSchema(today)),
    defaultValues: { from: from ?? '', to: to ?? '' },
  });

  useEffect(() => {
    if (serverErrors?.from) form.setError('from', { message: serverErrors.from });
    if (serverErrors?.to) form.setError('to', { message: serverErrors.to });
  }, [serverErrors, form]);

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onApply)}
        className="mb-4 flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-start"
      >
        {(['from', 'to'] as const).map((name) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem className="md:w-44">
                <FormLabel>{name === 'from' ? 'Từ ngày' : 'Đến ngày'}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <Button type="submit" className="md:mt-[22px]">
          Áp dụng
        </Button>
      </form>
    </Form>
  );
}

function Overview({
  data,
  loading,
  companyId,
  canOpenSettlements,
}: {
  data?: ReportFigures & { asOf: string | null };
  loading: boolean;
  companyId: string;
  canOpenSettlements: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FIGURE_KEYS.map((k) => (
          <Skeleton key={k} className="h-24" />
        ))}
      </div>
    );
  }
  return (
    <div className="mb-6 grid gap-3">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Tổng quan">
        {figureKeys(hasCost(data)).map((k) => (
          <Card key={k} className="gap-1 py-4" data-figure={k}>
            <CardContent className="px-4">
              <p className="text-sm text-muted-foreground">{FIGURE_LABELS[k]}</p>
              <Money value={data[k] ?? 0} className="text-xl font-semibold" />
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {data.asOf ? `Số liệu tính lúc ${formatDate(data.asOf, 'HH:mm DD/MM/YYYY')}` : 'Chưa có số liệu trong khoảng này'}
      </p>
      <p className="text-sm text-muted-foreground">
        Phí cổng thanh toán và chi phí vận chuyển của đơn tự giao chưa được thu thập, đang tính 0
      </p>
      {data.feesPending && (
        <AlertMessage severity="warning">
          Có đơn sàn chưa đối soát, phí sàn của những ngày đó đang tính 0 nên lãi có thể cao hơn thực tế.
          {canOpenSettlements && (
            <>
              {' '}
              <Link to={ROUTES.company.settlements(companyId)} className="font-medium underline">
                Xem đối soát sàn
              </Link>
            </>
          )}
        </AlertMessage>
      )}
    </div>
  );
}

/** Gian hàng cho bộ lọc lấy từ `/report/shops` (điểm chốt 8) */
function shopOptions(items: ShopFigures[]) {
  return items
    .filter((i) => i.source === 'marketplace' && i.shop)
    .map((i) => {
      const c = channelLabel(i);
      return { value: i.shop!.id, label: c.platform ? `${c.name} (${c.platform})` : c.name };
    });
}

const LINES = [
  { key: 'revenue', color: 'var(--chart-1)' },
  { key: 'cashCollected', color: 'var(--chart-3)' },
  { key: 'profit', color: 'var(--chart-4)' },
] as const;

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

/** Ba đường Doanh thu, Tiền đã thu, Lãi; đường Lãi ẩn khi không có giá vốn (AC-B3, AC-B5) */
function DailyChart({ items }: { items: (ReportFigures & { day: string })[] }) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Chưa có số liệu trong khoảng này</p>;
  }
  const withCost = hasCost(items[0]);
  const lines = LINES.filter((l) => withCost || l.key !== 'profit');
  return (
    <div className="h-72 w-full" data-testid="daily-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={items} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="day" tickFormatter={(d: string) => formatDate(d, 'DD/MM')} tick={{ fontSize: 12 }} minTickGap={16} />
          <YAxis tickFormatter={(v: number) => compact.format(v)} tick={{ fontSize: 12 }} width={56} />
          <ChartTooltip
            labelFormatter={(d) => dayText(String(d))}
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{ borderRadius: 8, fontSize: 13 }}
          />
          <Legend />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={FIGURE_LABELS[l.key]}
              stroke={l.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type SortKey = FigureKey | 'margin';

/** Lãi theo gian hàng: sắp theo cột số, gộp theo nguồn, dòng Tổng của BE (AC-B4) */
function ShopTable({ data, loading }: { data?: { items: ShopFigures[]; total: ReportFigures }; loading: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'revenue', dir: 'desc' });
  const [grouped, setGrouped] = useState(false);
  const withCost = hasCost(data?.total);
  const keys: SortKey[] = [...figureKeys(withCost), ...(withCost ? (['margin'] as const) : [])];

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return sortByFigure(grouped ? groupBySource(items) : items, sort.key, sort.dir);
  }, [data, grouped, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const cells = (f: ReportFigures) =>
    keys.map((k) => (
      <TableCell key={k} className="text-right">
        {k === 'margin' ? (
          <span className={cn('tabular-nums', f.profit !== null && f.profit < 0 && 'text-destructive')}>
            {margin(f.profit, f.revenue)}
          </span>
        ) : (
          <Money value={f[k] ?? 0} />
        )}
      </TableCell>
    ));

  return (
    <Card className="gap-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lãi theo gian hàng</CardTitle>
        <div className="flex items-center gap-2">
          <Switch id="group-source" checked={grouped} onCheckedChange={setGrouped} />
          <Label htmlFor="group-source">Gộp theo nguồn</Label>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table aria-label="Lãi theo gian hàng">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">Kênh</TableHead>
                {keys.map((k) => {
                  const active = sort.key === k;
                  const Icon = active ? (sort.dir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
                  return (
                    <TableHead
                      key={k}
                      className="text-right"
                      aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggle(k)}
                      >
                        {k === 'margin' ? 'Biên lãi' : FIGURE_LABELS[k]}
                        <Icon className={cn('size-3.5', !active && 'opacity-40')} />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={keys.length + 1} className="py-8 text-center text-muted-foreground">
                    Chưa có số liệu trong khoảng này
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const c = channelLabel(r);
                  return (
                    <TableRow key={`${r.source}-${r.shop?.id ?? ''}`}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{c.name}</span>
                          {c.platform && <span className="text-xs text-muted-foreground">{c.platform}</span>}
                          {r.feesPending && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <TriangleAlert className="size-4 text-warning" aria-label="Phí sàn chưa đối soát" tabIndex={0} />
                              </TooltipTrigger>
                              <TooltipContent>Phí sàn chưa đối soát</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      {cells(r)}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {data && (
              <TableFooter>
                <TableRow>
                  <TableCell>Tổng</TableCell>
                  {cells(data.total)}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
