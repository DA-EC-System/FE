import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowTextAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useDecideInvitation } from '@/api/identity.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { formatDateTime } from '@/utils/format';
import type { PageResult } from '@/api/types';
import type { Invitation } from '@/types/identity';
import { useAuth } from '@/hooks/useAuth';
import {
  approveLockReason,
  conflictCurrent,
  invalidTransitionCurrent,
  invitationTransitionMessage,
  isCeoContext,
} from './shared';

interface PendingInvitationsProps {
  data: PageResult<Invitation> | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  /** Có `identity.account.manage`: thấy nút duyệt, từ chối; chỉ có quyền xem thì chỉ xem */
  canManage: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
}

const STATUS_LABELS: Record<Invitation['status'], string> = {
  open: 'Chưa ai mở',
  claimed: 'Đang đăng ký',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  revoked: 'Đã huỷ',
};

const who = (inv: Invitation) => inv.fullName ?? inv.email ?? 'yêu cầu này';

/** US-CT-07: yêu cầu tham gia qua link đang chờ duyệt */
export function PendingInvitations({
  data,
  loading,
  fetching,
  error,
  canManage,
  page,
  pageSize,
  onPageChange,
}: PendingInvitationsProps) {
  const decide = useDecideInvitation();
  const callerIsCeo = isCeoContext(useAuth().companyContext);
  const [rejecting, setRejecting] = useState<Invitation | null>(null);

  const run = async (inv: Invitation, decision: 'approve' | 'reject') => {
    try {
      const res = await decide.mutateAsync({ id: inv.id, decision, version: inv.version });
      toast.success(
        decision === 'approve'
          ? `Đã duyệt ${who(inv)}. Người này đăng nhập được bằng ${res.member?.email ?? inv.email}.`
          : `Đã từ chối yêu cầu của ${who(inv)}.`,
      );
    } catch (e) {
      // Danh sách tự nạp lại (onSettled) nên dòng hiện trạng thái mới nhất
      const moved = invalidTransitionCurrent<Invitation>(e);
      const latest = conflictCurrent<Invitation>(e);
      if (moved) {
        toast.warning(invitationTransitionMessage(moved, 'pending'));
      } else if (problemCode(e) === 'version_conflict') {
        toast.warning(
          latest && latest.status !== 'pending'
            ? `Yêu cầu của ${who(latest)} vừa được người khác xử lý (${STATUS_LABELS[latest.status].toLowerCase()}). Chưa có gì thay đổi.`
            : 'Yêu cầu vừa được người khác cập nhật, đã nạp lại. Chưa có gì thay đổi.',
        );
      } else {
        toast.error(problemMessage(e));
      }
    }
  };

  const columns = useMemo<ColumnDef<Invitation>[]>(
    () => [
      {
        id: 'person',
        header: 'Người đăng ký',
        meta: { className: 'min-w-52' },
        cell: ({ row: { original: inv } }) => (
          <div className="grid gap-0.5">
            <span className="font-medium">{inv.fullName}</span>
            <span className="text-muted-foreground">{inv.email}</span>
            {inv.existingAccount && (
              <span>
                <Badge variant="outline" title="Email đã có tài khoản Commerio; duyệt chỉ thêm vào công ty, không đổi mật khẩu">
                  Đã có tài khoản
                </Badge>
              </span>
            )}
          </div>
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
              <Badge variant="destructive" title="Có vai trò đã bị xoá sau khi tạo link: từ chối rồi tạo link mới">
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
        id: 'submittedAt',
        header: 'Gửi yêu cầu lúc',
        meta: { className: 'w-36 whitespace-nowrap' },
        cell: ({ row }) => (row.original.submittedAt ? formatDateTime(row.original.submittedAt) : ''),
      },
      {
        id: 'expiresAt',
        header: 'Hết hạn',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row: { original: inv } }) =>
          inv.expired ? (
            <Badge variant="outline" title="Link đã hết hạn nhưng yêu cầu đã nộp vẫn duyệt được">
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
              meta: { className: 'w-40 whitespace-nowrap' },
              cell: ({ row: { original: inv } }) => {
                const busy = decide.isPending && decide.variables?.id === inv.id;
                return (
                  <div className="flex gap-1">
                    <RowTextAction
                      label="Duyệt"
                      reason={approveLockReason(inv, callerIsCeo) ?? (busy ? 'Đang xử lý' : null)}
                      onClick={() => run(inv, 'approve')}
                    >
                      Duyệt
                    </RowTextAction>
                    <RowTextAction
                      label="Từ chối"
                      destructive
                      reason={busy ? 'Đang xử lý' : null}
                      onClick={() => setRejecting(inv)}
                    >
                      Từ chối
                    </RowTextAction>
                  </div>
                );
              },
            } satisfies ColumnDef<Invitation>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, callerIsCeo, decide.isPending, decide.variables?.id],
  );

  return (
    <>
      {Boolean(error) && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          getRowId={(inv) => inv.id}
          loading={loading}
          fetching={fetching}
          empty="Không có yêu cầu tham gia nào"
          pagination={{ page, pageSize, total: data?.total ?? 0, onChange: onPageChange }}
        />
      </Card>
      <ConfirmDialog
        open={Boolean(rejecting)}
        title="Từ chối yêu cầu?"
        message={
          <>
            <strong>{rejecting && who(rejecting)}</strong> sẽ không vào được công ty. Muốn mời lại thì tạo link mới.
          </>
        }
        confirmLabel="Từ chối"
        destructive
        loading={decide.isPending}
        onConfirm={async () => {
          if (rejecting) await run(rejecting, 'reject');
          setRejecting(null);
        }}
        onClose={() => setRejecting(null)}
      />
    </>
  );
}
