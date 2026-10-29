import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePurchaseRequests, useSuppliers } from '@/api/purchasing.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { PurchaseRequestStatus, PurchaseRequestSummary } from '@/types/purchasing';
import { REQUEST_STATUS, formatQty } from './shared';

/** Đề nghị nhập (sơ đồ A1): một NCC mỗi đề nghị; cột còn chờ và cờ NCC giao thiếu */
export function RequestsTab() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canManage = useCan()(PERMISSIONS.purchaseRequestManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [status, setStatus] = useState<PurchaseRequestStatus | ''>('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const suppliersQuery = useSuppliers();
  const query = usePurchaseRequests({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: status || undefined,
    supplierId: supplierId || undefined,
  });
  const filtered = Boolean(debouncedSearch || status || supplierId);
  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const showCost = (query.data?.items ?? []).some((r) => r.totalCost !== null);

  const columns = useMemo<ColumnDef<PurchaseRequestSummary>[]>(
    () => [
      {
        id: 'number',
        header: 'Số đề nghị',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.number}</p>
            <p className="text-xs text-muted-foreground">{row.original.lineCount} dòng</p>
          </div>
        ),
      },
      {
        id: 'supplier',
        header: 'Nhà cung cấp',
        meta: { className: 'min-w-44' },
        cell: ({ row }) => (
          <div>
            <p>{row.original.supplier.name}</p>
            {row.original.note && <p className="truncate text-xs text-muted-foreground">{row.original.note}</p>}
          </div>
        ),
      },
      {
        id: 'totalQty',
        header: 'Số lượng',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => formatQty(row.original.totalQty),
      },
      {
        id: 'outstanding',
        header: 'Còn chờ',
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => (row.original.outstanding ? formatQty(row.original.outstanding) : '—'),
      },
      ...(showCost
        ? ([
            {
              id: 'totalCost',
              header: 'Giá trị',
              meta: { className: 'w-36 text-right whitespace-nowrap' },
              cell: ({ row }) => (row.original.totalCost === null ? '—' : formatCurrency(row.original.totalCost)),
            },
          ] satisfies ColumnDef<PurchaseRequestSummary>[])
        : []),
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-40' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} statuses={REQUEST_STATUS} />
            {row.original.supplierShort && <Badge variant="destructive">NCC giao thiếu</Badge>}
          </div>
        ),
      },
      {
        id: 'createdAt',
        header: 'Người lập',
        meta: { className: 'w-44' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.createdBy}</p>
          </div>
        ),
      },
    ],
    [showCost],
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
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm số đề nghị, NCC, ghi chú" />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={withReset((v: string) => setStatus(v as PurchaseRequestStatus | ''))}
            options={(Object.keys(REQUEST_STATUS) as PurchaseRequestStatus[]).map((s) => ({
              value: s,
              label: REQUEST_STATUS[s].label,
            }))}
          />
          <FilterSelect
            label="Nhà cung cấp"
            value={supplierId}
            onChange={withReset(setSupplierId)}
            options={(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          {canManage && (
            <Button className="md:ms-auto" onClick={() => navigate(ROUTES.company.purchaseRequestNew(companyId))}>
              <Plus />
              Lập đề nghị
            </Button>
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không tìm thấy đề nghị phù hợp' : 'Chưa có đề nghị nhập nào'}
          onRowClick={(r) => navigate(ROUTES.company.purchaseRequest(companyId, r.id))}
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
