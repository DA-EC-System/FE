import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInvalidateSettlement, useRunSettlement, useSettlementLines, useStatements } from '@/api/settlement.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';
import { SETTLEMENT_RUN } from '@/utils/env';
import type { DiscrepancyReason, SettlementLine, SettlementStatement } from '@/types/settlement';
import { useUrlFilters } from '@/features/sales/useUrlFilters';
import { labelOptions } from './shared';
import { DISCREPANCY_REASON_LABELS, LINE_KIND_LABELS, PAYMENT_STATUS_OPTIONS, paymentStatusOf, shopText } from './settlementShared';
import { LineOrder } from './SettlementDetailPage';
import { StatusBadge, useCanWrite, useCompanyId } from './parts';

const PAGE_SIZES = [25, 50, 100];
type Tab = 'statements' | 'discrepancies';

/**
 * Gian hàng cho bộ lọc lấy từ `shop` của các bảng kê (điểm chốt 8): BE chưa có `GET /channel/shops`.
 * Một trang 100 bảng kê mới nhất là đủ cho số gian hàng của một công ty; cùng trang đó cho mã bảng kê sàn của tab Chênh lệch.
 */
function useStatementIndex() {
  const query = useStatements({ page: 1, pageSize: 100 });
  return useMemo(() => {
    const shops = new Map<string, string>();
    const codes = new Map<string, string>();
    for (const s of query.data?.items ?? []) {
      if (!shops.has(s.shop.id)) shops.set(s.shop.id, shopText(s.shop));
      codes.set(s.id, s.externalStatementId);
    }
    return { shops: [...shops].map(([value, label]) => ({ value, label })), codes };
  }, [query.data]);
}

