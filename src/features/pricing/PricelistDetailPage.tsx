import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  DataGrid,
  useGridApiContext,
  type GridColDef,
  type GridRenderEditCellParams,
  type GridRowSelectionModel,
} from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SearchIcon from '@mui/icons-material/Search';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { usePricelist, usePricelistItems, useSavePrices } from '@/api/pricing.api';
import { useCategories } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { PricelistItem } from '@/types/pricing';
import { BulkPriceDialog } from './BulkPriceDialog';
import { parsePrice, priceText, type Toast } from './shared';

type Row = PricelistItem & { current: number | null };

/** Ô sửa giá: gõ số, lỗi hiện ngay dưới ô (UC-CP-03 bước 8) */
function PriceEditCell({ id, field, value, error }: GridRenderEditCellParams<Row, string>) {
  const apiRef = useGridApiContext();
  return (
    <Tooltip open={Boolean(error)} title={typeof error === 'string' ? error : ''} placement="bottom-start" arrow>
      <TextField
        autoFocus
        fullWidth
        size="small"
        value={value ?? ''}
        error={Boolean(error)}
        placeholder="Trống: chưa có giá"
        onChange={(e) => apiRef.current.setEditCellValue({ id, field, value: e.target.value })}
        onFocus={(e) => e.target.select()}
        InputProps={{ endAdornment: <InputAdornment position="end">đ</InputAdornment> }}
        sx={{ '& input': { textAlign: 'right' } }}
      />
    </Tooltip>
  );
}

