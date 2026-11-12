import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CloudOff, ImageIcon, Link2, PlugZap, RefreshCw, RotateCcw, Unlink, Upload } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useDelistListing,
  useMatchListing,
  usePushListings,
  useRemoteSkus,
  useShop,
  useShopListings,
  useSyncListings,
  useUnmatchListing,
} from '@/api/shops.api';
import { apiClient, getErrorMessage, getProblem } from '@/api/client';
import { catalogKeys } from '@/api/catalog.api';
import { codeMessage, problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { priceText } from '@/utils/price';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { usePageGuide } from '@/guides/usePageGuide';
import type { ListingRow, ListingStatus, RemoteSku } from '@/types/shop';
import type { ProductDetail } from '@/types/catalog';
import { onPlatform } from '@/lib/machines/channel';
import { MatchDialog, type MatchOption } from './MatchDialog';
import {
  imageUrlsFor,
  LISTED_STATUSES,
  LISTING_POLL_MAX_MS,
  listingPollDelay,
  listingStatusHint,
  REPUSH_STATUSES,
  splitPushResults,
} from './listingPush';
import { CategoryMapSection } from './CategoryMapSection';
import {
  isUsable,
  LISTING_STATUS_LABELS,
  LISTING_STATUS_VARIANTS,
  platformLabel,
  STATUS_LABELS,
  STATUS_VARIANTS,
  STOCK_SYNC_LABELS,
} from './shopSchemas';
import { useStartConnect } from './useStartConnect';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

/** Tab của bảng theo Test_UI `v-listing` */
type ListingTab = 'all' | 'unmatched' | 'not_listed' | 'stale' | 'failed' | 'held';

/** Lỗi đẩy của một biến thể; giữ `code` để gắn lối sửa (vd `category_unmapped`) */
interface PushError {
  code?: string;
  message: string;
}

/** Trạng thái phiếu kiểm kê đầu kỳ chưa ghi sổ (§18.6.2) */
const STOCKTAKE_STATUS = { draft: 'đang nháp', pending: 'đang chờ duyệt', rejected: 'bị từ chối, cần sửa rồi gửi lại' } as const;

/**
 * Tab theo Test_UI `v-listing`. "Chưa ghép" là SKU trên sàn chưa ghép biến thể nào;
 * các tab còn lại lọc biến thể Commerio theo trạng thái listing (sơ đồ C2).
 */
const LISTING_TABS: { value: ListingTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unmatched', label: 'Chưa ghép' },
  { value: 'not_listed', label: 'Chưa lên sàn' },
  { value: 'stale', label: 'Giá chưa đẩy' },
  { value: 'failed', label: 'Đẩy lỗi' },
  { value: 'held', label: 'Sàn khoá, đã ẩn' },
];

const FAILED_STATUSES: ListingStatus[] = ['push_failed', 'rejected'];
const HELD_STATUSES: ListingStatus[] = ['platform_hold', 'hidden', 'under_review'];

/** Đã ghép nhưng chưa đẩy, hoặc giá đã đổi sau lần đẩy cuối */
const isStale = (r: ListingRow) =>
  Boolean(r.listing) &&
  onPlatform(r.listing!.status) &&
  (r.listing!.lastPushedAt === null || r.price !== r.listing!.lastPushedPrice);

/** Biến thể thuộc tab nào; tab "Chưa ghép" là danh sách SKU sàn nên không chứa biến thể */
function inTab(tab: ListingTab, r: ListingRow): boolean {
  const status = r.listing?.status;
  switch (tab) {
    case 'all':
      return true;
    case 'unmatched':
      return false;
    case 'not_listed':
      return !status || status === 'delisted';
    case 'stale':
      return isStale(r);
    case 'failed':
      return Boolean(status && FAILED_STATUSES.includes(status));
    case 'held':
      return Boolean(status && HELD_STATUSES.includes(status));
  }
}

/** Gỡ được khi listing còn trên sàn và không đang đẩy */
const canDelist = (s: ListingStatus) => onPlatform(s) && s !== 'pushing';

/**
 * Hộp ghép đang mở. BE ghép theo SKU sàn (§18.6.5): biến thể chưa ghép thì chọn SKU sàn; từ SKU sàn (chưa ghép, hoặc
 * Đổi ghép ở dòng biến thể) thì chọn biến thể khác hoặc "không quản tồn"
 */
type Matching =
  | { from: 'variant'; row: ListingRow }
  | { from: 'remote'; externalSkuId: string; title: string; sellerSku: string | null; current: ListingRow | null };

/** Lựa chọn "không quản tồn" trong hộp ghép: gửi `variantId: null` */
const UNMANAGED = '__unmanaged__';

/** UC-CH-02: ghép biến thể với SKU trên sàn, đẩy sản phẩm và giá theo kênh */
export function ShopListingsPage() {
  const { shopId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();

  const shopQuery = useShop(shopId);
  const shop = shopQuery.data;
  useBreadcrumb(shop?.shopName);
  const usable = shop ? isUsable(shop.status) : false;
  const canManage = can(PERMISSIONS.listingManage) && usable;
  /** Ghép SKU tách quyền khỏi đẩy, gỡ (§18.6.5): Sale ghép được nhưng không đẩy */
  const canMatch = can(PERMISSIONS.listingMatch) && usable;
  const canReconnect =
    can(PERMISSIONS.shopConnect) && shop && (shop.status === 'needs_reauth' || shop.status === 'disconnected');

  /** Lúc bắt đầu theo dõi dòng đang đẩy; null khi không còn dòng nào đang đẩy (§18.6.4) */
  const pollFrom = useRef<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const listingsQuery = useShopListings(shopId, (data) => {
    const now = Date.now();
    const delay = listingPollDelay(data, pollFrom.current ?? now, now);
    if (delay === false) {
      // Còn dòng đang đẩy mà dừng: đã quá 30 phút
      if (pollFrom.current !== null && data?.some((r) => r.listing?.status === 'pushing')) setPollTimedOut(true);
      else pollFrom.current = null;
      return false;
    }
    pollFrom.current ??= now;
    return delay;
  });
  const remoteQuery = useRemoteSkus(shopId, canMatch);
  const matchMut = useMatchListing();
  const unmatchMut = useUnmatchListing();
  const pushMut = usePushListings();
  const delistMut = useDelistListing();
  const syncMut = useSyncListings();
  const listingReview = shop?.capabilities.listingReview ?? false;
  const { startTour } = usePageGuide('shop-listings', { ready: Boolean(shop) && listingsQuery.isSuccess });
  const connector = useStartConnect();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ListingTab>('all');
  const [delisting, setDelisting] = useState<ListingRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState<Matching | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [unmatching, setUnmatching] = useState<ListingRow | null>(null);
  const [pushing, setPushing] = useState<ListingRow[] | null>(null);
  /** Lý do không đẩy được của lần đẩy gần nhất, theo biến thể */
  const [pushErrors, setPushErrors] = useState<Map<string, PushError>>(new Map());
  /** Danh mục Commerio đang mở hộp ghép danh mục sàn (FE#146) */
  const [mapCategoryId, setMapCategoryId] = useState<string | null>(null);
  const [resolvingCategory, setResolvingCategory] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const items = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const remoteSkus = useMemo(() => remoteQuery.data ?? [], [remoteQuery.data]);
  const unmatchedRemote = useMemo(() => remoteSkus.filter((r) => !r.matchedVariantId && !r.mode), [remoteSkus]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (r) =>
        (!q ||
          r.productName.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.listing?.sellerSku?.toLowerCase().includes(q)) &&
        inTab(tab, r),
    );
  }, [items, search, tab]);

  const remoteRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? unmatchedRemote.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.externalSkuId.toLowerCase().includes(q) ||
            r.sellerSku?.toLowerCase().includes(q),
        )
      : unmatchedRemote;
  }, [unmatchedRemote, search]);

  /** Số dòng mỗi tab, không tính ô tìm kiếm */
  const tabCounts = useMemo(() => {
    const counts = {} as Record<ListingTab, number>;
    for (const t of LISTING_TABS) {
      counts[t.value] = t.value === 'unmatched' ? unmatchedRemote.length : items.filter((r) => inTab(t.value, r)).length;
    }
    return counts;
  }, [items, unmatchedRemote]);

  const changeTab = (v: string) => {
    setTab(v as ListingTab);
    setPage(1);
    setSelection(new Set());
  };

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
      return unmatchedRemote
        .filter((r) => !r.pendingMapping)
        .map((r) => ({
          id: r.externalSkuId,
          title: r.title,
          subtitle: `${r.sellerSku || 'Không có SKU người bán'} · ${r.externalSkuId}`,
          suggested: Boolean(r.sellerSku) && r.sellerSku === row.sku,
        }));
    }
    const { sellerSku, current } = matching;
    const variants = items
      .filter((r) => !r.listing || r.variantId === current?.variantId)
      .map((r) => ({
        id: r.variantId,
        title: [r.productName, r.attributesLabel].filter(Boolean).join(' · '),
        subtitle: r.sku,
        suggested: Boolean(sellerSku) && sellerSku === r.sku,
      }));
    return [
      ...variants,
      {
        id: UNMANAGED,
        title: 'Không quản tồn',
        subtitle: 'Đơn của SKU sàn này không trừ tồn biến thể nào. Cần CEO duyệt',
        suggested: false,
      },
    ];
  }, [matching, unmatchedRemote, items]);

  /** Lý do chưa ghép, đổi ghép được ở dòng biến thể */
  const matchBlock = (r: ListingRow) =>
    r.listing?.pendingMapping
      ? 'Đang chờ CEO duyệt ghép'
      : r.listing?.status === 'pushing'
        ? 'Đang đẩy, ghép sau khi sàn trả kết quả'
        : r.listing && !r.listing.externalSkuId
          ? 'Sàn chưa trả mã SKU'
          : !r.listing && remoteQuery.isError
            ? 'Chưa tải được SKU trên sàn'
            : null;

  /** Đổi ghép: mở hộp từ SKU sàn đang ghép với biến thể này */
  const openRemap = (r: ListingRow) => {
    const externalSkuId = r.listing!.externalSkuId!;
    openMatch({
      from: 'remote',
      externalSkuId,
      title: remoteSkus.find((x) => x.externalSkuId === externalSkuId)?.title ?? r.productName,
      sellerSku: r.listing!.sellerSku,
      current: r,
    });
  };

  const saveMatch = async (id: string) => {
    if (!matching) return;
    const input =
      matching.from === 'variant'
        ? { externalSkuId: id, variantId: matching.row.variantId }
        : { externalSkuId: matching.externalSkuId, variantId: id === UNMANAGED ? null : id };
    const variantSku = items.find((r) => r.variantId === input.variantId)?.sku;
    const label = matching.from === 'variant' ? matching.row.sku : matching.sellerSku || matching.externalSkuId;
    const reload = () => void Promise.all([listingsQuery.refetch(), remoteQuery.refetch()]);
    try {
      const { pending } = await matchMut.mutateAsync({ shopId, ...input });
      setMatching(null);
      if (pending) {
        toast.info(`Đã gửi CEO duyệt ghép SKU sàn ${label}. Trong lúc chờ, ghép cũ giữ nguyên.`);
      } else {
        toast.success(input.variantId ? `Đã ghép ${variantSku ?? label}` : `Đã đặt SKU sàn ${label} là không quản tồn`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const fieldError = problem?.errors?.variantId ?? problem?.errors?.externalSkuId;
      if (problem?.code === 'version_conflict') {
        // UC-CH-02 ngoại lệ 5a: không đổi gì, nạp lại để chọn lại
        setMatching(null);
        toast.warning(`Ghép SKU của ${label} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        reload();
      } else {
        setMatchError(fieldError ?? problemMessage(e));
        if (fieldError || problem?.code === 'mapping_pending' || problem?.code === 'sku_taken') reload();
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

  const handleDelist = async () => {
    if (!delisting?.listing) return;
    try {
      await delistMut.mutateAsync({ shopId, variantId: delisting.variantId, version: delisting.listing.version });
      toast.success(`Đã gỡ ${delisting.sku} khỏi sàn`);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        toast.warning(`Trạng thái của ${delisting.sku} trên sàn vừa đổi. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        void listingsQuery.refetch();
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDelisting(null);
  };

  /** Biến thể chưa có SKU sàn sẽ được tạo mới: hỏi trước (ngoại lệ 7a) */
  const requestPush = (targets: ListingRow[]) => {
    if (targets.some((r) => !r.listing)) setPushing(targets);
    else void push(targets);
  };

  /** Đẩy chạy nền (§18.6.4): dòng được xếp việc chuyển Đang đẩy, trang tự đọc lại tới khi sàn trả kết quả */
  const push = async (targets: ListingRow[]) => {
    try {
      const results = await pushMut.mutateAsync({
        shopId,
        variantIds: targets.map((r) => r.variantId),
        imageUrls: imageUrlsFor(targets, items, window.location.origin),
      });
      const { queued, blocked } = splitPushResults(results);
      setPushErrors((prev) => {
        const next = new Map(prev);
        results.forEach((r) => {
          if (r.code) next.set(r.variantId, { code: r.code, message: r.message ?? codeMessage(r.code) });
          else next.delete(r.variantId);
        });
        return next;
      });
      if (queued) {
        pollFrom.current = Date.now();
        setPollTimedOut(false);
        toast.success(`Đã xếp ${queued} biến thể vào hàng đẩy lên sàn. Trang tự cập nhật khi sàn trả kết quả.`);
        setSelection(new Set());
      }
      if (blocked.length) toast.warning(`${blocked.length} biến thể không đẩy được, xem lý do ở cột Trạng thái`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
    setPushing(null);
  };

  const sync = async () => {
    try {
      const r = await syncMut.mutateAsync(shopId);
      toast.success(
        `Đã đồng bộ ${r.checked} sản phẩm: ${r.changed} đổi trạng thái, ${r.pushed} đẩy giá hoặc tồn${r.errors ? `, ${r.errors} lỗi` : ''}.`,
      );
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  /**
   * Dòng đẩy lỗi `category_unmapped`: PushResult và ListingRow không có danh mục,
   * nên lấy danh mục từ chi tiết sản phẩm rồi mở hộp ghép của danh mục đó.
   */
  const openCategoryMap = async (row: ListingRow) => {
    setResolvingCategory(row.variantId);
    try {
      const product = await queryClient.fetchQuery({
        queryKey: catalogKeys.product(companyId, row.productId),
        queryFn: async () => (await apiClient.get<ProductDetail>(`/catalog/products/${row.productId}`)).data,
      });
      setMapCategoryId(product.category.id);
    } catch {
      toast.error('Không xác định được danh mục của sản phẩm. Chọn danh mục ở mục Ghép danh mục bên dưới.');
      document.getElementById('category-maps')?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setResolvingCategory(null);
    }
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
              <span className="font-mono text-xs text-muted-foreground">{l.externalSkuId ?? 'Sàn chưa trả mã'}</span>
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
              <div className="flex flex-col items-start gap-1">
                <span className="text-destructive" data-testid="push-error">
                  {err.message}
                </span>
                {err.code === 'category_unmapped' && canManage && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    disabled={resolvingCategory === r.variantId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openCategoryMap(r);
                    }}
                    data-testid="open-category-map"
                  >
                    Ghép danh mục
                  </Button>
                )}
              </div>
            );
          }
          const l = r.listing;
          if (!l) return <span className="text-muted-foreground">Chưa lên sàn</span>;
          const live = onPlatform(l.status);
          const note =
            l.status === 'rejected'
              ? l.rejectReason
              : (l.status === 'push_failed' || l.status === 'pushing') && l.pushError
                ? l.status === 'pushing'
                  ? `Đang thử lại (${l.pushAttempts} lần): ${l.pushError.message}`
                  : l.pushError.message
                : l.status === 'hidden' && l.hiddenBy !== 'zero_stock'
                  ? 'Đã ẩn trên sàn'
                  : null;
          return (
            <div className="grid justify-items-start gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={LISTING_STATUS_VARIANTS[l.status]}
                    data-testid="listing-status"
                    tabIndex={0}
                    aria-describedby={`listing-hint-${r.variantId}`}
                  >
                    {LISTING_STATUS_LABELS[l.status]}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent id={`listing-hint-${r.variantId}`} className="max-w-64" data-testid="listing-hint">
                  {listingStatusHint(l, listingReview)}
                </TooltipContent>
              </Tooltip>
              {note && (
                <span
                  className={l.status === 'hidden' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
                  data-testid="listing-note"
                >
                  {note}
                </span>
              )}
              {l.status === 'hidden' && l.hiddenBy === 'zero_stock' && (
                <SyncBadge
                  id={`hidden-zero-${r.variantId}`}
                  variant="secondary"
                  label="Đang ẩn bằng tồn 0"
                  hint="Sàn không ẩn riêng từng phân loại nên Commerio đẩy tồn 0 để khách không đặt được SKU này."
                  testId="hidden-zero"
                />
              )}
              {live &&
                (l.lastPushedAt === null ? (
                  <Badge variant="warning">Chưa đẩy</Badge>
                ) : l.priceSync === 'pending' ? (
                  <>
                    <Badge variant="warning" data-testid="price-sync">
                      Giá đã đổi, chưa đẩy
                    </Badge>
                    <span className="text-xs text-muted-foreground">Trên sàn: {priceText(l.lastPushedPrice)}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Đã đẩy {formatDateTime(l.lastPushedAt)}</span>
                ))}
              {live && l.stockSync === 'error' && (
                <SyncBadge
                  id={`stock-drift-${r.variantId}`}
                  variant="destructive"
                  label={`${STOCK_SYNC_LABELS.error}${l.platformStock !== null ? ` (sàn ${l.platformStock})` : ''}`}
                  hint="Số tồn trên sàn khác Commerio hai lượt đối chiếu liền. Lượt đẩy tồn sau sẽ ghi đè số trên sàn."
                  testId="stock-sync"
                />
              )}
              {live && l.stockSync === 'pending' && (
                <Badge variant="outline" data-testid="stock-sync">
                  {STOCK_SYNC_LABELS.pending}
                </Badge>
              )}
              {/* Lỗi đẩy của riêng SKU này: câu của sàn hiện nguyên văn trong tooltip (§18.4, §18.6.6) */}
              {[
                { key: 'stock', label: 'Cập nhật tồn lên sàn lỗi', err: l.stockSyncError },
                { key: 'price', label: 'Đẩy giá lỗi', err: l.priceSyncError },
              ].map(
                ({ key, label, err }) =>
                  err && (
                    <SyncBadge
                      key={key}
                      id={`sync-error-${key}-${r.variantId}`}
                      variant="destructive"
                      label={label}
                      hint={`${err.message} · ${formatDateTime(err.at)}`}
                      testId="sync-error"
                    />
                  ),
              )}
              {l.qcAlert && (
                <span className="text-xs text-warning" data-testid="qc-alert">
                  Sàn cảnh báo QC: {l.qcAlert.reason}
                </span>
              )}
            </div>
          );
        },
      },
    );
    if (canManage || canMatch) {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-40 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          const status = r.listing?.status;
          const busy =
            status === 'pushing'
              ? 'Đang đẩy, chờ sàn trả kết quả'
              : status && LISTED_STATUSES.includes(status)
                ? 'Đã lên sàn. Giá và tồn cập nhật bằng nút Đồng bộ'
                : null;
          return (
            <div className="flex justify-end gap-1" data-guide={canMatch ? 'listings-match' : undefined}>
              {canMatch && (
                <RowAction
                  label={r.listing ? 'Đổi ghép' : 'Ghép'}
                  reason={matchBlock(r)}
                  onClick={() => (r.listing ? openRemap(r) : openMatch({ from: 'variant', row: r }))}
                >
                  <Link2 />
                </RowAction>
              )}
              {canManage && r.listing && (
                <RowAction label="Bỏ ghép" destructive onClick={() => setUnmatching(r)}>
                  <Unlink />
                </RowAction>
              )}
              {!canManage ? null : status && REPUSH_STATUSES.includes(status) ? (
                <RowAction
                  label="Đẩy lại"
                  reason={pushMut.isPending ? 'Đang đẩy...' : null}
                  onClick={() => requestPush([r])}
                >
                  <RotateCcw />
                </RowAction>
              ) : (
                <RowAction
                  label={r.listing ? 'Đẩy lên sàn' : 'Đẩy sản phẩm mới'}
                  reason={pushMut.isPending ? 'Đang đẩy...' : busy}
                  onClick={() => requestPush([r])}
                >
                  <Upload />
                </RowAction>
              )}
              {canManage && status && canDelist(status) && (
                <RowAction label="Gỡ khỏi sàn" destructive onClick={() => setDelisting(r)}>
                  <CloudOff />
                </RowAction>
              )}
            </div>
          );
        },
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, canMatch, remoteSkus, selection, rows, allFilteredSelected, someFilteredSelected, pushErrors, resolvingCategory, remoteQuery.isError, pushMut.isPending, listingReview]);

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
      ...(canMatch
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-16 text-right' },
              cell: ({ row }: { row: { original: RemoteSku } }) => {
                const r = row.original;
                return (
                  <div className="flex justify-end">
                    <RowAction
                      label="Ghép với biến thể"
                      reason={r.pendingMapping ? 'Đang chờ CEO duyệt ghép' : null}
                      onClick={() =>
                        openMatch({
                          from: 'remote',
                          externalSkuId: r.externalSkuId,
                          title: r.title,
                          sellerSku: r.sellerSku,
                          current: null,
                        })
                      }
                    >
                      <Link2 />
                    </RowAction>
                  </div>
                );
              },
            } satisfies ColumnDef<RemoteSku>,
          ]
        : []),
    ],
    [canMatch],
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
  const searching = Boolean(search.trim());

  return (
    <div>
      <PageHeader
        title={shop ? `Ghép SKU · ${shop.shopName}` : 'Ghép SKU'}
        subtitle={
          shop
            ? `${platformLabel(shop.platform, shop.platformName)} · ${shop.externalShopId}`
            : undefined
        }
        help="Ghép SKU là nối mỗi SKU trên sàn với một biến thể trong Commerio. Đơn sàn của SKU đã ghép trừ đúng tồn của biến thể, và Commerio đẩy tồn, giá lên đúng SKU đó. Giá đẩy lấy từ bảng giá của gian hàng, thiếu thì lấy giá chuẩn."
        onTour={startTour}
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
            {usable && can(PERMISSIONS.shopSync) && (
              <Button variant="outline" disabled={syncMut.isPending} onClick={() => void sync()}>
                <RefreshCw className={syncMut.isPending ? 'animate-spin motion-reduce:animate-none' : undefined} />
                {syncMut.isPending ? 'Đang đồng bộ...' : 'Đồng bộ'}
              </Button>
            )}
            {canManage && (
              <Button
                disabled={!selectedRows.length || pushMut.isPending}
                onClick={() => requestPush(selectedRows)}
                data-guide="listings-push"
              >
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
      {shop?.openingStocktake && (
        <AlertMessage severity="warning" className="mb-4">
          <span data-testid="opening-stocktake-banner">
            Gian hàng đang chờ kiểm kê đầu kỳ: phiếu{' '}
            <Link
              className="font-mono font-medium underline underline-offset-2"
              to={ROUTES.company.inventoryDoc(companyId, shop.openingStocktake.documentId)}
            >
              {shop.openingStocktake.number}
            </Link>{' '}
            {STOCKTAKE_STATUS[shop.openingStocktake.status]}. Đến khi phiếu ghi sổ, Commerio chưa đẩy tồn và chưa đẩy sản
            phẩm lên sàn; đơn vẫn kéo về.
          </span>
        </AlertMessage>
      )}
      {shop && usable && !can(PERMISSIONS.listingManage) && (
        <AlertMessage severity="info" className="mb-4">
          {can(PERMISSIONS.listingMatch)
            ? 'Bạn ghép được SKU sàn với biến thể. Đẩy sản phẩm, giá và gỡ khỏi sàn cần quyền đẩy sản phẩm lên sàn.'
            : 'Bạn chỉ có quyền xem ghép SKU của gian hàng.'}
        </AlertMessage>
      )}
      {pollTimedOut && (
        <AlertMessage severity="info" className="mb-4">
          <span data-testid="poll-timeout">
            Đã theo dõi {LISTING_POLL_MAX_MS / 60000} phút mà sàn chưa trả kết quả. Commerio vẫn chờ sàn; bấm Đồng bộ
            hoặc tải lại trang để xem kết quả mới.
          </span>
        </AlertMessage>
      )}
      {listingsQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(listingsQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <Tabs value={tab} onValueChange={changeTab} className="overflow-x-auto px-4 pt-3" data-guide="listings-tabs">
          <TabsList aria-label="Lọc theo trạng thái">
            {LISTING_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`listing-tab-${t.value}`}>
                {t.label}
                <span className="ms-1.5 text-xs text-muted-foreground tabular-nums">{tabCounts[t.value]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <FilterBar>
          <SearchInput value={search} onChange={withReset(setSearch)} placeholder="Tìm theo tên, SKU hoặc SKU sàn..." />
          <p className="text-sm text-muted-foreground md:ms-auto md:self-center" data-testid="match-summary">
            Đã ghép {items.filter((r) => r.listing).length} / {items.length} biến thể
          </p>
        </FilterBar>
        {tab === 'unmatched' ? (
          <div data-testid="remote-section">
            <p className="px-4 pb-3 text-sm text-muted-foreground">
              SKU lấy trực tiếp từ sàn, chưa ghép với biến thể nào. Ghép để đơn của các SKU này trừ đúng tồn và nhận giá
              từ Commerio.
            </p>
            {!usable ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground">
                Không tải được SKU trên sàn khi gian hàng chưa kết nối.
              </p>
            ) : !can(PERMISSIONS.listingMatch) ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground">Xem SKU sàn chưa ghép cần quyền ghép SKU.</p>
            ) : remoteQuery.isError ? (
              <div className="px-4 pb-6">
                <AlertMessage severity="error">{problemMessage(remoteQuery.error)}</AlertMessage>
              </div>
            ) : (
              <DataTable
                columns={remoteColumns}
                data={remoteRows}
                getRowId={(r) => r.externalSkuId}
                loading={remoteQuery.isLoading}
                fetching={remoteQuery.isFetching}
                empty={searching ? 'Không có SKU sàn khớp ô tìm kiếm' : 'Mọi SKU trên sàn đã được ghép'}
              />
            )}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={pageRows}
            getRowId={(r) => r.variantId}
            loading={listingsQuery.isLoading}
            fetching={listingsQuery.isFetching}
            empty={
              searching
                ? 'Không có biến thể khớp ô tìm kiếm'
                : tab !== 'all'
                  ? 'Không còn biến thể nào ở mục này'
                  : 'Công ty chưa có biến thể đang bán'
            }
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
        )}
      </Card>

      <CategoryMapSection shopId={shopId} editingCategoryId={mapCategoryId} onEditingChange={setMapCategoryId} />

      <MatchDialog
        open={Boolean(matching)}
        title={
          matching?.from === 'remote'
            ? matching.current
              ? 'Đổi ghép SKU sàn'
              : 'Ghép SKU sàn với biến thể'
            : 'Ghép biến thể với SKU sàn'
        }
        description={
          matching?.from === 'remote' ? (
            <>
              SKU sàn <strong>{matching.title}</strong> ({matching.sellerSku || matching.externalSkuId}).{' '}
              {matching.current
                ? `Đang ghép với ${matching.current.sku}. Chọn biến thể khác hoặc không quản tồn. Gian hàng đã nhận đơn của SKU này thì đổi ghép cần CEO duyệt; đơn đã nhận giữ ghép cũ.`
                : 'Chọn biến thể chưa ghép, hoặc không quản tồn.'}
            </>
          ) : matching ? (
            <>
              Biến thể <strong>{matching.row.sku}</strong> · {matching.row.productName}. Chọn SKU trên sàn chưa ghép.
            </>
          ) : null
        }
        searchLabel={matching?.from === 'remote' ? 'Tìm biến thể theo tên hoặc SKU...' : 'Tìm SKU sàn...'}
        options={matchOptions}
        initialId={matching?.from === 'remote' ? (matching.current?.variantId ?? null) : null}
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
        open={Boolean(delisting)}
        title="Gỡ khỏi sàn?"
        message={
          <>
            Gỡ <strong>{delisting?.sku}</strong> khỏi {shop?.shopName}. Khách không đặt được SKU này trên sàn nữa; ghép SKU
            vẫn giữ để đẩy lại sau.
          </>
        }
        confirmLabel="Gỡ khỏi sàn"
        destructive
        loading={delistMut.isPending}
        onConfirm={handleDelist}
        onClose={() => setDelisting(null)}
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

/** Nhãn đồng bộ của một listing (§18.6.6); rê chuột, Tab tới hoặc chạm để xem lý do */
function SyncBadge({
  id,
  variant,
  label,
  hint,
  testId,
}: {
  id: string;
  variant: 'secondary' | 'destructive';
  label: string;
  hint: string;
  testId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} data-testid={testId} tabIndex={0} aria-describedby={id}>
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent id={id} className="max-w-64" data-testid={`${testId}-hint`}>
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