/** UC-PF-10 — Đối soát tiền sàn: bảng kê và các dòng chênh lệch (AC-S1, AC-S3, AC-S4) */
export function SettlementsPage() {
  const companyId = useCompanyId();
  const navigate = useNavigate();
  const canRun = useCanWrite() && SETTLEMENT_RUN;
  const f = useUrlFilters(PAGE_SIZES);
  const tab: Tab = f.params.get('tab') === 'discrepancies' ? 'discrepancies' : 'statements';
  const shopId = f.params.get('shopId') ?? '';
  const paymentStatus = f.params.get('paymentStatus') ?? '';
  const reason = (f.params.get('reason') ?? '') as DiscrepancyReason | '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  const { shops, codes } = useStatementIndex();
  const [running, setRunning] = useState(false);

  const common = { page: f.page, pageSize: f.pageSize, shopId: shopId || undefined, from: from || undefined, to: to || undefined };
  const statements = useStatements({ ...common, paymentStatus: paymentStatus || undefined }, tab === 'statements');
  const lines = useSettlementLines({ ...common, matchStatus: 'discrepancy' }, tab === 'discrepancies');
  const query = tab === 'statements' ? statements : lines;

  // Lý do chỉ lọc trên trang đang xem: API chưa có tham số này (điểm chốt 4)
  const discrepancies = useMemo(
    () => (lines.data?.items ?? []).filter((l) => !reason || l.discrepancyReason === reason),
    [lines.data, reason],
  );

  const statementColumns = useMemo<ColumnDef<SettlementStatement>[]>(
    () => [
      { id: 'external', header: 'Mã bảng kê sàn', meta: { className: 'w-44' }, cell: ({ row }) => <span className="font-medium">{row.original.externalStatementId}</span> },
      { id: 'shop', header: 'Gian hàng', meta: { className: 'min-w-40' }, cell: ({ row }) => shopText(row.original.shop) },
      { id: 'time', header: 'Thời điểm bảng kê', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.statementTime) },
      { id: 'amount', header: 'Sàn trả', meta: { className: 'w-32 text-right' }, cell: ({ row }) => <Money value={row.original.settlementAmount} /> },
      { id: 'status', header: 'Trạng thái trả', meta: { className: 'w-32' }, cell: ({ row }) => <StatusBadge status={paymentStatusOf(row.original.paymentStatus)} /> },
      { id: 'lines', header: 'Số dòng', meta: { className: 'w-20 text-right' }, cell: ({ row }) => row.original.lineCount },
      { id: 'matched', header: 'Khớp', meta: { className: 'w-20 text-right' }, cell: ({ row }) => row.original.matchedCount },
      {
        id: 'discrepancy',
        header: 'Chênh lệch',
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => (
          <span className={cn(row.original.discrepancyCount > 0 && 'font-semibold text-warning')} data-warn={row.original.discrepancyCount > 0 || undefined}>
            {row.original.discrepancyCount}
          </span>
        ),
      },
      { id: 'refund', header: 'Sàn đã hoàn', meta: { className: 'w-24 text-right' }, cell: ({ row }) => row.original.refundTaggedCount },
      { id: 'receipts', header: 'Phiếu thu đã sinh', meta: { className: 'w-36 text-right' }, cell: ({ row }) => <Money value={row.original.receiptTotal} /> },
    ],
    [],
  );

  const lineColumns = useMemo<ColumnDef<SettlementLine>[]>(
    () => [
      {
        id: 'statement',
        header: 'Bảng kê',
        meta: { className: 'w-28' },
        cell: ({ row }) => (
          <Link to={ROUTES.company.settlement(companyId, row.original.statementId)} className="text-primary hover:underline">
            {codes.get(row.original.statementId) ?? 'Xem bảng kê'}
          </Link>
        ),
      },
      { id: 'txn', header: 'Mã giao dịch sàn', meta: { className: 'w-40' }, cell: ({ row }) => row.original.externalTransactionId },
      { id: 'kind', header: 'Loại', meta: { className: 'w-24' }, cell: ({ row }) => LINE_KIND_LABELS[row.original.kind] },
      { id: 'order', header: 'Đơn hàng', meta: { className: 'min-w-40' }, cell: ({ row }) => <LineOrder line={row.original} /> },
      { id: 'revenue', header: 'Doanh thu', meta: { className: 'w-32 text-right' }, cell: ({ row }) => <Money value={row.original.revenue} /> },
      { id: 'settlement', header: 'Tiền về', meta: { className: 'w-32 text-right' }, cell: ({ row }) => <Money value={row.original.settlement} /> },
      {
        id: 'orderTotal',
        header: 'Tổng đơn',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => (row.original.orderTotal === null ? '—' : <Money value={row.original.orderTotal} />),
      },
      {
        id: 'reason',
        header: 'Lý do',
        meta: { className: 'w-40' },
        cell: ({ row }) => (row.original.discrepancyReason ? DISCREPANCY_REASON_LABELS[row.original.discrepancyReason] : '—'),
      },
    ],
    [companyId, codes],
  );

  const filtered = Boolean(shopId || paymentStatus || from || to);

  return (
    <div>
      <PageHeader
        title="Đối soát sàn"
        subtitle="Bảng kê tiền sàn trả và kết quả khớp với đơn."
        action={
          canRun && (
            <Button onClick={() => setRunning(true)}>
              <RefreshCw />
              Đối soát ngay
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => f.update({ tab: v === 'statements' ? undefined : v, page: undefined, paymentStatus: undefined, reason: undefined })}
      >
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="statements">Bảng kê</TabsTrigger>
            <TabsTrigger value="discrepancies">Chênh lệch</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <FilterSelect label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={shops} />
          {tab === 'statements' ? (
            <FilterSelect label="Trạng thái trả" value={paymentStatus} onChange={f.setFilter('paymentStatus')} options={PAYMENT_STATUS_OPTIONS} />
          ) : (
            <FilterSelect label="Lý do" value={reason} onChange={(v) => f.update({ reason: v || undefined })} options={labelOptions(DISCREPANCY_REASON_LABELS)} />
          )}
          <DateFilter label="Bảng kê từ ngày" value={from} onChange={f.setFilter('from')} max={to || undefined} />
          <DateFilter label="Bảng kê đến ngày" value={to} onChange={f.setFilter('to')} min={from || undefined} />
        </FilterBar>
        {tab === 'statements' ? (
          <DataTable
            columns={statementColumns}
            data={query.isError ? [] : (statements.data?.items ?? [])}
            getRowId={(r) => r.id}
            loading={statements.isLoading}
            fetching={statements.isFetching}
            onRowClick={(r) => navigate(ROUTES.company.settlement(companyId, r.id))}
            empty={filtered ? 'Không có bảng kê phù hợp' : 'Chưa có bảng kê'}
            pagination={{ page: f.page, pageSize: f.pageSize, total: statements.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
          />
        ) : (
          <DataTable
            columns={lineColumns}
            data={query.isError ? [] : discrepancies}
            getRowId={(r) => r.id}
            loading={lines.isLoading}
            fetching={lines.isFetching}
            empty="Không có chênh lệch"
            pagination={{ page: f.page, pageSize: f.pageSize, total: lines.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
          />
        )}
      </Card>
      {canRun && <RunSettlementDialog open={running} shops={shops} onClose={() => setRunning(false)} />}
    </div>
  );
}

// Select của Radix không nhận value rỗng
const ALL = '__all__';

/** Đối soát ngay: 202 là đã nhận, tải lại danh sách sau 5 giây (AC-S4) */
function RunSettlementDialog({
  open,
  shops,
  onClose,
}: {
  open: boolean;
  shops: { value: string; label: string }[];
  onClose: () => void;
}) {
  const run = useRunSettlement();
  const invalidate = useInvalidateSettlement();
  const form = useForm<{ shopId: string }>({ defaultValues: { shopId: ALL } });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.reset({ shopId: ALL });
      setError(null);
    }
  }, [open, form]);

  const submit = form.handleSubmit(async ({ shopId }) => {
    setError(null);
    try {
      await run.mutateAsync({ shopId: shopId === ALL ? undefined : shopId });
      toast.success('Đã bắt đầu đối soát, kết quả sẽ hiện khi chạy xong');
      setTimeout(invalidate, 5000);
      onClose();
    } catch (e) {
      const fieldError = getProblem(e)?.errors?.shopId;
      if (fieldError) form.setError('shopId', { message: fieldError });
      else setError(problemMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Đối soát ngay</DialogTitle>
          <DialogDescription>Kéo bảng kê mới từ sàn và khớp với đơn. Việc chạy nền, kết quả có sau ít phút.</DialogDescription>
        </DialogHeader>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <Form {...form}>
          <form id="run-settlement" onSubmit={submit} noValidate>
            <FormField
              control={form.control}
              name="shopId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gian hàng</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Gian hàng">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={ALL}>Mọi gian hàng</SelectItem>
                      {shops.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="run-settlement" disabled={run.isPending}>
            {run.isPending && <Loader2 className="animate-spin" />}
            Đối soát
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
