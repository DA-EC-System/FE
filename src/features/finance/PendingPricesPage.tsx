import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFinanceList } from '@/api/financeLifecycle.api';
import type { PageResult } from '@/api/types';
import { isRouteMissing, problemMessage } from '@/api/problemMessages';
import { formatCurrency } from '@/utils/format';
import { useShop } from '@/api/shops.api';
import { LifecycleActionDialog } from './LifecycleActionDialog';

import type { PendingPrice } from '@/types/shop';
export function PendingPricesPage() {
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<PendingPrice | null>(null);
  // Mở từ cột giá của trang gian hàng thì lọc theo gian hàng đó (FE#274, `?shopId=`)
  const [searchParams, setSearchParams] = useSearchParams();
  const shopId = searchParams.get('shopId') ?? '';
  const shop = useShop(shopId).data;
  const query = useFinanceList<PageResult<PendingPrice>>('/channel/listings/pending-prices', { page, pageSize: 25, ...(shopId ? { shopId } : {}) });
  // Chưa đọc được thì không hiện bảng trống kèm "Không có giá chờ xác nhận" (FE#248)
  const unread = query.isError && !query.data;
  return <div><PageHeader title="Giá chờ xác nhận" subtitle="Kiểm tra giá tính lại theo cấu hình phí, thuế và cờ Dưới đáy trước khi xác nhận." />
    {shopId && <p className="mb-3 text-sm text-muted-foreground" data-testid="pending-shop-filter">Đang xem gian hàng {shop?.shopName ?? shopId}. <Button variant="link" className="h-auto p-0" onClick={() => { setPage(1); setSearchParams({}); }}>Xem mọi gian hàng</Button></p>}
    {query.isError && (isRouteMissing(query.error)
      ? <AlertMessage severity="info"><span data-testid="route-missing">Tính năng giá chờ xác nhận chưa mở trên máy chủ. Nhóm đang làm, bạn chưa cần làm gì.</span></AlertMessage>
      : <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>)}
    {!unread && <DataTable data={query.data?.items ?? []} getRowId={(r) => r.listing.id} loading={query.isLoading} fetching={query.isFetching} empty="Không có giá chờ xác nhận"
      pagination={{ page, pageSize: 25, total: query.data?.total ?? 0, onChange: setPage }} columns={[
        { header: 'SKU sàn', cell: ({ row }) => row.original.listing.sellerSku ?? row.original.listing.id },
        { header: 'Giá hiện tại', cell: ({ row }) => formatCurrency(row.original.price) },
        { header: 'Giá chờ', cell: ({ row }) => formatCurrency(row.original.pendingPrice) },
        { header: 'Cảnh báo', cell: ({ row }) => row.original.belowFloor ? <Badge variant="destructive">Dưới đáy</Badge> : '—' },
        { header: 'Thao tác', cell: ({ row }) => <Button size="sm" onClick={() => setSelected(row.original)}>Xác nhận giá</Button> },
      ]} />}
    {selected && <LifecycleActionDialog path={`/channel/listings/${selected.listing.id}/confirm-price`} version={selected.listing.version} title={selected.belowFloor ? 'Xác nhận giá dưới đáy' : 'Xác nhận giá'} onClose={() => setSelected(null)} />}
  </div>;
}
