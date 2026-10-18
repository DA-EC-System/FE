import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowLeft, ImageIcon, Link2, PlugZap, Unlink, Upload } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useMatchListing,
  usePushListings,
  useRemoteSkus,
  useShop,
  useShopListings,
  useUnmatchListing,
} from '@/api/shops.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { priceText } from '@/features/pricing/shared';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ListingRow, RemoteSku } from '@/types/shop';
import { MatchDialog, type MatchOption } from './MatchDialog';
import { isUsable, PLATFORM_LABELS, STATUS_LABELS, STATUS_VARIANTS } from './shopSchemas';
import { useStartConnect } from './useStartConnect';

type MatchFilter = '' | 'matched' | 'unmatched' | 'stale';

const MATCH_FILTERS: { value: Exclude<MatchFilter, ''>; label: string }[] = [
  { value: 'matched', label: 'Đã ghép' },
  { value: 'unmatched', label: 'Chưa ghép' },
  { value: 'stale', label: 'Giá chưa đẩy' },
];

/** Đã ghép nhưng chưa đẩy, hoặc giá đã đổi sau lần đẩy cuối */
const isStale = (r: ListingRow) =>
  Boolean(r.listing) && (r.listing!.lastPushedAt === null || r.price !== r.listing!.lastPushedPrice);

/** Hộp ghép đang mở: bắt đầu từ biến thể (chọn SKU sàn) hoặc từ SKU sàn (chọn biến thể) */
type Matching = { from: 'variant'; row: ListingRow } | { from: 'remote'; sku: RemoteSku };

