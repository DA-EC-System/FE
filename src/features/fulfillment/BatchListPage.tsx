import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useBatches } from '@/api/fulfillment.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { BatchStatus, BatchSummary } from '@/types/fulfillment';
import { useUrlFilters } from '@/features/sales/useUrlFilters';
import { BATCH_STATUS } from './shared';

const PAGE_SIZES = [25, 50, 100];

/** UC-SF-07 — Danh sách lô nhặt, mới nhất trên cùng (AC-B6) */
export function BatchListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const f = useUrlFilters(PAGE_SIZES);
  const status = (f.params.get('status') ?? '') as BatchStatus | '';
  const query = useBatches({ page: f.page, pageSize: f.pageSize, status: status || undefined });

  const columns = useMemo<ColumnDef<BatchSummary>[]>(
    () => [
      {
        id: 'code',
        header: 'Mã lô',
        meta: { className: 'w-32' },
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-32' },
        cell: ({ row }) => {
          const s = BATCH_STATUS[row.original.status];
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      { id: 'orderCount', header: 'Số đơn', meta: { className: 'w-24 text-right' }, cell: ({ row }) => row.original.orderCount },
      { id: 'totalQty', header: 'Số lượng', meta: { className: 'w-24 text-right' }, cell: ({ row }) => row.original.totalQty },
      { id: 'createdBy', header: 'Người tạo', cell: ({ row }) => row.original.createdBy?.name ?? '—' },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        meta: { className: 'w-40' },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Lô nhặt hàng" subtitle="Mỗi lô gom nhiều đơn để nhặt hàng một lượt." />
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={f.setFilter('status')}
            options={(Object.keys(BATCH_STATUS) as BatchStatus[]).map((s) => ({ value: s, label: BATCH_STATUS[s].label }))}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={status ? 'Không có lô phù hợp' : 'Chưa có lô nào'}
          onRowClick={(r) => navigate(ROUTES.company.batch(companyId, r.id))}
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
