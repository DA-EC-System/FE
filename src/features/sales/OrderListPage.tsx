import { PaymentStatusBadge } from '@/features/finance/PaymentStatusBadge';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrders } from '@/api/sales.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { OrderFlag, OrderSource, OrderStage as Stage, OrderStatus, OrderSummary, PaymentMethod } from '@/types/sales';
import {
  ORDER_FLAGS,
  ORDER_STAGE,
  ORDER_STATUS,
  PAYMENT_METHOD_LABELS,
  SOURCE_LABELS,
  paymentMethodLabel,
  sourceLabel,
} from './shared';
import { OrderStage } from './OrderStage';
import { LineThumb } from './LineThumb';
import { CopyButton } from '@/components/common/CopyButton';
import { useUrlFilters } from '@/hooks/useUrlFilters';

const PAGE_SIZES = [25, 50, 100];
const ALL = 'all';
const STATUS_TABS: OrderStatus[] = ['unpaid', 'processing', 'completed', 'cancelled'];
const DAY_MS = 24 * 3600_000;

/** Hạn gửi còn dưới 24 giờ (hoặc đã quá) với đơn chưa xong thì tô cảnh báo */
const shipByUrgent = (o: OrderSummary, now: number) =>
  Boolean(o.shipBy) && (o.status === 'unpaid' || o.status === 'processing') && Date.parse(o.shipBy!) - now < DAY_MS;

/** Đơn hàng từ mọi nguồn: tab theo 4 trạng thái (sơ đồ D1), lọc theo giai đoạn suy từ kiện và cờ */
export function OrderListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canCreate = can(PERMISSIONS.orderCreate);
  const f = useUrlFilters(PAGE_SIZES);
  const statusParam = f.params.get('status');
  const status = STATUS_TABS.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : '';
  const source = (f.params.get('source') ?? '') as OrderSource | '';
  const paymentMethod = (f.params.get('paymentMethod') ?? '') as PaymentMethod | '';
  const stage = (f.params.get('stage') ?? '') as Stage | '';
  const flag = (f.params.get('flag') ?? '') as OrderFlag | '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  // Link "Xem đơn của gian hàng" từ hộp thoại ngắt gian hàng (§18.6.1) mở trang với ?shopId=
  const shopId = f.params.get('shopId') ?? '';
  const shopsQuery = useShops({ enabled: can(PERMISSIONS.shopView) });

  const query = useOrders({
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    status: status || undefined,
    source: source || undefined,
    shopId: shopId || undefined,
    paymentMethod: paymentMethod || undefined,
    stage: stage || undefined,
    flag: flag || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const filtered = Boolean(f.q || source || shopId || paymentMethod || stage || flag || from || to);

  const columns = useMemo<ColumnDef<OrderSummary>[]>(
    () => [
      {
        id: 'code',
        header: 'Mã đơn',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.code}</p>
            {row.original.externalOrderId && (
              // Bấm chép mã đơn sàn không mở chi tiết đơn
              <div className="flex items-center gap-0.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                <span className="font-mono">{row.original.externalOrderId}</span>
                <CopyButton value={row.original.externalOrderId} label={`Sao chép mã đơn sàn ${row.original.externalOrderId}`} />
              </div>
            )}
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
          ) : row.original.recipientName ? (
            <div>
              <p>{row.original.recipientName}</p>
              <p className="text-xs text-muted-foreground">người nhận</p>
            </div>
          ) : (
            '—'
          ),
      },
      {
        id: 'items',
        header: 'Sản phẩm',
        meta: { className: 'min-w-64' },
        cell: ({ row }) => {
          const p = row.original.itemsPreview;
          if (!p) return '—';
          const more = row.original.lineCount - 1;
          return (
            <div className="flex items-center gap-2">
              <LineThumb src={p.thumbnailUrl} alt={p.productName} />
              <div className="min-w-0">
                <p className="line-clamp-1" title={p.productName}>
                  {p.productName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.attributesLabel && `${p.attributesLabel} `}× {p.quantity}
                  {more > 0 && ` · và ${more} món khác`}
                </p>
              </div>
            </div>
          );
        },
      },
      { id: 'source', header: 'Nguồn', meta: { className: 'w-40' }, cell: ({ row }) => sourceLabel(row.original) },
      {
        id: 'shipBy',
        header: 'Hạn gửi',
        meta: { className: 'w-36' },
        cell: ({ row }) => {
          const o = row.original;
          if (!o.shipBy) return '—';
          return shipByUrgent(o, Date.now()) ? (
            <span className="font-medium text-warning">{formatDateTime(o.shipBy)}</span>
          ) : (
            formatDateTime(o.shipBy)
          );
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-56' },
        cell: ({ row }) => <OrderStage order={row.original} />,
      },
      {
        id: 'settlement', header: 'Trạng thái tiền', cell: ({ row }) => <PaymentStatusBadge status={row.original.paymentStatus} />,
      },
      {
        id: 'paymentMethod',
        header: 'Thanh toán',
        meta: { className: 'w-36' },
        cell: ({ row }) => paymentMethodLabel(row.original.paymentMethod),
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

  const shopOptions = useMemo(() => {
    const options = (shopsQuery.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }));
    // Không xem được danh sách gian hàng (thiếu quyền) vẫn hiện gian hàng đang lọc để xoá được
    if (shopId && !options.some((o) => o.value === shopId)) {
      const shop = query.data?.items.find((o) => o.shop?.id === shopId)?.shop;
      options.push({ value: shopId, label: shop?.shopName ?? 'Gian hàng đang lọc' });
    }
    return options;
  }, [shopsQuery.data, query.data, shopId]);

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
      <Tabs value={status || ALL} onValueChange={(v) => f.update({ status: v === ALL ? undefined : v, page: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            <TabsTrigger value={ALL}>Tất cả</TabsTrigger>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {ORDER_STATUS[s].label}
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
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã đơn, mã đơn sàn, tên, số điện thoại" />
          <FilterSelect
            label="Nguồn"
            value={source}
            onChange={f.setFilter('source')}
            options={(Object.keys(SOURCE_LABELS) as OrderSource[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
          {(shopId || shopOptions.length > 0) && (
            <FilterSelect label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={shopOptions} />
          )}
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
          <FilterSelect
            label="Giai đoạn"
            value={stage}
            onChange={f.setFilter('stage')}
            options={(Object.keys(ORDER_STAGE) as Stage[]).map((s) => ({ value: s, label: ORDER_STAGE[s].label }))}
          />
          <FilterSelect
            label="Cờ"
            value={flag}
            onChange={f.setFilter('flag')}
            options={(Object.keys(ORDER_FLAGS) as OrderFlag[]).map((x) => ({ value: x, label: ORDER_FLAGS[x].label }))}
          />
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
