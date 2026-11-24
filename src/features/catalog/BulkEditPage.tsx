import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { EditableGrid, type EditableGridApi, type GridColumn, type SaveResult } from '@/components/common/EditableGrid';
import { parseVariantField, reorderVersionAfterSave, type SkuVersions } from './variantCells';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { fetchBulkRow, useBulkEditCache, useBulkEditRows, useGroups, useSaveBulkCells } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { useSaveGuard } from '@/hooks/useSaveGuard';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency } from '@/utils/format';
import type { BulkEditRow, BulkField, BulkSaveResult, BulkSaveRow } from '@/types/catalog';

const FIELD_LABELS: Record<BulkField, string> = {
  standardPrice: 'Giá chuẩn',
  targetNetPrice: 'Giá muốn thực nhận',
  minQty: 'Ngưỡng tồn',
  weightG: 'Khối lượng (g)',
  lengthMm: 'Dài (mm)',
  widthMm: 'Rộng (mm)',
  heightMm: 'Cao (mm)',
};
const FIELDS = Object.keys(FIELD_LABELS) as BulkField[];
const FIELD_HELP: Partial<Record<BulkField, string>> = {
  standardPrice: 'Giá chuẩn của SKU (VND). Gợi ý tính từ giá nhập gần nhất nhân hệ số lãi (theo danh mục sản phẩm hoặc công ty).',
  targetNetPrice:
    'Số tiền muốn nhận về mỗi món sau phí sàn (VND); giá niêm yết từng sàn tính ngược từ số này. Gợi ý: giá nhập gần nhất × hệ số lãi, hoặc theo SKU cùng sản phẩm.',
  minQty: 'Số có thể bán xuống tới số này thì gợi ý nhập hàng. Gợi ý tính từ tốc độ bán, số ngày nhà cung cấp giao và tồn dự phòng.',
  weightG: 'Dùng tính phí vận chuyển. Gợi ý lấy theo SKU cùng sản phẩm gần nhất.',
};

const showNumber = (field: BulkField, n: number) =>
  field === 'standardPrice' || field === 'targetNetPrice' ? formatCurrency(n) : n.toLocaleString('vi-VN');

const failureText = (f: BulkSaveResult['failed'][number], field: BulkField) => f.errors?.[field] ?? f.message;

