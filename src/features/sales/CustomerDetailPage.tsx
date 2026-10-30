import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomer, useOrders } from '@/api/sales.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import type { OrderSummary } from '@/types/sales';
import { channelLabel, ORDER_STATUS } from './shared';
import { Info } from './Info';

/** UC-SF-02 — Hồ sơ khách và lịch sử đơn */
export function CustomerDetailPage() {
  const navigate = useNavigate();
  const { customerId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canViewOrders = useCan()(PERMISSIONS.orderView);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useCustomer(customerId);
  const customer = query.data;
  const orders = useOrders({ customerId, page, pageSize }, { enabled: Boolean(customer) && canViewOrders });

  const columns = useMemo<ColumnDef<OrderSummary>[]>(
    () => [
      {
        id: 'code',
        header: 'Mã đơn',
        meta: { className: 'w-32' },
        cell: ({ row }) => (
          <Link
            to={ROUTES.company.order(companyId, row.original.id)}
            className="font-medium text-primary hover:underline"
          >
            {row.original.code}
          </Link>
        ),
      },
      { id: 'createdAt', header: 'Ngày tạo', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.createdAt) },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-40' },
        cell: ({ row }) => {
          const s = ORDER_STATUS[row.original.status];
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      {
        id: 'total',
        header: 'Tổng tiền',
        meta: { className: 'w-36 text-right' },
        cell: ({ row }) => formatCurrency(row.original.total),
      },
    ],
    [companyId],
  );

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={() => navigate(ROUTES.company.customers(companyId))}>
      <ArrowLeft />
      Khách hàng
    </Button>
  );

  if (query.isError) {
    // C4: không có hoặc của công ty khác đều là 404 (AC-K2, AC-R5)
    const notFound = getProblem(query.error)?.status === 404;
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : 'Không tải được khách hàng'} />
        <AlertMessage severity="error">
          {notFound ? 'Không tìm thấy khách hàng. Khách không tồn tại hoặc không thuộc công ty này.' : problemMessage(query.error)}
        </AlertMessage>
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div>
      {back}
      <PageHeader title={customer.name} subtitle={`Khách từ ${formatDate(customer.createdAt)}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="py-4 lg:col-span-2">
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Info label="Số điện thoại">{customer.phone}</Info>
            <Info label="Email">{customer.email || '—'}</Info>
            <Info label="Địa chỉ">{customer.address || '—'}</Info>
            <Info label="Ghi chú">{customer.note || '—'}</Info>
            <Info label="Kênh">
              <div className="flex flex-wrap gap-1">
                {customer.channels.map((c) => (
                  <Badge key={c} variant="secondary">
                    {channelLabel(c)}
                  </Badge>
                ))}
              </div>
            </Info>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="grid gap-4">
            <Info label="Số đơn">{customer.orderCount}</Info>
            <Info label="Tổng đã mua">{formatCurrency(customer.totalSpent)}</Info>
            <Info label="Đơn gần nhất">{formatDateTime(customer.lastOrderAt)}</Info>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 py-4">
        <CardHeader>
          <CardTitle className="text-base">Danh tính theo kênh</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.identities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Khách chưa liên kết tài khoản sàn nào.</p>
          ) : (
            <ul className="grid gap-2 text-sm" data-testid="customer-identities">
              {customer.identities.map((i) => (
                <li key={`${i.channelKind}-${i.externalUserId}`} className="flex flex-wrap gap-2">
                  <Badge variant="outline">{channelLabel(i.channelKind)}</Badge>
                  <span className="font-medium">{i.displayName}</span>
                  <span className="text-muted-foreground">{i.externalUserId}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canViewOrders && (
        <Card className="mt-4 gap-0 pt-4 pb-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lịch sử đơn</CardTitle>
          </CardHeader>
          <DataTable
            columns={columns}
            data={orders.data?.items ?? []}
            getRowId={(r) => r.id}
            loading={orders.isLoading}
            fetching={orders.isFetching}
            empty="Khách chưa có đơn nào"
            pagination={{
              page,
              pageSize,
              total: orders.data?.total ?? 0,
              pageSizes: [10, 25, 50],
              onChange: (p, size) => {
                setPage(size === pageSize ? p : 1);
                setPageSize(size);
              },
            }}
          />
        </Card>
      )}
    </div>
  );
}
