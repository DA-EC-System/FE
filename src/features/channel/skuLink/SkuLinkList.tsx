import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PaginationBar } from '@/components/common/DataTable';
import { FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useGroups } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { saveDraftSkuLinks, useApplySkuLinks, useRemoteProducts } from '@/api/setupDraft.api';
import { useShopListings } from '@/api/shops.api';
import { GroupCombobox } from '@/features/catalog/GroupCombobox';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/utils/permissions';
import type {
  CreateGroup,
  Decision,
  DecisionAction,
  DecisionFilter,
  RemoteProduct,
  RemoteSkuRow,
  SetupDraft,
  SetupDraftSaved,
  SkuLinkInput,
} from '@/types/setupDraft';
import { MatchDialog } from '../MatchDialog';
import { UNMANAGED, variantMatchOptions } from '../matchOptions';
import { CANNOT_CREATE_TEXT } from '../setupDecisions';
import {
  CONFIDENCE_LABELS,
  DECISION_LABELS,
  allSkus,
  createItems,
  decisionCounts,
  isOpenSku,
  resultSummaryText,
  suggestionLinks,
  suggestionText,
} from './skuLinkRows';

export interface SkuLinkListProps {
  shopId: string;
  /**
   * `draft`: gian hàng đang thiết lập, mỗi thay đổi ghi vào nháp (BE chọn theo trạng thái gian hàng, §18.12). `apply`: gian
   * hàng đang bán, liên kết và tạo SKU kho ngay
   */
  mode: 'draft' | 'apply';
  /** `setup_draft_version` đang giữ (chế độ nháp) */
  draftVersion?: number;
  /** Nháp đang giữ: bộ đếm và lựa chọn của từng dòng đọc từ đây (chế độ nháp) */
  draft?: SetupDraft | null;
  /** Mỗi lần ghi nháp xong, hoặc khi 409 trả bản mới nhất */
  onDraftSaved?: (draft: SetupDraft, draftVersion: number) => void;
  /** 409 `version_conflict`: nơi khác vừa sửa nháp */
  onConflict?: () => void;
  /** Hiện lựa chọn "Bỏ qua" (chế độ nháp) */
  showSkip?: boolean;
  /** Chế độ áp: mở hộp chọn SKU kho có xem trước của trang gọi */
  onPick?: (row: RemoteSkuRow) => void;
}

const PAGE_SIZES = [20, 50];

/** Giá trị ô "Quyết định" (Radix Select không nhận chuỗi rỗng) */
type DecisionValue = 'suggest' | 'link' | 'create' | 'skip' | 'unmanaged';

const DECISION_FILTERS: { value: DecisionFilter; label: string }[] = [
  { value: 'none', label: 'Chưa chọn' },
  { value: 'link', label: DECISION_LABELS.link },
  { value: 'create', label: DECISION_LABELS.create },
  { value: 'skip', label: DECISION_LABELS.skip },
  { value: 'unmanaged', label: DECISION_LABELS.unmanaged },
];

/**
 * Danh sách Liên kết SKU sàn dùng chung (Documents/21 §18.12, FE#460): tab "SKU sàn chưa liên kết" của trang gian hàng
 * (chế độ áp) và bước Liên kết SKU sàn của thiết lập (chế độ nháp). Gom theo sản phẩm sàn, phân trang ở BE, chọn nhiều dòng
 * để liên kết theo gợi ý hoặc tạo SKU kho (SKU cùng sản phẩm sàn thành một sản phẩm kho nhiều biến thể).
 */
