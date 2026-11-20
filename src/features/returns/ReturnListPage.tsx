import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ScanLine } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Money } from '@/components/common/Money';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReturns } from '@/api/returns.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { usePageGuide } from '@/guides/usePageGuide';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ReturnRequestSummary, ReturnSource, ReturnStatus } from '@/types/returns';
import { CLOSE_RESULT_LABELS, RETURN_STATUS, RETURN_TABS } from './shared';
import { ReceiveReturnDialog } from './ReceiveReturnDialog';
import { RespondByBadge } from './RespondByBadge';
import { UnmatchedParcels } from './UnmatchedParcels';

const PAGE_SIZES = [25, 50, 100];

const SOURCE_OPTIONS: { value: ReturnSource; label: string }[] = [
  { value: 'marketplace', label: 'Từ sàn' },
  { value: 'manual', label: 'Tạo thủ công' },
];
const SORT_OPTIONS: { value: 'respond_by'; label: string }[] = [{ value: 'respond_by', label: 'Hạn trả lời gần nhất' }];

type Tab = (typeof RETURN_TABS)[number]['value'];

/** Trả hàng/Hoàn tiền (sơ đồ D3): Sale xử lý yêu cầu theo trạng thái, kho quét nhận hàng hoàn */
export function ReturnListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canReceive = can(PERMISSIONS.fulfillmentProcess);
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('tab') as Tab | null;
  const tab: Tab = RETURN_TABS.some((t) => t.value === tabParam) ? (tabParam as Tab) : 'requested';
  const source = (f.params.get('source') ?? '') as ReturnSource | '';
  const unmatched = tab === 'unmatched';
  // Hạn trả lời chỉ có ở yêu cầu Chờ phản hồi (commerio-backend#392)
  const sort = tab === 'requested' && f.params.get('sort') === 'respond_by' ? 'respond_by' : '';
  const [receiving, setReceiving] = useState(false);
  const { startTour } = usePageGuide('returns');

  const query = useReturns({
    status: tab === 'all' || unmatched ? undefined : (tab as ReturnStatus),
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    source: source || undefined,
    sort: sort || undefined,
  });
  const counts = query.data?.counts;
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const filtered = Boolean(f.q || source);

  const columns = useMemo<ColumnDef<ReturnRequestSummary>[]>(
    () => [
      { id: 'code', header: 'Mã yêu cầu', meta: { className: 'w-32' }, cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span> },
      { id: 'order', header: 'Mã đơn', meta: { className: 'w-28' }, cell: ({ row }) => row.original.order.code },
      {
        id: 'source',
        header: 'Nguồn',
        meta: { className: 'w-40' },
        cell: ({ row }) => (row.original.source === 'marketplace' ? (row.original.shopName ?? 'Sàn') : 'Tạo thủ công'),
      },
      { id: 'customer', header: 'Người mua', meta: { className: 'min-w-36' }, cell: ({ row }) => row.original.customerName ?? '—' },
      { id: 'qty', header: 'SL trả', meta: { className: 'w-20 text-right' }, cell: ({ row }) => row.original.totalQty },
      {
        id: 'refund',
        header: 'Số tiền hoàn',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => <Money value={row.original.refundAmount} />,
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-56' },
        cell: ({ row }) => (
          <div className="grid gap-1">
            <StatusBadge status={row.original.status} statuses={RETURN_STATUS} />
            <RespondByBadge status={row.original.status} respondBy={row.original.respondBy} />
            {row.original.closeResult && (
              <span className="text-xs text-muted-foreground">{CLOSE_RESULT_LABELS[row.original.closeResult]}</span>
            )}
          </div>
        ),
      },
      { id: 'createdAt', header: 'Ngày tạo', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.createdAt) },
    ],
    [],
  );

  const countOf = (t: Tab) => {
    if (!counts) return null;
    if (t === 'all') return null;
    return counts[t];
  };

  return (
    <div>
      <PageHeader
        title="Trả hàng/Hoàn tiền"
        subtitle="Yêu cầu trả hàng từ sàn và từ đơn tạo thủ công. Kho quét nhận hàng hoàn tại đây."
        help="Sale chấp nhận trả hàng, chỉ hoàn tiền hoặc từ chối. Hàng hoàn về thì kho quét nhận và ghi tình trạng trên phiếu kiểm hàng hoàn. Kiện quét chưa tìm được yêu cầu nằm ở tab Hàng hoàn chưa rõ đơn."
        onTour={startTour}
        action={
          canReceive ? (
            <Button data-guide="return-receive" onClick={() => setReceiving(true)}>
              <ScanLine />
              Quét nhận hàng hoàn
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={(v) => f.update({ tab: v === 'requested' ? undefined : v, page: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList data-guide="return-tabs">
            {RETURN_TABS.map((t) => {
              const n = countOf(t.value);
              return (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  {n !== null && (
                    <Badge variant={t.value === 'unmatched' && n > 0 ? 'destructive' : 'secondary'} className="ms-1">
                      {n}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </Tabs>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0" data-guide="return-list">
        {unmatched ? (
          <UnmatchedParcels companyId={companyId} canProcess={canReceive} />
        ) : (
          <>
            <FilterBar>
              <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã yêu cầu, mã đơn, tên người mua" />
              <FilterSelect label="Nguồn" value={source} onChange={f.setFilter('source')} options={SOURCE_OPTIONS} />
              {tab === 'requested' && (
                <FilterSelect label="Xếp theo" value={sort} onChange={f.setFilter('sort')} options={SORT_OPTIONS} allLabel="Mới tạo trước" />
              )}
            </FilterBar>
            <DataTable
              columns={columns}
              data={items}
              getRowId={(r) => r.id}
              loading={query.isLoading}
              fetching={query.isFetching}
              onRowClick={(r) => navigate(ROUTES.company.returnRequest(companyId, r.id))}
              empty={filtered ? 'Không tìm thấy yêu cầu phù hợp' : 'Không có yêu cầu nào'}
              pagination={{
                page: f.page,
                pageSize: f.pageSize,
                total: query.data?.total ?? 0,
                pageSizes: PAGE_SIZES,
                onChange: f.onPageChange,
              }}
            />
          </>
        )}
      </Card>
      <ReceiveReturnDialog
        open={receiving}
        onClose={() => setReceiving(false)}
        onDone={(r) => {
          setReceiving(false);
          if (r.kind === 'matched') navigate(ROUTES.company.returnRequest(companyId, r.request.id));
          else f.update({ tab: 'unmatched', page: undefined });
        }}
      />
    </div>
  );
}
