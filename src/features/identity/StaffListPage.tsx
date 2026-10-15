import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import SearchIcon from '@mui/icons-material/Search';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useRoles, useSetStaffLocked, useStaff } from '@/api/identity.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { MembershipStatus } from '@/types/auth';
import type { StaffMember } from '@/types/identity';
import { InviteStaffDialog } from './InviteStaffDialog';
import { EditStaffRolesDialog } from './EditStaffRolesDialog';
import { conflictCurrent } from './shared';

type Toast = { severity: 'success' | 'error' | 'warning'; msg: string };

/** UC-PI-05: quản lý tài khoản nhân viên của công ty đang chọn */
export function StaffListPage() {
  const { account, companyContext } = useAuth();
  const can = useCan();
  const canManage = can(PERMISSIONS.staffManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [locking, setLocking] = useState<StaffMember | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const staffQuery = useStaff({
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    search: debouncedSearch,
    status,
    roleId,
  });
  const rolesQuery = useRoles();
  const roles = rolesQuery.data ?? [];
  const lockMut = useSetStaffLocked();

  /** UC-PI-05: không đổi vai trò hay khoá CEO và chính mình */
  const protectedReason = useCallback(
    (m: StaffMember) => {
      if (m.isCeo) return 'Không thao tác được trên tài khoản CEO';
      if (m.accountId === account?.id) return 'Không thao tác được trên tài khoản của chính bạn';
      return null;
    },
    [account?.id],
  );

  const handleLock = useCallback(async () => {
    if (!locking) return;
    const locked = locking.status === 'active';
    try {
      await lockMut.mutateAsync({ accountId: locking.accountId, locked, version: locking.version });
      setToast({
        severity: 'success',
        msg: locked ? `Đã tạm khoá ${locking.fullName}` : `Đã mở khoá ${locking.fullName}`,
      });
    } catch (e) {
      const latest = conflictCurrent<StaffMember>(e);
      setToast(
        getProblem(e)?.code === 'version_conflict' && latest
          ? {
              severity: 'warning',
              msg: `${latest.fullName} vừa được người khác sửa, hiện ${
                latest.status === 'locked' ? 'đang tạm khoá' : 'đang hoạt động'
              }. Chưa có gì thay đổi.`,
            }
          : { severity: 'error', msg: getErrorMessage(e) },
      );
    }
    setLocking(null);
  }, [locking, lockMut]);

  const columns: GridColDef<StaffMember>[] = useMemo(
    () => [
      {
        field: 'fullName',
        headerName: 'Họ tên',
        flex: 1.2,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ height: '100%' }}>
            <span>{row.fullName}</span>
            {row.accountId === account?.id && (
              <Typography variant="caption" color="text.secondary">
                (bạn)
              </Typography>
            )}
          </Stack>
        ),
      },
      { field: 'email', headerName: 'Email', flex: 1.2, minWidth: 200 },
      {
        field: 'roles',
        headerName: 'Vai trò',
        flex: 1.4,
        minWidth: 220,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: '100%' }} flexWrap="wrap">
            {row.roles.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                size="small"
                color={row.isCeo ? 'primary' : 'default'}
                variant={row.isCeo ? 'filled' : 'outlined'}
              />
            ))}
          </Stack>
        ),
      },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 190,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: '100%' }}>
            <Chip
              size="small"
              label={row.status === 'locked' ? 'Tạm khoá' : 'Hoạt động'}
              color={row.status === 'locked' ? 'error' : 'success'}
            />
            {row.pendingFirstLogin && (
              <Tooltip title="Chưa đăng nhập lần đầu bằng mật khẩu trong thư mời">
                <Chip size="small" variant="outlined" label="Chờ đăng nhập" />
              </Tooltip>
            )}
          </Stack>
        ),
      },
      {
        field: 'joinedAt',
        headerName: 'Tham gia',
        width: 150,
        valueGetter: (value) => formatDateTime(value as string),
      },
      ...(canManage
        ? [
            {
              field: 'actions',
              headerName: 'Hành động',
              width: 120,
              sortable: false,
              filterable: false,
              renderCell: ({ row }) => {
                const reason = protectedReason(row);
                const locked = row.status === 'locked';
                return (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title={reason ?? 'Đổi vai trò'}>
                      <span>
                        <IconButton size="small" disabled={Boolean(reason)} onClick={() => setEditing(row)}>
                          <ManageAccountsIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={reason ?? (locked ? 'Mở khoá' : 'Tạm khoá')}>
                      <span>
                        <IconButton
                          size="small"
                          color={locked ? 'default' : 'error'}
                          disabled={Boolean(reason)}
                          onClick={() => setLocking(row)}
                        >
                          {locked ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                );
              },
            } satisfies GridColDef<StaffMember>,
          ]
        : []),
    ],
    [account?.id, canManage, protectedReason],
  );

  const lockingTarget = locking?.status === 'active';

  return (
    <Box>
      <PageHeader
        title="Nhân viên"
        subtitle={`Tài khoản làm việc tại ${companyContext?.companyName ?? ''}.`}
        action={
          canManage ? (
            <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviteOpen(true)}>
              Thêm nhân viên
            </Button>
          ) : null
        }
      />

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm theo tên hoặc email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 0 }));
            }}
            sx={{ minWidth: 260 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            size="small"
            select
            label="Trạng thái"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MembershipStatus | '');
              setPagination((p) => ({ ...p, page: 0 }));
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            <MenuItem value="active">Hoạt động</MenuItem>
            <MenuItem value="locked">Tạm khoá</MenuItem>
          </TextField>
          <TextField
            size="small"
            select
            label="Vai trò"
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setPagination((p) => ({ ...p, page: 0 }));
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <DataGrid
          rows={staffQuery.data?.items ?? []}
          getRowId={(r) => r.accountId}
          columns={columns}
          loading={staffQuery.isLoading || staffQuery.isFetching}
          paginationMode="server"
          rowCount={staffQuery.data?.total ?? 0}
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          getRowHeight={() => 'auto'}
          sx={{ minHeight: 420, '& .MuiDataGrid-cell': { py: 1 } }}
        />
      </Paper>

      <InviteStaffDialog
        open={inviteOpen}
        roles={roles}
        onClose={() => setInviteOpen(false)}
        onDone={(msg) => {
          setInviteOpen(false);
          setToast({ severity: 'success', msg });
        }}
      />

      <EditStaffRolesDialog
        member={editing}
        roles={roles}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          setEditing(null);
          setToast({ severity: 'success', msg });
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
