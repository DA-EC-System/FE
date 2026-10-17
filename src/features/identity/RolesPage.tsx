import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeleteRole, useRoles } from '@/api/identity.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { missingPermissions, PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Role } from '@/types/identity';
import { RoleFormDialog } from './RoleFormDialog';

function IconAction({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={destructive ? 'size-8 text-destructive hover:text-destructive' : 'size-8'}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** UC-PI-06: vai trò có sẵn và vai trò tuỳ biến của công ty */
export function RolesPage() {
  const { companyContext } = useAuth();
  const can = useCan();
  const canManage = can(PERMISSIONS.roleManage);
  const rolesQuery = useRoles();
  const deleteMut = useDeleteRole();

  const [form, setForm] = useState<{ role: Role | null } | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  /** Vì sao chỉ xem được tập quyền; null nếu sửa và xoá được */
  const readOnlyReason = useCallback(
    (role: Role) => {
      if (role.builtIn) return 'Vai trò có sẵn, không sửa hay xoá được.';
      if (!canManage) return 'Bạn không có quyền quản lý vai trò.';
      if (missingPermissions(companyContext, role.permissions).length) {
        return 'Vai trò có quyền bạn không có nên bạn chỉ xem được tập quyền.';
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
        toast.warning(`Không xoá được vai trò ${deleting.name}: còn tài khoản đang mang vai trò này.`);
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
            {r.builtIn && <Badge variant="outline">Có sẵn</Badge>}
          </div>
        ),
      },
      {
        id: 'permissions',
        header: 'Số quyền',
        meta: { className: 'w-28' },
        cell: ({ row }) => row.original.permissions.length,
      },
      { accessorKey: 'memberCount', header: 'Số tài khoản', meta: { className: 'w-32' } },
      {
        id: 'updatedAt',
        header: 'Cập nhật',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Hành động</span>,
        meta: { className: 'w-28' },
        cell: ({ row: { original: r } }) =>
          readOnlyReason(r) ? (
            <IconAction label="Xem tập quyền" onClick={() => setForm({ role: r })}>
              <Eye />
            </IconAction>
          ) : (
            <div className="flex gap-1">
              <IconAction label="Sửa" onClick={() => setForm({ role: r })}>
                <Pencil />
              </IconAction>
              <IconAction label="Xoá" destructive onClick={() => setDeleting(r)}>
                <Trash2 />
              </IconAction>
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
        subtitle="Vai trò có sẵn và vai trò tuỳ biến; mỗi vai trò là một tập quyền."
        action={
          canManage ? (
            <Button onClick={() => setForm({ role: null })}>
              <Plus />
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
          loading={rolesQuery.isLoading}
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
              ? `. Vai trò còn ${deleting.memberCount} tài khoản đang mang nên hệ thống sẽ không cho xoá.`
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
