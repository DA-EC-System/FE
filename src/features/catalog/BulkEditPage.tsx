import { useEffect, useMemo, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Save, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBulkEditRows, useBulkSaveVariants, useCategories } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency } from '@/utils/format';
import { cn } from '@/lib/utils';
import type { BulkEditRow, BulkField, BulkSaveResult, BulkSaveRow } from '@/types/catalog';

const FIELD_LABELS: Record<BulkField, string> = {
  standardPrice: 'Giá chuẩn',
  minQty: 'Ngưỡng tồn',
  weightG: 'Khối lượng (g)',
  lengthMm: 'Dài (mm)',
  widthMm: 'Rộng (mm)',
  heightMm: 'Cao (mm)',
};
const FIELDS = Object.keys(FIELD_LABELS) as BulkField[];
const FIELD_HELP: Partial<Record<BulkField, string>> = {
  standardPrice: 'Giá bán chuẩn của SKU (VND). Gợi ý tính từ giá nhập gần nhất nhân hệ số của danh mục.',
  minQty: 'Tồn khả dụng xuống tới số này thì gợi ý nhập lại. Gợi ý tính từ tốc độ bán, số ngày NCC giao và tồn dự phòng.',
  weightG: 'Dùng tính phí vận chuyển. Gợi ý lấy theo SKU cùng sản phẩm gần nhất.',
};

/** Ô người dùng đã sửa hoặc đã nhận gợi ý, giữ chuỗi gốc để báo lỗi đúng chỗ */
interface Draft {
  version: number;
  reorderVersion: number | null;
  values: Partial<Record<BulkField, string>>;
}
type RowError = BulkSaveResult['failed'][number];

const showNumber = (field: BulkField, n: number) =>
  field === 'standardPrice' ? formatCurrency(n) : n.toLocaleString('vi-VN');

/** "" là xoá giá trị; còn lại phải là số nguyên dương. Cho gõ dấu chấm ngăn nghìn */
function parseCell(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim().replace(/[.\s]/g, '');
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t) || Number(t) <= 0) return { ok: false };
  return { ok: true, value: Number(t) };
}

