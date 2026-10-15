import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
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
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import ImageIcon from '@mui/icons-material/Image';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useArchiveProduct, useCategories, useProducts } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ProductListItem, ProductStatus } from '@/types/catalog';
import type { Toast } from './shared';

/** UC-CP-02: danh sách sản phẩm của công ty, tìm theo tên hoặc SKU */
export function ProductListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.productManage);
  const canSetup = can(PERMISSIONS.catalogSetup);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatus>('active');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [archiving, setArchiving] = useState<ProductListItem | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const productsQuery = useProducts({
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    status,
  });
  const categories = useCategories().data ?? [];
  const archiveMut = useArchiveProduct();

  const resetPage = () => setPagination((p) => ({ ...p, page: 0 }));
  const open = useCallback(
    (id: string) => navigate(ROUTES.company.catalogProduct(companyId, id)),
    [navigate, companyId],
  );

  const handleArchive = useCallback(async () => {
    if (!archiving) return;
    try {
      await archiveMut.mutateAsync({ id: archiving.id, version: archiving.version });
      setToast({ severity: 'success', msg: `Đã xoá ${archiving.name}` });
    } catch (e) {
      const code = getProblem(e)?.code;
      setToast({
        severity:
          code === 'product_has_active_orders' || code === 'version_conflict' ? 'warning' : 'error',
        msg: getErrorMessage(e),
      });
    }
    setArchiving(null);
  }, [archiving, archiveMut]);

  const columns: GridColDef<ProductListItem>[] = useMemo(
    () => [
      {
        field: 'thumbnailUrl',
        headerName: '',
        width: 64,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" sx={{ height: '100%' }}>
            <Avatar variant="rounded" src={row.thumbnailUrl ?? undefined} alt={row.name}>
              <ImageIcon fontSize="small" />
            </Avatar>
          </Stack>
        ),
      },
      { field: 'name', headerName: 'Sản phẩm', flex: 1.5, minWidth: 220, sortable: false },
      {
        field: 'category',
        headerName: 'Danh mục',
        flex: 0.8,
        minWidth: 130,
        sortable: false,
        valueGetter: (value: ProductListItem['category']) => value.name,
      },
      { field: 'variantCount', headerName: 'Số biến thể', width: 110, sortable: false },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Chip
            size="small"
            label={row.status === 'archived' ? 'Đã xoá' : 'Đang bán'}
            color={row.status === 'archived' ? 'default' : 'success'}
          />
        ),
      },
      {
        field: 'updatedAt',
        headerName: 'Cập nhật',
        width: 150,
        sortable: false,
        valueGetter: (value) => formatDateTime(value as string),
      },
      {
        field: 'actions',
        headerName: 'Hành động',
        width: 110,
        sortable: false,
        renderCell: ({ row }) => {
          const editable = canManage && row.status === 'active';
          return (
            <Stack direction="row" spacing={0.5}>
              <Tooltip title={editable ? 'Sửa' : 'Xem'}>
                <IconButton size="small" onClick={() => open(row.id)}>
                  {editable ? <EditIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              {editable && (
                <Tooltip title="Xoá">
                  <IconButton size="small" color="error" onClick={() => setArchiving(row)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
    ],
    [canManage, open],
  );

  return (
    <Box>
      <PageHeader
        title="Sản phẩm"
        subtitle="Sản phẩm và biến thể; SKU sinh theo quy tắc của danh mục."
        action={
          <Stack direction="row" spacing={1}>
            {canSetup && (
              <Button variant="outlined" onClick={() => navigate(ROUTES.company.catalogSetup(companyId))}>
                Danh mục & thuộc tính
              </Button>
            )}
            {canManage && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate(ROUTES.company.catalogNew(companyId))}
              >
                Thêm sản phẩm
              </Button>
            )}
          </Stack>
        }
      />

      {productsQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(productsQuery.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm theo tên hoặc SKU..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
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
            label="Danh mục"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              resetPage();
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            select
            label="Trạng thái"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProductStatus);
              resetPage();
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="active">Đang bán</MenuItem>
            <MenuItem value="archived">Đã xoá</MenuItem>
          </TextField>
        </Stack>

        <DataGrid
          rows={productsQuery.data?.items ?? []}
          columns={columns}
          loading={productsQuery.isLoading || productsQuery.isFetching}
          paginationMode="server"
          rowCount={productsQuery.data?.total ?? 0}
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          disableColumnMenu
          rowHeight={60}
          onRowDoubleClick={({ row }) => open(row.id)}
          sx={{ minHeight: 420 }}
          localeText={{ noRowsLabel: 'Chưa có sản phẩm' }}
        />
      </Paper>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Xoá sản phẩm?"
        message={
          <>
            <strong>{archiving?.name}</strong> sẽ ngừng bán cùng {archiving?.variantCount} biến thể. SKU
            đã sinh được giữ lại, không cấp cho sản phẩm khác. Sản phẩm còn đơn hàng đang xử lý thì
            không xoá được.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={archiveMut.isPending}
        onConfirm={handleArchive}
        onClose={() => setArchiving(null)}
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