export function SkuLinkList({ shopId, mode, draftVersion, draft, onDraftSaved, onConflict, showSkip = mode === 'draft', onPick }: SkuLinkListProps) {
  const can = useCan();
  const canCreateProducts = can(PERMISSIONS.productManage);
  const drafting = mode === 'draft';
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);
  const list = useRemoteProducts(shopId, {
    status: drafting ? 'all' : 'unlinked',
    search: q,
    ...(drafting && decisionFilter ? { decision: decisionFilter } : {}),
    page,
    pageSize,
  });
  const listings = useShopListings(shopId);
  const variants = useMemo(() => listings.data ?? [], [listings.data]);
  const skuOf = useMemo(() => new Map(variants.map((v) => [v.variantId, v.sku])), [variants]);
  const products = useMemo(() => list.data?.items ?? [], [list.data]);
  const rows = useMemo(() => allSkus(products), [products]);
  const productOf = useMemo(() => new Map(products.flatMap((p) => p.skus.map((s) => [s.externalSkuId, p.externalProductId] as const))), [products]);

  // Đổi trang, ô tìm, ô lọc thì bỏ chọn và về trang 1 (đổi lọc)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setPage(1), [q, decisionFilter]);
  useEffect(() => setSelected(new Set()), [q, decisionFilter, page, pageSize]);

  /** Lỗi theo dòng của lần ghi hoặc áp gần nhất */
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());

  // --- Chế độ nháp: lựa chọn vừa đổi giữ tại chỗ tới khi nháp mới về, ghi theo hàng đợi với draftVersion mới nhất
  const [local, setLocal] = useState<Map<string, Decision>>(new Map());
  const version = useRef(draftVersion ?? 0);
  useEffect(() => {
    if (draftVersion !== undefined && draftVersion > version.current) version.current = draftVersion;
  }, [draftVersion]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [writing, setWriting] = useState(0);

  const draftMap = useMemo(() => new Map((draft?.decisions ?? []).map((d) => [d.externalSkuId, d])), [draft]);
  const decisionOf = (r: RemoteSkuRow): Decision | null => {
    const d = local.get(r.externalSkuId) ?? draftMap.get(r.externalSkuId);
    if (d) return d;
    return r.decision ? { externalSkuId: r.externalSkuId, action: r.decision.action, variantId: r.decision.variantId } : null;
  };
  const merged = useMemo(() => {
    const m = new Map(draftMap);
    for (const [k, d] of local) m.set(k, d);
    return [...m.values()];
  }, [draftMap, local]);
  /** SKU kho đã được chọn cho một SKU sàn khác trong nháp */
  const takenVariants = useMemo(() => new Set(merged.flatMap((d) => (d.action === 'link' && d.variantId ? [d.variantId] : []))), [merged]);

  const writeDraft = (items: SkuLinkInput[]) => {
    if (!items.length) return;
    setLocal((prev) => {
      const next = new Map(prev);
      for (const it of items) next.set(it.externalSkuId, it);
      return next;
    });
    setRowErrors((prev) => {
      const next = new Map(prev);
      for (const it of items) next.delete(it.externalSkuId);
      return next;
    });
    setWriting((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        const res = await saveDraftSkuLinks(shopId, items, version.current);
        version.current = res.draftVersion;
        const failed = res.results.filter((r) => r.result === 'error');
        if (failed.length) {
          setRowErrors((prev) => new Map([...prev, ...failed.map((r) => [r.externalSkuId, r.message ?? 'Chưa lưu được lựa chọn này'] as const)]));
          setLocal((prev) => {
            const next = new Map(prev);
            for (const r of failed) next.delete(r.externalSkuId);
            return next;
          });
        }
        onDraftSaved?.(res.draft, res.draftVersion);
      } catch (e) {
        const p = getProblem(e);
        if (p?.code === 'version_conflict') {
          // Nơi khác vừa sửa nháp: nhận bản BE trả kèm 409, bỏ lựa chọn chưa lưu ở đây
          const cur = p.current as Partial<SetupDraftSaved> | undefined;
          if (cur?.draft && typeof cur.draftVersion === 'number') {
            version.current = cur.draftVersion;
            onDraftSaved?.(cur.draft, cur.draftVersion);
          }
          setLocal(new Map());
          toast.warning('Nháp vừa được sửa ở nơi khác. Đã nạp bản mới nhất, chọn lại các dòng vừa đổi.');
          onConflict?.();
        } else {
          setLocal((prev) => {
            const next = new Map(prev);
            for (const it of items) next.delete(it.externalSkuId);
            return next;
          });
          const fields = p?.status === 422 ? Object.values(p.errors ?? {})[0] : undefined;
          toast.error(`Chưa lưu được lựa chọn: ${fields ?? problemMessage(e)}`);
        }
      } finally {
        setWriting((n) => n - 1);
      }
    });
  };

  // --- Chế độ áp
  const applyMut = useApplySkuLinks(shopId);
  const applyNow = async (items: SkuLinkInput[], groups: CreateGroup[] = []) => {
    if (!items.length) return true;
    try {
      const results = await applyMut.mutateAsync({ items, groups, productOf: (id) => productOf.get(id) });
      const failed = results.filter((r) => r.result === 'error');
      setRowErrors(new Map(failed.map((r) => [r.externalSkuId, r.message ?? r.code ?? 'Chưa xong'] as const)));
      const text = resultSummaryText(results);
      if (failed.length) toast.warning(text);
      else toast.success(text);
      setSelected(new Set());
      return true;
    } catch (e) {
      const p = getProblem(e);
      toast.error(p?.status === 403 ? 'Tạo SKU kho mới cần quyền sửa sản phẩm. Nhờ Admin hoặc CEO, hoặc chọn SKU kho có sẵn.' : problemMessage(e));
      return false;
    }
  };

  const submit = (items: SkuLinkInput[]) => (drafting ? writeDraft(items) : void applyNow(items));

  // --- Hộp chọn SKU kho (chế độ nháp; chế độ áp dùng hộp của trang gọi nếu có)
  const [picking, setPicking] = useState<RemoteSkuRow | null>(null);
  const pickOptions = useMemo(() => {
    if (!picking) return [];
    const current = decisionOf(picking);
    const currentId = current?.action === 'link' ? current.variantId : null;
    return variantMatchOptions(
      variants.filter((v) => v.variantId === currentId || !takenVariants.has(v.variantId)),
      { title: picking.title, sellerSku: picking.sellerSku, isCeo: false },
    ).filter((o) => o.id !== UNMANAGED);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decisionOf đọc local/draftMap đã có trong takenVariants
  }, [picking, variants, takenVariants]);
  const pick = (r: RemoteSkuRow) => (drafting || !onPick ? setPicking(r) : onPick(r));

  // --- Tạo SKU kho ở chế độ áp: chọn danh mục sản phẩm cho từng sản phẩm sàn
  const [creating, setCreating] = useState<SkuLinkInput[] | null>(null);
  const startCreate = (items: SkuLinkInput[]) => (drafting ? writeDraft(items) : setCreating(items));

  const hasVariants = variants.length > 0;
  const openRows = rows.filter((r) => isOpenSku(r));
  const selectedRows = openRows.filter((r) => selected.has(r.externalSkuId));
  const confident = suggestionLinks(drafting ? openRows.filter((r) => !decisionOf(r)) : openRows, { onlyHigh: true, taken: takenVariants });
  const selLinks = suggestionLinks(selectedRows, { taken: takenVariants });
  const selCreates = canCreateProducts ? createItems(selectedRows) : [];
  const counts = drafting ? decisionCounts(merged, list.data?.counts.unlinked ?? 0) : null;
  const busy = applyMut.isPending;

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const pageIds = openRows.map((r) => r.externalSkuId);
  const allOn = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOn = pageIds.some((id) => selected.has(id));

  const data = list.data;
  const searching = q.trim().length >= 2 || Boolean(decisionFilter);

  return (
    <div className="grid gap-3" data-testid="sku-link-list">
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm tên, SKU người bán, mã SKU sàn..." className="min-w-56 flex-1" />
        {drafting && (
          <FilterSelect
            label="Lựa chọn"
            value={decisionFilter}
            onChange={(v) => setDecisionFilter(v as DecisionFilter | '')}
            options={DECISION_FILTERS}
          />
        )}
        {confident.length > 0 && (
          <Button type="button" onClick={() => submit(confident)} disabled={busy} data-testid="accept-confident">
            Chấp nhận {confident.length} gợi ý chắc chắn
          </Button>
        )}
      </div>

      {counts && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="decision-counts">
          <span>
            Đã liên kết <b>{counts.link}</b>
          </span>
          <span>
            Sẽ tạo khi hoàn tất <b>{counts.create}</b>
          </span>
          {showSkip && (
            <span>
              Bỏ qua <b>{counts.skip}</b>
            </span>
          )}
          {counts.unmanaged > 0 && (
            <span>
              Không quản tồn <b>{counts.unmanaged}</b>
            </span>
          )}
          <span className={cn(counts.none > 0 && 'text-warning-text')}>
            Chưa chọn <b>{counts.none}</b>
          </span>
          {writing > 0 && <span className="text-muted-foreground">Đang lưu…</span>}
        </p>
      )}
      {data?.nameMatchSkipped && (
        <AlertMessage severity="info">Gian hàng có quá nhiều SKU nên Commerio chỉ gợi ý khi trùng SKU người bán, không gợi ý theo tên.</AlertMessage>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="sku-bulk-bar">
          <span>
            Đã chọn <b>{selected.size}</b> SKU
          </span>
          {selLinks.length > 0 && (
            <Button type="button" size="sm" onClick={() => submit(selLinks)} disabled={busy}>
              Liên kết {selLinks.length} SKU theo gợi ý
            </Button>
          )}
          {selCreates.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => startCreate(selCreates)} disabled={busy}>
              Tạo sản phẩm kho từ {selCreates.length} SKU
            </Button>
          )}
          {drafting && showSkip && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => writeDraft(selectedRows.map((r) => ({ externalSkuId: r.externalSkuId, action: 'skip', variantId: null })))}
            >
              Bỏ qua {selectedRows.length} SKU
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      {list.isError ? (
        <AlertMessage severity="error">{problemMessage(list.error, 'remote_skus')}</AlertMessage>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Chọn mọi SKU trên trang"
                    checked={allOn ? true : someOn ? 'indeterminate' : false}
                    disabled={!pageIds.length}
                    onCheckedChange={(v) => toggle(pageIds, v === true)}
                  />
                </TableHead>
                <TableHead className="min-w-56">SKU sàn</TableHead>
                <TableHead className="w-20 text-end">Tồn sàn</TableHead>
                <TableHead className="min-w-48">Gợi ý</TableHead>
                <TableHead className="min-w-56">{drafting ? 'Lựa chọn' : 'Thao tác'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading || (data?.refresh?.status === 'running' && !data.syncedAt) ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Đang tải SKU sàn…
                  </TableCell>
                </TableRow>
              ) : !products.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground" data-testid="sku-link-empty">
                    {searching
                      ? 'Không có SKU sàn khớp ô tìm kiếm hoặc ô lọc'
                      : data && !data.syncedAt
                        ? 'Chưa tải SKU từ sàn'
                        : drafting
                          ? 'Gian hàng chưa có SKU nào trên sàn'
                          : 'Mọi SKU sàn đã liên kết'}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <ProductRows
                    key={p.externalProductId}
                    product={p}
                    selected={selected}
                    onToggle={toggle}
                    renderRow={(r) => (
                      <SkuRow
                        key={r.externalSkuId}
                        r={r}
                        child={p.skus.length > 1}
                        checked={selected.has(r.externalSkuId)}
                        onCheck={(on) => toggle([r.externalSkuId], on)}
                        error={rowErrors.get(r.externalSkuId) ?? null}
                        action={
                          drafting ? (
                            <DecisionCell
                              r={r}
                              decision={decisionOf(r)}
                              skuOf={skuOf}
                              hasVariants={hasVariants}
                              canCreate={canCreateProducts && r.canCreate}
                              showSkip={showSkip}
                              taken={takenVariants}
                              onChange={(d) => writeDraft([d])}
                              onPick={() => pick(r)}
                            />
                          ) : (
                            <ApplyActions
                              r={r}
                              busy={busy}
                              canCreate={canCreateProducts && r.canCreate}
                              canPick={Boolean(onPick) || hasVariants}
                              onLink={(variantId) => void applyNow([{ externalSkuId: r.externalSkuId, action: 'link', variantId }])}
                              onPick={() => pick(r)}
                              onCreate={() => startCreate([{ externalSkuId: r.externalSkuId, action: 'create', variantId: null }])}
                            />
                          )
                        }
                      />
                    )}
                  />
                ))
              )}
            </TableBody>
          </Table>
          {data && data.total > 0 && (
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={data.total}
              pageSizes={PAGE_SIZES}
              sizeLabel="Sản phẩm mỗi trang"
              onChange={(pg, size) => {
                setPage(pg);
                setPageSize(size);
              }}
            />
          )}
        </div>
      )}

      <MatchDialog
        open={Boolean(picking)}
        title="Chọn SKU kho có sẵn"
        description={
          picking ? (
            <>
              SKU sàn <strong>{picking.title}</strong> ({picking.sellerSku || picking.externalSkuId}). Chọn SKU kho để liên kết.
            </>
          ) : null
        }
        searchLabel="Tìm SKU kho theo tên hoặc mã SKU..."
        options={pickOptions}
        initialId={picking && decisionOf(picking)?.action === 'link' ? decisionOf(picking)!.variantId : null}
        empty="Không còn SKU kho chưa liên kết"
        saving={busy}
        error={null}
        onSave={(variantId) => {
          if (!picking) return;
          const item: SkuLinkInput = { externalSkuId: picking.externalSkuId, action: 'link', variantId };
          setPicking(null);
          submit([item]);
        }}
        onClose={() => setPicking(null)}
      />
      <CreateFromSkusDialog
        items={creating}
        products={products}
        saving={busy}
        onSubmit={async (groups) => {
          if (creating && (await applyNow(creating, groups))) setCreating(null);
        }}
        onClose={() => setCreating(null)}
      />
    </div>
  );
}

