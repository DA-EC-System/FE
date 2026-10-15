import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import OutboxIcon from '@mui/icons-material/Outbox';
import { useStockDocs } from '@/api/inventory.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { StockDocStatus, StockDocSummary, StockDocType } from '@/types/inventory';
import { DOC_KIND_LABELS, DOC_STATUS, DOC_TYPE_LABELS, formatQty } from './shared';

/** Phiếu nhập, phiếu xuất của kho: lập nháp rồi ghi sổ */
export function DocumentsTab() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canManage = useCan()(PERMISSIONS.stockDocManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [type, setType] = useState<StockDocType | ''>('');
  const [status, setStatus] = useState<StockDocStatus | ''>('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });

  const docsQuery = useStockDocs({
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    search: debouncedSearch || undefined,
    type: type || undefined,
    status: status || undefined,
  });
  const filtered = Boolean(debouncedSearch || type || status);
  const resetPage = () => setPagination((p) => ({ ...p, page: 0 }));
  const open = (id: string) => navigate(ROUTES.company.inventoryDoc(companyId, id));

  const columns: GridColDef<StockDocSummary>[] = useMemo(
    () => [
      {
        field: 'number',
        headerName: 'Số phiếu',
        width: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" sx={{ height: '100%', lineHeight: 1.3 }}>
            <Typography variant="body2" fontWeight={600}>
              {row.number}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {DOC_TYPE_LABELS[row.type]}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'kind',
        headerName: 'Loại',
        width: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" sx={{ height: '100%', lineHeight: 1.3 }}>
            <Typography variant="body2">{DOC_KIND_LABELS[row.kind]}</Typography>
            {row.reference && (
              <Typography variant="caption" color="text.secondary">
                Đơn {row.reference}
              </Typography>
            )}
          </Stack>
        ),
      },
      {
        field: 'note',
        headerName: 'Ghi chú',
        flex: 1,
        minWidth: 180,
        sortable: false,
        valueFormatter: (value: string) => value || '—',
      },
      {
        field: 'totalQty',
        headerName: 'Số lượng',
        type: 'number',
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" alignItems="flex-end" sx={{ height: '100%', lineHeight: 1.3 }}>
            <Typography variant="body2">{formatQty(row.totalQty)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.lineCount} dòng
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Chip size="small" label={DOC_STATUS[row.status].label} color={DOC_STATUS[row.status].color} />
        ),
      },
      {
        field: 'createdAt',
        headerName: 'Lập / ghi sổ',
        width: 190,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack justifyContent="center" sx={{ height: '100%', lineHeight: 1.3 }}>
            <Typography variant="body2">{formatDateTime(row.postedAt ?? row.createdAt)}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.postedBy ?? row.createdBy}
            </Typography>
          </Stack>
        ),
      },
    ],
    [],
  );

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <TextField
          size="small"
          placeholder="Tìm số phiếu, mã đơn, ghi chú"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
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
          label="Loại phiếu"
          value={type}
          onChange={(e) => {
            setType(e.target.value as StockDocType | '');
            resetPage();
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Tất cả</MenuItem>
          <MenuItem value="receipt">Phiếu nhập</MenuItem>
          <MenuItem value="issue">Phiếu xuất</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StockDocStatus | '');
            resetPage();
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Tất cả</MenuItem>
          {(Object.keys(DOC_STATUS) as StockDocStatus[]).map((s) => (
            <MenuItem key={s} value={s}>
              {DOC_STATUS[s].label}
            </MenuItem>
          ))}
        </TextField>
        {canManage && (
          <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
            <Button
              variant="contained"
              startIcon={<MoveToInboxIcon />}
              onClick={() => navigate(ROUTES.company.inventoryDocNew(companyId, 'receipt'))}
            >
              Lập phiếu nhập
            </Button>
            <Button
              variant="outlined"
              startIcon={<OutboxIcon />}
              onClick={() => navigate(ROUTES.company.inventoryDocNew(companyId, 'issue'))}
            >
              Lập phiếu xuất
            </Button>
          </Stack>
        )}
      </Stack>

      {docsQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(docsQuery.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <DataGrid
          rows={docsQuery.data?.items ?? []}
          columns={columns}
          loading={docsQuery.isFetching}
          rowCount={docsQuery.data?.total ?? 0}
          paginationMode="server"
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          disableColumnMenu
          rowHeight={60}
          onRowClick={({ row }) => open(row.id)}
          sx={{ minHeight: 320, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          localeText={{ noRowsLabel: filtered ? 'Không tìm thấy phiếu phù hợp' : 'Chưa có phiếu nào' }}
        />
      </Paper>
    </Box>
  );
}
