import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import SearchIcon from '@mui/icons-material/Search';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LockCompanyDialog } from './LockCompanyDialog';
import { useLockCompany, usePlatformCompanies, useUnlockCompany } from '@/api/platform.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { MODULE_LABELS } from '@/utils/modules';
import { formatDate, formatDateTime } from '@/utils/format';
import type { Company, CompanyStatus } from '@/types/company';

type Toast = { severity: 'success' | 'warning' | 'error'; msg: string };

const PAGE_SIZES = [10, 25, 50];

/**
 * UC-PI-08 — Quản lý công ty. Quản trị nền tảng chỉ xem thông tin đăng ký và trạng thái,
 * khoá (có lý do) hoặc mở khoá. Không xem dữ liệu kinh doanh, không tạo/sửa/xoá công ty (QT-03).
 */
export function CompanyListPage() {
  // Bộ lọc và trang nằm trên URL để tải lại hay chia sẻ link vẫn giữ nguyên
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? '1'));
  const pageSize = PAGE_SIZES.includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 25;
  const status = (params.get('status') ?? '') as CompanyStatus | '';
  const q = params.get('q') ?? '';

  const [searchInput, setSearchInput] = useState(q);
  const debouncedSearch = useDebounce(searchInput.trim());

  const updateParams = (patch: Record<string, string | number | undefined>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (debouncedSearch !== q) updateParams({ q: debouncedSearch, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = usePlatformCompanies({
    page,
    pageSize,
    search: q || undefined,
    status: status || undefined,
  });

  const lockMut = useLockCompany();
  const unlockMut = useUnlockCompany();
  const [locking, setLocking] = useState<Company | null>(null);
  const [lockFieldError, setLockFieldError] = useState<string>();
  const [unlocking, setUnlocking] = useState<Company | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // 409: trạng thái đã đổi ở phiên khác — báo trạng thái hiện tại, không đổi gì
  const reportError = (error: unknown) => {
    const problem = getProblem(error);
    setToast({
      severity: problem?.status === 409 ? 'warning' : 'error',
      msg: getErrorMessage(error),
    });
  };

  const handleLock = (reason: string) => {
    if (!locking) return;
    setLockFieldError(undefined);
    lockMut.mutate(
      { id: locking.id, reason },
      {
        onSuccess: (company) => {
          setToast({ severity: 'success', msg: `Đã khoá ${company.name}` });
          setLocking(null);
        },
        onError: (error) => {
          const problem = getProblem(error);
          if (problem?.status === 422 && problem.errors?.reason) {
            setLockFieldError(problem.errors.reason);
            return;
          }
          setLocking(null);
          reportError(error);
        },
      },
    );
  };

  const handleUnlock = () => {
    if (!unlocking) return;
    unlockMut.mutate(unlocking.id, {
      onSuccess: (company) => setToast({ severity: 'success', msg: `Đã mở khoá ${company.name}` }),
      onError: reportError,
      onSettled: () => setUnlocking(null),
    });
  };

  const columns: GridColDef<Company>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Tên công ty', flex: 1.4, minWidth: 220 },
      { field: 'taxCode', headerName: 'Mã số thuế', width: 130 },
      {
        field: 'ceoName',
        headerName: 'CEO',
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Box sx={{ lineHeight: 1.3, py: 1 }}>
            <Typography variant="body2">{row.ceoName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.ceoEmail}
            </Typography>
          </Box>
        ),
      },
      {
        field: 'createdAt',
        headerName: 'Ngày đăng ký',
        width: 120,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: 'optionalModules',
        headerName: 'Phân hệ tuỳ chọn',
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) =>
          row.optionalModules.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              —
            </Typography>
          ) : (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, py: 1 }}>
              {row.optionalModules.map((m) => (
                <Chip key={m} label={MODULE_LABELS[m]} size="small" variant="outlined" />
              ))}
            </Stack>
          ),
      },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 220,
        renderCell: ({ row }) =>
          row.status === 'active' ? (
            <Chip label="Đang hoạt động" color="success" size="small" />
          ) : (
            <Tooltip title={row.lockReason ?? ''}>
              <Box sx={{ py: 1, lineHeight: 1.3 }}>
                <Chip label="Đã khoá" color="error" size="small" />
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {formatDateTime(row.lockedAt)} · {row.lockReason}
                </Typography>
              </Box>
            </Tooltip>
          ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 130,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) =>
          row.status === 'active' ? (
            <Button
              size="small"
              color="error"
              startIcon={<LockIcon />}
              onClick={() => {
                setLockFieldError(undefined);
                setLocking(row);
              }}
            >
              Khoá
            </Button>
          ) : (
            <Button size="small" startIcon={<LockOpenIcon />} onClick={() => setUnlocking(row)}>
              Mở khoá
            </Button>
          ),
      },
    ],
    [],
  );

  const paginationModel: GridPaginationModel = { page: page - 1, pageSize };

  return (
    <Box>
      <PageHeader
        title="Công ty"
        subtitle="Công ty tự đăng ký dùng Commerio. Quản trị nền tảng chỉ khoá hoặc mở khoá, không xem dữ liệu kinh doanh."
      />

      {query.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(query.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm theo tên, mã số thuế, email CEO..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
            label="Trạng thái"
            value={status}
            onChange={(e) => updateParams({ status: e.target.value, page: undefined })}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            <MenuItem value="active">Đang hoạt động</MenuItem>
            <MenuItem value="locked">Đã khoá</MenuItem>
          </TextField>
        </Stack>

        <DataGrid
          rows={query.data?.items ?? []}
          columns={columns}
          rowCount={query.data?.total ?? 0}
          loading={query.isFetching}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={(m) =>
            updateParams({ page: m.page + 1, pageSize: m.pageSize })
          }
          pageSizeOptions={PAGE_SIZES}
          getRowHeight={() => 'auto'}
          disableRowSelectionOnClick
          disableColumnFilter
          sx={{ minHeight: 420, border: 0 }}
        />
      </Paper>

      <LockCompanyDialog
        company={locking}
        loading={lockMut.isPending}
        serverError={lockFieldError}
        onSubmit={handleLock}
        onClose={() => setLocking(null)}
      />

      <ConfirmDialog
        open={Boolean(unlocking)}
        title="Mở khoá công ty?"
        message={
          <>
            Nhân viên của <strong>{unlocking?.name}</strong> sẽ đăng nhập lại được và công ty
            hoạt động như trước khi khoá.
          </>
        }
        confirmLabel="Mở khoá"
        loading={unlockMut.isPending}
        onConfirm={handleUnlock}
        onClose={() => setUnlocking(null)}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
