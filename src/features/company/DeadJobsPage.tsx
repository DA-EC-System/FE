import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { RowTextAction } from '@/components/common/RowAction';
import { Card } from '@/components/ui/card';
import { useDeadJobs, useRetryDeadJob } from '@/api/companySettings.api';
import { useShops } from '@/api/shops.api';
import { getErrorMessage } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { formatDateTime } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissions';
import type { DeadJob } from '@/types/companySettings';
import { DEAD_JOB_QUEUE_LABELS, queueLabel } from './deadJobLabels';

/**
 * §14.5: tác vụ tự động đã thử hết lượt mà vẫn lỗi (đồng bộ đơn, đồng bộ listing, gia hạn uỷ quyền gian hàng...).
 * Chỉ người có quyền platform.job.manage (CEO, Admin) vào được; chạy lại thì việc về hàng gốc với lượt thử mới.
 */
export function DeadJobsPage() {
  const can = useCan();
  const [queue, setQueue] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [retrying, setRetrying] = useState<DeadJob | null>(null);

  const query = useDeadJobs({ queue: queue || undefined, page, pageSize });
  const retryMut = useRetryDeadJob();
  // Response không có tên gian hàng: lấy từ danh sách gian hàng theo shopId
  const shopsQuery = useShops({ enabled: can(PERMISSIONS.shopView) });
  const shopNames = useMemo(
    () => new Map((shopsQuery.data?.items ?? []).map((s) => [s.id, s.shopName])),
    [shopsQuery.data],
  );

  const columns = useMemo<ColumnDef<DeadJob>[]>(
    () => [
      {
        id: 'queue',
        header: 'Loại tác vụ',
        meta: { className: 'w-48' },
        cell: ({ row }) => <span data-testid="job-queue">{queueLabel(row.original.queue)}</span>,
      },
      {
        id: 'shop',
        header: 'Gian hàng',
        meta: { className: 'min-w-44' },
        cell: ({ row: { original: j } }) =>
          j.shopId ? (
            (shopNames.get(j.shopId) ?? <span className="font-mono text-xs">{j.shopId}</span>)
          ) : (
            <span className="text-muted-foreground">Không gắn gian hàng</span>
          ),
      },
      {
        accessorKey: 'attempts',
        header: 'Số lần thử',
        meta: { className: 'w-28 text-right tabular-nums' },
      },
      {
        id: 'lastError',
        header: 'Lỗi gần nhất',
        meta: { className: 'min-w-64' },
        cell: ({ row }) => <span className="break-words whitespace-normal">{row.original.lastError}</span>,
      },
      {
        id: 'failedAt',
        header: 'Thời gian lỗi',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.failedAt),
      },
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-28 whitespace-nowrap text-right' },
        cell: ({ row }) => (
          <RowTextAction label="Chạy lại" onClick={() => setRetrying(row.original)}>
            Chạy lại
          </RowTextAction>
        ),
      },
    ],
    [shopNames],
  );

  const retry = async () => {
    if (!retrying) return;
    const job = retrying;
    try {
      await retryMut.mutateAsync(job.id);
      toast.success(`Đã đưa tác vụ ${queueLabel(job.queue)} vào hàng chờ chạy lại`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
    setRetrying(null);
  };

  return (
    <div>
      <PageHeader
        title="Tác vụ lỗi"
        subtitle="Tác vụ tự động (đồng bộ đơn, đồng bộ listing, gia hạn uỷ quyền gian hàng) đã thử 5 lần vẫn lỗi. Xử lý nguyên nhân (vd kết nối lại gian hàng) rồi bấm Chạy lại. Tác vụ lỗi được lưu 30 ngày."
      />

      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <FilterSelect
            label="Loại tác vụ"
            value={queue}
            onChange={(v) => {
              setQueue(v);
              setPage(1);
            }}
            className="w-56"
            options={Object.entries(DEAD_JOB_QUEUE_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty="Không có tác vụ lỗi"
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

      <ConfirmDialog
        open={Boolean(retrying)}
        title="Chạy lại tác vụ"
        message={
          retrying && (
            <>
              Chạy lại tác vụ <b>{queueLabel(retrying.queue)}</b>
              {retrying.shopId ? ` của gian hàng ${shopNames.get(retrying.shopId) ?? retrying.shopId}` : ''}. Nếu chưa xử
              lý nguyên nhân, tác vụ có thể lỗi lại.
            </>
          )
        }
        confirmLabel="Chạy lại"
        loading={retryMut.isPending}
        onConfirm={() => void retry()}
        onClose={() => setRetrying(null)}
      />
    </div>
  );
}
