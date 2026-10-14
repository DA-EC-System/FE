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
  Typography,
} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRowSelectionModel,
  GridToolbar,
} from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import StoreIcon from '@mui/icons-material/Store';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LaunchIcon from '@mui/icons-material/Launch';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CompanyFormDialog } from './CompanyFormDialog';
import {
  useCompanies,
  useCreateCompany,
  useUpdateCompany,
  useDeleteCompany,
  useBulkDeleteCompanies,
} from '@/api/companies.api';
import { useAuth } from '@/hooks/useAuth';
import { makeCan } from '@/utils/permissions';
import { formatDate } from '@/utils/format';
import { ROUTES } from '@/router/routes';
import type { Company } from '@/types/company';
import type { CompanyFormValues } from './companySchemas';

export function CompanyListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const can = useMemo(() => makeCan(user), [user]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);

  const [editing, setEditing] = useState<Company | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; msg: string } | null>(null);

  // Debounce search
  useMemo(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useCompanies({
    page: 1,
    pageSize: 100,
    search: debouncedSearch,
  });

  const createMut = useCreateCompany();
  const updateMut = useUpdateCompany();
  const deleteMut = useDeleteCompany();
  const bulkDeleteMut = useBulkDeleteCompanies();

  const rows = query.data?.items ?? [];

  const handleSubmit = useCallback(
    async (values: CompanyFormValues) => {
      try {
        if (editing) {
          await updateMut.mutateAsync({ id: editing.id, ...values });
          setToast({ severity: 'success', msg: 'Đã cập nhật công ty' });
        } else {
          await createMut.mutateAsync(values);
          setToast({ severity: 'success', msg: 'Đã tạo công ty mới' });
        }
        setEditing(null);
        setCreateOpen(false);
      } catch (e) {
        setToast({ severity: 'error', msg: (e as Error).message });
      }
    },
    [editing, createMut, updateMut],
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync(deleting.id);
      setToast({ severity: 'success', msg: `Đã xoá ${deleting.name}` });
      setDeleting(null);
    } catch (e) {
      setToast({ severity: 'error', msg: (e as Error).message });
    }
  }, [deleting, deleteMut]);

  const handleBulkDelete = useCallback(async () => {
    const ids = selection.map(String);
    if (ids.length === 0) return;
    try {
      const res = await bulkDeleteMut.mutateAsync(ids);
      setToast({ severity: 'success', msg: `Đã xoá ${res.deleted} công ty` });
      setBulkDeleting(false);
      setSelection([]);
    } catch (e) {
      setToast({ severity: 'error', msg: (e as Error).message });
    }
  }, [selection, bulkDeleteMut]);

  const columns: GridColDef<Company>[] = useMemo(
    () => [
      { field: 'id', headerName: 'Mã', width: 110 },
      {
        field: 'name',
        headerName: 'Tên công ty',
        flex: 1.4,
        minWidth: 240,
      },
      {
        field: 'taxCode',
        headerName: 'Mã số thuế',
        width: 160,
      },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 140,
        renderCell: ({ value }) =>
          value === 'active' ? (
            <Chip label="Đang hoạt động" color="success" size="small" />
          ) : (
            <Chip label="Đã khoá" color="error" size="small" />
          ),
      },
      {
        field: 'lockReason',
        headerName: 'Lý do khoá',
        flex: 1,
        minWidth: 180,
        valueGetter: (_, row) => row.lockReason ?? '—',
      },
      {
        field: 'createdAt',
        headerName: 'Ngày tạo',
        width: 130,
        valueGetter: (value) => formatDate(value as string),
      },
      {
        field: 'actions',
        headerName: 'Hành động',
        width: 180,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Kênh bán hàng của công ty">
              <IconButton
                size="small"
                color="primary"
                onClick={() => navigate(ROUTES.admin.companyShops(row.id))}
              >
                <StoreIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {can('update', 'company') && (
              <Tooltip title="Sửa">
                <IconButton size="small" onClick={() => setEditing(row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {can('delete', 'company') && (
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
    [can, navigate],
  );

  return (
    <Box>
      <PageHeader
        title="Quản lý Công ty (Platform)"
        subtitle="Mỗi công ty là một tenant độc lập với dữ liệu, nhân sự và kênh bán hàng riêng."
        action={
          can('create', 'company') ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Thêm công ty
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
            placeholder="Tìm theo tên hoặc mã số thuế..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ flexGrow: 1 }} />
          {selection.length > 0 && can('delete', 'company') && (
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
          loading={query.isLoading || query.isFetching}
          checkboxSelection={can('delete', 'company')}
          disableRowSelectionOnClick
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: false,
              printOptions: { disableToolbarButton: true },
            },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          sx={{ minHeight: 480 }}
        />
      </Paper>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
        <VisibilityIcon fontSize="small" color="action" />
        <Typography variant="caption" color="text.secondary">
          Mẹo: nhấp biểu tượng <LaunchIcon sx={{ fontSize: 12, mx: 0.5 }} /> /
          <StoreIcon sx={{ fontSize: 12, mx: 0.5 }} /> trên từng dòng để vào
          trang quản lý Kênh bán hàng của công ty đó.
        </Typography>
      </Stack>

      {/* Create / Edit dialog */}
      <CompanyFormDialog
        open={createOpen || Boolean(editing)}
        company={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xoá công ty?"
        message={
          <>
            Bạn sắp xoá <strong>{deleting?.name}</strong>. Mọi kênh bán hàng
            thuộc công ty này cũng sẽ bị xoá. Hành động này không thể hoàn
            tác.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={bulkDeleting}
        title={`Xoá ${selection.length} công ty đã chọn?`}
        message="Tất cả kênh bán hàng thuộc các công ty này cũng sẽ bị xoá. Hành động này không thể hoàn tác."
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
