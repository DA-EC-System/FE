import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, PackageX, ShieldAlert } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useStockDocs } from '@/api/inventory.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ManualStockDocType, StockDocStatus, StockDocSummary, StockDocType } from '@/types/inventory';
import { AREA_LABELS, DOC_KIND_LABELS, DOC_STATUS, DOC_TYPE_LABELS, formatQty } from './shared';

const NEW_DOCS: { type: ManualStockDocType; label: string; icon: typeof ClipboardList }[] = [
  { type: 'stocktake', label: 'Kiểm kê', icon: ClipboardList },
  { type: 'write_off', label: 'Xuất huỷ', icon: PackageX },
  { type: 'to_quarantine', label: 'Chuyển chờ xử lý', icon: ShieldAlert },
];

/** Phiếu kho (sơ đồ B3): nhập, xuất theo đơn chỉ xem; kiểm kê, xuất huỷ, chuyển chờ xử lý lập nháp rồi gửi duyệt */
export function DocumentsTab() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canManage = useCan()(PERMISSIONS.stockDocManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [type, setType] = useState<StockDocType | ''>('');
  const [status, setStatus] = useState<StockDocStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const docsQuery = useStockDocs({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    type: type || undefined,
    status: status || undefined,
  });
  const filtered = Boolean(debouncedSearch || type || status);
  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const open = (id: string) => navigate(ROUTES.company.inventoryDoc(companyId, id));

  const columns = useMemo<ColumnDef<StockDocSummary>[]>(
    () => [
      {
        id: 'number',
        header: 'Số phiếu',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.number}</p>
            <p className="text-xs text-muted-foreground">
              {DOC_TYPE_LABELS[row.original.type]}
              {row.original.area && ` · ${AREA_LABELS[row.original.area]}`}
            </p>
          </div>
        ),
      },
      {
        id: 'kind',
        header: 'Nguồn',
        meta: { className: 'w-40' },
        cell: ({ row }) => (
          <div>
            <p>{DOC_KIND_LABELS[row.original.kind]}</p>
            {row.original.source && (
              <p className="text-xs text-muted-foreground">
                {row.original.source.type === 'order' ? 'Đơn ' : ''}
                {row.original.source.number}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'note',
        header: 'Ghi chú',
        meta: { className: 'min-w-44' },
        cell: ({ row }) => row.original.note || '—',
      },
      {
        id: 'totalQty',
        header: 'Số lượng',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => (
          <div>
            <p>{formatQty(row.original.totalQty)}</p>
            <p className="text-xs text-muted-foreground">{row.original.lineCount} dòng</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-36' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} statuses={DOC_STATUS} />
            {row.original.claimFlag && <Badge variant="destructive">Khiếu nại</Badge>}
          </div>
        ),
      },
      {
        id: 'createdAt',
        header: 'Lập / ghi sổ',
        meta: { className: 'w-44' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="whitespace-nowrap">{formatDateTime(row.original.postedAt ?? row.original.createdAt)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.postedBy ?? row.original.createdBy}
            </p>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      {docsQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(docsQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm số phiếu, chứng từ gốc, ghi chú" />
          <FilterSelect
            label="Loại phiếu"
            value={type}
            onChange={withReset((v: string) => setType(v as StockDocType | ''))}
            options={(Object.keys(DOC_TYPE_LABELS) as StockDocType[]).map((t) => ({
              value: t,
              label: DOC_TYPE_LABELS[t],
            }))}
          />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={withReset((v: string) => setStatus(v as StockDocStatus | ''))}
            options={(Object.keys(DOC_STATUS) as StockDocStatus[]).map((s) => ({
              value: s,
              label: DOC_STATUS[s].label,
            }))}
          />
          {/* Chỉ người có quyền lập phiếu mới thấy nút (AC-K12) */}
          {canManage && (
            <div className="flex flex-wrap gap-2 md:ms-auto">
              {NEW_DOCS.map(({ type: t, label, icon: Icon }, i) => (
                <Button
                  key={t}
                  variant={i === 0 ? 'default' : 'outline'}
                  onClick={() => navigate(ROUTES.company.inventoryDocNew(companyId, t))}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={docsQuery.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={docsQuery.isLoading}
          fetching={docsQuery.isFetching}
          empty={filtered ? 'Không tìm thấy phiếu phù hợp' : 'Chưa có phiếu nào'}
          onRowClick={(r) => open(r.id)}
          pagination={{
            page,
            pageSize,
            total: docsQuery.data?.total ?? 0,
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