/** Dòng cha của sản phẩm sàn nhiều SKU (ô chọn cả sản phẩm), rồi các SKU con; sản phẩm một SKU chỉ có một dòng */
function ProductRows({
  product,
  selected,
  onToggle,
  renderRow,
}: {
  product: RemoteProduct;
  selected: ReadonlySet<string>;
  onToggle: (ids: string[], on: boolean) => void;
  renderRow: (r: RemoteSkuRow) => React.ReactNode;
}) {
  if (product.skus.length === 1) return <>{renderRow(product.skus[0]!)}</>;
  const ids = product.skus.filter((s) => isOpenSku(s)).map((s) => s.externalSkuId);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  return (
    <Fragment>
      <TableRow className="bg-muted/30" data-testid="sku-product-row">
        <TableCell>
          <Checkbox
            aria-label={`Chọn mọi SKU của ${product.title}`}
            checked={all ? true : some ? 'indeterminate' : false}
            disabled={!ids.length}
            onCheckedChange={(v) => onToggle(ids, v === true)}
          />
        </TableCell>
        <TableCell colSpan={4}>
          <span className="font-medium">{product.title}</span>{' '}
          <span className="text-xs text-muted-foreground">
            · {product.skus.length} SKU{product.externalCategoryPath ? ` · ${product.externalCategoryPath}` : ''}
          </span>
        </TableCell>
      </TableRow>
      {product.skus.map(renderRow)}
    </Fragment>
  );
}

