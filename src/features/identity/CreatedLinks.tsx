import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useInvitations, useRevokeInvitation } from '@/api/identity.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { formatDateTime } from '@/utils/format';
import type { Invitation, InvitationStatus } from '@/types/identity';
import { conflictCurrent, invalidTransitionCurrent, invitationTransitionMessage } from './shared';

/** Link mời chưa ai gửi yêu cầu (Documents/21 §3.1) */
const UNSUBMITTED: InvitationStatus[] = ['open', 'claimed'];

/** Trạng thái mới nhất khi huỷ bị `version_conflict` */
const LATEST_LABELS: Record<InvitationStatus, string> = {
  open: 'vẫn chưa ai mở',
  claimed: 'đang được đăng ký',
  pending: 'đã gửi yêu cầu, xem ở tab Yêu cầu tham gia',
  approved: 'đã được duyệt',
  rejected: 'đã bị từ chối',
  revoked: 'đã bị huỷ',
};

interface CreatedLinksProps {
  /** Có `identity.account.manage`: thấy nút Huỷ; chỉ có quyền xem thì chỉ xem */
  canManage: boolean;
}

/** US-CT-05 AC 4–6: link mời chưa nộp, huỷ được khi lỡ gửi nhầm người */
export function CreatedLinks({ canManage }: CreatedLinksProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const query = useInvitations({ status: UNSUBMITTED, page, pageSize });
  const revoke = useRevokeInvitation();
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  // Huỷ dòng cuối của trang cuối thì trang hiện tại rỗng: lùi về trang cuối còn dữ liệu
  const total = query.data?.total;
  useEffect(() => {
    if (total === undefined) return;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [total, page, pageSize]);

  const run = async (inv: Invitation) => {
    try {
      await revoke.mutateAsync({ id: inv.id, version: inv.version });
      toast.success('Đã huỷ link mời. Người cầm link không dùng được nữa.');
    } catch (e) {
      // Danh sách tự nạp lại (onSettled) nên dòng hiện trạng thái mới nhất
      const moved = invalidTransitionCurrent<Invitation>(e);
      const latest = conflictCurrent<Invitation>(e);
      if (moved) {
        toast.warning(invitationTransitionMessage(moved, 'links'));
      } else if (problemCode(e) === 'version_conflict') {
        toast.warning(
          latest
            ? `Link này vừa đổi trạng thái: ${LATEST_LABELS[latest.status]}. Chưa huỷ.`
            : 'Link vừa được cập nhật, đã nạp lại. Chưa huỷ.',
        );
      } else {
        toast.error(problemMessage(e));
      }
    }
  };

  const columns = useMemo<ColumnDef<Invitation>[]>(
    () => [
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'min-w-52' },
        cell: ({ row: { original: inv } }) =>
          inv.status === 'claimed' ? (
            <div className="grid gap-0.5">
              <span className="font-medium">Đang đăng ký</span>
              <span className="text-muted-foreground">{inv.email}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Chưa ai mở</span>
          ),
      },
      {
        id: 'roles',
        header: 'Vai trò được gán',
        meta: { className: 'min-w-44' },
        cell: ({ row: { original: inv } }) => (
          <div className="flex flex-wrap gap-1">
            {inv.roles.map((r) => (
              <Badge key={r.id} variant="outline">
                {r.name}
              </Badge>
            ))}
            {inv.outdated && (
              <Badge variant="destructive" title="Có vai trò đã bị xoá sau khi tạo link: huỷ rồi tạo link mới">
                Có vai trò đã xoá
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'createdBy',
        header: 'Người tạo link',
        meta: { className: 'min-w-36' },
        cell: ({ row }) => row.original.createdBy.fullName,
      },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        meta: { className: 'w-36 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: 'expiresAt',
        header: 'Hết hạn',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row: { original: inv } }) =>
          inv.expired ? (
            <Badge variant="outline" title="Link đã hết hạn, người cầm link không dùng được nữa">
              Đã hết hạn
            </Badge>
          ) : (
            formatDateTime(inv.expiresAt)
          ),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Hành động</span>,
              meta: { className: 'w-16' },
              cell: ({ row: { original: inv } }) => {
                const busy = revoke.isPending && revoke.variables?.id === inv.id;
                return (
                  <RowAction
                    label="Huỷ link"
                    destructive
                    reason={busy ? 'Đang xử lý' : null}
                    onClick={() => setRevoking(inv)}
                  >
                    <Ban />
                  </RowAction>
                );
              },
            } satisfies ColumnDef<Invitation>,
          ]
        : []),
    ],
    [canManage, revoke.isPending, revoke.variables?.id],
  );

  return (
    <>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(inv) => inv.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty="Không có link mời nào chưa dùng"
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
        open={Boolean(revoking)}
        title="Huỷ link mời?"
        message={
          <>
            Người cầm link sẽ không dùng được nữa
            {revoking?.status === 'claimed' && (
              <>
                , kể cả <strong>{revoking.email}</strong> đang đăng ký
              </>
            )}
            . Muốn mời lại thì tạo link mới.
          </>
        }
        confirmLabel="Huỷ link"
        destructive
        loading={revoke.isPending}
        onConfirm={async () => {
          if (revoking) await run(revoking);
          setRevoking(null);
        }}
        onClose={() => setRevoking(null)}
      />
    </>
  );
}
