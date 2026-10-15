import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Button,
  Snackbar,
  Alert,
  MenuItem,
} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRowSelectionModel,
} from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ShopFormDialog } from './ShopFormDialog';
import {
  useShops,
  useCreateShop,
  useUpdateShop,
  useDeleteShop,
  useSyncShop,
  useBulkDeleteShops,
} from '@/api/shops.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Shop } from '@/types/shop';
import {
  PLATFORM_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  type ShopFormValues,
} from './shopSchemas';

export function ShopListPage() {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const companyName = companyContext?.companyName ?? '';
  const can = useCan();
  const canConnect = can(PERMISSIONS.shopConnect);
  const canUpdate = can(PERMISSIONS.shopUpdate);
  const canDisconnect = can(PERMISSIONS.shopDisconnect);
  const canSync = can(PERMISSIONS.shopSync);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);

  const [editing, setEditing] = useState<Shop | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<Shop | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [syncing, setSyncing] = useState<Shop | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; msg: string } | null>(null);

  const shopsQuery = useShops({
    page: 1,
    pageSize: 100,
    search: debouncedSearch,
    platform: platformFilter,
  });

  const createMut = useCreateShop();
  const updateMut = useUpdateShop();
  const deleteMut = useDeleteShop();
  const syncMut = useSyncShop();
  const bulkDeleteMut = useBulkDeleteShops();

  const rows = shopsQuery.data?.items ?? [];

  const handleSubmit = useCallback(
    async (values: ShopFormValues) => {
      try {
        if (editing) {
          await updateMut.mutateAsync({ id: editing.id, ...values });
          setToast({ severity: 'success', msg: 'Đã cập nhật gian hàng' });
        } else {
          await createMut.mutateAsync(values);
          setToast({ severity: 'success', msg: 'Đã kết nối gian hàng mới' });
        }
        setEditing(null);
        setCreateOpen(false);
      } catch (e) {
        setToast({ severity: 'error', msg: getErrorMessage(e) });
      }
    },
    [editing, createMut, updateMut],
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync(deleting.id);
      setToast({ severity: 'success', msg: `Đã xoá ${deleting.shopName}` });
      setDeleting(null);
    } catch (e) {
      setToast({ severity: 'error', msg: getErrorMessage(e) });
    }
  }, [deleting, deleteMut]);

  const handleSync = useCallback(async () => {
    if (!syncing) return;
    try {
      await syncMut.mutateAsync(syncing.id);
      setToast({ severity: 'success', msg: `Đã đồng bộ ${syncing.shopName}` });
      setSyncing(null);
    } catch (e) {
      setToast({ severity: 'error', msg: getErrorMessage(e) });
    }
  }, [syncing, syncMut]);

  const handleBulkDelete = useCallback(async () => {
    const ids = selection.map(String);
    if (ids.length === 0) return;
    try {
      const res = await bulkDeleteMut.mutateAsync(ids);
      setToast({ severity: 'success', msg: `Đã xoá ${res.deleted} gian hàng` });
      setBulkDeleting(false);
      setSelection([]);
    } catch (e) {
      setToast({ severity: 'error', msg: getErrorMessage(e) });
    }
  }, [selection, bulkDeleteMut]);

  const columns: GridColDef<Shop>[] = useMemo(
    () => [
      { field: 'id', headerName: 'Mã', width: 110 },
      {
        field: 'shopName',
        headerName: 'Tên gian hàng',
        flex: 1.4,
        minWidth: 220,
      },
      {
        field: 'platform',
        headerName: 'Nền tảng',
        width: 150,
        renderCell: ({ value }) => (
          <Chip
            label={PLATFORM_LABELS[value as keyof typeof PLATFORM_LABELS]}
            size="small"
            variant="outlined"
          />
        ),
      },
      {
        field: 'externalShopId',
        headerName: 'Mã ngoài sàn',
        flex: 1,
        minWidth: 180,
      },
      { field: 'region', headerName: 'Vùng', width: 90 },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 150,
        renderCell: ({ value }) => (
          <Chip
            label={STATUS_LABELS[value as keyof typeof STATUS_LABELS]}
            color={STATUS_COLORS[value as keyof typeof STATUS_COLORS]}
            size="small"
          />
        ),
      },
      {
        field: 'lastOrderSyncAt',
        headerName: 'Đồng bộ lần cuối',
        width: 160,
        valueGetter: (value) => formatDateTime(value as string),
      },
      {
        field: 'actions',
        headerName: 'Hành động',
        width: 170,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5}>
            {canSync && (
              <Tooltip title="Đồng bộ đơn">
                <IconButton size="small" onClick={() => setSyncing(row)}>
                  <SyncIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canUpdate && (
              <Tooltip title="Sửa">
                <IconButton size="small" onClick={() => setEditing(row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canDisconnect && (
              <Tooltip title="Xoá">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleting(row)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ),
      },
    ],
    [canSync, canUpdate, canDisconnect],
  );

  return (
    <Box>
      <PageHeader
        title="Kênh bán hàng"
        subtitle={`Các gian hàng kết nối sàn của ${companyName}.`}
        action={
          canConnect ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Thêm gian hàng
            </Button>
          ) : null
        }
      />

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ p: 2 }}
          alignItems={{ sm: 'center' }}
        >
          <TextField
            size="small"
            placeholder="Tìm theo tên hoặc mã ngoài sàn..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            label="Nền tảng"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          {selection.length > 0 && canDisconnect && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setBulkDeleting(true)}
            >
              Xoá {selection.length} mục đã chọn
            </Button>
          )}
        </Stack>

        <DataGrid
          rows={rows}
          columns={columns}
          loading={shopsQuery.isLoading || shopsQuery.isFetching}
          checkboxSelection={canDisconnect}
          disableRowSelectionOnClick
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          sx={{ minHeight: 480 }}
        />
      </Paper>

      <ShopFormDialog
        open={createOpen || Boolean(editing)}
        shop={editing}
        companyId={companyId}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xoá gian hàng?"
        message={
          <>
            Bạn sắp xoá <strong>{deleting?.shopName}</strong>. Kết nối OAuth
            (nếu có) sẽ bị thu hồi. Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={Boolean(syncing)}
        title="Đồng bộ đơn hàng?"
        message={
          <>
            Hệ thống sẽ kéo các đơn mới từ gian hàng{' '}
            <strong>{syncing?.shopName}</strong> về luồng duyệt đơn chung.
            Thao tác này có thể mất 5–15 giây tuỳ sàn.
          </>
        }
        confirmLabel="Bắt đầu đồng bộ"
        loading={syncMut.isPending}
        onConfirm={handleSync}
        onClose={() => setSyncing(null)}
      />

      <ConfirmDialog
        open={bulkDeleting}
        title={`Xoá ${selection.length} gian hàng đã chọn?`}
        message="Tất cả kết nối OAuth (nếu có) cũng sẽ bị thu hồi. Hành động này không thể hoàn tác."
        confirmLabel="Xoá tất cả"
        destructive
        loading={bulkDeleteMut.isPending}
        onConfirm={handleBulkDelete}
        onClose={() => setBulkDeleting(false)}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={() => setToast(null)}
            variant="filled"
          >
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
