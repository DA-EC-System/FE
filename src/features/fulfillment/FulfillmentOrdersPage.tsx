import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Boxes } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type FulfillmentTab,
  useCreateBatch,
  useFulfillmentCounts,
  useFulfillmentOrders,
} from '@/api/fulfillment.api';
import { useShops } from '@/api/shops.api';
import { getProblem, type ProblemDetails } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { FulfillmentOrder } from '@/types/fulfillment';
import type { OrderSource } from '@/types/sales';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS, SOURCE_LABELS, sourceLabel } from '@/features/sales/shared';
import { useUrlFilters } from '@/features/sales/useUrlFilters';
import { IssueOrderButton } from './IssueOrderButton';

const PAGE_SIZES = [25, 50, 100];
const MAX_BATCH_ORDERS = 50;
const TABS: { value: FulfillmentTab; label: string }[] = [
  { value: 'confirmed', label: 'Chờ nhặt' },
  { value: 'picking', label: 'Đang nhặt' },
  { value: 'packing', label: 'Đóng gói' },
  { value: 'issued', label: 'Đã xuất' },
];
const BATCH_CONFLICTS = ['already_in_batch', 'invalid_transition', 'version_conflict'];

/** UC-SF-07, 08 — Đơn chờ nhặt, đang nhặt, đóng gói, đã xuất; tạo lô và xuất kho (AC-B1 đến AC-B3, AC-X1) */
export function FulfillmentOrdersPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canViewShops = useCan()(PERMISSIONS.shopView);
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('status') as FulfillmentTab | null;
  const tab = TABS.some((t) => t.value === tabParam) ? (tabParam as FulfillmentTab) : 'confirmed';
  const source = (f.params.get('source') ?? '') as OrderSource | '';
  const shopId = f.params.get('shopId') ?? '';

  const query = useFulfillmentOrders({
    status: tab,
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    source: source || undefined,
    shopId: shopId || undefined,
  });
  const counts = useFulfillmentCounts(TABS.map((t) => t.value));
  // Kho không có quyền xem gian hàng nên chỉ lọc theo nguồn
  const shops = useShops({ pageSize: 100 }, { enabled: canViewShops });
  const createBatch = useCreateBatch();

  const [selected, setSelected] = useState<Map<string, FulfillmentOrder>>(new Map());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const filtered = Boolean(f.q || source || shopId);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const picking = tab === 'confirmed';
  const tooMany = selected.size > MAX_BATCH_ORDERS;

  const resetSelection = () => {
    setSelected(new Map());
    setFailedIds(new Set());
    setNotice(null);
  };

  const toggle = (o: FulfillmentOrder, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(o.id, o);
      else next.delete(o.id);
      return next;
    });

  const allOnPage = items.length > 0 && items.every((o) => selected.has(o.id));
  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const o of items) {
        if (on) next.set(o.id, o);
        else next.delete(o.id);
      }
      return next;
    });

  const submitBatch = async () => {
    setNotice(null);
    setFailedIds(new Set());
    try {
      const batch = await createBatch.mutateAsync([...selected.values()].map((o) => ({ id: o.id, version: o.version })));
      toast.success(`Đã tạo lô ${batch.code}`);
      setSelected(new Map());
      navigate(ROUTES.company.batch(companyId, batch.id));
    } catch (e) {
      const problem = getProblem(e) as (ProblemDetails & { orderIds?: string[]; orderId?: string }) | undefined;
      if (problem?.code && BATCH_CONFLICTS.includes(problem.code)) {
        const ids = problem.orderIds ?? (problem.orderId ? [problem.orderId] : []);
        setFailedIds(new Set(ids));
        setNotice('Có đơn vừa thay đổi, chưa tạo lô');
        // Bỏ chọn đơn lỗi, giữ các đơn còn lại để tạo lại
        setSelected((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      } else {
        setNotice(problemMessage(e));
      }
    } finally {
      setConfirmOpen(false);
    }
  };

  const columns = useMemo<ColumnDef<FulfillmentOrder>[]>(() => {
    const cols: ColumnDef<FulfillmentOrder>[] = [
      {
        id: 'code',
        header: 'Mã đơn',
        meta: { className: 'w-32' },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium">{row.original.code}</span>
            {failedIds.has(row.original.id) && <Badge variant="destructive">Đã thay đổi</Badge>}
          </div>
        ),
      },
      { id: 'source', header: 'Nguồn', meta: { className: 'w-40' }, cell: ({ row }) => sourceLabel(row.original) },
      { id: 'customer', header: 'Khách', meta: { className: 'min-w-36' }, cell: ({ row }) => row.original.customerName ?? '—' },
      { id: 'lineCount', header: 'Số dòng', meta: { className: 'w-20 text-right' }, cell: ({ row }) => row.original.lineCount },
      { id: 'totalQty', header: 'Số lượng', meta: { className: 'w-24 text-right' }, cell: ({ row }) => row.original.totalQty },
      {
        id: 'payment',
        header: 'Thanh toán',
        meta: { className: 'w-40' },
        cell: ({ row }) => {
          const o = row.original;
          if (!o.paymentMethod) return 'Sàn thu hộ';
          const s = o.paymentStatus ? PAYMENT_STATUS[o.paymentStatus] : null;
          return (
            <div className="grid gap-1">
              <span>{PAYMENT_METHOD_LABELS[o.paymentMethod]}</span>
              {s && (
                <span>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'confirmedAt',
        header: 'Ngày xác nhận',
        meta: { className: 'w-40' },
        cell: ({ row }) => (row.original.confirmedAt ? formatDateTime(row.original.confirmedAt) : '—'),
      },
      {
        id: 'batch',
        header: 'Lô',
        meta: { className: 'w-28' },
        cell: ({ row }) => {
          const b = row.original.batch;
          if (!b) return '—';
          return (
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={(e) => {
                e.stopPropagation();
                navigate(ROUTES.company.batch(companyId, b.id));
              }}
            >
              {b.code}
            </Button>
          );
        },
      },
    ];
    if (picking) {
      cols.unshift({
        id: 'select',
        meta: { className: 'w-10' },
        header: () => (
          <Checkbox aria-label="Chọn cả trang" checked={allOnPage} onCheckedChange={(v) => toggleAll(v === true)} />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Chọn ${row.original.code}`}
            checked={selected.has(row.original.id)}
            onCheckedChange={(v) => toggle(row.original, v === true)}
          />
        ),
      });
    }
    if (tab === 'packing') {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-36 text-right' },
        cell: ({ row }) => <IssueOrderButton order={row.original} />,
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, picking, selected, failedIds, allOnPage, companyId, items]);

  return (
    <div>
      <PageHeader
        title="Xử lý đơn"
        subtitle="Gom đơn đã xác nhận thành lô nhặt, đóng gói rồi xuất kho."
        action={
          picking ? (
            <Button disabled={selected.size === 0 || tooMany} onClick={() => setConfirmOpen(true)}>
              <Boxes />
              Tạo lô nhặt{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          resetSelection();
          f.update({ status: v === 'confirmed' ? undefined : v, page: undefined });
        }}
      >
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {counts[t.value] !== undefined && (
                  <Badge variant="secondary" className="ms-1">
                    {counts[t.value]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {tooMany && (
        <AlertMessage severity="warning" className="mb-4">
          Mỗi lô tối đa {MAX_BATCH_ORDERS} đơn
        </AlertMessage>
      )}
      {notice && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </AlertMessage>
      )}
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã đơn, tên khách" />
          <FilterSelect
            label="Nguồn"
            value={source}
            onChange={(v) => f.update({ source: v, shopId: v === 'marketplace' ? shopId : undefined, page: undefined })}
            options={(Object.keys(SOURCE_LABELS) as OrderSource[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
          {canViewShops && (
            <FilterSelect
              label="Gian hàng"
              value={shopId}
              onChange={f.setFilter('shopId')}
              options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }))}
            />
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={items}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không tìm thấy đơn phù hợp' : 'Không có đơn nào'}
          pagination={{
            page: f.page,
            pageSize: f.pageSize,
            total: query.data?.total ?? 0,
            pageSizes: PAGE_SIZES,
            onChange: f.onPageChange,
          }}
        />
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Tạo lô nhặt"
        message={`Gom ${selected.size} đơn vào một lô nhặt mới. Các đơn sẽ chuyển sang Đang nhặt.`}
        confirmLabel="Tạo lô"
        loading={createBatch.isPending}
        onConfirm={submitBatch}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
