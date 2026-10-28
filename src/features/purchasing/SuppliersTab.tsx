import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSaveSupplier, useSupplierReport, useSuppliers } from '@/api/purchasing.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { cn } from '@/lib/utils';
import type { Supplier } from '@/types/purchasing';
import { formatQty, supplierSchema, type SupplierForm } from './shared';

type Row = Supplier & { shortReceiptCount: number; receiptCount: number; defectRate: number | null };

const EMPTY: SupplierForm = { name: '', phone: '', email: '', address: '', note: '', active: true };

/** Nhà cung cấp kèm báo cáo: số lần giao thiếu, tỉ lệ hàng lỗi (sơ đồ A2) */
export function SuppliersTab() {
  const canManage = useCan()(PERMISSIONS.purchaseRequestManage);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const query = useSuppliers({ search: debouncedSearch || undefined });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useSupplierReport({ from: from || undefined, to: to || undefined });
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      (query.data ?? []).map((s) => {
        const r = report.data?.find((x) => x.supplierId === s.id);
        return {
          ...s,
          receiptCount: r?.receiptCount ?? 0,
          shortReceiptCount: r?.shortReceiptCount ?? 0,
          defectRate: r?.defectRate ?? null,
        };
      }),
    [query.data, report.data],
  );

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'name',
        header: 'Nhà cung cấp',
        meta: { className: 'min-w-48' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">
              {row.original.name}
              {!row.original.active && (
                <Badge variant="secondary" className="ms-2">
                  Ngừng giao dịch
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {[row.original.phone, row.original.email].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'receipts',
        header: 'Phiếu nhận',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => formatQty(row.original.receiptCount),
      },
      {
        id: 'short',
        header: 'Giao thiếu',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => (
          <span className={cn(row.original.shortReceiptCount > 0 && 'font-medium text-destructive')}>
            {formatQty(row.original.shortReceiptCount)}
          </span>
        ),
      },
      {
        id: 'defect',
        header: 'Tỉ lệ lỗi',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) =>
          row.original.defectRate === null ? '—' : `${(row.original.defectRate * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`,
      },
      ...(canManage
        ? ([
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-12 text-right' },
              cell: ({ row }) => (
                <RowAction label="Sửa nhà cung cấp" onClick={() => setEditing(row.original)}>
                  <Pencil />
                </RowAction>
              ),
            },
          ] satisfies ColumnDef<Row>[])
        : []),
    ],
    [canManage],
  );

  return (
    <div>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}
      {report.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(report.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Tìm tên hoặc số điện thoại" />
          <DateFilter label="Ghi sổ từ ngày" value={from} onChange={setFrom} max={to || undefined} />
          <DateFilter label="Đến ngày" value={to} onChange={setTo} min={from || undefined} />
          {canManage && (
            <Button className="md:ms-auto" onClick={() => setEditing('new')}>
              <Plus />
              Thêm nhà cung cấp
            </Button>
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={debouncedSearch ? 'Không tìm thấy nhà cung cấp phù hợp' : 'Chưa có nhà cung cấp nào'}
        />
      </Card>
      <SupplierDialog supplier={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | 'new' | null; onClose: () => void }) {
  const saveMut = useSaveSupplier();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<SupplierForm>({ resolver: zodResolver(supplierSchema), defaultValues: EMPTY });
  const active = useWatch({ control, name: 'active' });

  const load = (s: Supplier | null) => {
    reset(s ? { name: s.name, phone: s.phone, email: s.email, address: s.address, note: s.note, active: s.active } : EMPTY);
    setVersion(s?.version ?? 0);
  };

  useEffect(() => {
    if (supplier) {
      load(supplier === 'new' ? null : supplier);
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  const onSubmit = handleSubmit(async (values) => {
    setNotice(null);
    try {
      const saved = await saveMut.mutateAsync({
        ...values,
        id: supplier === 'new' ? undefined : supplier?.id,
        version: supplier === 'new' ? undefined : version,
      } as SupplierForm & { id?: string; version?: number } as Parameters<typeof saveMut.mutateAsync>[0]);
      toast.success(`Đã lưu ${saved.name}`);
      onClose();
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Supplier>(e);
      if (problem?.code === 'version_conflict' && latest) {
        load(latest);
        setNotice({ severity: 'warning', msg: 'Nhà cung cấp vừa được người khác sửa. Form đã hiện bản mới nhất.' });
        return;
      }
      let placed = 0;
      for (const [path, message] of Object.entries(problem?.errors ?? {})) {
        if (path in EMPTY) {
          setError(path as keyof SupplierForm, { message });
          placed++;
        }
      }
      if (!placed) setNotice({ severity: 'error', msg: getErrorMessage(e) });
    }
  });

  const busy = saveMut.isPending;
  const field = (name: 'name' | 'phone' | 'email', label: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`sup-${name}`}>{label}</Label>
      <Input id={`sup-${name}`} aria-invalid={Boolean(errors[name])} {...register(name)} />
      {errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Dialog open={supplier !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier === 'new' ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}</DialogTitle>
        </DialogHeader>
        {notice && <AlertMessage severity={notice.severity}>{notice.msg}</AlertMessage>}
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          {field('name', 'Tên nhà cung cấp')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('phone', 'Điện thoại')}
            {field('email', 'Email')}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sup-address">Địa chỉ</Label>
            <Input id="sup-address" {...register('address')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sup-note">Ghi chú</Label>
            <Textarea id="sup-note" rows={2} {...register('note')} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={(v) => setValue('active', v, { shouldDirty: true })} />
            Đang giao dịch (tắt thì không lập đề nghị mới với NCC này)
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Huỷ
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
