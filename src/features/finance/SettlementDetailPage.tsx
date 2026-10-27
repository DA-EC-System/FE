import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { Money } from '@/components/common/Money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettlementLines, useStatement } from '@/api/settlement.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';
import type { MatchStatus, SettlementLine, SettlementStatement } from '@/types/settlement';
import { Info } from '@/features/sales/Info';
import { useUrlFilters } from '@/features/sales/useUrlFilters';
import {
  DISCREPANCY_REASON_LABELS,
  FEE_KEYS,
  FEE_LABELS,
  LINE_KIND_LABELS,
  MATCH_STATUS,
  formulaCheck,
  paymentStatusOf,
  shopText,
} from './settlementShared';
import { DocLink, OrderCode, StatusBadge, useCompanyId } from './parts';

const PAGE_SIZES = [25, 50, 100];
const MATCH_TABS: MatchStatus[] = ['matched', 'discrepancy', 'refund_tagged'];

/** Ô Đơn hàng của dòng đối soát: mã đơn kèm khách, mã đơn sàn lạ, hoặc "—" với dòng không phải đơn (AC-S2) */
export function LineOrder({ line }: { line: SettlementLine }) {
  if (line.order) {
    return (
      <div className="grid">
        <OrderCode order={line.order} />
        {line.order.customerName && <span className="text-xs text-muted-foreground">{line.order.customerName}</span>}
      </div>
    );
  }
  if (line.kind === 'order' && line.externalOrderId) {
    return (
      <div className="grid">
        <span>{line.externalOrderId}</span>
        <span className="text-xs text-muted-foreground">Không có trong hệ thống</span>
      </div>
    );
  }
  return <>—</>;
}

/** UC-PF-10 — Chi tiết bảng kê và các dòng đối soát (AC-S2) */
export function SettlementDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const query = useStatement(id);
  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={() => navigate(ROUTES.company.settlements(companyId))}>
      <ArrowLeft />
      Đối soát sàn
    </Button>
  );

  if (query.isError) {
    const notFound = getProblem(query.error)?.status === 404;
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : 'Không tải được bảng kê'} />
        <AlertMessage severity="error">
          {notFound
            ? 'Không tìm thấy bảng kê. Bảng kê không tồn tại hoặc không thuộc công ty này.'
            : problemMessage(query.error)}
        </AlertMessage>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  return (
    <div>
      {back}
      <StatementHeader statement={query.data} />
      <LinesTable statementId={query.data.id} />
    </div>
  );
}

function StatementHeader({ statement: s }: { statement: SettlementStatement }) {
  return (
    <>
      <PageHeader title={`Bảng kê ${s.externalStatementId}`} subtitle={shopText(s.shop)} />
      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Info label="Gian hàng">{shopText(s.shop)}</Info>
          <Info label="Mã bảng kê sàn">{s.externalStatementId}</Info>
          <Info label="Thời điểm bảng kê">{formatDateTime(s.statementTime)}</Info>
          <Info label="Trạng thái trả">
            <StatusBadge status={paymentStatusOf(s.paymentStatus)} />
          </Info>
          <Info label="Sàn trả">
            <Money value={s.settlementAmount} className="font-semibold" />
          </Info>
          <Info label="Phiếu thu đã sinh">
            <Money value={s.receiptTotal} />
          </Info>
          <Info label="Số dòng">{s.lineCount}</Info>
          <Info label="Kết quả khớp">
            <div className="flex flex-wrap gap-1">
              <Badge variant="success">Khớp {s.matchedCount}</Badge>
              <Badge variant="warning">Chênh lệch {s.discrepancyCount}</Badge>
              <Badge variant="info">Sàn đã hoàn {s.refundTaggedCount}</Badge>
            </div>
          </Info>
        </CardContent>
      </Card>
    </>
  );
}

