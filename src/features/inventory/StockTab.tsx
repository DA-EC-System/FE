import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useStock } from '@/api/inventory.api';
import { useCategories } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency } from '@/utils/format';
import type { StockLevel } from '@/types/inventory';
import { ReorderDialog } from './ReorderDialog';
import { StockDetailDrawer } from './StockDetailDrawer';
import { formatQty, type Toast } from './shared';

interface StockTabProps {
  onToast: (toast: Toast) => void;
}

function SummaryCard({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  tone?: 'error';
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        border: 1,
        borderColor: active ? 'error.main' : 'divider',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={600} color={tone === 'error' ? 'error.main' : undefined}>
        {value}
      </Typography>
    </Paper>
  );
}

/** UC-IN-01 tồn theo biến thể, UC-IN-02 đặt ngưỡng ngay trên dòng */
export function StockTab({ onToast }: StockTabProps) {
  const can = useCan();
  const canReorder = can(PERMISSIONS.reorderManage);
  const canCost = can(PERMISSIONS.costView);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [belowMin, setBelowMin] = useState(false);
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [editing, setEditing] = useState<StockLevel | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const stockQuery = useStock({
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    belowMin: belowMin || undefined,
  });
  const categories = useCategories().data ?? [];
  const summary = stockQuery.data?.summary;
  const filtered = Boolean(debouncedSearch || categoryId || belowMin);

  const resetPage = () => setPagination((p) => ({ ...p, page: 0 }));

  const columns: GridColDef<StockLevel>[] = useMemo(
    () => [
      {
        field: 'sku',
        headerName: 'Biến thể',
        flex: 1.6,
        minWidth: 240,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" sx={{ height: '100%', lineHeight: 1.3 }}>
            <Typography variant="body2" fontWeight={600}>
              {row.sku}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.productName}
              {row.attributesLabel && ` · ${row.attributesLabel}`}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'category',
        headerName: 'Danh mục',
        width: 120,
        sortable: false,
        valueGetter: (value: StockLevel['category']) => value.name,
      },
      {
        field: 'onHand',
        headerName: 'Tồn thực',
        type: 'number',
        width: 100,
        sortable: false,
        valueFormatter: (value: number) => formatQty(value),
      },
      {
        field: 'reserved',
        headerName: 'Đang giữ',
        type: 'number',
        width: 100,
        sortable: false,
        valueFormatter: (value: number) => formatQty(value),
      },
      {
        field: 'available',
        headerName: 'Khả dụng',
        type: 'number',
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ height: '100%' }}>
            {row.belowMin && (
              <Tooltip title={`Dưới ngưỡng ${formatQty(row.minQty ?? 0)}`}>
                <WarningAmberIcon fontSize="small" color="error" />
              </Tooltip>
            )}
            <Typography variant="body2" fontWeight={600} color={row.belowMin ? 'error.main' : undefined}>
              {formatQty(row.available)}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'minQty',
        headerName: 'Ngưỡng',
        type: 'number',
        width: 110,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ height: '100%' }}>
            <Typography variant="body2" color={row.minQty === null ? 'text.secondary' : undefined}>
              {row.minQty === null ? '—' : formatQty(row.minQty)}
            </Typography>
            {canReorder && (
              <Tooltip title="Đặt ngưỡng">
                <IconButton size="small" onClick={() => setEditing(row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ),
      },
      ...(canCost
        ? ([
            {
              field: 'avgCost',
              headerName: 'Giá vốn BQ',
              type: 'number',
              width: 130,
              sortable: false,
              valueFormatter: (value: number | null) => (value === null ? '—' : formatCurrency(value)),
            },
            {
              field: 'stockValue',
              headerName: 'Giá trị tồn',
              type: 'number',
              width: 140,
              sortable: false,
              valueFormatter: (value: number | null) => (value === null ? '—' : formatCurrency(value)),
            },
          ] satisfies GridColDef<StockLevel>[])
        : []),
      {
        field: 'actions',
        headerName: '',
        width: 60,
        sortable: false,
        renderCell: ({ row }) => (
          <Tooltip title="Lịch sử biến động">
            <IconButton size="small" onClick={() => setViewing(row.variantId)}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ),
      },
    ],
    [canReorder, canCost],
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: `repeat(${canCost ? 3 : 2}, minmax(0, 1fr))` },
          gap: 2,
          mb: 2,
        }}
      >
        <SummaryCard label="Biến thể đang bán" value={summary ? formatQty(summary.variantCount) : '—'} />
        <SummaryCard
          label="Dưới ngưỡng tồn"
          value={summary ? formatQty(summary.belowMinCount) : '—'}
          tone={summary?.belowMinCount ? 'error' : undefined}
          active={belowMin}
          onClick={() => {
            setBelowMin((b) => !b);
            resetPage();
          }}
        />
        {canCost && (
          <SummaryCard
            label="Giá trị tồn (giá vốn)"
            value={summary?.totalValue != null ? formatCurrency(summary.totalValue) : '—'}
          />
        )}
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <TextField
          size="small"
          placeholder="Tìm theo tên sản phẩm hoặc SKU"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
          sx={{ minWidth: 300 }}
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
        <FormControlLabel
          control={
            <Switch
              checked={belowMin}
              onChange={(e) => {
                setBelowMin(e.target.checked);
                resetPage();
              }}
            />
          }
          label="Chỉ hiện dưới ngưỡng"
        />
        {!canCost && (
          <Chip size="small" variant="outlined" label="Giá vốn chỉ hiện với người có quyền" sx={{ ml: { md: 'auto' } }} />
        )}
      </Stack>

      {stockQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(stockQuery.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <DataGrid
          rows={stockQuery.data?.items ?? []}
          getRowId={(row) => row.variantId}
          columns={columns}
          loading={stockQuery.isFetching}
          rowCount={stockQuery.data?.total ?? 0}
          paginationMode="server"
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          disableColumnMenu
          rowHeight={60}
          onRowDoubleClick={({ row }) => setViewing(row.variantId)}
          sx={{ minHeight: 320 }}
          localeText={{
            noRowsLabel: filtered ? 'Không tìm thấy biến thể phù hợp' : 'Chưa có biến thể đang bán',
          }}
        />
      </Paper>

      <ReorderDialog
        level={editing}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          setEditing(null);
          onToast({ severity: 'success', msg });
        }}
      />
      <StockDetailDrawer variantId={viewing} canCost={canCost} onClose={() => setViewing(null)} />
    </Box>
  );
}
