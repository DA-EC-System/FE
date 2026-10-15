import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import { PageHeader } from '@/components/common/PageHeader';
import { usePlatformAuditLogs } from '@/api/platform.api';
import { getErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime } from '@/utils/format';
import type { PlatformAuditAction, PlatformAuditLog } from '@/types/audit';
import { AUDIT_ACTION_LABELS } from './auditLabels';

const columns: GridColDef<PlatformAuditLog>[] = [
  {
    field: 'createdAt',
    headerName: 'Thời điểm',
    width: 160,
    valueFormatter: (value: string) => formatDateTime(value),
  },
  {
    field: 'action',
    headerName: 'Hành động',
    width: 120,
    renderCell: ({ row }) => {
      const a = AUDIT_ACTION_LABELS[row.action];
      return <Chip size="small" color={a.color} label={a.label} />;
    },
  },
  { field: 'targetCompanyName', headerName: 'Công ty', flex: 1, minWidth: 200 },
  { field: 'actorEmail', headerName: 'Người thực hiện', flex: 1, minWidth: 200 },
  {
    field: 'reason',
    headerName: 'Lý do',
    flex: 1.2,
    minWidth: 200,
    valueFormatter: (value?: string) => value ?? '—',
  },
];

/** Nhật ký cấp nền tảng (company_id null): đăng ký, khoá, mở khoá công ty. Chỉ đọc. */
export function PlatformAuditLogPage() {
  const [action, setAction] = useState<PlatformAuditAction | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const search = useDebounce(searchInput.trim());

  const query = usePlatformAuditLogs({
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    action: action || undefined,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const resetPage = () => setPagination((p) => ({ ...p, page: 0 }));

  return (
    <Box>
      <PageHeader
        title="Nhật ký nền tảng"
        subtitle="Các thao tác cấp nền tảng: công ty đăng ký, bị khoá và được mở khoá."
      />

      {query.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(query.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm theo công ty hoặc người thực hiện..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
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
            label="Hành động"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as PlatformAuditAction | '');
              resetPage();
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {Object.entries(AUDIT_ACTION_LABELS).map(([key, { label }]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="date"
            label="Từ ngày"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="Đến ngày"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: from || undefined }}
          />
        </Stack>

        <DataGrid
          rows={query.data?.items ?? []}
          columns={columns}
          rowCount={query.data?.total ?? 0}
          loading={query.isFetching}
          paginationMode="server"
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          disableColumnFilter
          sx={{ minHeight: 420, border: 0 }}
        />
      </Paper>
    </Box>
  );
}
