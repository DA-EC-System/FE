import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { HandCoins } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCodOrders, useConfirmCod, useTabCounts } from '@/api/finance.api';
import { getProblem, type ProblemDetails } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { CodConflictOrder, CodOrder, CodStatus } from '@/types/finance';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { COD_STATUS, MAX_COD_BATCH, codSelection, numberRange } from './shared';
import { DocLink, OrderCode, useCanWrite, useCompanyId } from './parts';

const PAGE_SIZES = [25, 50, 100];
const TABS: CodStatus[] = ['cod_pending', 'cod_collected', 'not_collected'];

/** Đơn chọn được phải có đơn hàng (BE luôn trả, nhưng `order` có thể null theo hợp đồng) */
const keyOf = (o: CodOrder) => o.order?.id ?? '';

/** Đơn còn `cod_pending` mà bị từ chối là đơn chưa giao (AC-K3) */
const conflictLabel = (o: CodConflictOrder) => (o.status === 'cod_pending' ? 'Chưa giao' : 'Đã thay đổi');

/** UC-PF-04 — Thu COD: đơn đã giao chờ thu, xác nhận đã nhận tiền theo lô (AC-K1 đến AC-K3) */
export function CodPage() {
  const companyId = useCompanyId();
  const canWrite = useCanWrite();
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('status') as CodStatus | null;
  const tab = tabParam && TABS.includes(tabParam) ? tabParam : 'cod_pending';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';

  const query = useCodOrders({
    status: tab,
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const counts = useTabCounts('cod-orders', TABS);
  const confirm = useConfirmCod();

  const [selected, setSelected] = useState<Map<string, CodOrder>>(new Map());
  /** Đơn bị 409 theo id đơn; có thể đã rời tab nên cũng liệt kê trong thông báo */
  const [changed, setChanged] = useState<Map<string, CodConflictOrder>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const selectable = tab === 'cod_pending' && canWrite;
  const sum = codSelection([...selected.values()].map((o) => o.amount));
  const filtered = Boolean(f.q || from || to);

  const toggle = (o: CodOrder, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(keyOf(o), o);
      else next.delete(keyOf(o));
      return next;
    });
  const pageRows = items.filter((o) => o.order);
  const allOnPage = pageRows.length > 0 && pageRows.every((o) => selected.has(keyOf(o)));
  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const o of pageRows) {
        if (on) next.set(keyOf(o), o);
        else next.delete(keyOf(o));
      }
      return next;
    });

  const submit = async () => {
    setNotice(null);
    setChanged(new Map());
    const count = selected.size;
    try {
      const result = await confirm.mutateAsync([...selected.keys()]);
      const numbers = result.receipts.map((r) => r.receipt.number);
      toast.success(`Đã xác nhận ${count} đơn COD, lập phiếu thu ${numberRange(numbers)}`);
      setSelected(new Map());
    } catch (e) {
      const problem = getProblem(e) as (ProblemDetails & { orders?: CodConflictOrder[] }) | undefined;
      if (problem?.code === 'payment_state_changed' && problem.orders) {
        const orders = problem.orders;
        setChanged(new Map(orders.map((o) => [o.orderId, o])));
        setNotice('Có đơn vừa thay đổi, chưa xác nhận đơn nào');
        // Bỏ chọn đơn đã đổi, giữ các đơn còn lại để xác nhận lại
        setSelected((prev) => {
          const next = new Map(prev);
          for (const o of orders) next.delete(o.orderId);
          return next;
        });
      } else {
        setNotice(problemMessage(e));
      }
    } finally {
      setConfirmOpen(false);
    }
  };

  const columns = useMemo<ColumnDef<CodOrder>[]>(() => {
    const cols: ColumnDef<CodOrder>[] = [
      {
        id: 'code',
        header: 'Mã đơn',
        meta: { className: 'w-36' },
        cell: ({ row }) => {
          const conflict = changed.get(keyOf(row.original));
          return (
            <div className="flex flex-wrap items-center gap-1">
              <OrderCode order={row.original.order} />
              {conflict && <Badge variant="destructive">{conflictLabel(conflict)}</Badge>}
            </div>
          );
        },
      },
      { id: 'customer', header: 'Khách', cell: ({ row }) => row.original.order?.customerName ?? '—' },
      { id: 'phone', header: 'SĐT', meta: { className: 'w-32' }, cell: ({ row }) => row.original.order?.customerPhone ?? '—' },
      { id: 'amount', header: 'Số tiền', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.amount) },
      { id: 'deliveredAt', header: 'Ngày giao', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.deliveredAt) },
      {
        id: 'receipt',
        header: 'Phiếu thu',
        meta: { className: 'w-32' },
        cell: ({ row }) => {
          const r = row.original.receipt;
          return r ? <DocLink to={ROUTES.company.receipt(companyId, r.id)}>{r.number}</DocLink> : '—';
        },
      },
    ];
    if (selectable) {
      cols.unshift({
        id: 'select',
        meta: { className: 'w-10' },
        header: () => <Checkbox aria-label="Chọn cả trang" checked={allOnPage} onCheckedChange={(v) => toggleAll(v === true)} />,
        cell: ({ row }) =>
          row.original.order && (
            <Checkbox
              aria-label={`Chọn ${row.original.order.code}`}
              checked={selected.has(keyOf(row.original))}
              onCheckedChange={(v) => toggle(row.original, v === true)}
            />
          ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectable, selected, changed, allOnPage, companyId, items]);

  return (
    <div>
      <PageHeader
        title="Thu COD"
        subtitle="Đơn COD đã giao, chờ xác nhận đã nhận tiền từ đơn vị vận chuyển."
        action={
          selectable ? (
            <div className="grid justify-items-end gap-1">
              <Button disabled={sum.count === 0 || sum.tooMany} onClick={() => setConfirmOpen(true)}>
                <HandCoins />
                Xác nhận đã nhận tiền{sum.count > 0 ? ` (${sum.count})` : ''}
              </Button>
              {sum.tooMany && <span className="text-xs text-destructive">Tối đa {MAX_COD_BATCH} đơn mỗi lần</span>}
              {sum.count > 0 && !sum.tooMany && (
                <span className="text-xs text-muted-foreground" data-testid="cod-total">
                  Tổng {formatCurrency(sum.total)}
                </span>
              )}
            </div>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setSelected(new Map());
          setChanged(new Map());
          setNotice(null);
          f.update({ status: v === 'cod_pending' ? undefined : v, page: undefined });
        }}
      >
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {COD_STATUS[t].label}
                {counts[t] !== undefined && (
                  <Badge variant="secondary" className="ms-1">
                    {counts[t]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {notice && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
          {changed.size > 0 && (
            <ul className="mt-1 list-disc ps-5" data-testid="cod-changed">
              {[...changed.values()].map((o) => (
                <li key={o.orderId}>
                  {o.code}: {conflictLabel(o)}
                </li>
              ))}
            </ul>
          )}
        </AlertMessage>
      )}
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã đơn, tên khách, SĐT" />
          <DateFilter label="Giao từ ngày" value={from} onChange={f.setFilter('from')} max={to || undefined} />
          <DateFilter label="Giao đến ngày" value={to} onChange={f.setFilter('to')} min={from || undefined} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={items}
          getRowId={(r) => keyOf(r)}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không có đơn COD phù hợp' : 'Chưa có đơn COD'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận đã nhận tiền COD"
        message={`Xác nhận đã nhận ${formatCurrency(sum.total)} của ${sum.count} đơn COD? Mỗi đơn sinh một phiếu thu.`}
        confirmLabel="Xác nhận"
        loading={confirm.isPending}
        onConfirm={submit}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
