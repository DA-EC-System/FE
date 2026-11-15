import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { Money } from '@/components/common/Money';
import { FlagChips } from '@/components/common/FlagChips';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLedger, useOrderProfits, useSkuProfits, useTaxWarnings } from '@/api/ledger.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatDate } from '@/utils/format';
import { LEDGER_KIND_LABELS, formatMargin, formatMilestone, isReplaced } from '@/utils/ledger';
import type { LedgerFilter, LedgerKind, LedgerLine, LedgerTotals, OrderProfitRow, ProfitTotals, SkuProfitRow } from '@/types/finance';
import { LedgerStateBadge, ProfitFlags, ProfitStateBadge } from './ledgerShared';
import { PAYMENT_FLAGS, todayVn } from './lifecycleShared';

const PAGE_SIZES = [25, 50, 100];
type Tab = 'lines' | 'orders' | 'skus';

const FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'Mọi dòng' },
  { value: 'estimated', label: 'Ước tính' },
  { value: 'actual', label: 'Thực tế' },
  { value: 'replaced', label: 'Đã thay' },
];

const KPIS: { key: keyof LedgerTotals; label: string; hint: string }[] = [
  { key: 'receivable', label: 'Phải thu sàn', hint: 'Ước tính, chờ sàn quyết toán' },
  { key: 'platformBalance', label: 'Số dư shop trên sàn', hint: 'Đã quyết toán, trừ tiền đã rút' },
  { key: 'withdrawn', label: 'Đã rút về ngân hàng', hint: 'Tổng các lần rút' },
  { key: 'committedPurchase', label: 'Tiền sẽ ra', hint: 'Đề nghị nhập đã duyệt chưa nhận đủ' },
];

const REGIMES = { company: 'doanh nghiệp', household: 'hộ kinh doanh', individual: 'cá nhân' } as const;

/** Cảnh báo doanh thu luỹ kế năm chạm mốc; app không khai thuế */
function TaxWarnings() {
  const query = useTaxWarnings();
  const data = query.data;
  if (!data?.items.length) return null;
  return (
    <div className="mb-4 grid gap-2" data-testid="tax-warnings">
      {data.items.map((w) => (
        <AlertMessage key={w.milestone} severity={w.over ? 'error' : 'warning'}>
          Doanh thu luỹ kế năm nay {w.over ? 'đã vượt' : 'sắp vượt'} mốc {formatMilestone(w.milestone)}: <Money value={w.ytdRevenue} />
          {data.regime ? ` (loại hình ${REGIMES[data.regime]})` : ''}. App không khai thuế, chỉ cảnh báo để kế toán chuẩn bị.
        </AlertMessage>
      ))}
    </div>
  );
}

