import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RowTextAction } from '@/components/common/RowAction';
import { useDeleteRole, useRoles } from '@/api/identity.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { usePageGuide } from '@/guides/usePageGuide';
import { missingPermissions, PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Role } from '@/types/identity';
import { RoleFormDialog } from './RoleFormDialog';

/** UC-PI-06: vai trò mặc định và vai trò tự tạo của công ty */
export function RolesPage() {
  const { companyContext } = useAuth();
  const can = useCan();
  const canManage = can(PERMISSIONS.roleManage);
  const rolesQuery = useRoles();
  const deleteMut = useDeleteRole();
  const { startTour } = usePageGuide('roles', { ready: rolesQuery.isSuccess });

  const [form, setForm] = useState<{ role: Role | null } | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  /** Vì sao chỉ xem được quyền; null nếu sửa và xoá được */
  const readOnlyReason = useCallback(
    (role: Role) => {
      if (role.builtIn) return 'Vai trò mặc định, không sửa hay xoá được.';
      if (!canManage) return 'Bạn không có quyền quản lý vai trò.';
      if (missingPermissions(companyContext, role.permissions).length) {
        return 'Vai trò này có quyền mà bạn không có, nên bạn chỉ xem được.';
      }
      return null;
    },
    [canManage, companyContext],
  );

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync({ id: deleting.id, version: deleting.version });
      toast.success(`Đã xoá vai trò ${deleting.name}`);
    } catch (e) {
      const code = problemCode(e);
      if (code === 'role_in_use') {
        toast.warning(`Không xoá được vai trò ${deleting.name}: còn nhân viên đang được gán vai trò này.`);
      } else if (code === 'version_conflict') {
        toast.warning(`Vai trò ${deleting.name} vừa được người khác sửa. Chưa có gì thay đổi.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDeleting(null);
  };

  const columns = useMemo<ColumnDef<Role>[]>(
    () => [
      {
        id: 'name',
        header: 'Vai trò',
        meta: { className: 'min-w-48' },
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {r.builtIn && <Badge variant="outline">Mặc định</Badge>}
          </div>
        ),
      },
      {
        id: 'permissions',
        header: 'Số quyền',
        meta: { className: 'w-28' },
        cell: ({ row }) => row.original.permissions.length,
      },
      { accessorKey: 'memberCount', header: 'Số nhân viên', meta: { className: 'w-32' } },
      {
        id: 'updatedAt',
        header: 'Cập nhật',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Hành động</span>,
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row: { original: r } }) =>
          readOnlyReason(r) ? (
            <div className="flex gap-1" data-guide="roles-actions">
              <RowTextAction label="Xem quyền" onClick={() => setForm({ role: r })}>
                Xem
              </RowTextAction>
            </div>
          ) : (
            <div className="flex gap-1" data-guide="roles-actions">
              <RowTextAction label="Sửa" onClick={() => setForm({ role: r })}>
                Sửa
              </RowTextAction>
              <RowTextAction label="Xoá" destructive onClick={() => setDeleting(r)}>
                Xoá
              </RowTextAction>
            </div>
          ),
      },
    ],
    [readOnlyReason],
  );

  const formReason = form?.role ? readOnlyReason(form.role) : null;

  return (
    <div>
      <PageHeader
        title="Vai trò"
        subtitle="Vai trò mặc định và vai trò tự tạo; mỗi vai trò gồm các quyền được chọn."
        help="Vai trò mặc định (CEO, Admin, Sale...) không sửa hay xoá được. Vai trò tự tạo chỉ gồm những quyền bạn đang có; vai trò còn nhân viên đang được gán thì không xoá được."
        onTour={startTour}
        action={
          canManage ? (
            <Button onClick={() => setForm({ role: null })} data-guide="roles-create">
              Tạo vai trò
            </Button>
          ) : null
        }
      />

      {rolesQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(rolesQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={rolesQuery.data ?? []}
          getRowId={(r) => r.id}
          loading={rolesQuery.isLoading} fetching={rolesQuery.isFetching}
          empty="Chưa có vai trò"
        />
      </Card>

      <RoleFormDialog
        open={Boolean(form)}
        role={form?.role ?? null}
        readOnly={Boolean(formReason)}
        readOnlyReason={formReason}
        onClose={() => setForm(null)}
        onDone={(msg) => {
          setForm(null);
          toast.success(msg);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xoá vai trò?"
        message={
          <>
            Bạn sắp xoá vai trò <strong>{deleting?.name}</strong>
            {deleting?.memberCount
              ? `. Vai trò còn ${deleting.memberCount} nhân viên đang được gán nên hệ thống sẽ không cho xoá.`
              : '. Hành động này không thể hoàn tác.'}
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