function LinesTable({ statementId }: { statementId: string }) {
  const companyId = useCompanyId();
  const f = useUrlFilters(PAGE_SIZES);
  const matchParam = f.params.get('match') as MatchStatus | null;
  const match = matchParam && MATCH_TABS.includes(matchParam) ? matchParam : undefined;
  // `?line=` tô sáng một dòng, dành cho link từ phiếu thu khi BE cho biết dòng thuộc bảng kê nào (điểm chốt 2)
  const highlight = f.params.get('line');
  const query = useSettlementLines({ statementId, matchStatus: match, page: f.page, pageSize: f.pageSize });
  const [open, setOpen] = useState<Set<string>>(() => new Set(highlight ? [highlight] : []));

  useEffect(() => {
    if (!highlight || !query.data) return;
    document.querySelector(`[data-row-id="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'center' });
  }, [highlight, query.data]);

  const toggle = (lineId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

  const columns = useMemo<ColumnDef<SettlementLine>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        meta: { className: 'w-10' },
        cell: ({ row }) => {
          const isOpen = open.has(row.original.id);
          return (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
              aria-expanded={isOpen}
              onClick={() => toggle(row.original.id)}
            >
              {isOpen ? <ChevronDown /> : <ChevronRight />}
            </Button>
          );
        },
      },
      { id: 'txn', header: 'Mã giao dịch sàn', meta: { className: 'w-40' }, cell: ({ row }) => row.original.externalTransactionId },
      { id: 'kind', header: 'Loại', meta: { className: 'w-24' }, cell: ({ row }) => LINE_KIND_LABELS[row.original.kind] },
      { id: 'order', header: 'Đơn hàng', meta: { className: 'min-w-40' }, cell: ({ row }) => <LineOrder line={row.original} /> },
      { id: 'revenue', header: 'Doanh thu', meta: { className: 'w-28 text-right' }, cell: ({ row }) => <Money value={row.original.revenue} /> },
      { id: 'fee', header: 'Phí', meta: { className: 'w-28 text-right' }, cell: ({ row }) => <Money value={row.original.feeTotal} /> },
      { id: 'shipping', header: 'Vận chuyển', meta: { className: 'w-28 text-right' }, cell: ({ row }) => <Money value={row.original.shippingCost} /> },
      { id: 'adjustment', header: 'Điều chỉnh', meta: { className: 'w-28 text-right' }, cell: ({ row }) => <Money value={row.original.adjustment} /> },
      { id: 'settlement', header: 'Tiền về', meta: { className: 'w-28 text-right' }, cell: ({ row }) => <Money value={row.original.settlement} className="font-medium" /> },
      {
        id: 'orderTotal',
        header: 'Tổng đơn',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => (row.original.orderTotal === null ? '—' : <Money value={row.original.orderTotal} />),
      },
      {
        id: 'result',
        header: 'Kết quả',
        meta: { className: 'w-40' },
        cell: ({ row }) => (
          <div className="grid justify-items-start gap-0.5">
            <StatusBadge status={MATCH_STATUS[row.original.matchStatus]} />
            {row.original.discrepancyReason && (
              <span className="text-xs text-muted-foreground">{DISCREPANCY_REASON_LABELS[row.original.discrepancyReason]}</span>
            )}
          </div>
        ),
      },
      {
        id: 'receipt',
        header: 'Phiếu thu',
        meta: { className: 'w-32' },
        cell: ({ row }) => {
          const l = row.original;
          if (l.receipt) return <DocLink to={ROUTES.company.receipt(companyId, l.receipt.id)}>{l.receipt.number}</DocLink>;
          if (l.receiptPending) return <span className="text-muted-foreground">Chờ sàn trả</span>;
          return '—';
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, companyId],
  );

  return (
    <>
      <Tabs value={match ?? 'all'} onValueChange={(v) => f.update({ match: v === 'all' ? undefined : v, page: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="all">Tất cả</TabsTrigger>
            {MATCH_TABS.map((m) => (
              <TabsTrigger key={m} value={m}>
                {MATCH_STATUS[m].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={query.isError ? [] : (query.data?.items ?? [])}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={match ? 'Không có dòng phù hợp' : 'Chưa có dòng đối soát'}
          renderExpanded={(l) => (open.has(l.id) ? <LineBreakdown line={l} /> : null)}
          rowClassName={(l) => (l.id === highlight ? 'bg-primary/10' : undefined)}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
    </>
  );
}

/** Bảy ô phí và phép kiểm `Doanh thu − Phí − Vận chuyển + Điều chỉnh = Tiền về` (AC-S2) */
function LineBreakdown({ line }: { line: SettlementLine }) {
  const check = formulaCheck(line);
  return (
    <div className="grid gap-3 py-1" data-testid="line-breakdown">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {FEE_KEYS.map((k) => (
          <Info key={k} label={FEE_LABELS[k]}>
            <Money value={line.fees[k]} />
            {line.fees[k] < 0 && <span className="ms-1 text-xs text-muted-foreground">sàn hoàn</span>}
          </Info>
        ))}
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">Doanh thu − Phí − Vận chuyển + Điều chỉnh: </span>
        <span className={cn('tabular-nums', !check.holds && 'font-semibold text-destructive')}>{check.text}</span>
        <span className="text-muted-foreground"> so với Tiền về </span>
        <Money value={line.settlement} className={cn(!check.holds && 'font-semibold text-destructive')} />
        {check.gap && <span className="ms-2 font-semibold text-destructive">{check.gap}</span>}
      </p>
      {check.revenueGap && <p className="text-sm text-warning">{check.revenueGap}</p>}
    </div>
  );
}