/** UC-CH-02: ghép biến thể với SKU trên sàn, đẩy sản phẩm và giá theo kênh */
export function ShopListingsPage() {
  const { shopId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();

  const shopQuery = useShop(shopId);
  const shop = shopQuery.data;
  const usable = shop ? isUsable(shop.status) : false;
  const canManage = can(PERMISSIONS.listingManage) && usable;
  const canReconnect = can(PERMISSIONS.shopConnect) && shop && shop.status !== 'connected';

  const listingsQuery = useShopListings(shopId);
  const remoteQuery = useRemoteSkus(shopId, usable);
  const matchMut = useMatchListing();
  const unmatchMut = useUnmatchListing();
  const pushMut = usePushListings();
  const connector = useStartConnect();

  const [search, setSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState<Matching | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [unmatching, setUnmatching] = useState<ListingRow | null>(null);
  const [pushing, setPushing] = useState<ListingRow[] | null>(null);
  /** Lý do không đẩy được của lần đẩy gần nhất, theo biến thể */
  const [pushErrors, setPushErrors] = useState<Map<string, string>>(new Map());

  const items = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const remoteSkus = useMemo(() => remoteQuery.data ?? [], [remoteQuery.data]);
  const unmatchedRemote = remoteSkus.filter((r) => !r.matchedVariantId);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (r) =>
        (!q ||
          r.productName.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.listing?.sellerSku.toLowerCase().includes(q)) &&
        (matchFilter === '' ||
          (matchFilter === 'matched' && r.listing) ||
          (matchFilter === 'unmatched' && !r.listing) ||
          (matchFilter === 'stale' && isStale(r))),
    );
  }, [items, search, matchFilter]);

  // Phân trang tại chỗ: API trả mọi biến thể đang bán
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const selectedRows = items.filter((r) => selection.has(r.variantId));
  const allFilteredSelected = rows.length > 0 && rows.every((r) => selection.has(r.variantId));
  const someFilteredSelected = rows.some((r) => selection.has(r.variantId));

  const openMatch = (m: Matching) => {
    setMatchError(null);
    setMatching(m);
  };

  /** Lựa chọn trong hộp ghép: phía bên kia của mục đang ghép */
  const matchOptions: MatchOption[] = useMemo(() => {
    if (!matching) return [];
    if (matching.from === 'variant') {
      const row = matching.row;
      return remoteSkus
        .filter((r) => !r.matchedVariantId || r.matchedVariantId === row.variantId)
        .map((r) => ({
          id: r.externalSkuId,
          title: r.title,
          subtitle: `${r.sellerSku || 'Không có SKU người bán'} · ${r.externalSkuId} · ${priceText(r.price)}`,
          suggested: Boolean(r.sellerSku) && r.sellerSku === row.sku,
        }));
    }
    const sku = matching.sku;
    return items
      .filter((r) => !r.listing)
      .map((r) => ({
        id: r.variantId,
        title: [r.productName, r.attributesLabel].filter(Boolean).join(' · '),
        subtitle: r.sku,
        suggested: Boolean(sku.sellerSku) && sku.sellerSku === r.sku,
      }));
  }, [matching, remoteSkus, items]);

  const saveMatch = async (id: string) => {
    if (!matching) return;
    const target =
      matching.from === 'variant'
        ? { row: matching.row, externalSkuId: id }
        : { row: items.find((r) => r.variantId === id)!, externalSkuId: matching.sku.externalSkuId };
    try {
      await matchMut.mutateAsync({
        shopId,
        variantId: target.row.variantId,
        externalSkuId: target.externalSkuId,
        version: target.row.listing?.version ?? null,
      });
      setMatching(null);
      toast.success(`Đã ghép ${target.row.sku}`);
    } catch (e) {
      const code = problemCode(e);
      if (code === 'version_conflict') {
        // UC-CH-02 ngoại lệ 5a: không đổi gì, nạp lại để chọn lại
        setMatching(null);
        toast.warning(`Ghép SKU của ${target.row.sku} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        void Promise.all([listingsQuery.refetch(), remoteQuery.refetch()]);
      } else if (code === 'sku_taken') {
        setMatchError(problemMessage(e));
        void remoteQuery.refetch();
      } else {
        setMatchError(problemMessage(e));
      }
    }
  };

  const handleUnmatch = async () => {
    if (!unmatching?.listing) return;
    try {
      await unmatchMut.mutateAsync({
        shopId,
        variantId: unmatching.variantId,
        version: unmatching.listing.version,
      });
      toast.success(`Đã bỏ ghép ${unmatching.sku}`);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        toast.warning(`Ghép SKU của ${unmatching.sku} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        void listingsQuery.refetch();
      } else {
        toast.error(problemMessage(e));
      }
    }
    setUnmatching(null);
  };

  /** Biến thể chưa có SKU sàn sẽ được tạo mới: hỏi trước (ngoại lệ 7a) */
  const requestPush = (targets: ListingRow[]) => {
    if (targets.some((r) => !r.listing)) setPushing(targets);
    else void push(targets);
  };

  const push = async (targets: ListingRow[]) => {
    try {
      const results = await pushMut.mutateAsync({ shopId, variantIds: targets.map((r) => r.variantId) });
      const failed = results.filter((r) => r.outcome === 'failed');
      const created = results.filter((r) => r.outcome === 'created').length;
      const done = results.length - failed.length;
      setPushErrors((prev) => {
        const next = new Map(prev);
        results.forEach((r) => {
          if (r.outcome === 'failed') next.set(r.variantId, r.message ?? problemMessage(null));
          else next.delete(r.variantId);
        });
        return next;
      });
      if (done) {
        toast.success(`Đã đẩy ${done} biến thể lên sàn${created ? ` (${created} tạo mới)` : ''}`);
        setSelection(new Set());
      }
      if (failed.length) toast.warning(`${failed.length} biến thể không đẩy được, xem lý do ở cột Trạng thái`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
    setPushing(null);
  };

  const columns = useMemo<ColumnDef<ListingRow>[]>(() => {
    const cols: ColumnDef<ListingRow>[] = [];
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
                <p className="truncate text-xs text-muted-foreground">{r.attributesLabel || 'Không có thuộc tính'}</p>
              </div>
            </div>
          );
        },
      },
      { accessorKey: 'sku', header: 'SKU', meta: { className: 'w-40 font-mono text-xs' } },
      {
        id: 'price',
        header: 'Giá đẩy',
        meta: { className: 'w-36 text-right whitespace-nowrap' },
        cell: ({ row }) => {
          const r = row.original;
          if (r.price === null) return <span className="text-muted-foreground italic">Chưa có giá</span>;
          return (
            <div className="grid">
              <span>{priceText(r.price)}</span>
              <span className="text-xs text-muted-foreground">
                {r.priceSource === 'shop' ? 'Giá gian hàng' : 'Theo giá chuẩn'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'remote',
        header: 'SKU sàn',
        meta: { className: 'min-w-44' },
        cell: ({ row }) => {
          const l = row.original.listing;
          if (!l) return <Badge variant="outline">Chưa ghép</Badge>;
          return (
            <div className="grid" data-testid="remote-sku">
              <span className="font-mono text-xs">{l.sellerSku || '—'}</span>
              <span className="font-mono text-xs text-muted-foreground">{l.externalSkuId}</span>
            </div>
          );
        },
      },
      {
        id: 'pushState',
        header: 'Trạng thái',
        meta: { className: 'min-w-48' },
        cell: ({ row }) => {
          const r = row.original;
          const err = pushErrors.get(r.variantId);
          if (err) {
            return (
              <span className="text-destructive" data-testid="push-error">
                {err}
              </span>
            );
          }
          const l = r.listing;
          if (!l) return <span className="text-muted-foreground">Chưa có trên sàn</span>;
          if (l.lastPushedAt === null) return <Badge variant="warning">Chưa đẩy</Badge>;
          if (r.price !== l.lastPushedPrice) {
            return (
              <div className="grid justify-items-start gap-1">
                <Badge variant="warning">Giá đã đổi, chưa đẩy</Badge>
                <span className="text-xs text-muted-foreground">Trên sàn: {priceText(l.lastPushedPrice)}</span>
              </div>
            );
          }
          return (
            <div className="grid justify-items-start gap-1">
              <Badge variant="success">Đã đẩy</Badge>
              <span className="text-xs text-muted-foreground">{formatDateTime(l.lastPushedAt)}</span>
            </div>
          );
        },
      },
    );
    if (canManage) {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex justify-end gap-1">
              <RowAction
                label={r.listing ? 'Đổi ghép' : 'Ghép'}
                reason={remoteQuery.isError ? 'Chưa tải được SKU trên sàn' : null}
                onClick={() => openMatch({ from: 'variant', row: r })}
              >
                <Link2 />
              </RowAction>
              {r.listing && (
                <RowAction label="Bỏ ghép" destructive onClick={() => setUnmatching(r)}>
                  <Unlink />
                </RowAction>
              )}
              <RowAction
                label={r.listing ? 'Đẩy lên sàn' : 'Đẩy sản phẩm mới'}
                reason={pushMut.isPending ? 'Đang đẩy...' : null}
                onClick={() => requestPush([r])}
              >
                <Upload />
              </RowAction>
            </div>
          );
        },
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, selection, rows, allFilteredSelected, someFilteredSelected, pushErrors, remoteQuery.isError, pushMut.isPending]);

  const remoteColumns = useMemo<ColumnDef<RemoteSku>[]>(
    () => [
      { accessorKey: 'title', header: 'Sản phẩm trên sàn', meta: { className: 'min-w-56 font-medium' } },
      {
        id: 'sellerSku',
        header: 'SKU người bán',
        meta: { className: 'w-40 font-mono text-xs' },
        cell: ({ row }) => row.original.sellerSku || <span className="text-muted-foreground">—</span>,
      },
      { accessorKey: 'externalSkuId', header: 'Mã SKU sàn', meta: { className: 'w-44 font-mono text-xs' } },
      {
        id: 'price',
        header: 'Giá trên sàn',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => priceText(row.original.price),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-16 text-right' },
              cell: ({ row }: { row: { original: RemoteSku } }) => (
                <div className="flex justify-end">
                  <RowAction label="Ghép với biến thể" onClick={() => openMatch({ from: 'remote', sku: row.original })}>
                    <Link2 />
                  </RowAction>
                </div>
              ),
            } satisfies ColumnDef<RemoteSku>,
          ]
        : []),
    ],
    [canManage],
  );

  const backToList = () => navigate(ROUTES.company.shops(companyId));

  if (shopQuery.isError) {
    return (
      <div className="grid justify-items-start gap-4">
        <AlertMessage severity="error">{problemMessage(shopQuery.error)}</AlertMessage>
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft />
          Về danh sách gian hàng
        </Button>
      </div>
    );
  }

  const newCount = pushing?.filter((r) => !r.listing).length ?? 0;
  const filtered = Boolean(search.trim() || matchFilter);

  return (
    <div>
      <PageHeader
        title={shop ? `Ghép SKU · ${shop.shopName}` : 'Ghép SKU'}
        subtitle={
          shop
            ? `${PLATFORM_LABELS[shop.platform]} · ${shop.externalShopId}. Giá đẩy lấy từ bảng giá của gian hàng, thiếu thì lấy giá chuẩn.`
            : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {shop && (
              <Badge variant={STATUS_VARIANTS[shop.status]} data-testid="shop-status">
                {STATUS_LABELS[shop.status]}
              </Badge>
            )}
            <Button variant="outline" onClick={backToList}>
              <ArrowLeft />
              Danh sách
            </Button>
            {canManage && (
              <Button disabled={!selectedRows.length || pushMut.isPending} onClick={() => requestPush(selectedRows)}>
                <Upload />
                {pushMut.isPending
                  ? 'Đang đẩy...'
                  : selectedRows.length
                    ? `Đẩy ${selectedRows.length} biến thể lên sàn`
                    : 'Đẩy lên sàn'}
              </Button>
            )}
          </div>
        }
      />

      {shop && !usable && (
        <AlertMessage severity="warning" className="mb-4">
          <span>
            Gian hàng {STATUS_LABELS[shop.status].toLowerCase()} nên chỉ xem được ghép SKU cũ. Kết nối lại để ghép và đẩy
            giá.
          </span>
          {canReconnect && (
            <Button
              size="sm"
              variant="outline"
              className="ms-3"
              disabled={connector.pending}
              onClick={() => connector.start({ platform: shop.platform, shopId: shop.id })}
            >
              <PlugZap />
              Kết nối lại
            </Button>
          )}
        </AlertMessage>
      )}
      {shop && usable && !can(PERMISSIONS.listingManage) && (
        <AlertMessage severity="info" className="mb-4">
          Bạn chỉ có quyền xem ghép SKU của gian hàng.
        </AlertMessage>
      )}
      {listingsQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(listingsQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm theo tên, SKU hoặc SKU sàn..." />
          <FilterSelect
            label="Ghép"
            value={matchFilter}
            onChange={withReset((v: string) => setMatchFilter(v as MatchFilter))}
            options={MATCH_FILTERS}
          />
          <p className="text-sm text-muted-foreground md:ms-auto md:self-center" data-testid="match-summary">
            Đã ghép {items.filter((r) => r.listing).length} / {items.length} biến thể
          </p>
        </FilterBar>
        <DataTable
          columns={columns}
          data={pageRows}
          getRowId={(r) => r.variantId}
          loading={listingsQuery.isLoading}
          fetching={listingsQuery.isFetching}
          empty={filtered ? 'Không có biến thể khớp bộ lọc' : 'Công ty chưa có biến thể đang bán'}
          pagination={{
            page: safePage,
            pageSize,
            total: rows.length,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <Card className="mt-6 gap-0 py-0" data-testid="remote-section">
        <CardHeader className="py-4">
          <CardTitle>SKU trên sàn chưa ghép</CardTitle>
          <CardDescription>
            Lấy trực tiếp từ sàn. Ghép để đơn của các SKU này trừ đúng tồn và nhận giá từ Commerio.
          </CardDescription>
        </CardHeader>
        {!usable ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Không tải được SKU trên sàn khi gian hàng chưa kết nối.
          </p>
        ) : remoteQuery.isError ? (
          <div className="px-6 pb-6">
            <AlertMessage severity="error">{problemMessage(remoteQuery.error)}</AlertMessage>
          </div>
        ) : (
          <DataTable
            columns={remoteColumns}
            data={unmatchedRemote}
            getRowId={(r) => r.externalSkuId}
            loading={remoteQuery.isLoading}
            fetching={remoteQuery.isFetching}
            empty="Mọi SKU trên sàn đã được ghép"
          />
        )}
      </Card>

      <MatchDialog
        open={Boolean(matching)}
        title={matching?.from === 'remote' ? 'Ghép SKU sàn với biến thể' : 'Ghép biến thể với SKU sàn'}
        description={
          matching?.from === 'remote' ? (
            <>
              SKU sàn <strong>{matching.sku.title}</strong> ({matching.sku.sellerSku || matching.sku.externalSkuId}).
              Chọn biến thể chưa ghép.
            </>
          ) : matching ? (
            <>
              Biến thể <strong>{matching.row.sku}</strong> · {matching.row.productName}. Chọn SKU trên sàn chưa ghép.
            </>
          ) : null
        }
        searchLabel={matching?.from === 'remote' ? 'Tìm biến thể theo tên hoặc SKU...' : 'Tìm SKU sàn...'}
        options={matchOptions}
        initialId={matching?.from === 'variant' ? (matching.row.listing?.externalSkuId ?? null) : null}
        empty={matching?.from === 'remote' ? 'Không còn biến thể chưa ghép' : 'Không còn SKU sàn chưa ghép'}
        saving={matchMut.isPending}
        error={matchError}
        onSave={saveMatch}
        onClose={() => setMatching(null)}
      />
      <ConfirmDialog
        open={Boolean(unmatching)}
        title="Bỏ ghép SKU?"
        message={
          <>
            Bỏ ghép <strong>{unmatching?.sku}</strong> với SKU sàn {unmatching?.listing?.sellerSku || unmatching?.listing?.externalSkuId}.
            Đơn mới của SKU sàn này sẽ không trừ tồn biến thể cho tới khi ghép lại.
          </>
        }
        confirmLabel="Bỏ ghép"
        destructive
        loading={unmatchMut.isPending}
        onConfirm={handleUnmatch}
        onClose={() => setUnmatching(null)}
      />
      <ConfirmDialog
        open={Boolean(pushing)}
        title="Đẩy lên sàn?"
        message={
          <>
            Đẩy {pushing?.length} biến thể lên {shop?.shopName}. <strong>{newCount} biến thể chưa có SKU sàn</strong> sẽ được
            tạo sản phẩm mới trên sàn và tự ghép với SKU sàn trả về.
          </>
        }
        confirmLabel="Đẩy lên sàn"
        loading={pushMut.isPending}
        onConfirm={() => pushing && push(pushing)}
        onClose={() => setPushing(null)}
      />
    </div>
  );
}