/** UC-CP-03 bước 4–10: xem và sửa giá từng biến thể; thay đổi giữ ở bản nháp tới khi bấm Lưu */
export function PricelistDetailPage() {
  const { pricelistId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.pricelistManage);

  const plQuery = usePricelist(pricelistId);
  const itemsQuery = usePricelistItems(pricelistId);
  const categoriesQuery = useCategories();
  const saveMut = useSavePrices();
  const pricelist = plQuery.data;
  const isChannel = pricelist?.type === 'channel';

  /** variantId → giá mới (null là bỏ giá) */
  const [draft, setDraft] = useState<Map<string, number | null>>(new Map());
  /** Lỗi BE trả theo dòng: errors["items.<variantId>"] */
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [toast, setToast] = useState<Toast | null>(
    () => (location.state as { toast?: Toast } | null)?.toast ?? null,
  );

  // Thông báo từ trang tạo chỉ hiện một lần
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const dirty = draft.size > 0;

  // Rời trang khi còn giá chưa lưu: hỏi trước (đổi route và đóng tab)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const original = useMemo(() => new Map(items.map((i) => [i.variantId, i.price])), [items]);

  const current = useCallback(
    (variantId: string) => (draft.has(variantId) ? draft.get(variantId)! : original.get(variantId) ?? null),
    [draft, original],
  );

  /** Gộp thay đổi vào bản nháp; giá trùng giá đã lưu thì bỏ khỏi bản nháp */
  const applyChanges = useCallback(
    (changes: Map<string, number | null>) => {
      setDraft((prev) => {
        const next = new Map(prev);
        changes.forEach((price, variantId) => {
          if ((original.get(variantId) ?? null) === price) next.delete(variantId);
          else next.set(variantId, price);
        });
        return next;
      });
      setRowErrors((prev) => {
        const next = new Map(prev);
        changes.forEach((_, variantId) => next.delete(variantId));
        return next;
      });
    },
    [original],
  );

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((i) => ({ ...i, current: current(i.variantId) }))
      .filter(
        (r) =>
          (!q || r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)) &&
          (!categoryId || r.categoryId === categoryId) &&
          (!onlyMissing || r.current === null) &&
          (!onlyChanged || draft.has(r.variantId) || rowErrors.has(r.variantId)),
      );
  }, [items, current, search, categoryId, onlyMissing, onlyChanged, draft, rowErrors]);

  const selectedRows = useMemo(() => {
    const ids = new Set(selection);
    return items.filter((i) => ids.has(i.variantId));
  }, [items, selection]);

  const pricedCount = items.filter((i) => current(i.variantId) !== null).length;

  const save = async () => {
    if (!pricelist || !dirty) return;
    try {
      const saved = await saveMut.mutateAsync({
        id: pricelist.id,
        version: pricelist.version,
        items: [...draft].map(([variantId, price]) => ({ variantId, price })),
      });
      const n = draft.size;
      setDraft(new Map());
      setRowErrors(new Map());
      setOnlyChanged(false);
      setToast({ severity: 'success', msg: `Đã lưu ${n} giá của ${saved.name}` });
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict') {
        // Nạp giá mới nhất nhưng giữ bản nháp để người dùng kiểm lại (UC-CP-03 luồng 409)
        await Promise.all([plQuery.refetch(), itemsQuery.refetch()]);
        setToast({
          severity: 'warning',
          msg: 'Bảng giá vừa được người khác sửa. Đã nạp giá mới nhất, thay đổi của bạn vẫn giữ: kiểm lại rồi bấm Lưu.',
        });
        return;
      }
      const errors = problem?.errors ?? {};
      const byRow = new Map(
        Object.entries(errors)
          .filter(([key]) => key.startsWith('items.'))
          .map(([key, msg]) => [key.slice('items.'.length), msg] as const),
      );
      if (byRow.size) {
        setRowErrors(byRow);
        setOnlyChanged(true);
        setToast({ severity: 'error', msg: `${byRow.size} giá chưa hợp lệ, xem cột Ghi chú` });
      } else {
        setToast({ severity: 'error', msg: errors.items ?? getErrorMessage(e) });
      }
    }
  };

  const columns: GridColDef<Row>[] = useMemo(
    () => [
      {
        field: 'productName',
        headerName: 'Sản phẩm',
        flex: 1.4,
        minWidth: 240,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: '100%' }}>
            <Avatar variant="rounded" src={row.thumbnailUrl ?? undefined} sx={{ width: 36, height: 36 }}>
              {row.productName[0]}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {row.productName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {row.attributesLabel || 'Không có thuộc tính'}
              </Typography>
            </Box>
          </Stack>
        ),
      },
      {
        field: 'sku',
        headerName: 'SKU',
        width: 170,
        renderCell: ({ value }) => <Box sx={{ fontFamily: 'monospace' }}>{value}</Box>,
      },
      ...(isChannel
        ? [
            {
              field: 'standardPrice',
              headerName: 'Giá chuẩn',
              width: 140,
              align: 'right',
              headerAlign: 'right',
              valueFormatter: (value: number | null) => priceText(value),
            } satisfies GridColDef<Row>,
          ]
        : []),
      {
        field: 'current',
        headerName: isChannel ? 'Giá gian hàng' : 'Giá bán',
        width: 170,
        align: 'right',
        headerAlign: 'right',
        editable: canManage,
        // Ô sửa nhận chữ; số đã kiểm ở preProcessEditCellProps nên valueSetter chỉ đổi kiểu
        valueGetter: (value: number | null) => (value === null ? '' : String(value)),
        valueSetter: (value: string, row) => {
          const parsed = parsePrice(value);
          return { ...row, current: parsed.ok ? parsed.value : row.current };
        },
        preProcessEditCellProps: ({ props }) => {
          const parsed = parsePrice(String(props.value ?? ''));
          return { ...props, error: parsed.ok ? false : parsed.error };
        },
        renderEditCell: (params) => <PriceEditCell {...(params as GridRenderEditCellParams<Row, string>)} />,
        cellClassName: ({ row }) =>
          rowErrors.has(row.variantId) ? 'price-error' : draft.has(row.variantId) ? 'price-dirty' : '',
        renderCell: ({ row }) =>
          row.current !== null ? (
            priceText(row.current)
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {isChannel ? 'theo giá chuẩn' : 'chưa có giá'}
            </Typography>
          ),
      },
      {
        field: 'note',
        headerName: 'Ghi chú',
        flex: 1,
        minWidth: 180,
        sortable: false,
        renderCell: ({ row }) => {
          const err = rowErrors.get(row.variantId);
          if (err) return <Typography variant="body2" color="error">{err}</Typography>;
          if (!draft.has(row.variantId)) return null;
          const before = original.get(row.variantId) ?? null;
          return (
            <Typography variant="body2" color="text.secondary">
              Trước: {priceText(before)}
            </Typography>
          );
        },
      },
    ],
    [isChannel, canManage, draft, rowErrors, original],
  );

  if (plQuery.isError) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(plQuery.error)}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(ROUTES.company.pricing(companyId))}>
          Về danh sách bảng giá
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={pricelist?.name ?? 'Bảng giá'}
        subtitle={
          !pricelist
            ? undefined
            : pricelist.type === 'standard'
              ? 'Bảng giá chuẩn, áp dụng mặc định cho mọi đơn'
              : pricelist.shop
                ? `Giá riêng cho gian hàng ${pricelist.shop.shopName} (${PLATFORM_LABELS[pricelist.shop.platform]}); ô trống lấy giá chuẩn`
                : 'Gian hàng của bảng giá này đã bị xoá'
        }
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(ROUTES.company.pricing(companyId))}>
              Danh sách
            </Button>
            {canManage && (
              <>
                <Button
                  startIcon={<UndoIcon />}
                  disabled={!dirty || saveMut.isPending}
                  onClick={() => setDiscardOpen(true)}
                >
                  Huỷ thay đổi
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={!dirty || saveMut.isPending || !pricelist}
                  onClick={save}
                >
                  {saveMut.isPending ? 'Đang lưu...' : dirty ? `Lưu ${draft.size} thay đổi` : 'Lưu thay đổi'}
                </Button>
              </>
            )}
          </Stack>
        }
      />

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Bạn chỉ có quyền xem bảng giá.
        </Alert>
      )}
      {itemsQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(itemsQuery.error)}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Tìm theo tên sản phẩm hoặc SKU"
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
        <TextField
          select
          size="small"
          label="Danh mục"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Tất cả danh mục</MenuItem>
          {(categoriesQuery.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={<Switch checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />}
          label={isChannel ? 'Chưa có giá riêng' : 'Chưa có giá'}
        />
        {canManage && (
          <FormControlLabel
            control={<Switch checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />}
            label="Chỉ dòng đã sửa"
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Chip label={`Đã gán giá ${pricedCount} / ${items.length}`} variant="outlined" />
      </Stack>

      {canManage && selection.length > 0 && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" startIcon={<EditNoteIcon />} onClick={() => setBulkOpen(true)}>
                Sửa giá hàng loạt
              </Button>
              <Button color="inherit" size="small" onClick={() => setSelection([])}>
                Bỏ chọn
              </Button>
            </Stack>
          }
        >
          Đã chọn {selection.length} biến thể
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(r) => r.variantId}
          loading={itemsQuery.isLoading || plQuery.isLoading}
          checkboxSelection={canManage}
          keepNonExistentRowsSelected
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          disableRowSelectionOnClick
          disableColumnMenu
          rowHeight={56}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          processRowUpdate={(newRow: Row) => {
            applyChanges(new Map([[newRow.variantId, newRow.current]]));
            return newRow;
          }}
          onProcessRowUpdateError={(e) => setToast({ severity: 'error', msg: getErrorMessage(e) })}
          localeText={{
            noRowsLabel: items.length ? 'Không có biến thể khớp bộ lọc' : 'Công ty chưa có biến thể đang bán',
            footerRowSelected: (n) => `Đã chọn ${n} dòng`,
            MuiTablePagination: { labelRowsPerPage: 'Số dòng' },
          }}
          sx={(theme) => ({
            minHeight: 400,
            '& .price-dirty': { bgcolor: alpha(theme.palette.warning.main, 0.16), fontWeight: 600 },
            '& .price-error': { bgcolor: alpha(theme.palette.error.main, 0.16), fontWeight: 600 },
          })}
        />
      </Paper>

      <BulkPriceDialog
        open={bulkOpen}
        rows={selectedRows}
        isChannel={isChannel}
        current={current}
        onClose={() => setBulkOpen(false)}
        onApply={({ changes }) => {
          applyChanges(changes);
          setBulkOpen(false);
          setToast({ severity: 'success', msg: `Đã đổi ${changes.size} giá. Bấm Lưu để ghi lại.` });
        }}
      />
      <ConfirmDialog
        open={discardOpen}
        title="Huỷ thay đổi?"
        message={`Bỏ ${draft.size} giá chưa lưu và quay về giá đang áp dụng.`}
        confirmLabel="Huỷ thay đổi"
        cancelLabel="Giữ lại"
        destructive
        onConfirm={() => {
          setDraft(new Map());
          setRowErrors(new Map());
          setDiscardOpen(false);
        }}
        onClose={() => setDiscardOpen(false)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message={`Còn ${draft.size} giá chưa lưu sẽ bị bỏ.`}
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
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
