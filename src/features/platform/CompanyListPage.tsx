import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Lock, LockOpen } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LockCompanyDialog } from './LockCompanyDialog';
import { useLockCompany, usePlatformCompanies, useUnlockCompany } from '@/api/platform.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useDebounce } from '@/hooks/useDebounce';
import { MODULE_LABELS } from '@/utils/modules';
import { formatDate, formatDateTime } from '@/utils/format';
import type { Company, CompanyStatus } from '@/types/company';

const PAGE_SIZES = [10, 25, 50];

const STATUS_LABELS: Record<CompanyStatus, string> = {
  active: 'Đang hoạt động',
  locked: 'Đã khoá',
};

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

  // 409 version_conflict: phiên khác vừa đổi — báo trạng thái hiện tại theo current (AC-16);
  // danh sách tự tải lại ở onSettled của mutation
  const reportError = (error: unknown, name: string) => {
    const current = (getProblem(error) as { current?: Company } | undefined)?.current;
    if (problemCode(error) === 'version_conflict' && current) {
      toast.warning(
        `${current.name} vừa được người khác đổi, hiện ${STATUS_LABELS[
          current.status
        ].toLowerCase()}${current.status === 'locked' && current.lockReason ? ` (lý do: ${current.lockReason})` : ''}. Chưa có gì thay đổi.`,
      );
      return;
    }
    toast.error(
      problemCode(error) === 'not_found' ? `Không tìm thấy công ty ${name}` : problemMessage(error),
    );
  };

  const handleLock = (reason: string) => {
    if (!locking) return;
    setLockFieldError(undefined);
    lockMut.mutate(
      { id: locking.id, reason, version: locking.version },
      {
        onSuccess: (company) => {
          toast.success(`Đã khoá ${company.name}`);
          setLocking(null);
        },
        onError: (error) => {
          const problem = getProblem(error);
          if (problem?.status === 422 && problem.errors?.reason) {
            setLockFieldError(problem.errors.reason);
            return;
          }
          reportError(error, locking.name);
          setLocking(null);
        },
      },
    );
  };

  const handleUnlock = () => {
    if (!unlocking) return;
    const target = unlocking;
    unlockMut.mutate(
      { id: target.id, version: target.version },
      {
        onSuccess: (company) => toast.success(`Đã mở khoá ${company.name}`),
        onError: (error) => reportError(error, target.name),
        onSettled: () => setUnlocking(null),
      },
    );
  };

  const columns = useMemo<ColumnDef<Company>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Tên công ty',
        meta: { className: 'min-w-52 font-medium' },
      },
      { accessorKey: 'taxCode', header: 'Mã số thuế', meta: { className: 'w-32' } },
      {
        id: 'ceo',
        header: 'CEO',
        meta: { className: 'min-w-52' },
        cell: ({ row: { original: c } }) => (
          <div className="leading-tight">
            <div>{c.ceoName}</div>
            <div className="text-xs text-muted-foreground">{c.ceoEmail}</div>
          </div>
        ),
      },
      {
        id: 'createdAt',
        header: 'Ngày đăng ký',
        meta: { className: 'w-32 whitespace-nowrap' },
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: 'optionalModules',
        header: 'Phân hệ tuỳ chọn',
        meta: { className: 'min-w-52' },
        cell: ({ row: { original: c } }) =>
          c.optionalModules.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {c.optionalModules.map((m) => (
                <Badge key={m} variant="outline">
                  {MODULE_LABELS[m]}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-56' },
        cell: ({ row: { original: c } }) =>
          c.status === 'active' ? (
            <Badge variant="success">{STATUS_LABELS.active}</Badge>
          ) : (
            <div className="grid gap-1" title={c.lockReason}>
              <Badge variant="destructive">{STATUS_LABELS.locked}</Badge>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {formatDateTime(c.lockedAt)} · {c.lockReason}
              </span>
            </div>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Hành động</span>,
        meta: { className: 'w-32' },
        cell: ({ row: { original: c } }) =>
          c.status === 'active' ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setLockFieldError(undefined);
                setLocking(c);
              }}
            >
              <Lock />
              Khoá
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setUnlocking(c)}>
              <LockOpen />
              Mở khoá
            </Button>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Công ty"
        subtitle="Công ty tự đăng ký dùng Commerio. Quản trị nền tảng chỉ khoá hoặc mở khoá, không xem dữ liệu kinh doanh."
      />

      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Tìm theo tên, mã số thuế, email CEO..."
            className="md:w-80"
          />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={(v) => updateParams({ status: v, page: undefined })}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(c) => c.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={q || status ? 'Không có công ty nào khớp bộ lọc' : 'Chưa có công ty'}
          pagination={{
            page,
            pageSize,
            pageSizes: PAGE_SIZES,
            total: query.data?.total ?? 0,
            onChange: (p, size) => updateParams({ page: p, pageSize: size }),
          }}
        />
      </Card>

      <LockCompanyDialog
        company={locking}
        loading={lockMut.isPending}
        serverError={lockFieldError}
        onSubmit={handleLock}
        onClose={() => setLocking(null)}
      />

      {/* Mở khoá không hỏi lý do, chỉ xác nhận (AC-14) */}
      <ConfirmDialog
        open={Boolean(unlocking)}
        title="Mở khoá công ty?"
        message={
          <>
            Nhân viên của <strong>{unlocking?.name}</strong> sẽ đăng nhập lại được và công ty hoạt
            động như trước khi khoá.
          </>
        }
        confirmLabel="Mở khoá"
        loading={unlockMut.isPending}
        onConfirm={handleUnlock}
        onClose={() => setUnlocking(null)}
      />
    </div>
  );
}
