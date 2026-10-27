import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSupplierReturns } from '@/api/purchasing.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { SupplierReturnStatus, SupplierReturnSummary } from '@/types/purchasing';
import { RETURN_STATUS, formatQty } from './shared';

/** Phiếu trả NCC (sơ đồ B4): hệ thống sinh nháp từ hàng lỗi; Mua hàng lập tay từ hàng chờ xử lý */
export function ReturnsTab() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canManage = useCan()(PERMISSIONS.supplierReturnManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [status, setStatus] = useState<SupplierReturnStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useSupplierReturns({ page, pageSize, search: debouncedSearch || undefined, status: status || undefined });
  const filtered = Boolean(debouncedSearch || status);
  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns = useMemo<ColumnDef<SupplierReturnSummary>[]>(
    () => [
      {
        id: 'number',
        header: 'Số phiếu',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.number}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.source ? `Từ ${row.original.source.number}` : 'Lập tay'}
            </p>
          </div>
        ),
      },
      {
        id: 'supplier',
        header: 'Nhà cung cấp',
        meta: { className: 'min-w-44' },
        cell: ({ row }) => row.original.supplier?.name ?? <span className="text-muted-foreground">Chưa chọn</span>,
      },
      {
        id: 'totalQty',
        header: 'Số lượng',
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => formatQty(row.original.totalQty),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-36' },
        cell: ({ row }) => <StatusBadge status={row.original.status} statuses={RETURN_STATUS} />,
      },
      {
        id: 'createdAt',
        header: 'Lập / gửi',
        meta: { className: 'w-44' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="whitespace-nowrap">{formatDateTime(row.original.sentAt ?? row.original.createdAt)}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.createdBy}</p>
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
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm số phiếu, chứng từ gốc, ghi chú" />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={withReset((v: string) => setStatus(v as SupplierReturnStatus | ''))}
            options={(Object.keys(RETURN_STATUS) as SupplierReturnStatus[]).map((s) => ({
              value: s,
              label: RETURN_STATUS[s].label,
            }))}
          />
          {canManage && (
            <Button className="md:ms-auto" onClick={() => navigate(ROUTES.company.supplierReturnNew(companyId))}>
              <Plus />
              Lập phiếu trả
            </Button>
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không tìm thấy phiếu phù hợp' : 'Chưa có phiếu trả NCC nào'}
          onRowClick={(r) => navigate(ROUTES.company.supplierReturn(companyId, r.id))}
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
