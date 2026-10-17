import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { usePlatformAuditLogs } from '@/api/platform.api';
import { getErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime } from '@/utils/format';
import type { PlatformAuditAction, PlatformAuditLog } from '@/types/audit';
import { AUDIT_ACTION_LABELS } from './auditLabels';

const columns: ColumnDef<PlatformAuditLog>[] = [
  {
    id: 'createdAt',
    header: 'Thời điểm',
    meta: { className: 'w-40 whitespace-nowrap' },
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    id: 'action',
    header: 'Hành động',
    meta: { className: 'w-28' },
    cell: ({ row }) => {
      const a = AUDIT_ACTION_LABELS[row.original.action];
      return <Badge variant={a.variant}>{a.label}</Badge>;
    },
  },
  { accessorKey: 'targetCompanyName', header: 'Công ty', meta: { className: 'min-w-52' } },
  { accessorKey: 'actorEmail', header: 'Người thực hiện', meta: { className: 'min-w-52' } },
  {
    id: 'reason',
    header: 'Lý do',
    meta: { className: 'min-w-52 whitespace-normal' },
    cell: ({ row }) => row.original.reason ?? '—',
  },
];

/** Nhật ký cấp nền tảng (company_id null): đăng ký, khoá, mở khoá công ty. Chỉ đọc. */
export function PlatformAuditLogPage() {
  const [action, setAction] = useState<PlatformAuditAction | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const search = useDebounce(searchInput.trim());

  const query = usePlatformAuditLogs({
    page,
    pageSize,
    action: action || undefined,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <div>
      <PageHeader
        title="Nhật ký nền tảng"
        subtitle="Các thao tác cấp nền tảng: công ty đăng ký, bị khoá và được mở khoá."
      />

      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput
            value={searchInput}
            onChange={withReset(setSearchInput)}
            placeholder="Tìm theo công ty hoặc người thực hiện..."
          />
          <FilterSelect
            label="Hành động"
            value={action}
            onChange={withReset((v: string) => setAction(v as PlatformAuditAction | ''))}
            options={Object.entries(AUDIT_ACTION_LABELS).map(([value, { label }]) => ({ value, label }))}
          />
          <DateFilter label="Từ ngày" value={from} onChange={withReset(setFrom)} max={to || undefined} />
          <DateFilter label="Đến ngày" value={to} onChange={withReset(setTo)} min={from || undefined} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty="Không có dòng nào"
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>
    </div>
  );
}
