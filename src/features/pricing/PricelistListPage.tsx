import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useDeletePricelist, usePricelists } from '@/api/pricing.api';
import { useShops } from '@/api/shops.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Pricelist } from '@/types/pricing';
import { CreatePricelistDialog, RenamePricelistDialog } from './PricelistFormDialog';
import type { Toast } from './shared';

/** UC-CP-03 bước 1–3: bảng giá chuẩn và bảng giá theo gian hàng của công ty (QT-12) */
export function PricelistListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.pricelistManage);
  // Bảng giá theo kênh cần phân hệ Kênh bán và quyền xem gian hàng để chọn gian hàng
  const channelOn = useModuleEnabled('channel');
  const canPickShop = canManage && channelOn && can(PERMISSIONS.shopView);

  const listQuery = usePricelists();
  const shopsQuery = useShops({ page: 1, pageSize: 100 }, { enabled: canPickShop });
  const deleteMut = useDeletePricelist();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Pricelist | null>(null);
  const [deleting, setDeleting] = useState<Pricelist | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const pricelists = listQuery.data ?? [];
  const freeShops = useMemo(() => {
    const taken = new Set(pricelists.map((p) => p.shop?.id).filter(Boolean));
    return (canPickShop ? shopsQuery.data?.items ?? [] : []).filter(
      (s) => s.status !== 'disconnected' && !taken.has(s.id),
    );
  }, [pricelists, shopsQuery.data, canPickShop]);

  const open = useCallback(
    (id: string) => navigate(ROUTES.company.pricelist(companyId, id)),
    [navigate, companyId],
  );

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync({ id: deleting.id, version: deleting.version });
      setToast({ severity: 'success', msg: `Đã xoá ${deleting.name}` });
    } catch (e) {
      const code = getProblem(e)?.code;
      setToast({
        severity: code === 'in_use' || code === 'version_conflict' ? 'warning' : 'error',
        msg: getErrorMessage(e),
      });
    }
    setDeleting(null);
  };

  const columns: GridColDef<Pricelist>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Bảng giá', flex: 1.2, minWidth: 200, sortable: false },
      {
        field: 'type',
        headerName: 'Loại',
        width: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <Chip
            size="small"
            label={row.type === 'standard' ? 'Chuẩn' : 'Theo gian hàng'}
            color={row.type === 'standard' ? 'primary' : 'default'}
          />
        ),
      },
      {
        field: 'shop',
        headerName: 'Gian hàng',
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) =>
          row.type === 'standard' ? (
            <Typography variant="body2" color="text.secondary">
              Mặc định cho mọi đơn
            </Typography>
          ) : row.shop ? (
            `${row.shop.shopName} · ${PLATFORM_LABELS[row.shop.platform]}`
          ) : (
            <Typography variant="body2" color="text.secondary">
              Gian hàng đã xoá
            </Typography>
          ),
      },
      {
        field: 'pricedCount',
        headerName: 'Đã gán giá',
        width: 170,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" sx={{ height: '100%' }}>
            <Typography variant="body2">
              {row.pricedCount} / {row.variantCount} biến thể
            </Typography>
            <LinearProgress
              variant="determinate"
              value={row.variantCount ? (row.pricedCount / row.variantCount) * 100 : 0}
              sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
            />
          </Stack>
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
        width: 140,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={canManage ? 'Sửa giá' : 'Xem giá'}>
              <IconButton size="small" onClick={() => open(row.id)}>
                {canManage ? <EditIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            {canManage && (
              <Tooltip title="Đổi tên">
                <IconButton size="small" onClick={() => setRenaming(row)}>
                  <DriveFileRenameOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canManage && row.type === 'channel' && (
              <Tooltip title="Xoá">
                <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ),
      },
    ],
    [canManage, open],
  );

  return (
    <Box>
      <PageHeader
        title="Bảng giá"
        subtitle="Bảng giá chuẩn áp dụng mặc định; đơn từ gian hàng có bảng giá riêng lấy giá trong bảng đó."
        action={
          canPickShop ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
              Tạo bảng giá
            </Button>
          ) : undefined
        }
      />

      {listQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(listQuery.error)}
        </Alert>
      )}
      {canManage && !channelOn && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Công ty chưa bật phân hệ Kênh bán nên chỉ có bảng giá chuẩn.
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <DataGrid
          rows={pricelists}
          columns={columns}
          loading={listQuery.isLoading}
          hideFooter={pricelists.length <= 25}
          disableRowSelectionOnClick
          disableColumnMenu
          rowHeight={60}
          onRowDoubleClick={({ row }) => open(row.id)}
          sx={{ minHeight: 260 }}
          localeText={{ noRowsLabel: 'Chưa có bảng giá' }}
        />
      </Paper>

      <CreatePricelistDialog
        open={creating}
        shops={freeShops}
        onClose={() => setCreating(false)}
        onDone={(created) => {
          setCreating(false);
          navigate(ROUTES.company.pricelist(companyId, created.id), {
            state: { toast: { severity: 'success', msg: `Đã tạo ${created.name}` } satisfies Toast },
          });
        }}
      />
      <RenamePricelistDialog
        pricelist={renaming}
        onClose={() => setRenaming(null)}
        onDone={(msg) => {
          setRenaming(null);
          setToast({ severity: 'success', msg });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xoá bảng giá?"
        message={
          <>
            Xoá <strong>{deleting?.name}</strong>. Đơn từ gian hàng {deleting?.shop?.shopName} sẽ lấy giá
            chuẩn. Gian hàng còn kết nối thì không xoá được.
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
