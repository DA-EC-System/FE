import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFinanceList } from '@/api/financeLifecycle.api';
import type { PageResult } from '@/api/types';
import { problemMessage } from '@/api/problemMessages';
import { formatCurrency } from '@/utils/format';
import { LifecycleActionDialog } from './LifecycleActionDialog';

import type { PendingPrice } from '@/types/shop';
export function PendingPricesPage() {
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<PendingPrice | null>(null);
  const query = useFinanceList<PageResult<PendingPrice>>('/channel/listings/pending-prices', { page, pageSize: 25 });
  return <div><PageHeader title="Giá chờ xác nhận" subtitle="Kiểm tra giá tính lại theo cấu hình phí, thuế và cờ Dưới đáy trước khi xác nhận." />
    {query.isError && <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>}
    <DataTable data={query.data?.items ?? []} getRowId={(r) => r.listing.id} loading={query.isLoading} empty="Không có giá chờ xác nhận"
      pagination={{ page, pageSize: 25, total: query.data?.total ?? 0, onChange: setPage }} columns={[
        { header: 'SKU sàn', cell: ({ row }) => row.original.listing.sellerSku ?? row.original.listing.id },
        { header: 'Giá hiện tại', cell: ({ row }) => formatCurrency(row.original.price) },
        { header: 'Giá chờ', cell: ({ row }) => formatCurrency(row.original.pendingPrice) },
        { header: 'Cảnh báo', cell: ({ row }) => row.original.belowFloor ? <Badge variant="destructive">Dưới đáy</Badge> : '—' },
        { header: 'Thao tác', cell: ({ row }) => <Button size="sm" onClick={() => setSelected(row.original)}>Xác nhận giá</Button> },
      ]} />
    {selected && <LifecycleActionDialog path={`/channel/listings/${selected.listing.id}/confirm-price`} version={selected.listing.version} title={selected.belowFloor ? 'Xác nhận giá dưới đáy' : 'Xác nhận giá'} onClose={() => setSelected(null)} />}
  </div>;
}
