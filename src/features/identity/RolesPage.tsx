import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useDeleteRole, useRoles } from '@/api/identity.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { missingPermissions, PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Role } from '@/types/identity';
import { RoleFormDialog } from './RoleFormDialog';

type Toast = { severity: 'success' | 'error' | 'warning'; msg: string };

/** UC-PI-06: vai trò có sẵn và vai trò tuỳ biến của công ty */
export function RolesPage() {
  const { companyContext } = useAuth();
  const can = useCan();
  const canManage = can(PERMISSIONS.roleManage);
  const rolesQuery = useRoles();
  const deleteMut = useDeleteRole();

  const [form, setForm] = useState<{ role: Role | null } | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

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

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync({ id: deleting.id, version: deleting.version });
      setToast({ severity: 'success', msg: `Đã xoá vai trò ${deleting.name}` });
    } catch (e) {
      const code = getProblem(e)?.code;
      setToast({
        severity: code === 'role_in_use' || code === 'version_conflict' ? 'warning' : 'error',
        msg: getErrorMessage(e),
      });
    }
    setDeleting(null);
  }, [deleting, deleteMut]);

  const columns: GridColDef<Role>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Vai trò',
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ height: '100%' }}>
            <span>{row.name}</span>
            {row.builtIn && <Chip size="small" label="Có sẵn" variant="outlined" />}
          </Stack>
        ),
      },
      {
        field: 'permissions',
        headerName: 'Số quyền',
        width: 110,
        valueGetter: (value: string[]) => value.length,
      },
      { field: 'memberCount', headerName: 'Số tài khoản', width: 130 },
      {
        field: 'updatedAt',
        headerName: 'Cập nhật',
        width: 160,
        valueGetter: (value) => formatDateTime(value as string),
      },
      {
        field: 'actions',
        headerName: 'Hành động',
        width: 130,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => {
          const reason = readOnlyReason(row);
          if (reason) {
            return (
              <Tooltip title="Xem tập quyền">
                <IconButton size="small" onClick={() => setForm({ role: row })}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            );
          }
          return (
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Sửa">
                <IconButton size="small" onClick={() => setForm({ role: row })}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Xoá">
                <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        },
      },
    ],
    [readOnlyReason],
  );

  const formReason = form?.role ? readOnlyReason(form.role) : null;

  return (
    <Box>
      <PageHeader
        title="Vai trò"
        subtitle="Vai trò có sẵn và vai trò tuỳ biến; mỗi vai trò là một tập quyền."
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ role: null })}>
              Tạo vai trò
            </Button>
          ) : null
        }
      />

      {rolesQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(rolesQuery.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <DataGrid
          rows={rolesQuery.data ?? []}
          columns={columns}
          loading={rolesQuery.isLoading}
          disableRowSelectionOnClick
          hideFooter
          autoHeight
        />
      </Paper>

      <RoleFormDialog
        open={Boolean(form)}
        role={form?.role ?? null}
        readOnly={Boolean(formReason)}
        readOnlyReason={formReason}
        onClose={() => setForm(null)}
        onDone={(msg) => {
          setForm(null);
          setToast({ severity: 'success', msg });
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

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