/** FE#155 (US-SP-04): sửa nhiều SKU một lần; gợi ý của BE chỉ được lưu khi người dùng nhận */
export function BulkEditPage({ onExit }: { onExit: () => void }) {
  const can = useCan();
  const canReorder = can(PERMISSIONS.reorderManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [incomplete, setIncomplete] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, RowError>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useBulkEditRows({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    incomplete: incomplete || undefined,
  });
  const categories = useCategories();
  const save = useBulkSaveVariants();
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);

  const dirtyIds = Object.keys(drafts);
  const dirty = dirtyIds.length > 0;
  const invalid = useMemo(
    () =>
      Object.values(drafts).some((d) => Object.values(d.values).some((raw) => raw !== undefined && !parseCell(raw).ok)),
    [drafts],
  );

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
      setSelected(new Set());
    };

  const setCell = (row: BulkEditRow, field: BulkField, raw: string) => {
    setDrafts((prev) => {
      const d = prev[row.variantId] ?? { version: row.version, reorderVersion: row.reorderVersion, values: {} };
      const values = { ...d.values };
      const current = row.current[field];
      // Gõ lại đúng số cũ thì coi như không sửa
      const parsed = parseCell(raw);
      if (parsed.ok && parsed.value === current) delete values[field];
      else values[field] = raw;
      const next = { ...prev };
      if (Object.keys(values).length) next[row.variantId] = { ...d, values };
      else delete next[row.variantId];
      return next;
    });
  };

  const acceptable = (row: BulkEditRow) =>
    FIELDS.filter(
      (f) => row.suggestions[f] && drafts[row.variantId]?.values[f] === undefined && (f !== 'minQty' || canReorder),
    );

  const acceptSuggestions = (targets: BulkEditRow[]) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of targets) {
        const d = next[row.variantId] ?? { version: row.version, reorderVersion: row.reorderVersion, values: {} };
        const values = { ...d.values };
        for (const f of FIELDS) {
          const s = row.suggestions[f];
          if (!s || values[f] !== undefined || (f === 'minQty' && !canReorder)) continue;
          values[f] = String(s.value);
        }
        if (Object.keys(values).length) next[row.variantId] = { ...d, values };
      }
      return next;
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.variantId));
  const selectedSuggestions = selectedRows.reduce((n, r) => n + acceptable(r).length, 0);

  const submit = async () => {
    const payload: BulkSaveRow[] = Object.entries(drafts).map(([variantId, d]) => {
      const row: BulkSaveRow = { variantId, version: d.version };
      for (const [f, raw] of Object.entries(d.values) as [BulkField, string][]) {
        const parsed = parseCell(raw);
        if (parsed.ok) row[f] = parsed.value;
      }
      if ('minQty' in row) row.reorderVersion = d.reorderVersion;
      return row;
    });
    try {
      const result = await save.mutateAsync(payload);
      const savedIds = new Set(result.saved.map((s) => s.variantId));
      setDrafts((prev) => {
        const next: Record<string, Draft> = {};
        for (const [id, d] of Object.entries(prev)) {
          if (savedIds.has(id)) continue;
          const failure = result.failed.find((f) => f.variantId === id);
          // Xung đột version: giữ số đã gõ, lấy version mới khi bảng tải lại
          next[id] = failure?.code === 'version_conflict' ? { ...d, version: -1 } : d;
        }
        return next;
      });
      setRowErrors(Object.fromEntries(result.failed.map((f) => [f.variantId, f])));
      if (result.failed.length) {
        toast.warning(`Đã lưu ${result.saved.length} SKU, ${result.failed.length} SKU lỗi. Xem lỗi trên từng dòng.`);
      } else {
        toast.success(`Đã lưu ${result.saved.length} SKU`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // Sau khi bảng tải lại, dòng xung đột nhận version mới để lưu lại được
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of rows) {
        const d = next[row.variantId];
        if (d && d.version === -1) {
          next[row.variantId] = { ...d, version: row.version, reorderVersion: row.reorderVersion };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
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

  const columns = useMemo<ColumnDef<BulkEditRow>[]>(() => {
    const pageIds = rows.map((r) => r.variantId);
    const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    const fieldColumn = (field: BulkField): ColumnDef<BulkEditRow> => ({
      id: field,
      header: FIELD_LABELS[field],
      meta: { className: field === 'standardPrice' ? 'min-w-36' : 'min-w-28', numeric: true, help: FIELD_HELP[field] },
      cell: ({ row }) => (
        <BulkCell
          row={row.original}
          field={field}
          raw={drafts[row.original.variantId]?.values[field]}
          error={rowErrors[row.original.variantId]?.errors?.[field]}
          readOnly={field === 'minQty' && !canReorder}
          onChange={(raw) => setCell(row.original, field, raw)}
        />
      ),
    });
    return [
      {
        id: 'select',
        header: () => (
          <Checkbox
            aria-label="Chọn mọi SKU trên trang"
            checked={allOnPage}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of pageIds) {
                  if (v) next.add(id);
                  else next.delete(id);
                }
                return next;
              })
            }
          />
        ),
        meta: { className: 'w-10' },
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Chọn ${row.original.sku}`}
            checked={selected.has(row.original.variantId)}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (v) next.add(row.original.variantId);
                else next.delete(row.original.variantId);
                return next;
              })
            }
          />
        ),
      },
      {
        id: 'sku',
        header: 'SKU',
        meta: { className: 'min-w-64' },
        cell: ({ row }) => {
          const r = row.original;
          const failure = rowErrors[r.variantId];
          return (
            <div className="grid gap-0.5">
              <span className="font-medium">{r.productName}</span>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{r.sku}</span>
                {r.attributesLabel && ` · ${r.attributesLabel}`} · {r.categoryName}
              </span>
              {r.source && (
                <span className="text-xs text-muted-foreground" data-testid="bulk-source">
                  Từ {r.source.purchaseRequestNumber} · {r.source.supplierName}
                  {r.source.lastCost !== null && ` · giá nhập ${formatCurrency(r.source.lastCost)}`}
                </span>
              )}
              {failure && (
                <span className="text-xs text-destructive-text" role="alert" data-testid="bulk-row-error">
                  {failure.message}
                </span>
              )}
            </div>
          );
        },
      },
      ...FIELDS.map(fieldColumn),
    ];
  }, [rows, selected, drafts, rowErrors, canReorder]);

  return (
    <div>
      <PageHeader
        title="Sửa hàng loạt"
        subtitle="Sửa giá, ngưỡng tồn, khối lượng và kích thước của nhiều SKU rồi lưu một lần."
        help="Ô có nhãn gợi ý chỉ được lưu khi bạn bấm nhận. Dòng lỗi giữ nguyên số đã gõ, các dòng khác vẫn lưu."
        action={
          <Button variant="outline" onClick={onExit}>
            <ArrowLeft />
            Về danh sách
          </Button>
        }
      />

      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm theo tên hoặc SKU..." />
          <FilterSelect
            loading={categories.isLoading}
            label="Danh mục"
            value={categoryId}
            onChange={withReset(setCategoryId)}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex h-9 items-center gap-2">
            <Switch id="bulk-incomplete" checked={incomplete} onCheckedChange={withReset(setIncomplete)} />
            <Label htmlFor="bulk-incomplete">Chỉ SKU còn trống ô</Label>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {selected.size > 0 && <span className="text-sm text-muted-foreground">Đã chọn {selected.size} SKU</span>}
            <Button
              variant="outline"
              disabled={selectedSuggestions === 0}
              onClick={() => {
                acceptSuggestions(selectedRows);
                toast.success(`Đã nhận ${selectedSuggestions} gợi ý, bấm Lưu để ghi`);
              }}
            >
              <Sparkles />
              Nhận gợi ý cho SKU đã chọn{selectedSuggestions > 0 && ` (${selectedSuggestions})`}
            </Button>
          </div>
        </FilterBar>
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.variantId}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={incomplete ? 'Mọi SKU đã đủ thông tin' : 'Không tìm thấy SKU phù hợp'}
          rowClassName={(r) => cn(rowErrors[r.variantId] && 'bg-destructive-soft/40')}
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <div className="sticky bottom-0 z-20 mt-4 rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted-foreground" data-testid="bulk-dirty">
            {dirty ? `${dirtyIds.length} SKU có thay đổi chưa lưu` : 'Chưa có thay đổi'}
            {invalid && ' · còn ô chưa hợp lệ'}
          </span>
          <Button
            variant="ghost"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setDrafts({});
              setRowErrors({});
            }}
          >
            Bỏ thay đổi
          </Button>
          <Button disabled={!dirty || invalid || save.isPending} onClick={submit}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Lưu {dirty ? `${dirtyIds.length} SKU` : ''}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message="Các ô đã sửa và gợi ý đã nhận chưa được lưu sẽ bị bỏ."
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

function BulkCell({
  row,
  field,
  raw,
  error,
  readOnly,
  onChange,
}: {
  row: BulkEditRow;
  field: BulkField;
  raw: string | undefined;
  error?: string;
  readOnly: boolean;
  onChange: (raw: string) => void;
}) {
  const current = row.current[field];
  const suggestion = row.suggestions[field];
  const label = `${FIELD_LABELS[field]} ${row.sku}`;
  if (readOnly) {
    return (
      <span className="text-sm" title="Cần quyền đặt ngưỡng tồn">
        {current === null ? '—' : showNumber(field, current)}
      </span>
    );
  }
  const edited = raw !== undefined;
  const bad = edited && !parseCell(raw).ok;
  return (
    <div className="grid justify-items-end gap-1">
      <Input
        aria-label={label}
        inputMode="numeric"
        className={cn(
          'h-8 w-full min-w-20 text-right tabular-nums',
          edited && 'border-primary bg-accent',
          (bad || error) && 'border-destructive',
        )}
        value={edited ? raw : current === null ? '' : String(current)}
        placeholder="Trống"
        aria-invalid={bad || Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
      {suggestion && !edited && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-info-border bg-info-soft px-1.5 py-0.5 text-xs text-info-text hover:border-info"
          title={suggestion.basis}
          aria-label={`Nhận gợi ý ${label}: ${showNumber(field, suggestion.value)}. ${suggestion.basis}`}
          onClick={() => onChange(String(suggestion.value))}
        >
          <span className="font-medium">gợi ý</span>
          <span className="tabular-nums">{showNumber(field, suggestion.value)}</span>
          <Check className="size-3" />
        </button>
      )}
      {(bad || error) && <span className="text-xs text-destructive-text">{bad ? 'Số nguyên dương' : error}</span>}
    </div>
  );
}
