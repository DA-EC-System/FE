import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useCustomers, useCustomerChannels } from '@/api/sales.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate } from '@/utils/format';
import type { CustomerSummary } from '@/types/sales';
import { channelLabel } from './shared';
import { useUrlFilters } from '@/hooks/useUrlFilters';

const PAGE_SIZES = [25, 50, 100];

/** UC-SF-02 — Khách hàng của công ty, gộp từ đơn sàn, hộp thư và đơn tạo tay */
export function CustomerListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const f = useUrlFilters(PAGE_SIZES);
  const channel = f.params.get('channel') ?? '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';

  const query = useCustomers({
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    channel: channel || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const channels = useCustomerChannels();
  const filtered = Boolean(f.q || channel || from || to);

  const columns = useMemo<ColumnDef<CustomerSummary>[]>(
    () => [
      {
        id: 'name',
        header: 'Khách hàng',
        meta: { className: 'min-w-44' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.email || '—'}</p>
          </div>
        ),
      },
      { id: 'phone', header: 'Số điện thoại', meta: { className: 'w-32' }, cell: ({ row }) => row.original.phone },
      {
        id: 'channels',
        header: 'Kênh',
        meta: { className: 'w-44' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.channels.map((c) => (
              <Badge key={c} variant="secondary">
                {channelLabel(c)}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'orderCount',
        header: 'Số đơn',
        meta: { className: 'w-20 text-right' },
        cell: ({ row }) => row.original.orderCount,
      },
      {
        id: 'totalSpent',
        header: 'Tổng đã mua',
        meta: { className: 'w-36 text-right' },
        cell: ({ row }) => formatCurrency(row.original.totalSpent),
      },
      {
        id: 'lastOrderAt',
        header: 'Đơn gần nhất',
        meta: { className: 'w-32' },
        cell: ({ row }) => formatDate(row.original.lastOrderAt),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Khách hàng" subtitle="Khách mua qua sàn, nhắn qua hộp thư hoặc được tạo tay khi lập đơn." />
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm tên, số điện thoại, email" />
          <FilterSelect
            label="Kênh"
            value={channel}
            onChange={f.setFilter('channel')}
            options={[...new Set([...(channels.data ?? []), ...(channel ? [channel] : [])])].map((c) => ({ value: c, label: channelLabel(c) }))}
          />
          <DateFilter label="Đặt đơn từ ngày" value={from} max={to || undefined} onChange={f.setFilter('from')} />
          <DateFilter label="Đến ngày" value={to} min={from || undefined} onChange={f.setFilter('to')} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không tìm thấy khách hàng phù hợp' : 'Chưa có khách hàng nào'}
          onRowClick={(r) => navigate(ROUTES.company.customer(companyId, r.id))}
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
