import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowLeft, ImageIcon, ListChecks, Save, Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePricelist, usePricelistItems, useSavePrices } from '@/api/pricing.api';
import { useCategories } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { cn } from '@/lib/utils';
import type { PricelistItem } from '@/types/pricing';
import { BulkPriceDialog } from './BulkPriceDialog';
import { parsePrice, priceText } from './shared';

type Row = PricelistItem & { current: number | null };

const editText = (value: number | null) => (value === null ? '' : value.toLocaleString('vi-VN'));

interface PriceCellProps {
  row: Row;
  /** Chữ người dùng gõ mà chưa hợp lệ; giữ ở trang để đổi trang, lọc không mất */
  invalidText: string | undefined;
  error: string | undefined;
  placeholder: string;
  onValid: (variantId: string, price: number | null) => void;
  onInvalid: (variantId: string, text: string, error: string) => void;
}

/** Ô giá: kiểm ngay khi gõ, giá hợp lệ vào bản nháp, giá sai báo lỗi dưới ô (AC-G6, AC-G7) */
function PriceCell({ row, invalidText, error, placeholder, onValid, onInvalid }: PriceCellProps) {
  const [text, setText] = useState(invalidText ?? editText(row.current));
  const [focused, setFocused] = useState(false);

  // Giá đổi từ ngoài (sửa hàng loạt, nạp lại, huỷ thay đổi) khi không gõ dở
  const current = row.current;
  useEffect(() => {
    if (!focused && invalidText === undefined) setText(editText(current));
  }, [current, focused, invalidText]);

  return (
    <div className="grid gap-1">
      <div className="relative">
        <Input
          value={text}
          inputMode="numeric"
          placeholder={placeholder}
          aria-label={`Giá ${row.sku}`}
          aria-invalid={Boolean(error)}
          data-price-input={row.variantId}
          className="h-8 pe-6 text-right"
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const parsed = parsePrice(next);
            if (parsed.ok) onValid(row.variantId, parsed.value);
            else onInvalid(row.variantId, next, parsed.error);
          }}
        />
        <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          đ
        </span>
      </div>
      {error && (
        <p className="text-xs text-destructive" data-testid="price-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** UC-CP-03 bước 4–10: xem và sửa giá từng biến thể; thay đổi giữ ở bản nháp tới khi bấm Lưu */
export function PricelistDetailPage() {
  const { pricelistId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.pricelistManage);

  const plQuery = usePricelist(pricelistId);
  const itemsQuery = usePricelistItems(pricelistId);
  const categories = useCategories().data ?? [];
  const saveMut = useSavePrices();
  const pricelist = plQuery.data;
  const isChannel = pricelist?.type === 'channel';

  /** variantId → giá mới (null là bỏ giá) */
  const [draft, setDraft] = useState<Map<string, number | null>>(new Map());
  /** Ô đang gõ dở chưa hợp lệ: variantId → chữ và lỗi */
  const [invalid, setInvalid] = useState<Map<string, { text: string; error: string }>>(new Map());
  /** Lỗi BE trả theo dòng: errors["items.<variantId>"] (AC-G9) */
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const dirty = draft.size > 0 || invalid.size > 0;

  // Rời trang khi còn giá chưa lưu: hỏi trước (đổi route và đóng tab) (AC-G11)
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
    (variantId: string) => (draft.has(variantId) ? draft.get(variantId)! : (original.get(variantId) ?? null)),
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
      const clear = <T,>(prev: Map<string, T>) => {
        const next = new Map(prev);
        changes.forEach((_, variantId) => next.delete(variantId));
        return next.size === prev.size ? prev : next;
      };
      setInvalid(clear);
      setRowErrors(clear);
    },
    [original],
  );

  const onValid = useCallback(
    (variantId: string, price: number | null) => applyChanges(new Map([[variantId, price]])),
    [applyChanges],
  );
  const onInvalid = useCallback((variantId: string, text: string, error: string) => {
    setInvalid((prev) => new Map(prev).set(variantId, { text, error }));
  }, []);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((i) => ({ ...i, current: current(i.variantId) }))
      .filter(
        (r) =>
          (!q || r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)) &&
          (!categoryId || r.categoryId === categoryId) &&
          (!onlyMissing || r.current === null) &&
          (!onlyChanged || draft.has(r.variantId) || invalid.has(r.variantId) || rowErrors.has(r.variantId)),
      );
  }, [items, current, search, categoryId, onlyMissing, onlyChanged, draft, invalid, rowErrors]);

  // Phân trang tại chỗ: API trả cả bảng (docs/21 mục 6)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const selectedRows = useMemo(() => items.filter((i) => selection.has(i.variantId)), [items, selection]);
  const allFilteredSelected = rows.length > 0 && rows.every((r) => selection.has(r.variantId));
  const someFilteredSelected = rows.some((r) => selection.has(r.variantId));

  const pricedCount = items.filter((i) => current(i.variantId) !== null).length;

  const save = async () => {
    if (!pricelist || !draft.size) return;
    if (invalid.size) {
      setOnlyChanged(true);
      setPage(1);
      toast.error(`Còn ${invalid.size} ô giá chưa hợp lệ, sửa trước khi lưu`);
      return;
    }
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
      toast.success(`Đã lưu ${n} giá của ${saved.name}`);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict') {
        // Nạp giá mới nhất nhưng giữ bản nháp để người dùng kiểm lại (AC-G10)
        await Promise.all([plQuery.refetch(), itemsQuery.refetch()]);
        toast.warning(
          'Bảng giá vừa được người khác sửa. Đã nạp giá mới nhất, thay đổi của bạn vẫn giữ: kiểm lại rồi bấm Lưu.',
        );
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
        setPage(1);
        toast.error(`${byRow.size} giá chưa hợp lệ, xem cột Ghi chú`);
      } else {
        toast.error(errors.items ?? problemMessage(e));
      }
    }
  };

  const discard = () => {
    setDraft(new Map());
    setInvalid(new Map());
    setRowErrors(new Map());
    setDiscardOpen(false);
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const cols: ColumnDef<Row>[] = [];
    if (canManage) {
      cols.push({
        id: 'select',
        meta: { className: 'w-10' },
        header: () => (
          <Checkbox
            aria-label="Chọn tất cả dòng đang lọc"
            checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
            onCheckedChange={(v) =>
              setSelection((prev) => {
                const next = new Set(prev);
                rows.forEach((r) => (v === true ? next.add(r.variantId) : next.delete(r.variantId)));
                return next;
              })
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Chọn ${row.original.sku}`}
            checked={selection.has(row.original.variantId)}
            onCheckedChange={(v) =>
              setSelection((prev) => {
                const next = new Set(prev);
                if (v === true) next.add(row.original.variantId);
                else next.delete(row.original.variantId);
                return next;
              })
            }
          />
        ),
      });
    }
    cols.push(
      {
        id: 'product',
        header: 'Sản phẩm',
        meta: { className: 'min-w-56' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-9 rounded-md">
                {r.thumbnailUrl && <AvatarImage src={r.thumbnailUrl} alt={r.productName} className="object-cover" />}
                <AvatarFallback className="rounded-md">
                  <ImageIcon className="size-4 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{r.productName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.attributesLabel || 'Không có thuộc tính'}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        meta: { className: 'w-40 font-mono text-xs' },
      },
    );
    if (isChannel) {
      cols.push({
        id: 'standardPrice',
        header: 'Giá chuẩn',
        meta: { className: 'w-32 text-right whitespace-nowrap' },
        cell: ({ row }) => priceText(row.original.standardPrice),
      });
    }
    cols.push(
      {
        id: 'price',
        header: isChannel ? 'Giá gian hàng' : 'Giá bán',
        meta: { className: 'w-44 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          const placeholder = isChannel ? 'theo giá chuẩn' : 'chưa có giá';
          const changed = draft.has(r.variantId);
          const bad = invalid.get(r.variantId);
          const wrapper = cn(
            '-mx-2 rounded-md px-2 py-1',
            bad || rowErrors.has(r.variantId)
              ? 'bg-destructive/10'
              : changed && 'bg-warning/15 font-semibold',
          );
          if (!canManage) {
            return (
              <div className={wrapper}>
                {r.current !== null ? (
                  priceText(r.current)
                ) : (
                  <span className="text-muted-foreground italic">{placeholder}</span>
                )}
              </div>
            );
          }
          return (
            <div className={wrapper} data-dirty={changed || undefined}>
              <PriceCell
                row={r}
                invalidText={bad?.text}
                error={bad?.error}
                placeholder={placeholder}
                onValid={onValid}
                onInvalid={onInvalid}
              />
            </div>
          );
        },
      },
      {
        id: 'note',
        header: 'Ghi chú',
        meta: { className: 'min-w-40' },
        cell: ({ row }) => {
          const r = row.original;
          const err = rowErrors.get(r.variantId);
          if (err) return <span className="text-destructive" data-testid="row-error">{err}</span>;
          if (!draft.has(r.variantId)) return null;
          return <span className="text-muted-foreground">Trước: {priceText(original.get(r.variantId) ?? null)}</span>;
        },
      },
    );
    return cols;
  }, [
    canManage,
    isChannel,
    draft,
    invalid,
    rowErrors,
    original,
    selection,
    rows,
    allFilteredSelected,
    someFilteredSelected,
    onValid,
    onInvalid,
  ]);

  const backToList = () => navigate(ROUTES.company.pricing(companyId));

  if (plQuery.isError) {
    return (
      <div className="grid justify-items-start gap-4">
        <AlertMessage severity="error">{getErrorMessage(plQuery.error)}</AlertMessage>
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft />
          Về danh sách bảng giá
        </Button>
      </div>
    );
  }

  const filtered = Boolean(search.trim() || categoryId || onlyMissing || onlyChanged);

  return (
    <div>
      <PageHeader
        title={pricelist?.name ?? 'Bảng giá'}
        subtitle={
          !pricelist
            ? undefined
            : pricelist.type === 'standard'
              ? 'Bảng giá chuẩn, áp dụng mặc định cho mọi đơn.'
              : pricelist.shop
                ? `Giá riêng cho gian hàng ${pricelist.shop.shopName} (${PLATFORM_LABELS[pricelist.shop.platform]}); ô trống lấy giá chuẩn.`
                : 'Gian hàng của bảng giá này đã bị xoá.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={backToList}>
              <ArrowLeft />
              Danh sách
            </Button>
            {canManage && (
              <>
                <Button
                  variant="outline"
                  disabled={!dirty || saveMut.isPending}
                  onClick={() => setDiscardOpen(true)}
                >
                  <Undo2 />
                  Huỷ thay đổi
                </Button>
                <Button disabled={!draft.size || saveMut.isPending || !pricelist} onClick={save}>
                  <Save />
                  {saveMut.isPending
                    ? 'Đang lưu...'
                    : draft.size
                      ? `Lưu ${draft.size} thay đổi`
                      : 'Lưu thay đổi'}
                </Button>
              </>
            )}
          </div>
        }
      />

      {!canManage && (
        <AlertMessage severity="info" className="mb-4">
          Bạn chỉ có quyền xem bảng giá.
        </AlertMessage>
      )}
      {itemsQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(itemsQuery.error)}
        </AlertMessage>
      )}

      {canManage && selection.size > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info/10 px-4 py-2 text-sm"
          role="status"
        >
          <span>Đã chọn {selection.size} biến thể</span>
          <div className="ms-auto flex gap-2">
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <ListChecks />
              Sửa giá hàng loạt
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelection(new Set())}>
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="Tìm theo tên sản phẩm hoặc SKU..."
          />
          <FilterSelect
            label="Danh mục"
            value={categoryId}
            onChange={withReset(setCategoryId)}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex items-center gap-2 md:h-9">
            <Switch id="only-missing" checked={onlyMissing} onCheckedChange={withReset(setOnlyMissing)} />
            <Label htmlFor="only-missing">{isChannel ? 'Chưa có giá riêng' : 'Chưa có giá'}</Label>
          </div>
          {canManage && (
            <div className="flex items-center gap-2 md:h-9">
              <Switch id="only-changed" checked={onlyChanged} onCheckedChange={withReset(setOnlyChanged)} />
              <Label htmlFor="only-changed">Đã sửa</Label>
            </div>
          )}
          <Badge variant="outline" className="md:ms-auto md:mb-2" data-testid="priced-summary">
            Đã gán giá {pricedCount} / {items.length}
          </Badge>
        </FilterBar>
        <DataTable
          columns={columns}
          data={pageRows}
          getRowId={(r) => r.variantId}
          loading={itemsQuery.isLoading || plQuery.isLoading}
          fetching={itemsQuery.isFetching}
          empty={items.length || filtered ? 'Không có biến thể khớp bộ lọc' : 'Công ty chưa có biến thể đang bán'}
          pagination={{
            page: safePage,
            pageSize,
            total: rows.length,
            pageSizes: [25, 50, 100],
            onChange: (p, size) => {
              setPage(size === pageSize ? p : 1);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <BulkPriceDialog
        open={bulkOpen}
        rows={selectedRows}
        isChannel={isChannel}
        current={current}
        onClose={() => setBulkOpen(false)}
        onApply={({ changes }) => {
          applyChanges(changes);
          setBulkOpen(false);
          toast.success(`Đã đổi ${changes.size} giá. Bấm Lưu để ghi lại.`);
        }}
      />
      <ConfirmDialog
        open={discardOpen}
        title="Huỷ thay đổi?"
        message={`Bỏ ${draft.size + invalid.size} giá chưa lưu và quay về giá đang áp dụng.`}
        confirmLabel="Huỷ thay đổi"
        cancelLabel="Giữ lại"
        destructive
        onConfirm={discard}
        onClose={() => setDiscardOpen(false)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message={`Còn ${draft.size + invalid.size} giá chưa lưu sẽ bị bỏ.`}
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
