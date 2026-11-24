import { PaymentStatusBadge } from '@/features/finance/PaymentStatusBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrderTabCounts, useOrders } from '@/api/sales.api';
import { usePageGuide } from '@/guides/usePageGuide';
import { useShops, useSyncShop } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { OrderFlag, OrderSource, OrderStage as Stage, OrderStatus, OrderSummary, PaymentMethod } from '@/types/sales';
import {
  FILTERABLE_ORDER_FLAGS,
  ORDER_FLAGS,
  ORDER_STAGE,
  ORDER_STATUS,
  PAYMENT_METHOD_LABELS,
  SOURCE_LABELS,
  isOverdue,
  paymentMethodLabel,
  sourceLabel,
} from './shared';
import { OrderStage } from './OrderStage';
import { LineThumb } from './LineThumb';
import { CopyButton } from '@/components/common/CopyButton';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { stagesFor } from '@/lib/machines/order';
import { shopDisplayName } from '@/features/channel/shopList';

const PAGE_SIZES = [25, 50, 100];
const ALL = 'all';
const STATUS_TABS: OrderStatus[] = ['unpaid', 'processing', 'completed', 'cancelled'];
const COUNT_TABS = ['all', ...STATUS_TABS] as const;

/** Đơn hàng từ mọi nguồn: tab theo 4 trạng thái (sơ đồ D1), lọc theo giai đoạn suy từ kiện và cờ */
export function OrderListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const f = useUrlFilters(PAGE_SIZES);
  const statusParam = f.params.get('status');
  const status = STATUS_TABS.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : '';
  const source = (f.params.get('source') ?? '') as OrderSource | '';
  const paymentMethod = (f.params.get('paymentMethod') ?? '') as PaymentMethod | '';
  // Giai đoạn chọn được theo tab và Nguồn (FE#288); giai đoạn trên URL không còn hợp thì bỏ, không lọc ra bảng rỗng
  const stageOptions = stagesFor(status, source);
  const stageParam = (f.params.get('stage') ?? '') as Stage | '';
  const stage = stageParam && stageOptions.includes(stageParam) ? stageParam : '';
  const flag = (f.params.get('flag') ?? '') as OrderFlag | '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  // Link "Xem đơn của gian hàng" từ hộp thoại ngắt gian hàng (§18.6.1) mở trang với ?shopId=
  const shopId = f.params.get('shopId') ?? '';
  const shopsQuery = useShops({ enabled: can(PERMISSIONS.shopView) });
  const canSync = can(PERMISSIONS.shopView) && can(PERMISSIONS.shopSync);
  const syncMut = useSyncShop();
  const [syncing, setSyncing] = useState(false);
  // Khoá bấm đúp (FE#247): lần bấm thứ hai tới trước khi React vẽ nút khoá thì không chạy gì
  const syncingRef = useRef(false);
  // Bảng toàn màn hình: phủ cả cửa sổ, Esc để thoát
  const [full, setFull] = useState(false);

  const listFilters = {
    search: f.q || undefined,
    source: source || undefined,
    shopId: shopId || undefined,
    paymentMethod: paymentMethod || undefined,
    stage: stage || undefined,
    flag: flag || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const query = useOrders({ page: f.page, pageSize: f.pageSize, status: status || undefined, ...listFilters });
  // Số trên tab theo bộ lọc đang chọn, giống chip đếm của Test_UI (FE#138)
  const counts = useOrderTabCounts(listFilters, COUNT_TABS);
  const { startTour } = usePageGuide('orders', { ready: !query.isLoading });
  const countText = (n: number | undefined) => (n === undefined ? '' : n.toLocaleString('vi-VN'));
  const filtered = Boolean(f.q || source || shopId || paymentMethod || stage || flag || from || to);

  useEffect(() => {
    if (stageParam && !stage) f.update({ stage: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageParam, stage]);

  const columns = useMemo<ColumnDef<OrderSummary>[]>(
    () => [
      {
        id: 'code',
        header: 'Mã đơn',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-mono font-medium">{row.original.code}</p>
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
        header: 'Người mua',
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
      { id: 'source', header: 'Kênh bán', meta: { className: 'w-40' }, cell: ({ row }) => sourceLabel(row.original) },
      {
        id: 'shipBy',
        header: 'Hạn bàn giao',
        meta: { className: 'w-36' },
        cell: ({ row }) => {
          const o = row.original;
          if (!o.shipBy) return '—';
          return isOverdue(o) ? (
            <span className="font-medium text-destructive" title="Đã trễ hạn bàn giao">
              {formatDateTime(o.shipBy)}
            </span>
          ) : o.flags.includes('due_soon') ? (
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
        id: 'settlement', header: 'Đối soát', cell: ({ row }) => <PaymentStatusBadge status={row.original.paymentStatus} />,
      },
      {
        id: 'paymentMethod',
        header: 'Thanh toán',
        meta: { className: 'w-36' },
        cell: ({ row }) => paymentMethodLabel(row.original),
      },
      {
        id: 'total',
        header: 'Tổng tiền',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => formatCurrency(row.original.total),
      },
    ],
    [],
  );

  const shopOptions = useMemo(() => {
    const options = (shopsQuery.data?.items ?? []).map((s) => ({ value: s.id, label: shopDisplayName(s) }));
    // Không xem được danh sách gian hàng (thiếu quyền) vẫn hiện gian hàng đang lọc để xoá được
    if (shopId && !options.some((o) => o.value === shopId)) {
      const shop = query.data?.items.find((o) => o.shop?.id === shopId)?.shop;
      options.push({ value: shopId, label: shop ? shopDisplayName(shop) : 'Gian hàng đang lọc' });
    }
    return options;
  }, [shopsQuery.data, query.data, shopId]);

  // Đồng bộ đơn: kéo đơn ngay của gian hàng đang lọc, không lọc thì mọi gian hàng đang hoạt động
  const syncTargets = (shopsQuery.data?.items ?? []).filter((s) => s.status === 'active' && (!shopId || s.id === shopId));
  const syncOrders = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    let results: PromiseSettledResult<Awaited<ReturnType<typeof syncMut.mutateAsync>>>[];
    try {
      results = await Promise.allSettled(syncTargets.map((s) => syncMut.mutateAsync(s.id)));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
    let created = 0;
    let updated = 0;
    const failed: { name: string; error: unknown }[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        created += r.value.created;
        updated += r.value.updated;
      } else failed.push({ name: shopDisplayName(syncTargets[i]), error: r.reason });
    });
    const ok = results.length - failed.length;
    if (ok > 0) toast.success(`Đã đồng bộ ${ok} gian hàng: ${created} đơn mới, ${updated} đơn cập nhật`);
    if (failed.length === 1) toast.error(`${failed[0].name}: ${problemMessage(failed[0].error)}`);
    else if (failed.length > 1) toast.error(`Không đồng bộ được ${failed.map((x) => x.name).join(', ')}`);
  };
  const syncReason = syncing
    ? 'Đang đồng bộ...'
    : shopsQuery.isLoading
      ? 'Đang tải danh sách gian hàng...'
      : syncTargets.length === 0
        ? 'Chưa có gian hàng nào đang kết nối'
        : undefined;

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc đang đóng ô chọn của bộ lọc thì không thoát toàn màn hình
      if (e.key === 'Escape' && !document.querySelector('[role="listbox"]')) setFull(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [full]);

  return (
    <div>
      <PageHeader
        title="Đơn hàng"
        subtitle="Đơn từ mọi gian hàng của công ty trên các sàn."
        help="Số trên mỗi tab đếm theo bộ lọc đang chọn. Cột Trạng thái cho biết đơn đang ở bước nào (đơn nhiều kiện thì lấy kiện chậm nhất); rê chuột vào nhãn để xem giải thích."
        onTour={startTour}
        action={
          canSync ? (
            <Button variant="outline" onClick={() => void syncOrders()} disabled={Boolean(syncReason)} title={syncReason}>
              <RefreshCw className={cn(syncing && 'animate-spin')} />
              {shopId ? 'Đồng bộ đơn gian hàng này' : 'Đồng bộ đơn'}
            </Button>
          ) : undefined
        }
      />
      <Tabs value={status || ALL} onValueChange={(v) => f.update({ status: v === ALL ? undefined : v, page: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList data-guide="order-tabs">
            <TabsTrigger value={ALL}>
              Tất cả
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{countText(counts.all)}</span>
            </TabsTrigger>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {ORDER_STATUS[s].label}
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{countText(counts[s])}</span>
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
      <Card
        className={cn('gap-0 py-0', full && 'fixed inset-0 z-40 overflow-auto rounded-none border-0')}
        data-guide="order-list"
        data-fullscreen={full || undefined}
      >
        <FilterBar guide="order-filters">
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã đơn, mã đơn sàn" />
          <FilterSelect
            label="Kênh bán"
            value={source}
            onChange={f.setFilter('source')}
            options={(Object.keys(SOURCE_LABELS) as OrderSource[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
          {(shopId || shopOptions.length > 0) && (
            <FilterSelect loading={shopsQuery.isLoading} label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={shopOptions} />
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
          {stageOptions.length > 0 && (
            <FilterSelect
              label="Trạng thái chi tiết"
              value={stage}
              onChange={f.setFilter('stage')}
              options={stageOptions.map((s) => ({ value: s, label: ORDER_STAGE[s].label }))}
            />
          )}
          <FilterSelect
            label="Cảnh báo"
            value={flag}
            onChange={f.setFilter('flag')}
            options={FILTERABLE_ORDER_FLAGS.map((x) => ({ value: x, label: ORDER_FLAGS[x].label }))}
          />
          <Button
            variant="outline"
            size="icon"
            className="md:ms-auto"
            aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            title={full ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình'}
            aria-pressed={full}
            onClick={() => setFull((v) => !v)}
          >
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
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