function Kpis({ totals }: { totals: LedgerTotals | undefined }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((k) => {
        const value = totals?.[k.key];
        return (
          <Card key={k.key} className="gap-1 py-4" data-testid={`kpi-${k.key}`}>
            <CardContent className="grid gap-1">
              <span className="text-sm text-muted-foreground">{k.label}</span>
              {!totals ? (
                <Skeleton className="h-7 w-32" />
              ) : value == null ? (
                // BE trả null khi chưa tính số này (committedPurchase chưa làm): không hiện 0 ₫ cho khỏi hiểu nhầm
                <span className="text-xl font-semibold text-muted-foreground">Chưa tính</span>
              ) : (
                <Money value={value} className="text-xl font-semibold" />
              )}
              <span className="text-xs text-muted-foreground">{k.hint}</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Tổng trên toàn bộ kết quả lọc (BE tính), không chỉ trang đang xem */
function ProfitTotalsBar({ totals, note }: { totals: ProfitTotals | undefined; note?: string }) {
  if (!totals) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-4 py-2 text-sm" data-testid="profit-totals">
      <span className="text-muted-foreground">Tổng kỳ</span>
      <span>
        Thực nhận <Money value={totals.net} className="font-semibold" />
      </span>
      {totals.cogs !== null && (
        <span>
          Giá vốn <Money value={totals.cogs} className="font-semibold" />
        </span>
      )}
      {totals.gross !== null && (
        <span>
          Lãi gộp <Money value={totals.gross} className="font-semibold" />
        </span>
      )}
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

function CheckFilter({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 self-end pb-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

/** Đầu tháng hiện tại theo giờ Việt Nam */
const monthStart = () => `${todayVn().slice(0, 8)}01`;

/** Sổ tiền (sơ đồ D4.1, Documents/21 §21.1): dòng sổ chỉ thêm, ước tính bị thay khi sàn quyết toán; lãi theo đơn và theo SKU */
export function LedgerPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('tab');
  const tab: Tab = tabParam === 'orders' || tabParam === 'skus' ? tabParam : 'lines';
  const filterParam = f.params.get('filter') as LedgerFilter | null;
  const filter: LedgerFilter = FILTERS.some((x) => x.value === filterParam) ? filterParam! : 'all';
  const kind = (f.params.get('kind') ?? '') as LedgerKind | '';
  const shopId = f.params.get('shopId') ?? '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  const orderId = f.params.get('orderId') ?? '';
  const costMissing = f.params.get('costMissing') === 'true';
  const belowFloor = f.params.get('belowFloor') === 'true';
  // Lãi theo đơn, theo SKU bắt buộc có kỳ: mặc định từ đầu tháng tới hôm nay
  const period = { from: from || monthStart(), to: to || todayVn() };

  const shops = useShops({ enabled: can(P.shopView) });
  const shopName = (id: string | null) => (id ? (shops.data?.items.find((s) => s.id === id)?.shopName ?? 'Gian hàng') : null);
  const ledger = useLedger({
    filter,
    kind: kind || undefined,
    shopId: shopId || undefined,
    orderId: orderId || undefined,
    from: from || undefined,
    to: to || undefined,
    page: tab === 'lines' ? f.page : 1,
    pageSize: f.pageSize,
  });
  const orderProfits = useOrderProfits(
    { ...period, shopId: shopId || undefined, costMissing, belowFloor, page: f.page, pageSize: f.pageSize },
    tab === 'orders',
  );
  const skuProfits = useSkuProfits({ ...period, shopId: shopId || undefined, page: f.page, pageSize: f.pageSize }, tab === 'skus');

  const lineColumns = useMemo<ColumnDef<LedgerLine>[]>(
    () => [
      { id: 'on', header: 'Ngày', meta: { className: 'w-28' }, cell: ({ row }) => formatDate(row.original.occurredOn) },
      { id: 'kind', header: 'Khoản', meta: { className: 'w-40' }, cell: ({ row }) => LEDGER_KIND_LABELS[row.original.kind] ?? row.original.kind },
      {
        id: 'doc',
        header: 'Đơn/giao dịch',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <span className="grid gap-1">
            {row.original.orderCode ?? row.original.externalOrderId ?? row.original.txnId ?? '—'}
            <FlagChips flags={row.original.flags} meta={PAYMENT_FLAGS} />
          </span>
        ),
      },
      {
        id: 'shop',
        header: 'Gian hàng',
        meta: { className: 'min-w-36' },
        cell: ({ row }) => shopName(row.original.shopId) ?? (row.original.orderId ? 'Đơn tạo tay' : 'Toàn công ty'),
      },
      {
        id: 'amount',
        header: 'Số tiền',
        meta: { className: 'w-36', numeric: true },
        cell: ({ row }) => (
          <Money value={row.original.amount} className={isReplaced(row.original) ? 'text-muted-foreground line-through' : undefined} />
        ),
      },
      {
        id: 'state',
        header: 'Loại',
        meta: {
          className: 'w-28',
          help: 'Ước tính: tính theo cấu hình phí, thuế khi kiện giao xong. Thực tế: theo số sàn quyết toán; dòng đã thay vẫn giữ để đối chiếu.',
        },
        cell: ({ row }) => <LedgerStateBadge line={row.original} />,
      },
      {
        id: 'version',
        header: 'Cấu hình',
        meta: { className: 'w-28', help: 'Phiên bản cấu hình phí, thuế đã dùng để tính dòng ước tính.' },
        cell: ({ row }) =>
          row.original.configVersionId ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={ROUTES.company.financeConfig(companyId, row.original.configVersionId)}
              onClick={(e) => e.stopPropagation()}
            >
              Xem bản
            </Link>
          ) : (
            '—'
          ),
      },
      {
        id: 'note',
        header: 'Ghi chú',
        meta: { className: 'min-w-40' },
        cell: ({ row }) => (
          <span className="whitespace-normal">
            {row.original.reason ?? '—'}
            {row.original.txnId && row.original.orderCode ? (
              <span className="block text-xs text-muted-foreground">{row.original.txnId}</span>
            ) : null}
          </span>
        ),
      },
    ],
    // shopName đọc từ shops.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyId, shops.data],
  );

  const orderColumns = useMemo<ColumnDef<OrderProfitRow>[]>(
    () => [
      { id: 'order', header: 'Đơn', meta: { className: 'w-28' }, cell: ({ row }) => <span className="font-medium">{row.original.code ?? '—'}</span> },
      { id: 'shop', header: 'Gian hàng', meta: { className: 'min-w-36' }, cell: ({ row }) => shopName(row.original.shopId) ?? 'Đơn tạo tay' },
      { id: 'delivered', header: 'Ngày giao', meta: { className: 'w-28' }, cell: ({ row }) => (row.original.deliveredAt ? formatDate(row.original.deliveredAt) : '—') },
      {
        id: 'net',
        header: 'Thực nhận',
        meta: { className: 'w-32', numeric: true, help: 'Doanh thu và trợ giá của phần đã giao, sau khi trừ phí sàn, thuế khấu trừ và hoàn tiền.' },
        cell: ({ row }) => <Money value={row.original.net} />,
      },
      {
        id: 'cogs',
        header: 'Giá vốn',
        meta: { className: 'w-32', numeric: true },
        cell: ({ row }) => (row.original.cogs === null ? '—' : <Money value={row.original.cogs} />),
      },
      {
        id: 'gross',
        header: 'Lãi gộp',
        meta: { className: 'w-32', numeric: true, help: 'Thực nhận trừ giá vốn, chưa trừ quảng cáo.' },
        cell: ({ row }) => (row.original.gross === null ? '—' : <Money value={row.original.gross} />),
      },
      { id: 'margin', header: 'Biên', meta: { className: 'w-20', numeric: true, help: 'Lãi gộp / thực nhận.' }, cell: ({ row }) => formatMargin(row.original.marginPct) },
      {
        id: 'state',
        header: 'Trạng thái',
        meta: { className: 'w-48' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <ProfitStateBadge estimated={row.original.estimated} />
            <ProfitFlags costMissing={row.original.costMissing} belowFloor={row.original.belowFloor} />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shops.data],
  );

  const skuColumns = useMemo<ColumnDef<SkuProfitRow>[]>(
    () => [
      {
        id: 'sku',
        header: 'SKU',
        meta: { className: 'min-w-48' },
        cell: ({ row }) =>
          row.original.variantId ? (
            <span className="grid">
              <span className="font-medium">{row.original.sku}</span>
              <span className="text-xs text-muted-foreground">{row.original.productName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Chưa ghép SKU</span>
          ),
      },
      { id: 'qty', header: 'Đã bán', meta: { className: 'w-24', numeric: true }, cell: ({ row }) => row.original.soldQty.toLocaleString('vi-VN') },
      {
        id: 'net',
        header: 'Thực nhận',
        meta: { className: 'w-32', numeric: true, help: 'Thực nhận của đơn chia cho từng SKU theo tỷ lệ doanh thu dòng hàng.' },
        cell: ({ row }) => <Money value={row.original.net} />,
      },
      { id: 'cogs', header: 'Giá vốn', meta: { className: 'w-32', numeric: true }, cell: ({ row }) => (row.original.cogs === null ? '—' : <Money value={row.original.cogs} />) },
      { id: 'gross', header: 'Lãi gộp', meta: { className: 'w-32', numeric: true }, cell: ({ row }) => (row.original.gross === null ? '—' : <Money value={row.original.gross} />) },
      { id: 'margin', header: 'Biên', meta: { className: 'w-20', numeric: true }, cell: ({ row }) => formatMargin(row.original.marginPct) },
      { id: 'flags', header: '', meta: { className: 'w-32' }, cell: ({ row }) => <ProfitFlags costMissing={row.original.costMissing} /> },
    ],
    [],
  );

  const error = tab === 'lines' ? ledger.error : tab === 'orders' ? orderProfits.error : skuProfits.error;
  const pagination = (total: number | undefined) => ({
    page: f.page,
    pageSize: f.pageSize,
    total: total ?? 0,
    pageSizes: PAGE_SIZES,
    onChange: f.onPageChange,
  });
  const shopFilter = (
    <FilterSelect
      loading={shops.isLoading}
      label="Gian hàng"
      value={shopId}
      onChange={f.setFilter('shopId')}
      options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }))}
    />
  );
  const periodFilter = (
    <>
      <DateFilter label="Từ ngày" value={tab === 'lines' ? from : period.from} onChange={f.setFilter('from')} max={(tab === 'lines' ? to : period.to) || undefined} />
      <DateFilter label="Đến ngày" value={tab === 'lines' ? to : period.to} onChange={f.setFilter('to')} min={(tab === 'lines' ? from : period.from) || undefined} />
    </>
  );
  const excluded = skuProfits.data?.excludedOrders ?? 0;

  return (
    <div>
      <PageHeader
        title="Sổ tiền"
        subtitle="Mọi khoản tiền theo đơn và gian hàng."
        help="Dòng ước tính được ghi khi kiện giao xong và được thay bằng dòng thực tế khi sàn quyết toán, không sửa tại chỗ."
      />
      <TaxWarnings />
      <Kpis totals={ledger.data?.totals} />
      <Tabs value={tab} onValueChange={(v) => f.update({ tab: v === 'lines' ? undefined : v, page: undefined })}>
        <TabsList className="mb-2">
          <TabsTrigger value="lines">Dòng sổ</TabsTrigger>
          <TabsTrigger value="orders">Lãi theo đơn</TabsTrigger>
          <TabsTrigger value="skus">Lãi theo SKU</TabsTrigger>
        </TabsList>
      </Tabs>
      {error && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        {tab === 'lines' && (
          <>
            <FilterBar>
              <Tabs value={filter} onValueChange={(v) => f.update({ filter: v === 'all' ? undefined : v, page: undefined })}>
                <TabsList variant="segmented" aria-label="Loại dòng">
                  {FILTERS.map((x) => (
                    <TabsTrigger key={x.value} value={x.value}>
                      {x.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <FilterSelect
                label="Khoản"
                value={kind}
                onChange={f.setFilter('kind')}
                options={Object.entries(LEDGER_KIND_LABELS).map(([value, label]) => ({ value, label }))}
              />
              {shopFilter}
              {periodFilter}
              {orderId && (
                <Button variant="outline" size="sm" className="self-end" onClick={() => f.update({ orderId: undefined, page: undefined })}>
                  Chỉ dòng của một đơn
                  <X />
                </Button>
              )}
            </FilterBar>
            <DataTable
              columns={lineColumns}
              data={ledger.data?.items ?? []}
              getRowId={(r) => r.id}
              loading={ledger.isLoading}
              fetching={ledger.isFetching}
              onRowClick={(r) => r.orderId && navigate(ROUTES.company.order(companyId, r.orderId))}
              empty="Không có dòng sổ nào"
              pagination={pagination(ledger.data?.total)}
            />
          </>
        )}
        {tab === 'orders' && (
          <>
            <FilterBar>
              {periodFilter}
              {shopFilter}
              <CheckFilter id="cost-missing" label="Thiếu giá vốn" checked={costMissing} onChange={(v) => f.update({ costMissing: v ? 'true' : undefined, page: undefined })} />
              <CheckFilter id="below-floor" label="Dưới đáy" checked={belowFloor} onChange={(v) => f.update({ belowFloor: v ? 'true' : undefined, page: undefined })} />
            </FilterBar>
            <ProfitTotalsBar totals={orderProfits.data?.totals} />
            <DataTable
              columns={orderColumns}
              data={orderProfits.data?.items ?? []}
              getRowId={(r) => r.orderId}
              loading={orderProfits.isLoading}
              fetching={orderProfits.isFetching}
              onRowClick={(r) => navigate(ROUTES.company.order(companyId, r.orderId))}
              empty="Không có đơn nào giao trong kỳ"
              pagination={pagination(orderProfits.data?.total)}
            />
          </>
        )}
        {tab === 'skus' && (
          <>
            <FilterBar>
              {periodFilter}
              {shopFilter}
            </FilterBar>
            <ProfitTotalsBar
              totals={skuProfits.data?.totals}
              note={excluded ? `${excluded} đơn không tính vì kiện giao chưa có dòng hàng` : undefined}
            />
            <DataTable
              columns={skuColumns}
              data={skuProfits.data?.items ?? []}
              getRowId={(r) => r.variantId ?? 'unmapped'}
              loading={skuProfits.isLoading}
              fetching={skuProfits.isFetching}
              empty="Không có SKU nào giao trong kỳ"
              pagination={pagination(skuProfits.data?.total)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
