import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { useGoodsReceipts } from '@/api/purchasing.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { GoodsReceiptStatus, GoodsReceiptSummary } from '@/types/purchasing';
import { RECEIPT_STATUS, formatQty } from './shared';

/** Phiếu nhận (sơ đồ A2): kho lập từ đề nghị đã đặt NCC; lập phiếu ở trang đề nghị */
export function ReceiptsTab() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [status, setStatus] = useState<GoodsReceiptStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useGoodsReceipts({ page, pageSize, search: debouncedSearch || undefined, status: status || undefined });
  const filtered = Boolean(debouncedSearch || status);
  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns = useMemo<ColumnDef<GoodsReceiptSummary>[]>(
    () => [
      {
        id: 'number',
        header: 'Số phiếu',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.number}</p>
            <p className="text-xs text-muted-foreground">Đề nghị {row.original.request.number}</p>
          </div>
        ),
      },
      {
        id: 'supplier',
        header: 'Nhà cung cấp',
        meta: { className: 'min-w-44' },
        cell: ({ row }) => row.original.supplier.name,
      },
      {
        id: 'announced',
        header: 'Báo giao',
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => formatQty(row.original.totalAnnounced),
      },
      {
        id: 'short',
        header: 'Thiếu',
        meta: { className: 'w-20 text-right' },
        cell: ({ row }) =>
          row.original.shortQty ? (
            <span className="font-medium text-destructive">{formatQty(row.original.shortQty)}</span>
          ) : (
            '—'
          ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-32' },
        cell: ({ row }) => <StatusBadge status={row.original.status} statuses={RECEIPT_STATUS} />,
      },
      {
        id: 'createdAt',
        header: 'Lập / ghi sổ',
        meta: { className: 'w-44' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="whitespace-nowrap">{formatDateTime(row.original.postedAt ?? row.original.createdAt)}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.postedBy ?? row.original.createdBy}</p>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm số phiếu, số đề nghị" />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={withReset((v: string) => setStatus(v as GoodsReceiptStatus | ''))}
            options={(Object.keys(RECEIPT_STATUS) as GoodsReceiptStatus[]).map((s) => ({
              value: s,
              label: RECEIPT_STATUS[s].label,
            }))}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không tìm thấy phiếu phù hợp' : 'Chưa có phiếu nhận nào. Lập phiếu ở đề nghị đã đặt NCC.'}
          onRowClick={(r) => navigate(ROUTES.company.goodsReceipt(companyId, r.id))}
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            pageSizes: [25, 50, 100],
            onChange: (p, size) => {
              setPage(size === pageSize ? p : 1);
              setPageSize(size);
            },
          }}
        />
      </Card>
    </div>
  );
}
