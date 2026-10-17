import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Lock, LockOpen, UserCog, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRoles, useSetStaffLocked, useStaff } from '@/api/identity.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { MembershipStatus } from '@/types/auth';
import type { StaffMember } from '@/types/identity';
import { InviteStaffDialog } from './InviteStaffDialog';
import { EditStaffRolesDialog } from './EditStaffRolesDialog';
import { conflictCurrent, protectedReason, STAFF_STATUS_LABELS } from './shared';

/** Nút biểu tượng kèm tooltip; bọc span để tooltip vẫn hiện khi nút bị khoá */
function RowAction({
  label,
  reason,
  onClick,
  children,
  destructive,
}: {
  label: string;
  reason: string | null;
  onClick: () => void;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={reason ? 0 : undefined}>
          <Button
            variant="ghost"
            size="icon"
            className={destructive ? 'size-8 text-destructive hover:text-destructive' : 'size-8'}
            aria-label={label}
            disabled={Boolean(reason)}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** UC-PI-05: quản lý tài khoản nhân viên của công ty đang chọn */
export function StaffListPage() {
  const { account, companyContext } = useAuth();
  const can = useCan();
  const canManage = can(PERMISSIONS.staffManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [locking, setLocking] = useState<StaffMember | null>(null);

  const staffQuery = useStaff({ page, pageSize, search: debouncedSearch, status, roleId });
  const rolesQuery = useRoles();
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const lockMut = useSetStaffLocked();

  const handleLock = async () => {
    if (!locking) return;
    const locked = locking.status === 'active';
    try {
      await lockMut.mutateAsync({ accountId: locking.accountId, locked, version: locking.version });
      toast.success(locked ? `Đã tạm khoá ${locking.fullName}` : `Đã mở khoá ${locking.fullName}`);
    } catch (e) {
      const latest = conflictCurrent<StaffMember>(e);
      if (problemCode(e) === 'version_conflict' && latest) {
        toast.warning(
          `${latest.fullName} vừa được người khác sửa, hiện ${STAFF_STATUS_LABELS[
            latest.status
          ].toLowerCase()}. Chưa có gì thay đổi.`,
        );
      } else {
        toast.error(problemMessage(e));
      }
    }
    setLocking(null);
  };

  const columns = useMemo<ColumnDef<StaffMember>[]>(
    () => [
      {
        id: 'fullName',
        header: 'Họ tên',
        meta: { className: 'min-w-44' },
        cell: ({ row: { original: m } }) => (
          <span className="font-medium">
            {m.fullName}
            {m.accountId === account?.id && (
              <span className="font-normal text-muted-foreground"> (bạn)</span>
            )}
          </span>
        ),
      },
      { accessorKey: 'email', header: 'Email', meta: { className: 'min-w-48' } },
      {
        id: 'roles',
        header: 'Vai trò',
        meta: { className: 'min-w-48' },
        cell: ({ row: { original: m } }) => (
          <div className="flex flex-wrap gap-1">
            {m.roles.map((r) => (
              <Badge key={r.id} variant={m.isCeo ? 'default' : 'outline'}>
                {r.name}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-44' },
        cell: ({ row: { original: m } }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={m.status === 'locked' ? 'destructive' : 'success'}>
              {STAFF_STATUS_LABELS[m.status]}
            </Badge>
            {m.pendingFirstLogin && (
              <Badge variant="outline" title="Chưa đăng nhập lần đầu bằng mật khẩu trong thư mời">
                Chờ đăng nhập
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'joinedAt',
        header: 'Tham gia',
        meta: { className: 'w-36 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.joinedAt),
      },
      // Không có quyền quản lý: không có cột hành động (AC-2)
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Hành động</span>,
              meta: { className: 'w-24' },
              cell: ({ row: { original: m } }) => {
                const reason = protectedReason(m, account?.id);
                const locked = m.status === 'locked';
                return (
                  <div className="flex gap-1">
                    <RowAction label="Đổi vai trò" reason={reason} onClick={() => setEditing(m)}>
                      <UserCog />
                    </RowAction>
                    <RowAction
                      label={locked ? 'Mở khoá' : 'Tạm khoá'}
                      reason={reason}
                      destructive={!locked}
                      onClick={() => setLocking(m)}
                    >
                      {locked ? <LockOpen /> : <Lock />}
                    </RowAction>
                  </div>
                );
              },
            } satisfies ColumnDef<StaffMember>,
          ]
        : []),
    ],
    [account?.id, canManage],
  );

  const filtered = Boolean(debouncedSearch || status || roleId);
  const lockingTarget = locking?.status === 'active';
  const resetPage = () => setPage(1);

  return (
    <div>
      <PageHeader
        title="Nhân viên"
        subtitle={`Tài khoản làm việc tại ${companyContext?.companyName ?? ''}.`}
        action={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Thêm nhân viên
            </Button>
          ) : null
        }
      />

      {staffQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(staffQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              resetPage();
            }}
            placeholder="Tìm theo tên hoặc email..."
          />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={(v) => {
              setStatus(v as MembershipStatus | '');
              resetPage();
            }}
            options={Object.entries(STAFF_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            label="Vai trò"
            value={roleId}
            onChange={(v) => {
              setRoleId(v);
              resetPage();
            }}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={staffQuery.data?.items ?? []}
          getRowId={(m) => m.accountId}
          loading={staffQuery.isLoading}
          fetching={staffQuery.isFetching}
          empty={filtered ? 'Không có nhân viên nào khớp bộ lọc' : 'Chưa có nhân viên'}
          pagination={{
            page,
            pageSize,
            total: staffQuery.data?.total ?? 0,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <InviteStaffDialog
        open={inviteOpen}
        roles={roles}
        onClose={() => setInviteOpen(false)}
        onDone={(msg) => {
          setInviteOpen(false);
          toast.success(msg);
        }}
      />

      <EditStaffRolesDialog
        member={editing}
        roles={roles}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          setEditing(null);
          toast.success(msg);
        }}
      />

      <ConfirmDialog
        open={Boolean(locking)}
        title={lockingTarget ? 'Tạm khoá tài khoản?' : 'Mở khoá tài khoản?'}
        message={
          lockingTarget ? (
            <>
              <strong>{locking?.fullName}</strong> sẽ không làm việc được ở công ty này cho tới khi
              được mở khoá. Tài khoản ở công ty khác (nếu có) không bị ảnh hưởng.
            </>
          ) : (
            <>
              <strong>{locking?.fullName}</strong> sẽ làm việc lại được với các vai trò đang có.
            </>
          )
        }
        confirmLabel={lockingTarget ? 'Tạm khoá' : 'Mở khoá'}
        destructive={lockingTarget}
        loading={lockMut.isPending}
        onConfirm={handleLock}
        onClose={() => setLocking(null)}
      />
    </div>
  );
}
