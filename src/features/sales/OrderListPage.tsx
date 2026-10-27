import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrders } from '@/api/sales.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { OrderSource, OrderStatus, OrderSummary, PaymentMethod } from '@/types/sales';
import { ORDER_STATUS, PAYMENT_METHOD_LABELS, SOURCE_LABELS, sourceLabel } from './shared';
import { useUrlFilters } from '@/hooks/useUrlFilters';

const PAGE_SIZES = [25, 50, 100];
const ALL = 'all';
const STATUS_TABS: OrderStatus[] = [
  'pending_confirmation',
  'confirmed',
  'picking',
  'packing',
  'issued',
  'in_transit',
  'delivered',
  'delivery_failed',
  'cancelled',
];

/** UC-SF-04 — Đơn hàng từ mọi nguồn; tab mặc định là đơn chờ xác nhận */
export function OrderListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canCreate = useCan()(PERMISSIONS.orderCreate);
  const f = useUrlFilters(PAGE_SIZES);
  const statusParam = f.params.get('status');
  const status = statusParam === ALL ? '' : ((statusParam as OrderStatus | null) ?? 'pending_confirmation');
  const source = (f.params.get('source') ?? '') as OrderSource | '';
  const paymentMethod = (f.params.get('paymentMethod') ?? '') as PaymentMethod | '';
  const shortStock = f.params.get('shortStock') === 'true';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';

  const query = useOrders({
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    status: status || undefined,
    source: source || undefined,
    paymentMethod: paymentMethod || undefined,
    shortStock: shortStock || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const filtered = Boolean(f.q || source || paymentMethod || shortStock || from || to);

  const columns = useMemo<ColumnDef<OrderSummary>[]>(
    () => [
      {
        id: 'code',
        header: 'Mã đơn',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.code}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</p>
          </div>
        ),
      },
      {
        id: 'customer',
        header: 'Khách',
        meta: { className: 'min-w-40' },
        cell: ({ row }) =>
          row.original.customer ? (
            <div>
              <p>{row.original.customer.name}</p>
              <p className="text-xs text-muted-foreground">{row.original.customer.phone}</p>
            </div>
          ) : (
            '—'
          ),
      },
      { id: 'source', header: 'Nguồn', meta: { className: 'w-40' }, cell: ({ row }) => sourceLabel(row.original) },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-44' },
        cell: ({ row }) => {
          const s = ORDER_STATUS[row.original.status];
          return (
            <div className="flex flex-wrap gap-1">
              <Badge variant={s.variant}>{s.label}</Badge>
              {row.original.isShortStock && <Badge variant="destructive">Thiếu hàng</Badge>}
            </div>
          );
        },
      },
      {
        id: 'paymentMethod',
        header: 'Thanh toán',
        meta: { className: 'w-36' },
        cell: ({ row }) => (row.original.paymentMethod ? PAYMENT_METHOD_LABELS[row.original.paymentMethod] : 'Sàn thu hộ'),
      },
      {
        id: 'total',
        header: 'Tổng',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => formatCurrency(row.original.total),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Đơn hàng"
        subtitle="Đơn từ sàn, hộp thư và đơn tạo tay."
        // AC-R3: không có quyền tạo đơn thì không thấy nút
        actionLabel={canCreate ? 'Tạo đơn' : undefined}
        actionIcon={<Plus />}
        onAction={() => navigate(ROUTES.company.orderNew(companyId))}
      />
      <Tabs value={status || ALL} onValueChange={(v) => f.update({ status: v, page: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {ORDER_STATUS[s].label}
              </TabsTrigger>
            ))}
            <TabsTrigger value={ALL}>Tất cả</TabsTrigger>
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
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã đơn, tên, số điện thoại" />
          <FilterSelect
            label="Nguồn"
            value={source}
            onChange={f.setFilter('source')}
            options={(Object.keys(SOURCE_LABELS) as OrderSource[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
          <FilterSelect
            label="Thanh toán"
            value={paymentMethod}
            onChange={f.setFilter('paymentMethod')}
            options={(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => ({
              value: m,
              label: PAYMENT_METHOD_LABELS[m],
            }))}
          />
          <DateFilter label="Từ ngày" value={from} max={to || undefined} onChange={f.setFilter('from')} />
          <DateFilter label="Đến ngày" value={to} min={from || undefined} onChange={f.setFilter('to')} />
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id="short-stock"
              checked={shortStock}
              onCheckedChange={(v) => f.setFilter('shortStock')(v === true ? 'true' : '')}
            />
            <Label htmlFor="short-stock">Chỉ đơn thiếu hàng</Label>
          </div>
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không tìm thấy đơn phù hợp' : 'Chưa có đơn nào'}
          onRowClick={(r) => navigate(ROUTES.company.order(companyId, r.id))}
          pagination={{
            page: f.page,
            pageSize: f.pageSize,
            total: query.data?.total ?? 0,
            pageSizes: PAGE_SIZES,
            onChange: f.onPageChange,
          }}
        />
      </Card>
    </div>
  );
}
