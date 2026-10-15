import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { PageHeader } from '@/components/common/PageHeader';
import { useCompanyAuditLog, useCompanyAuditLogs } from '@/api/companySettings.api';
import { useStaff } from '@/api/identity.api';
import { getErrorMessage } from '@/api/client';
import { formatDateTime } from '@/utils/format';
import type { AuditAction, CompanyAuditLog } from '@/types/companySettings';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditFieldLabel,
  auditValueText,
  entityTypeLabel,
} from './auditLabels';

const columns: GridColDef<CompanyAuditLog>[] = [
  {
    field: 'createdAt',
    headerName: 'Thời điểm',
    width: 160,
    valueFormatter: (value: string) => formatDateTime(value),
  },
  {
    field: 'actor',
    headerName: 'Người làm',
    flex: 1,
    minWidth: 200,
    sortable: false,
    renderCell: ({ row }) => (
      <Box sx={{ lineHeight: 1.3, py: 1 }}>
        <Typography variant="body2">{row.actor.fullName}</Typography>
        <Typography variant="caption" color="text.secondary">
          {row.actor.email}
        </Typography>
      </Box>
    ),
  },
  {
    field: 'action',
    headerName: 'Thao tác',
    width: 110,
    renderCell: ({ row }) => {
      const a = AUDIT_ACTION_LABELS[row.action];
      return <Chip size="small" color={a.color} label={a.label} />;
    },
  },
  {
    field: 'entityType',
    headerName: 'Đối tượng',
    width: 130,
    valueFormatter: (value: string) => entityTypeLabel(value),
  },
  { field: 'entityLabel', headerName: 'Tên', flex: 1, minWidth: 200 },
];

/** UC-PI-07: nhật ký thao tác của công ty, chỉ đọc. Admin và CEO xem được. */
export function CompanyAuditLogPage() {
  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Lọc theo người: chọn trong danh sách nhân viên (Admin và CEO đều xem được nhân viên)
  const staffQuery = useStaff({ pageSize: 100 });
  const query = useCompanyAuditLogs({
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    actorId: actorId || undefined,
    entityType: entityType || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const resetPage = () => setPagination((p) => ({ ...p, page: 0 }));
  const hasFilter = Boolean(actorId || entityType || action || from || to);

  return (
    <Box>
      <PageHeader
        title="Nhật ký thao tác"
        subtitle="Mọi thao tác thêm, sửa, xoá trong công ty. Nhật ký chỉ xem, không ai sửa hay xoá được."
      />

      {query.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(query.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2 }} flexWrap="wrap" useFlexGap>
          <TextField
            select
            size="small"
            label="Người làm"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              resetPage();
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {staffQuery.data?.items.map((s) => (
              <MenuItem key={s.accountId} value={s.accountId}>
                {s.fullName} ({s.email})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Đối tượng"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              resetPage();
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Thao tác"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as AuditAction | '');
              resetPage();
            }}
            sx={{ minWidth: 140 }}
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
            inputProps={{ max: to || undefined }}
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
          {hasFilter && (
            <Button
              color="inherit"
              onClick={() => {
                setActorId('');
                setEntityType('');
                setAction('');
                setFrom('');
                setTo('');
                resetPage();
              }}
            >
              Xoá lọc
            </Button>
          )}
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
          getRowHeight={() => 'auto'}
          onRowClick={({ row }) => setSelectedId(row.id)}
          disableRowSelectionOnClick
          disableColumnFilter
          disableColumnSorting
          localeText={{ noRowsLabel: hasFilter ? 'Không có dòng nào khớp bộ lọc' : 'Chưa có thao tác nào' }}
          sx={{ minHeight: 420, border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Paper>

      <AuditLogDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </Box>
  );
}

/** UC-PI-07 bước 4: giá trị trước và sau của một dòng */
function AuditLogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useCompanyAuditLog(id);
  const log = query.data;
  const fields = log ? [...new Set([...Object.keys(log.before ?? {}), ...Object.keys(log.after ?? {})])] : [];

  return (
    <Dialog open={Boolean(id)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Chi tiết thao tác</DialogTitle>
      <DialogContent dividers>
        {query.isError && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}
        {query.isLoading && <Skeleton variant="rounded" height={200} />}
        {log && (
          <>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip size="small" color={AUDIT_ACTION_LABELS[log.action].color} label={AUDIT_ACTION_LABELS[log.action].label} />
              <Typography variant="subtitle1">
                {entityTypeLabel(log.entityType)}: {log.entityLabel}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {log.actor.fullName} ({log.actor.email}) lúc {formatDateTime(log.createdAt)}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '24%' }}>Trường</TableCell>
                  <TableCell sx={{ width: '38%' }}>Trước</TableCell>
                  <TableCell sx={{ width: '38%' }}>Sau</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((f) => {
                  const before = log.before ? auditValueText(log.before[f]) : '—';
                  const after = log.after ? auditValueText(log.after[f]) : '—';
                  const changed = before !== after;
                  return (
                    <TableRow key={f} sx={changed ? { bgcolor: 'action.hover' } : undefined}>
                      <TableCell sx={{ fontWeight: 500 }}>{auditFieldLabel(f)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {before}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{after}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