function SkuRow({
  r,
  child,
  checked,
  onCheck,
  error,
  action,
}: {
  r: RemoteSkuRow;
  child: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  error: string | null;
  action: React.ReactNode;
}) {
  const open = isOpenSku(r);
  const s = r.suggestion;
  const errorId = `sku-error-${r.externalSkuId}`;
  return (
    <TableRow data-state={checked ? 'selected' : undefined} data-testid="sku-row">
      <TableCell>
        {open && <Checkbox aria-label={`Chọn SKU ${r.sellerSku || r.externalSkuId}`} checked={checked} onCheckedChange={(v) => onCheck(v === true)} />}
      </TableCell>
      <TableCell className={cn(child && 'ps-8')}>
        <p className="font-medium">{child ? (r.variantLabel ?? r.title) : r.title}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {r.sellerSku || 'Không có SKU người bán'} · {r.externalSkuId}
        </p>
        {!child && r.variantLabel && <p className="text-xs text-muted-foreground">{r.variantLabel}</p>}
      </TableCell>
      <TableCell className="text-end tabular-nums">{r.platformStock}</TableCell>
      <TableCell>
        {s ? (
          <div className="grid gap-0.5" data-testid="sku-suggestion">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-sm">{s.sku}</span>
              <Badge variant={s.confidence === 'high' ? 'default' : 'outline'}>{CONFIDENCE_LABELS[s.confidence]}</Badge>
            </span>
            <span className="text-xs text-muted-foreground">
              {suggestionText(s)} · {s.productName}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell aria-describedby={error ? errorId : undefined}>
        {action}
        {error && (
          <p id={errorId} className="mt-1 text-xs text-destructive-text">
            {error}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Ô lựa chọn của một SKU ở chế độ nháp: liên kết theo gợi ý, chọn SKU kho có sẵn, tạo SKU kho mới, bỏ qua, không quản tồn */
function DecisionCell({
  r,
  decision,
  skuOf,
  hasVariants,
  canCreate,
  showSkip,
  taken,
  onChange,
  onPick,
}: {
  r: RemoteSkuRow;
  decision: Decision | null;
  skuOf: ReadonlyMap<string, string>;
  hasVariants: boolean;
  canCreate: boolean;
  showSkip: boolean;
  taken: ReadonlySet<string>;
  onChange: (d: Decision) => void;
  onPick: () => void;
}) {
  if (r.matchedVariantId) return <span className="text-sm text-muted-foreground">Đã liên kết {skuOf.get(r.matchedVariantId) ?? ''}</span>;
  if (r.pendingMapping) return <span className="text-sm text-muted-foreground">Đang chờ CEO duyệt liên kết</span>;
  const s = r.suggestion;
  const suggestFree = s && (!taken.has(s.variantId) || decision?.variantId === s.variantId);
  const value: DecisionValue | '' = !decision
    ? ''
    : decision.action === 'link'
      ? s && decision.variantId === s.variantId
        ? 'suggest'
        : 'link'
      : decision.action;
  const set = (action: DecisionAction, variantId: string | null = null) => onChange({ externalSkuId: r.externalSkuId, action, variantId });
  const cannot = r.cannotCreateReason ? CANNOT_CREATE_TEXT[r.cannotCreateReason] : null;
  return (
    <div className="grid gap-1">
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === 'suggest' && s) set('link', s.variantId);
          else if (v === 'link') onPick();
          else set(v as DecisionAction);
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label={`Lựa chọn cho SKU ${r.sellerSku || r.externalSkuId}`}>
          <SelectValue placeholder="Chưa chọn" />
        </SelectTrigger>
        <SelectContent>
          {s && suggestFree && <SelectItem value="suggest">Liên kết theo gợi ý: {s.sku}</SelectItem>}
          {/* Công ty chưa có SKU kho nào thì không có gì để chọn */}
          {(hasVariants || value === 'link') && <SelectItem value="link">Chọn SKU kho có sẵn…</SelectItem>}
          {(canCreate || value === 'create') && <SelectItem value="create">{DECISION_LABELS.create}</SelectItem>}
          {(showSkip || value === 'skip') && <SelectItem value="skip">{DECISION_LABELS.skip}</SelectItem>}
          <SelectItem value="unmanaged">{DECISION_LABELS.unmanaged}</SelectItem>
        </SelectContent>
      </Select>
      {value === 'link' && decision?.variantId && (
        <p className="text-xs text-muted-foreground">
          Liên kết với <span className="font-mono">{skuOf.get(decision.variantId) ?? 'SKU kho đã chọn'}</span>{' '}
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onPick}>
            Đổi
          </Button>
        </p>
      )}
      {!r.canCreate && cannot && <p className="text-xs text-muted-foreground">{cannot}</p>}
    </div>
  );
}

/** Nút ở dòng SKU sàn của gian hàng đang bán: gợi ý chắc chắn thì liên kết ngay; gợi ý theo tên chỉ mở hộp chọn (không chọn sẵn) */
function ApplyActions({
  r,
  busy,
  canCreate,
  canPick,
  onLink,
  onPick,
  onCreate,
}: {
  r: RemoteSkuRow;
  busy: boolean;
  canCreate: boolean;
  canPick: boolean;
  onLink: (variantId: string) => void;
  onPick: () => void;
  onCreate: () => void;
}) {
  if (r.pendingMapping) return <span className="text-xs text-muted-foreground">Đang chờ CEO duyệt liên kết</span>;
  const s = r.suggestion;
  const cannot = r.cannotCreateReason ? CANNOT_CREATE_TEXT[r.cannotCreateReason] : null;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-1.5">
        {s?.confidence === 'high' && (
          <Button type="button" size="sm" onClick={() => onLink(s.variantId)} disabled={busy}>
            Liên kết
          </Button>
        )}
        {canPick && (
          <Button type="button" size="sm" variant="outline" onClick={onPick}>
            {s?.confidence === 'high' ? 'Chọn khác' : s ? 'Xem gợi ý' : 'Chọn SKU kho'}
          </Button>
        )}
        {canCreate && (
          <Button type="button" size="sm" variant="outline" onClick={onCreate} disabled={busy}>
            Tạo SKU kho mới
          </Button>
        )}
      </div>
      {!r.canCreate && cannot && <p className="text-xs text-muted-foreground">{cannot}</p>}
    </div>
  );
}

/**
 * Tạo SKU kho từ các SKU sàn đã chọn (gian hàng đang bán, §18.12): mỗi sản phẩm sàn thành một sản phẩm kho, các SKU của
 * nó là biến thể; mỗi sản phẩm cần một danh mục sản phẩm. Điền sẵn danh mục gợi ý của BE nếu có
 */
function CreateFromSkusDialog({
  items,
  products,
  saving,
  onSubmit,
  onClose,
}: {
  items: SkuLinkInput[] | null;
  products: RemoteProduct[];
  saving: boolean;
  onSubmit: (groups: CreateGroup[]) => void;
  onClose: () => void;
}) {
  const groups = useGroups();
  const ids = useMemo(() => new Set((items ?? []).map((i) => i.externalSkuId)), [items]);
  const targets = useMemo(
    () => products.map((p) => ({ p, count: p.skus.filter((s) => ids.has(s.externalSkuId)).length })).filter((t) => t.count > 0),
    [products, ids],
  );
  const [chosen, setChosen] = useState<Record<string, string>>({});
  useEffect(() => {
    if (items) setChosen(Object.fromEntries(targets.flatMap((t) => (t.p.suggestedGroupId ? [[t.p.externalProductId, t.p.suggestedGroupId]] : []))));
  }, [items, targets]);
  const missing = targets.filter((t) => !chosen[t.p.externalProductId]).length;

  return (
    <Dialog open={Boolean(items)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo sản phẩm kho từ {items?.length ?? 0} SKU</DialogTitle>
          <DialogDescription>
            Mỗi sản phẩm trên sàn thành một sản phẩm kho, các SKU của nó là biến thể. Tên và giá lấy từ sàn, mã SKU kho là SKU người bán. Tạo
            xong tự liên kết.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-80 gap-3 overflow-y-auto">
          {targets.map(({ p, count }) => (
            <div key={p.externalProductId} className="grid gap-1.5">
              <Label htmlFor={`create-group-${p.externalProductId}`}>
                {p.title} <span className="font-normal text-muted-foreground">· {count} SKU</span>
              </Label>
              <GroupCombobox
                id={`create-group-${p.externalProductId}`}
                value={chosen[p.externalProductId] ?? ''}
                onChange={(v) => setChosen((c) => ({ ...c, [p.externalProductId]: v }))}
                groups={groups.data ?? []}
                loading={groups.isPending}
              />
            </div>
          ))}
          {groups.isError && <p className="text-sm text-destructive-text">{problemMessage(groups.error)}</p>}
        </div>
        <DialogFooter className="items-center">
          {missing > 0 && <span className="me-auto text-sm text-muted-foreground">Còn {missing} sản phẩm chưa chọn danh mục sản phẩm.</span>}
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={missing > 0 || saving}
            onClick={() => onSubmit(targets.map((t) => ({ externalProductId: t.p.externalProductId, groupId: chosen[t.p.externalProductId]! })))}
          >
            {saving ? 'Đang tạo…' : 'Tạo và liên kết'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