/** FE#155 (US-SP-04), FE#475: sửa nhiều SKU trực tiếp từng ô, lưu ngay; gợi ý của BE chỉ được lưu khi người dùng nhận */
export function BulkEditPage({ onExit }: { onExit: () => void }) {
  const can = useCan();
  const canReorder = can(PERMISSIONS.reorderManage);
  const canEdit = can(PERMISSIONS.productManage);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [groupId, setGroupId] = useState('');
  const [incomplete, setIncomplete] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const grid = useRef<EditableGridApi>(null);

  const params = {
    page,
    pageSize,
    search: debouncedSearch || undefined,
    groupId: groupId || undefined,
    incomplete: incomplete || undefined,
  };
  const query = useBulkEditRows(params);
  const cache = useBulkEditCache();
  // Bộ lọc vẫn lọc được theo nhóm chuẩn đã ẩn (Documents/25 E182)
  const groups = useGroups({ includeHidden: true });
  const saveCells = useSaveBulkCells();
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const waitingToLeave = useSaveGuard(busy || applying);

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
      setSelected(new Set());
    };

  const acceptable = (row: BulkEditRow) =>
    FIELDS.filter((f) => {
      const s = row.suggestions[f];
      return s && s.value !== row.current[f] && (f !== 'minQty' || canReorder);
    });

  const selectedRows = rows.filter((r) => selected.has(r.variantId));
  // Chưa chọn dòng nào thì áp cho mọi SKU trên trang (KB2 2.10: nút từng mờ khi chưa chọn)
  const suggestTargets = selected.size ? selectedRows : rows;
  const selectedSuggestions = suggestTargets.reduce((n, r) => n + acceptable(r).length, 0);

  /**
   * Một ô: một dòng gửi PATCH bulk. Version (cả `reorderVersion` của ngưỡng tồn) lấy từ dòng đang hiện hoặc lượt trước
   * cùng dòng, không đọc lại trước khi gửi: người khác vừa sửa thì BE trả xung đột thay vì ghi đè
   */
  const save = async (row: BulkEditRow, columnId: string, value: unknown, v: SkuVersions): Promise<SaveResult<SkuVersions>> => {
    const field = columnId as BulkField;
    const body: BulkSaveRow = { variantId: row.variantId, version: v.version, [field]: value as number | null };
    if (field === 'minQty') body.reorderVersion = v.reorderVersion ?? null;
    const result = await saveCells.mutateAsync({ rows: [body] });
    const failed = result.failed[0];
    if (failed) {
      return failed.code === 'version_conflict'
        ? { ok: false, conflict: true, error: `${failed.errors?.[field] ?? 'Người khác vừa sửa SKU này'}. Tải lại dòng rồi lưu lại.` }
        : { ok: false, error: failureText(failed, field) };
    }
    const saved = result.saved.find((s) => s.variantId === row.variantId);
    const next: SkuVersions = {
      version: saved?.version ?? v.version + 1,
      reorderVersion: field === 'minQty' ? reorderVersionAfterSave(v.reorderVersion) : v.reorderVersion,
    };
    cache.patch(row.variantId, (r) => ({
      ...r,
      version: next.version,
      reorderVersion: next.reorderVersion ?? null,
      current: { ...r.current, [field]: value as number | null },
    }));
    return { ok: true, version: next };
  };

  const reloadRow = async (row: BulkEditRow) => {
    const fresh = await fetchBulkRow(row.variantId, row.sku);
    if (fresh) cache.replace(fresh);
    else await query.refetch();
  };

  /** "Áp gợi ý": một lần lưu cho mọi dòng; lỗi hiện trên từng ô theo `failed[].errors` */
  const applySuggestions = async () => {
    setApplying(true);
    try {
      // Đọc lại để có version, reorderVersion mới nhất của các dòng
      const fresh = (await query.refetch()).data?.items ?? [];
      const ids = new Set(suggestTargets.map((r) => r.variantId));
      const payload: { row: BulkEditRow; body: BulkSaveRow; fields: BulkField[] }[] = [];
      for (const row of fresh) {
        if (!ids.has(row.variantId)) continue;
        const fields = acceptable(row);
        if (!fields.length) continue;
        const body: BulkSaveRow = { variantId: row.variantId, version: row.version };
        for (const f of fields) body[f] = row.suggestions[f]!.value;
        if (fields.includes('minQty')) body.reorderVersion = row.reorderVersion;
        payload.push({ row, body, fields });
      }
      if (!payload.length) return;
      const result = await saveCells.mutateAsync({ rows: payload.map((p) => p.body) });
      for (const s of result.saved) {
        const p = payload.find((x) => x.row.variantId === s.variantId);
        if (!p) continue;
        cache.patch(s.variantId, (r) => ({
          ...r,
          version: s.version,
          reorderVersion: p.fields.includes('minQty') ? reorderVersionAfterSave(p.body.reorderVersion) : r.reorderVersion,
          current: { ...r.current, ...Object.fromEntries(p.fields.map((f) => [f, p.body[f] ?? null])) },
        }));
        for (const f of p.fields) grid.current?.markSaved(s.variantId, f);
      }
      for (const f of result.failed) {
        const p = payload.find((x) => x.row.variantId === f.variantId);
        if (!p) continue;
        const fields = p.fields.filter((field) => f.errors?.[field]);
        for (const field of fields.length ? fields : p.fields) {
          grid.current?.setCellError(
            f.variantId,
            field,
            f.code === 'version_conflict' ? 'Người khác vừa sửa SKU này. Tải lại dòng rồi lưu lại.' : failureText(f, field),
            String(p.body[field] ?? ''),
            f.code === 'version_conflict',
          );
        }
      }
      const count = result.saved.reduce((n, s) => n + (payload.find((p) => p.row.variantId === s.variantId)?.fields.length ?? 0), 0);
      if (result.failed.length) toast.warning(`Đã lưu ${count} gợi ý, ${result.failed.length} SKU lỗi. Xem lỗi trên từng ô.`);
      else toast.success(`Đã lưu ${count} gợi ý`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setApplying(false);
    }
  };

  const columns = useMemo<GridColumn<BulkEditRow>[]>(() => {
    const pageIds = rows.map((r) => r.variantId);
    const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    const toggle = (id: string, on: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    const fieldColumn = (field: BulkField): GridColumn<BulkEditRow> => ({
      id: field,
      header: FIELD_LABELS[field],
      help: FIELD_HELP[field],
      numeric: true,
      className: field === 'standardPrice' || field === 'targetNetPrice' ? 'min-w-32' : 'min-w-24',
      render: (row) => {
        const v = row.current[field];
        return v === null ? <span className="text-muted-foreground">—</span> : showNumber(field, v);
      },
      edit: {
        raw: (row) => (row.current[field] === null ? '' : String(row.current[field])),
        parse: (raw) => parseVariantField(field, raw),
        readOnly: () => (field === 'minQty' && !canReorder ? 'Cần quyền đặt ngưỡng tồn' : false),
        extra: (row, { locked, save: saveRaw }) => {
          const s = row.suggestions[field];
          if (!s || s.value === row.current[field] || (field === 'minQty' && !canReorder)) return null;
          const label = `${FIELD_LABELS[field]} ${row.sku}`;
          return (
            <div className="mt-0.5 flex justify-end">
              <button
                type="button"
                disabled={locked}
                className="inline-flex items-center gap-1 rounded border border-info-border bg-info-soft px-1.5 py-0.5 text-xs text-info-text hover:border-info disabled:cursor-not-allowed disabled:opacity-60"
                title={locked ? `${s.basis}. Mở khoá để lưu gợi ý.` : s.basis}
                aria-label={`Lưu gợi ý ${label}: ${showNumber(field, s.value)}. ${s.basis}`}
                onClick={() => saveRaw(String(s.value))}
              >
                <span className="font-medium">gợi ý</span>
                <span className="tabular-nums">{showNumber(field, s.value)}</span>
                <Check className="size-3" />
              </button>
            </div>
          );
        },
      },
    });
    return [
      {
        id: 'sku',
        header: 'SKU',
        sticky: true,
        className: 'min-w-64 max-w-80',
        headerContent: (
          <span className="flex items-center gap-2">
            <Checkbox
              className="size-6"
              aria-label="Chọn mọi SKU trên trang"
              checked={allOnPage}
              onCheckedChange={(v) => {
                for (const id of pageIds) toggle(id, Boolean(v));
              }}
            />
            SKU
          </span>
        ),
        render: (r) => (
          <div className="flex items-start gap-2 whitespace-normal">
            {/* Ô chọn 24×24 (vùng bấm tối thiểu, FE#464) */}
            <Checkbox
              className="mt-0.5 size-6"
              aria-label={`Chọn ${r.sku}`}
              checked={selected.has(r.variantId)}
              onCheckedChange={(v) => toggle(r.variantId, Boolean(v))}
            />
            <div className="grid gap-0.5">
              <span className="font-medium">{r.productName}</span>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{r.sku}</span>
                {r.attributesLabel && ` · ${r.attributesLabel}`} · {r.groupName}
              </span>
              {r.source && (
                <span className="text-xs text-muted-foreground" data-testid="bulk-source">
                  Từ {r.source.purchaseRequestNumber} · {r.source.supplierName}
                  {r.source.lastCost !== null && ` · giá nhập ${formatCurrency(r.source.lastCost)}`}
                </span>
              )}
            </div>
          </div>
        ),
      },
      ...FIELDS.map(fieldColumn),
    ];
  }, [rows, selected, canReorder]);

  return (
    <div>
      <PageHeader
        title="Sửa hàng loạt"
        subtitle="Sửa giá chuẩn, ngưỡng tồn, khối lượng và kích thước của nhiều SKU ngay trong bảng. Mỗi ô lưu ngay khi bấm Enter."
        help="Bảng mặc định khoá để không sửa nhầm khi cuộn; bấm Khoá sửa (Ctrl+E) để mở. Ô có nhãn gợi ý chỉ được lưu khi bạn bấm gợi ý hoặc áp dụng. Ô lỗi giữ nguyên số đã gõ, các ô khác vẫn lưu."
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
      {waitingToLeave && (
        <AlertMessage severity="info" className="mb-4">
          Đang lưu nốt các ô vừa sửa, xong sẽ tự chuyển trang.
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm theo tên hoặc SKU..." />
          <FilterSelect
            loading={groups.isLoading}
            label="Danh mục sản phẩm"
            value={groupId}
            onChange={withReset(setGroupId)}
            options={(groups.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex h-9 items-center gap-2">
            <Switch id="bulk-incomplete" checked={incomplete} onCheckedChange={withReset(setIncomplete)} />
            <Label htmlFor="bulk-incomplete">Chỉ SKU thiếu thông tin</Label>
          </div>
        </FilterBar>
        <EditableGrid
          gridId="catalog-bulk-edit"
          aria-label="Sửa hàng loạt SKU"
          apiRef={grid}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.variantId}
          rowLabel={(r) => r.sku}
          getVersion={(r): SkuVersions => ({ version: r.version, reorderVersion: r.reorderVersion })}
          save={save}
          reloadRow={reloadRow}
          canEdit={canEdit}
          onBusyChange={setBusy}
          selectedCount={selected.size}
          isRowSelected={(r) => selected.has(r.variantId)}
          loading={query.isLoading}
          fetching={query.isFetching && !applying}
          empty={incomplete ? 'Mọi SKU đã đủ thông tin' : 'Không tìm thấy SKU phù hợp'}
          actions={
            canEdit && (
              <Button variant="outline" size="sm" disabled={selectedSuggestions === 0 || applying || busy} onClick={() => void applySuggestions()}>
                {applying ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {selected.size ? 'Áp gợi ý cho SKU đã chọn' : 'Áp mọi gợi ý trên trang'}
                {selectedSuggestions > 0 && ` (${selectedSuggestions})`}
              </Button>
            )
          }
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
    </div>
  );
}
