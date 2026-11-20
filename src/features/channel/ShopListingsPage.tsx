import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CloudOff,
  ImageIcon,
  Link2,
  PencilLine,
  PlugZap,
  Power,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { useOrder } from '@/api/sales.api';
import { type ListingTab, readShopListingParams, resolveMatchTarget, writeShopListingParams } from './shopListingParams';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDecideMapping,
  useDelistListing,
  useMatchListing,
  useOverrideListingPrice,
  usePushListings,
  useRefreshRemoteSkus,
  useRemoteSkus,
  useResolveOutsideChange,
  useUpdateListingContent,
  useShop,
  useShopListings,
  useSyncListings,
} from '@/api/shops.api';
import { getErrorMessage, getProblem, isTimeout } from '@/api/client';
import {
  problemCode,
  problemMessage,
  remoteRefreshErrorMessage,
  updateContentMessage,
} from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { OpeningStocktakeBanner } from './OpeningStocktakeBanner';
import { ReturnWindowPanel } from './ReturnWindowPanel';
import { priceText } from '@/utils/price';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { usePageGuide } from '@/guides/usePageGuide';
import type { ListingRow, ListingStatus, MappingDecision, OutsideChangeAction, PendingMapping, RemoteSku } from '@/types/shop';
import { onPlatform } from '@/lib/machines/channel';
import { MatchDialog, type MatchOption } from './MatchDialog';
import { MatchPreviewPanel } from './MatchPreviewPanel';
import { isDelisted, matchScore, rankByScore, UNMANAGED, variantMatchOptions } from './matchOptions';
import {
  canUpdateContent,
  LISTED_STATUSES,
  LISTING_POLL_MAX_MS,
  listingPollDelay,
  REPUSH_STATUSES,
  pushBlockMessage,
  splitPushResults,
} from './listingPush';
import { ListingStatusCell, PendingBadge, type PushError } from './ListingStatusCell';
import { PRICE_SOURCE_LABEL } from './listingPrice';
import { PriceOverrideDialog } from './PriceOverrideDialog';
import {
  isUsable,
  platformLabel,
  STATUS_LABELS,
  STATUS_VARIANTS,
} from './shopSchemas';
import { useStartConnect } from './useStartConnect';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

/** Tab của bảng theo Test_UI `v-listing` */

/** Hộp CEO duyệt hoặc từ chối ghép chờ đang mở (§18.6.5) */
interface Deciding {
  action: MappingDecision;
  listingId: string;
  version: number;
  /** SKU sàn hiện trong câu thông báo */
  label: string;
  /** Biến thể xin ghép, hoặc "Không quản tồn" */
  target: string;
}

/** Sàn lưu thông tin sàn của sản phẩm (Documents/21 §18.5) */
const SPEC_PLATFORMS: ReadonlySet<string> = new Set(['lazada', 'tiktok']);

/**
 * Tab theo Test_UI `v-listing`. "Chưa ghép" là SKU trên sàn chưa ghép biến thể nào;
 * các tab còn lại lọc biến thể Commerio theo trạng thái listing (sơ đồ C2).
 */
const LISTING_TABS: { value: ListingTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unmatched', label: 'Chưa liên kết' },
  { value: 'pending', label: 'Chờ duyệt liên kết' },
  { value: 'not_listed', label: 'Chưa đăng bán' },
  { value: 'stale', label: 'Chờ đồng bộ giá' },
  { value: 'failed', label: 'Đăng lỗi' },
  { value: 'held', label: 'Không hiển thị' },
];

const FAILED_STATUSES: ListingStatus[] = ['push_failed', 'rejected'];
const HELD_STATUSES: ListingStatus[] = ['platform_hold', 'hidden', 'under_review'];

/** Đã ghép nhưng chưa đẩy, hoặc BE báo giá chưa đẩy (priceSync, §18.6.6): cùng điều kiện với nhãn ở cột Trạng thái */
const isStale = (r: ListingRow) =>
  Boolean(r.listing) &&
  onPlatform(r.listing!.status) &&
  (r.listing!.lastPushedAt === null || r.listing!.priceSync === 'pending');

/** Biến thể thuộc tab nào; tab "Chưa ghép" là danh sách SKU sàn nên không chứa biến thể */
function inTab(tab: ListingTab, r: ListingRow): boolean {
  const status = r.listing?.status;
  switch (tab) {
    case 'all':
      return true;
    case 'unmatched':
    case 'pending':
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
/** Lượt tải SKU sàn lỗi mà BE không kèm lỗi cụ thể */
const REFRESH_FAILED_GENERIC = 'Chưa tải được SKU từ sàn. Bấm Tải SKU từ sàn để thử lại.';

type Matching =
  | { from: 'variant'; row: ListingRow }
  | { from: 'remote'; externalSkuId: string; title: string; sellerSku: string | null; current: ListingRow | null };

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
  const canEditProduct = can(PERMISSIONS.productManage);
  /** Quyết thay đổi ngoài app: `listing.manage` + vai trò CEO (§18.3, commerio-backend#360) */
  const isCeo = Boolean(companyContext?.roles.includes('CEO'));
  const canDecideOutside = canManage && isCeo;
  /** Ghi đè giá chỉ lưu ở Commerio, không gọi sàn: cần `listing.manage`, gian hàng ngắt vẫn sửa được (FE#274) */
  const canSetPrice = can(PERMISSIONS.listingManage);
  const canSync = can(PERMISSIONS.shopSync);
  /** Duyệt ghép chờ cần quyền đẩy listing và vai trò CEO (§18.6.5); FE dựa `canSelfApprove` của BE */
  const canDecide = can(PERMISSIONS.listingManage) && Boolean(companyContext?.canSelfApprove) && usable;
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
  const refreshMut = useRefreshRemoteSkus();
  // Lượt tải SKU sàn chạy nền (§18.3, BE#361): mở trang lần đầu hay bấm Tải lại thì BE chạy nền, `useRemoteSkus` hỏi lại
  // `GET remote-skus` tới khi `refresh.status` khác running (FE#315)
  const remoteRefresh = remoteQuery.data?.refresh ?? null;
  const refreshRunning = remoteRefresh?.status === 'running';
  const refreshing = refreshMut.isPending || refreshRunning;
  /** Hỏi lại lỗi (mạng, BE) khi lượt đang chạy: báo, giữ danh sách đang có */
  const refreshPollError = refreshRunning && remoteQuery.isRefetchError ? remoteQuery.error : null;
  /** Người dùng bấm Tải lại và BE xếp lượt nền: lượt xong thì báo bằng toast */
  const userRefresh = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const retrySeconds = remoteRefresh?.status === 'failed' ? remoteRefresh.retryAfterSeconds : null;
  // Đếm ngược số phút được tải lại theo `error.retryAfterSeconds`, tính từ lúc nhận phản hồi
  useEffect(() => {
    if (!retrySeconds) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [retrySeconds]);
  const secondsLeft =
    retrySeconds === null ? null : Math.max(0, retrySeconds - Math.max(0, now - remoteQuery.dataUpdatedAt) / 1000);
  const refreshFailure =
    remoteRefresh?.status === 'failed'
      ? remoteRefresh.error
        ? remoteRefreshErrorMessage(remoteRefresh.error, secondsLeft)
        : REFRESH_FAILED_GENERIC
      : null;
  useEffect(() => {
    // Chỉ báo cho đúng gian hàng đã bấm Tải lại; chuyển gian hàng giữa chừng thì bỏ lượt báo
    if (userRefresh.current === null || !remoteRefresh || remoteRefresh.status === 'running') return;
    const mine = userRefresh.current === shopId;
    userRefresh.current = null;
    if (!mine) return;
    if (remoteRefresh.status === 'failed') {
      toast.error(
        remoteRefresh.error
          ? remoteRefreshErrorMessage(remoteRefresh.error, remoteRefresh.retryAfterSeconds)
          : REFRESH_FAILED_GENERIC,
      );
    } else toast.success('Đã tải SKU từ sàn');
  }, [remoteRefresh, shopId]);
  const pushMut = usePushListings();
  const delistMut = useDelistListing();
  const priceMut = useOverrideListingPrice();
  const outsideMut = useResolveOutsideChange();
  const contentMut = useUpdateListingContent();
  const decideMut = useDecideMapping();
  const syncMut = useSyncListings();
  const listingReview = shop?.capabilities.listingReview ?? false;
  const { startTour } = usePageGuide('shop-listings', { ready: Boolean(shop) && listingsQuery.isSuccess });
  const connector = useStartConnect();

  // Tab, ô tìm theo URL (FE#327): mở lại hay gửi link vẫn đúng chỗ; `match` mở hộp ghép, `from` là đơn dẫn tới
  const [searchParams, setSearchParams] = useSearchParams();
  const urlParams = readShopListingParams(searchParams);
  const [search, setSearch] = useState(urlParams.q);
  const [tab, setTab] = useState<ListingTab>(urlParams.tab);
  const fromOrderId = urlParams.from;
  const fromOrder = useOrder(fromOrderId ?? '').data;
  const fromLabel = fromOrder?.code ?? '';
  const backToOrder = fromOrderId ? () => navigate(ROUTES.company.order(companyId, fromOrderId)) : null;
  /** SellerSku của `match` không có trong bản sao SKU sàn: nhắc Tải lại */
  const [missingMatch, setMissingMatch] = useState<string | null>(null);
  const [delisting, setDelisting] = useState<ListingRow | null>(null);
  /** Dòng đang ghi đè giá (FE#274) */
  const [pricing, setPricing] = useState<ListingRow | null>(null);
  const [priceFieldError, setPriceFieldError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [decidingOutside, setDecidingOutside] = useState<{ row: ListingRow; action: OutsideChangeAction } | null>(null);
  const [updatingContent, setUpdatingContent] = useState<ListingRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState<Matching | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [pushing, setPushing] = useState<ListingRow[] | null>(null);
  const [deciding, setDeciding] = useState<Deciding | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  /** Lý do không đẩy được của lần đẩy gần nhất, theo biến thể */
  const [pushErrors, setPushErrors] = useState<Map<string, PushError>>(new Map());

  const items = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const remoteSkus = useMemo(() => remoteQuery.data?.items ?? [], [remoteQuery.data]);
  /** Tên trên sàn theo mã SKU sàn, lấy từ bản sao `remote-skus` */
  const remoteTitles = useMemo(() => new Map(remoteSkus.map((r) => [r.externalSkuId, r.title])), [remoteSkus]);
  const unmatchedRemote = useMemo(() => remoteSkus.filter((r) => !r.matchedVariantId && !r.mode), [remoteSkus]);
  /** SKU sàn có ghép chờ CEO duyệt: `remote-skus` có cả dòng chỉ chờ "không quản tồn" mà `listings` không có */
  const pendingRemote = useMemo(() => remoteSkus.filter((r) => r.pendingMapping), [remoteSkus]);

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
    const source = tab === 'pending' ? pendingRemote : unmatchedRemote;
    return q
      ? source.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.externalSkuId.toLowerCase().includes(q) ||
            r.sellerSku?.toLowerCase().includes(q),
        )
      : source;
  }, [unmatchedRemote, pendingRemote, search, tab]);

  /** Số dòng mỗi tab, không tính ô tìm kiếm. Chưa tải được SKU sàn thì "Chờ duyệt" đếm theo biến thể */
  const tabCounts = useMemo(() => {
    const counts = {} as Record<ListingTab, number>;
    for (const t of LISTING_TABS) {
      counts[t.value] =
        t.value === 'unmatched'
          ? unmatchedRemote.length
          : t.value === 'pending'
            ? remoteQuery.data
              ? pendingRemote.length
              : items.filter((r) => r.listing?.pendingMapping).length
            : items.filter((r) => inTab(t.value, r)).length;
    }
    return counts;
  }, [items, unmatchedRemote, pendingRemote, remoteQuery.data]);

  /** Đích của ghép chờ: SKU biến thể xin ghép, hoặc "Không quản tồn" */
  const pendingTarget = (p: PendingMapping) =>
    p.variantId ? (items.find((r) => r.variantId === p.variantId)?.sku ?? 'SKU kho khác') : 'Không quản lý tồn';

  const reloadMatching = () => void Promise.all([listingsQuery.refetch(), remoteQuery.refetch()]);

  const openDecide = (action: MappingDecision, listingId: string, version: number, label: string, p: PendingMapping) => {
    setDecideError(null);
    setDeciding({ action, listingId, version, label, target: pendingTarget(p) });
  };

  /** UC-CH-02: CEO duyệt hoặc từ chối ghép chờ; xung đột phiên bản hay yêu cầu đã xử lý thì nạp lại */
  const decide = async (reason?: string) => {
    if (!deciding) return;
    const { action, listingId, version, label } = deciding;
    try {
      await decideMut.mutateAsync({ shopId, listingId, action, version, reason });
      setDeciding(null);
      toast.success(
        action === 'approve'
          ? `Đã duyệt liên kết SKU sàn ${label}`
          : `Đã từ chối liên kết SKU sàn ${label}. Liên kết cũ giữ nguyên.`,
      );
      reloadMatching();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.errors?.reason) {
        setDecideError(problem.errors.reason);
      } else if (problem?.code === 'version_conflict') {
        setDeciding(null);
        toast.warning(`Liên kết SKU sàn ${label} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        reloadMatching();
      } else if (problem?.code === 'invalid_transition') {
        setDeciding(null);
        toast.info(`Yêu cầu liên kết SKU sàn ${label} đã được xử lý hoặc không còn. Đã nạp lại dữ liệu.`);
        reloadMatching();
      } else if (action === 'reject') {
        setDecideError(problemMessage(e));
      } else {
        setDeciding(null);
        toast.error(problem?.errors?.variantId ?? problemMessage(e));
        reloadMatching();
      }
    }
  };

  /** Nút Duyệt, Từ chối của CEO trên dòng có ghép chờ */
  const decideActions = (listingId: string | null, version: number | null, label: string, p: PendingMapping | null) =>
    canDecide && p && listingId && version !== null ? (
      <>
        <RowAction label="Duyệt liên kết" onClick={() => openDecide('approve', listingId, version, label, p)}>
          <Check />
        </RowAction>
        <RowAction label="Từ chối liên kết" destructive onClick={() => openDecide('reject', listingId, version, label, p)}>
          <X />
        </RowAction>
      </>
    ) : null;

  const changeTab = (v: string) => {
    setTab(v as ListingTab);
    setPage(1);
    setSelection(new Set());
    setSearchParams((p) => writeShopListingParams(p, { tab: v as ListingTab }), { replace: true });
  };

  const changeSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    setSearchParams((p) => writeShopListingParams(p, { q: v }), { replace: true });
  };

  // `match` (FE#327): SKU sàn tải xong thì mở hộp ghép một lần rồi xoá khỏi URL. Không có trong bản sao thì nhắc Tải lại,
  // tải xong (dữ liệu đổi) thì thử lại; đã ghép hay đang chờ duyệt thì báo, không mở
  const matchParam = urlParams.match;
  const matchLabel = urlParams.q || matchParam;
  const remoteData = remoteQuery.data;
  const listingsReady = Boolean(listingsQuery.data);
  useEffect(() => {
    if (!matchParam || !canMatch || !remoteData || !listingsReady) return;
    const target = resolveMatchTarget(remoteData.items, matchParam);
    if (target.kind === 'missing') {
      setMissingMatch(refreshRunning ? null : matchLabel);
      return;
    }
    setMissingMatch(null);
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('match');
        return next;
      },
      { replace: true },
    );
    const label = target.sku.sellerSku || matchLabel;
    if (target.kind === 'pending') toast.info(`SKU sàn ${label} đang chờ CEO duyệt liên kết`);
    else if (target.kind === 'matched') toast.info(`SKU sàn ${label} đã liên kết, không cần liên kết lại`);
    else {
      setMatchError(null);
      setMatching({
        from: 'remote',
        externalSkuId: target.sku.externalSkuId,
        title: target.sku.title,
        sellerSku: target.sku.sellerSku,
        current: null,
      });
    }
  }, [matchParam, matchLabel, canMatch, remoteData, listingsReady, refreshRunning, setSearchParams]);

  // Phân trang tại chỗ: API trả mọi biến thể đang bán
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

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
      const name = [row.productName, row.attributesLabel].filter(Boolean).join(' · ');
      // Xếp theo độ giống tên/SKU với biến thể đang ghép (FE#326)
      return rankByScore(
        unmatchedRemote.filter((r) => !r.pendingMapping),
        (r) => matchScore(r, { name, sku: row.sku }),
      ).map(({ item: r, suggested }) => ({
        id: r.externalSkuId,
        title: r.title,
        subtitle: `${r.sellerSku || 'Không có SKU người bán'} · ${r.externalSkuId}`,
        suggested,
      }));
    }
    return variantMatchOptions(items, {
      title: matching.title,
      sellerSku: matching.sellerSku,
      currentVariantId: matching.current?.variantId,
      isCeo,
    });
  }, [matching, unmatchedRemote, items, isCeo]);

  /**
   * Lý do chưa ghép, đổi ghép được ở dòng biến thể. Listing đã gỡ không chặn (còn `externalSkuId` cũ nhưng là trạng thái
   * cuối): ghép như biến thể chưa có listing (FE#310)
   */
  const matchBlock = (r: ListingRow) => {
    const live = r.listing && !isDelisted(r) ? r.listing : null;
    return live?.pendingMapping
      ? 'Đang chờ CEO duyệt liên kết'
      : live?.status === 'pushing'
        ? 'Đang đăng, liên kết sau khi sàn phản hồi'
        : live && !live.externalSkuId
          ? 'Sàn chưa cấp SKU ID'
          : !live && remoteQuery.isError
            ? 'Chưa tải được SKU sàn'
            : null;
  };

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
      // Tới từ đơn (FE#327): toast có nút quay lại đơn
      const back = backToOrder
        ? { action: { label: `Quay lại đơn ${fromLabel}`.trim(), onClick: backToOrder } }
        : undefined;
      if (pending) {
        toast.info(`Đã gửi CEO duyệt liên kết SKU sàn ${label}. Trong lúc chờ, liên kết cũ giữ nguyên.`, back);
      } else {
        toast.success(
          input.variantId ? `Đã liên kết ${variantSku ?? label}` : `Đã đặt SKU sàn ${label} là không quản lý tồn`,
          back,
        );
      }
    } catch (e) {
      const problem = getProblem(e);
      const fieldError = problem?.errors?.variantId ?? problem?.errors?.externalSkuId;
      if (problem?.code === 'version_conflict') {
        // UC-CH-02 ngoại lệ 5a: không đổi gì, nạp lại để chọn lại
        setMatching(null);
        toast.warning(`Liên kết SKU của ${label} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        reload();
      } else {
        setMatchError(fieldError ?? problemMessage(e));
        if (fieldError || problem?.code === 'mapping_pending' || problem?.code === 'sku_taken') reload();
      }
    }
  };

  // Tải lại SKU sàn (§18.3, BE#361): POST trả danh sách đang có kèm lượt; lượt chạy nền thì báo đang tải, bảng tự cập nhật
  // và báo xong khi `refresh.status` hết running (FE#315). 200 không có lượt chạy là danh sách vừa đọc trong 60 giây.
  // Lỗi trả ngay trên POST (429 kèm số phút chờ, gian hàng chưa nối) báo luôn
  const refreshRemote = () =>
    refreshMut.mutate(shopId, {
      onSuccess: (data) => {
        if (data.refresh?.status === 'running') {
          userRefresh.current = shopId;
          toast.info('Đang tải SKU từ sàn, bảng tự cập nhật khi xong.');
        } else if (data.refresh?.status === 'failed') {
          toast.error(
            data.refresh.error
              ? remoteRefreshErrorMessage(data.refresh.error, data.refresh.retryAfterSeconds)
              : REFRESH_FAILED_GENERIC,
          );
        } else toast.success('Đã tải SKU từ sàn');
      },
      onError: (e) =>
        toast.error(
          isTimeout(e)
            ? 'Sàn trả danh sách SKU quá lâu. Thử lại sau ít phút; danh sách đang có vẫn giữ nguyên.'
            : problemMessage(e, 'remote_skus'),
        ),
    });

  const openPrice = (r: ListingRow) => {
    setPriceFieldError(null);
    setPriceError(null);
    setPricing(r);
  };

  // Ghi đè giá (FE#274, BE#225): 422 lỗi ô giá hiện dưới ô, 409 nạp lại và giữ hộp mở để người dùng xem giá mới
  const savePrice = async (price: number | null) => {
    const l = pricing?.listing;
    if (!pricing || !l) return;
    setPriceFieldError(null);
    setPriceError(null);
    try {
      await priceMut.mutateAsync({ shopId, listingId: l.id, version: l.version, price });
      toast.success(price === null ? `Đã bỏ ghi đè giá ${l.sellerSku || pricing.sku}` : `Đã lưu giá ${l.sellerSku || pricing.sku}`);
      setPricing(null);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'below_floor') {
        const detail = problem.detail?.trim().replace(/\.+$/, '');
        setPriceFieldError(detail ? `Giá dưới giá thấp nhất. ${detail}.` : 'Giá dưới giá thấp nhất của SKU ở gian hàng này.');
      } else if (problem?.code === 'validation_failed' && problem.errors?.price) {
        setPriceFieldError(problem.errors.price);
      } else if (problem?.code === 'version_conflict') {
        // Nạp lại để lấy version mới; ô giá giữ chữ người dùng đã gõ (hộp chỉ đặt lại ô khi đổi biến thể)
        const fresh = await listingsQuery.refetch();
        const row = fresh.isError ? undefined : fresh.data?.find((x) => x.variantId === pricing.variantId);
        if (fresh.isError) {
          setPriceError('Listing vừa được cập nhật nhưng chưa nạp lại được. Đóng hộp rồi mở lại để lưu.');
        } else if (!row?.listing || isDelisted(row)) {
          setPricing(null);
          toast.error(`${l.sellerSku || pricing.sku} vừa bị gỡ khỏi sàn nên không sửa giá được nữa.`);
        } else {
          setPricing(row);
          setPriceError(
            `Listing vừa được cập nhật, giá đang bán là ${row.price === null ? 'chưa có' : priceText(row.price)}. Xem lại rồi lưu.`,
          );
        }
      } else {
        setPriceError(problemMessage(e));
      }
    }
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

  const handleOutside = async () => {
    const l = decidingOutside?.row.listing;
    if (!decidingOutside || !l) return;
    const { row, action } = decidingOutside;
    try {
      const saved = await outsideMut.mutateAsync({ shopId, listingId: l.id, action, version: l.version });
      const done =
        action === 'restore' ? `Đã bật lại và dùng giá Commerio cho ${row.sku}` : `Đã dùng giá trên sàn cho ${row.sku}`;
      toast.success(saved.status === 'hidden' ? `${done}. SKU đang tạm ngừng nên vẫn ẩn trên sàn.` : done);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        toast.warning(`Trạng thái của ${row.sku} trên sàn vừa đổi. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        void listingsQuery.refetch();
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDecidingOutside(null);
  };

  /** Sửa nội dung (§18.3, commerio-backend#293): BE gọi sàn ngay, sàn từ chối thì listing giữ nguyên */
  const handleUpdateContent = async () => {
    const row = updatingContent;
    const l = row?.listing;
    if (!row || !l) return;
    try {
      const saved = await contentMut.mutateAsync({ shopId, listingId: l.id, version: l.version });
      toast.success(
        saved.status === 'under_review'
          ? `Đã cập nhật thông tin mới của ${row.sku} lên sàn. Sàn tạm ngừng bán để duyệt lại.`
          : `Đã cập nhật thông tin mới của ${row.sku} lên sàn. Sàn đang duyệt, listing vẫn bán bản cũ.`,
      );
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        toast.warning(`Trạng thái của ${row.sku} trên sàn vừa đổi. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        void listingsQuery.refetch();
      } else {
        toast.error(updateContentMessage(e, shop ? platformLabel(shop.platform, shop.platformName) : undefined));
      }
    }
    setUpdatingContent(null);
  };

  /** Biến thể chưa có SKU sàn sẽ được tạo mới: hỏi trước (ngoại lệ 7a) */
  const requestPush = (targets: ListingRow[]) => {
    if (targets.some((r) => !r.listing)) setPushing(targets);
    else void push(targets);
  };

  /**
   * Đẩy sản phẩm mới một dòng: `specStatus` đủ thì hỏi rồi đẩy như cũ, chưa có hay còn thiếu thì mở trang 4 bước
   * (commerio-backend#400, Documents/21 §18.5). Đẩy nhiều dòng một lần vẫn gửi thẳng, dòng thiếu thông tin sàn có nút Sửa thông tin sàn
   */
  const requestNewPush = (row: ListingRow) => {
    if (specPlatform && row.specStatus !== 'complete') openSpec(row.productId);
    else requestPush([row]);
  };

  /** Đẩy chạy nền (§18.6.4): dòng được xếp việc chuyển Đang đẩy, trang tự đọc lại tới khi sàn trả kết quả */
  const push = async (targets: ListingRow[]) => {
    try {
      const results = await pushMut.mutateAsync({ shopId, variantIds: targets.map((r) => r.variantId) });
      const { queued, blocked } = splitPushResults(results);
      setPushErrors((prev) => {
        const next = new Map(prev);
        results.forEach((r) => {
          if (r.code) next.set(r.variantId, { code: r.code, message: pushBlockMessage(r.code, r.message, platformName) });
          else next.delete(r.variantId);
        });
        return next;
      });
      if (queued) {
        pollFrom.current = Date.now();
        setPollTimedOut(false);
        toast.success(`Đã đưa ${queued} SKU vào hàng chờ đăng. Trang tự cập nhật khi sàn phản hồi.`);
        setSelection(new Set());
      }
      if (blocked.length) toast.warning(`${blocked.length} SKU không đăng được, xem lý do ở cột Trạng thái`);
    } catch (e) {
      toast.error(problemMessage(e, 'push'));
    }
    setPushing(null);
  };

  const sync = async () => {
    try {
      const r = await syncMut.mutateAsync(shopId);
      toast.success(
        r.queued
          ? 'Đã bắt đầu đồng bộ với sàn. Bảng tự tải lại sau khoảng 15 giây; chưa thấy đổi thì tải lại trang.'
          : 'Gian hàng đang có lượt đồng bộ chờ chạy, không tạo thêm.',
      );
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  /** Sàn có thông tin sàn của sản phẩm (category, attribute; commerio-backend#400) */
  const specPlatform = shop && SPEC_PLATFORMS.has(shop.platform) ? shop.platform : null;
  const platformName = shop ? platformLabel(shop.platform, shop.platformName) : '';
  const openSpec = (productId: string, fill = false) =>
    specPlatform && navigate(ROUTES.company.productPush(companyId, productId, specPlatform, shopId, fill));

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
                <p className="truncate text-xs text-muted-foreground">{r.attributesLabel || 'Không có phân loại'}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'sku',
        header: 'SKU kho',
        meta: { className: 'w-40' },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
      },
      {
        id: 'price',
        header: 'Giá bán trên gian hàng',
        meta: { className: 'w-36 text-right whitespace-nowrap' },
        cell: ({ row }) => {
          const r = row.original;
          // Nguồn giá, thực nhận, dưới giá thấp nhất, giá chờ xác nhận (FE#274, BE#225)
          const editable = canSetPrice && r.listing && !isDelisted(r);
          return (
            <div className="grid justify-items-end gap-0.5" data-testid="price-cell">
              {r.price === null ? (
                <span className="text-muted-foreground italic">Chưa có giá</span>
              ) : (
                <>
                  <span>{priceText(r.price)}</span>
                  {r.priceSource && (
                    <span className="text-xs text-muted-foreground" data-testid="price-source">
                      {PRICE_SOURCE_LABEL[r.priceSource]}
                    </span>
                  )}
                  {r.netReceived !== null && (
                    <span className="text-xs text-muted-foreground" data-testid="net-received">
                      Thực nhận {priceText(r.netReceived)}
                    </span>
                  )}
                </>
              )}
              {r.belowFloor && <Badge variant="destructive">Dưới giá thấp nhất</Badge>}
              {r.pendingPrice !== null && !canSetPrice && (
                <span className="text-xs text-muted-foreground" data-testid="pending-price">
                  Giá mới chờ xác nhận: {priceText(r.pendingPrice)}
                </span>
              )}
              {r.pendingPrice !== null && canSetPrice && (
                <Link
                  to={ROUTES.company.pendingPrices(companyId, shopId)}
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  data-testid="pending-price"
                >
                  Giá mới chờ xác nhận: {priceText(r.pendingPrice)}
                </Link>
              )}
              {editable && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  aria-label={`Sửa giá ${r.listing?.sellerSku || r.sku}`}
                  onClick={() => openPrice(r)}
                >
                  <PencilLine className="size-3" />
                  Sửa giá
                </Button>
              )}
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
          if (!l) return <Badge variant="outline">Chưa liên kết</Badge>;
          // Tên trong bản sao SKU sàn (FE#294): chưa tải hoặc SKU đã xoá trên sàn thì không hiện
          const remoteTitle = canMatch && l.externalSkuId ? remoteTitles.get(l.externalSkuId) : undefined;
          return (
            <div className="grid" data-testid="remote-sku">
              <span className="font-mono text-xs">{l.sellerSku || '—'}</span>
              <span className="font-mono text-xs text-muted-foreground">{l.externalSkuId ?? 'Chưa có SKU ID sàn'}</span>
              {remoteTitle && (
                <span className="max-w-64 truncate text-xs text-muted-foreground" title={remoteTitle} data-testid="remote-title">
                  {remoteTitle}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'pushState',
        header: 'Trạng thái',
        meta: { className: 'min-w-48' },
        cell: ({ row }) => (
          <ListingStatusCell
            row={row.original}
            pushError={pushErrors.get(row.original.variantId)}
            companyId={companyId}
            canManage={canManage}
            canEditProduct={canEditProduct}
            listingReview={listingReview}
            pendingTarget={pendingTarget}
            specFixable={!!specPlatform}
            onOpenSpec={(fill) => openSpec(row.original.productId, fill)}
          />
        ),
      },
    );
    if (canManage || canMatch || canDecide) {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-40 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          const status = r.listing?.status;
          const busy =
            status === 'pushing'
              ? 'Đang đăng, chờ sàn phản hồi'
              : status && LISTED_STATUSES.includes(status)
                ? canSync
                  ? 'Đã đăng bán. Giá và tồn cập nhật bằng nút Đồng bộ'
                  : 'Giá và tồn tự cập nhật mỗi 15 phút; CEO hoặc Admin bấm Đồng bộ để cập nhật ngay.'
                : null;
          return (
            <div className="flex justify-end gap-1" data-guide={canMatch ? 'listings-match' : undefined}>
              {r.listing &&
                decideActions(r.listing.id, r.listing.version, r.listing.sellerSku || r.sku, r.listing.pendingMapping)}
              {canMatch && (
                <RowAction
                  label={r.listing && !isDelisted(r) ? 'Đổi liên kết' : 'Liên kết'}
                  reason={matchBlock(r)}
                  onClick={() => (r.listing && !isDelisted(r) ? openRemap(r) : openMatch({ from: 'variant', row: r }))}
                >
                  <Link2 />
                </RowAction>
              )}
              {!canManage ? null : status && REPUSH_STATUSES.includes(status) ? (
                <RowAction
                  label="Đăng lại"
                  reason={pushMut.isPending ? 'Đang đăng...' : null}
                  onClick={() => requestPush([r])}
                >
                  <RotateCcw />
                </RowAction>
              ) : (
                <RowAction
                  label={r.listing ? 'Đăng bán' : 'Đăng sản phẩm mới'}
                  reason={pushMut.isPending ? 'Đang đăng...' : busy}
                  onClick={() => (r.listing ? requestPush([r]) : requestNewPush(r))}
                >
                  <Upload />
                </RowAction>
              )}
              {canDecideOutside && r.listing?.outsideChange && (
                <>
                  <RowAction
                    label="Bật lại, dùng giá Commerio"
                    reason={outsideMut.isPending ? 'Đang gửi...' : null}
                    onClick={() => setDecidingOutside({ row: r, action: 'restore' })}
                  >
                    <Power />
                  </RowAction>
                  {r.listing.outsideChange.kind === 'price_changed' && (
                    <RowAction
                      label="Dùng giá trên sàn"
                      reason={outsideMut.isPending ? 'Đang gửi...' : null}
                      onClick={() => setDecidingOutside({ row: r, action: 'accept-price' })}
                    >
                      <BadgeCheck />
                    </RowAction>
                  )}
                </>
              )}
              {canManage && canUpdateContent(shop?.platform, r.listing) && (
                <RowAction
                  label="Cập nhật thông tin lên sàn"
                  reason={contentMut.isPending ? 'Đang gửi...' : null}
                  onClick={() => setUpdatingContent(r)}
                >
                  <PencilLine />
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
  }, [canManage, canMatch, canEditProduct, canDecide, canDecideOutside, outsideMut.isPending, contentMut.isPending, shop?.platform, companyId, items, remoteSkus, remoteTitles, selection, rows, allFilteredSelected, someFilteredSelected, pushErrors, specPlatform, remoteQuery.isError, pushMut.isPending, listingReview, canSetPrice, canSync, shopId]);

  const remoteColumns = useMemo<ColumnDef<RemoteSku>[]>(
    () => [
      { accessorKey: 'title', header: 'Sản phẩm trên sàn', meta: { className: 'min-w-56 font-medium' } },
      {
        id: 'sellerSku',
        header: 'SKU người bán',
        meta: { className: 'w-40 font-mono text-xs' },
        cell: ({ row }) => row.original.sellerSku || <span className="text-muted-foreground">—</span>,
      },
      { accessorKey: 'externalSkuId', header: 'SKU ID sàn', meta: { className: 'w-44 font-mono text-xs' } },
      {
        id: 'pending',
        header: 'Trạng thái',
        meta: { className: 'min-w-40' },
        cell: ({ row }) => {
          const r = row.original;
          const current = r.matchedVariantId
            ? `Liên kết với ${items.find((x) => x.variantId === r.matchedVariantId)?.sku ?? 'SKU kho khác'}`
            : r.mode === 'unmanaged'
              ? 'Không quản lý tồn'
              : 'Chưa liên kết';
          return (
            <div className="grid justify-items-start gap-1">
              {r.pendingMapping && (
                <PendingBadge
                  id={`pending-remote-${r.externalSkuId}`}
                  pending={r.pendingMapping}
                  target={pendingTarget(r.pendingMapping)}
                />
              )}
              <span className="text-xs text-muted-foreground" data-testid="remote-current">
                {current}
              </span>
            </div>
          );
        },
      },
      ...(canMatch || canDecide
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-28 text-right' },
              cell: ({ row }: { row: { original: RemoteSku } }) => {
                const r = row.original;
                return (
                  <div className="flex justify-end gap-1">
                    {decideActions(r.listingId, r.listingVersion, r.sellerSku || r.externalSkuId, r.pendingMapping)}
                    {canMatch && !r.matchedVariantId && !r.mode && (
                      <RowAction
                        label="Liên kết SKU kho"
                        reason={r.pendingMapping ? 'Đang chờ CEO duyệt liên kết' : null}
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
                    )}
                  </div>
                );
              },
            } satisfies ColumnDef<RemoteSku>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canMatch, canDecide, items],
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
        title={shop ? `Listing & giá · ${shop.shopName}` : 'Listing & giá'}
        subtitle={
          shop
            ? `${platformLabel(shop.platform, shop.platformName)} · ${shop.externalShopId}`
            : undefined
        }
        help="Liên kết SKU (mapping) là nối mỗi SKU sàn với một SKU kho trong Commerio. Đơn của SKU đã liên kết sẽ trừ đúng tồn, và Commerio đồng bộ tồn, giá lên đúng SKU sàn đó. Giá lấy từ giá riêng của gian hàng, chưa đặt thì lấy giá bán lẻ."
        onTour={startTour}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {shop && (
              <Badge variant={STATUS_VARIANTS[shop.status]} data-testid="shop-status">
                {STATUS_LABELS[shop.status]}
              </Badge>
            )}
            {backToOrder && (
              <Button variant="outline" onClick={backToOrder} data-testid="back-to-order">
                <ArrowLeft />
                {fromLabel ? `Đơn ${fromLabel}` : 'Về đơn'}
              </Button>
            )}
            <Button variant="outline" onClick={backToList}>
              <ArrowLeft />
              Danh sách gian hàng
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
                  ? 'Đang đăng...'
                  : selectedRows.length
                    ? `Đăng bán ${selectedRows.length} SKU`
                    : 'Đăng bán'}
              </Button>
            )}
          </div>
        }
      />

      {shop && !usable && (
        <AlertMessage severity="warning" className="mb-4">
          <span>
            Gian hàng {STATUS_LABELS[shop.status].toLowerCase()} nên chỉ xem được liên kết SKU cũ. Kết nối lại để liên kết và
            đồng bộ giá.
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
      {shop && <OpeningStocktakeBanner shop={shop} companyId={companyId} />}
      {shop && <ReturnWindowPanel shop={shop} />}
      {shop && usable && !can(PERMISSIONS.listingManage) && (
        <AlertMessage severity="info" className="mb-4">
          {can(PERMISSIONS.listingMatch)
            ? 'Bạn liên kết được SKU sàn với SKU kho. Đăng bán, đồng bộ giá và gỡ khỏi sàn cần quyền Đăng bán.'
            : 'Bạn chỉ có quyền xem liên kết SKU của gian hàng.'}
        </AlertMessage>
      )}
      {pollTimedOut && (
        <AlertMessage severity="info" className="mb-4">
          <span data-testid="poll-timeout">
            Đã chờ {LISTING_POLL_MAX_MS / 60000} phút mà sàn chưa phản hồi. Commerio vẫn chờ; bấm Đồng bộ
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
          <SearchInput value={search} onChange={changeSearch} placeholder="Tìm theo tên, SKU kho hoặc SKU sàn..." />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:ms-auto md:self-center">
            <p className="text-sm text-muted-foreground" data-testid="match-summary">
              {/* Listing đã gỡ không tính là đã liên kết: Đã liên kết + Chưa đăng bán không vượt tổng (FE#326) */}
              Đã liên kết {items.filter((r) => r.listing && !isDelisted(r)).length}/{items.length} SKU
              {items.some(isDelisted) && ` (${items.filter(isDelisted).length} đã gỡ khỏi sàn)`}
            </p>
            {/* Bản sao SKU sàn dùng chung cho mọi tab (tên trên sàn, hộp Đổi ghép, tab Chưa ghép) nên Tải lại nằm ở đây (FE#294) */}
            {canMatch && (
              <>
                <p className="text-sm text-muted-foreground" data-testid="remote-synced">
                  {refreshRunning
                    ? 'Đang tải SKU từ sàn, bảng tự cập nhật khi xong.'
                    : remoteQuery.data?.syncedAt
                      ? `SKU sàn cập nhật lúc ${formatDateTime(remoteQuery.data.syncedAt)}`
                      : null}
                </p>
                {missingMatch && (
                  <p className="text-sm text-destructive" data-testid="match-missing">
                    Chưa thấy SKU sàn {missingMatch} trong danh sách. Bấm Tải SKU từ sàn để lấy SKU mới.
                  </p>
                )}
                <Button size="sm" variant="outline" disabled={refreshing} onClick={refreshRemote}>
                  <RefreshCw className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} />
                  {refreshing ? 'Đang tải SKU từ sàn…' : 'Tải SKU từ sàn'}
                </Button>
              </>
            )}
          </div>
        </FilterBar>
        {items.some((r) => r.feeWarning === 'over_50') && (
          <div className="px-4 pb-3" data-testid="fee-warning">
            <AlertMessage severity="warning">
              Tổng phí và thuế của gian hàng trên 50%. Kiểm tra cấu hình phí trước khi đặt giá.
            </AlertMessage>
          </div>
        )}
        {usable && canMatch && (refreshFailure || refreshPollError) && (
          <div className="px-4 pb-3" data-testid="remote-refresh-alert">
            <AlertMessage severity="error">
              {refreshPollError ? problemMessage(refreshPollError, 'remote_skus') : refreshFailure}
            </AlertMessage>
          </div>
        )}
        {tab === 'unmatched' || tab === 'pending' ? (
          <div data-testid="remote-section">
            <p className="max-w-prose px-4 pb-3 text-sm text-muted-foreground" data-testid="remote-hint">
              {tab === 'pending'
                ? canDecide
                  ? 'SKU sàn có yêu cầu liên kết chờ CEO duyệt. Duyệt thì liên kết mới có hiệu lực; từ chối thì liên kết cũ giữ nguyên.'
                  : 'SKU sàn có yêu cầu liên kết chờ CEO duyệt. Trong lúc chờ, liên kết cũ giữ nguyên.'
                : 'SKU sàn chưa liên kết SKU kho nào. Liên kết để đơn trừ đúng tồn và nhận giá từ Commerio. Vừa thêm sản phẩm trên sàn thì bấm Tải SKU từ sàn.'}
            </p>
            {!usable ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground">
                Không tải được SKU sàn khi gian hàng chưa kết nối.
              </p>
            ) : !can(PERMISSIONS.listingMatch) ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground">Xem SKU sàn chưa liên kết cần quyền liên kết SKU.</p>
            ) : remoteQuery.isError ? (
              <div className="px-4 pb-6">
                <AlertMessage severity="error">{problemMessage(remoteQuery.error, 'remote_skus')}</AlertMessage>
              </div>
            ) : (
              <DataTable
                columns={remoteColumns}
                data={remoteRows}
                getRowId={(r) => r.externalSkuId}
                loading={remoteQuery.isLoading || (refreshRunning && !remoteQuery.data?.syncedAt)}
                fetching={remoteQuery.isFetching}
                empty={
                  searching
                    ? 'Không có SKU sàn khớp ô tìm kiếm'
                    : tab === 'pending'
                      ? 'Không có yêu cầu liên kết chờ duyệt'
                      : remoteQuery.data && !remoteQuery.data.syncedAt
                        ? 'Chưa tải SKU từ sàn'
                        : 'Mọi SKU sàn đã liên kết'
                }
              />
            )}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={pageRows}
            getRowId={(r) => r.variantId}
            onRowDoubleClick={(r) => navigate(ROUTES.company.catalogProduct(companyId, r.productId))}
            loading={listingsQuery.isLoading}
            fetching={listingsQuery.isFetching}
            empty={
              searching
                ? 'Không có SKU khớp ô tìm kiếm'
                : tab !== 'all'
                  ? 'Không còn SKU nào ở mục này'
                  : 'Công ty chưa có SKU đang bán'
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

      <MatchDialog
        open={Boolean(matching)}
        title={
          matching?.from === 'remote'
            ? matching.current
              ? 'Đổi liên kết SKU sàn'
              : 'Liên kết SKU sàn với SKU kho'
            : 'Liên kết SKU kho với SKU sàn'
        }
        description={
          matching?.from === 'remote' ? (
            <>
              SKU sàn <strong>{matching.title}</strong> ({matching.sellerSku || matching.externalSkuId}).{' '}
              {matching.current
                ? `Đang liên kết với ${matching.current.sku}. Chọn SKU kho khác hoặc không quản lý tồn. Gian hàng đã nhận đơn của SKU này thì đổi liên kết cần CEO duyệt; đơn đã nhận giữ liên kết cũ.`
                : 'Chọn SKU kho chưa liên kết, hoặc không quản lý tồn.'}
            </>
          ) : matching ? (
            <>
              SKU kho <strong>{matching.row.sku}</strong> · {matching.row.productName}. Chọn SKU sàn chưa liên kết.
            </>
          ) : null
        }
        searchLabel={matching?.from === 'remote' ? 'Tìm SKU kho theo tên hoặc mã SKU...' : 'Tìm SKU sàn...'}
        options={matchOptions}
        initialId={matching?.from === 'remote' ? (matching.current?.variantId ?? null) : null}
        empty={matching?.from === 'remote' ? 'Không còn SKU kho chưa liên kết' : 'Không còn SKU sàn chưa liên kết'}
        saving={matchMut.isPending}
        error={matchError}
        onSave={saveMatch}
        onClose={() => setMatching(null)}
        renderPreview={(id) =>
          !matching || id === UNMANAGED ? null : (
            <MatchPreviewPanel
              shopId={shopId}
              pair={
                matching.from === 'variant'
                  ? { externalSkuId: id, variantId: matching.row.variantId }
                  : { externalSkuId: matching.externalSkuId, variantId: id }
              }
            />
          )
        }
      />
      <PriceOverrideDialog
        row={pricing}
        saving={priceMut.isPending}
        fieldError={priceFieldError}
        error={priceError}
        onSave={(price) => void savePrice(price)}
        onClose={() => setPricing(null)}
      />
      <ConfirmDialog
        open={Boolean(delisting)}
        title="Gỡ khỏi sàn?"
        message={
          <>
            Gỡ <strong>{delisting?.sku}</strong> khỏi {shop?.shopName}. Khách không đặt được SKU này trên sàn nữa; liên kết
            SKU vẫn giữ để đăng lại sau.
          </>
        }
        confirmLabel="Gỡ khỏi sàn"
        destructive
        loading={delistMut.isPending}
        onConfirm={handleDelist}
        onClose={() => setDelisting(null)}
      />
      <ConfirmDialog
        open={Boolean(decidingOutside)}
        title={decidingOutside?.action === 'accept-price' ? 'Dùng giá trên sàn?' : 'Bật lại trên sàn?'}
        message={
          decidingOutside?.action === 'accept-price' ? (
            <>
              Lấy giá <strong>{priceText(decidingOutside.row.listing?.outsideChange?.platformPrice)}</strong> đang có trên sàn làm
              giá riêng của <strong>{decidingOutside.row.sku}</strong> ở {shop?.shopName}, rồi bật lại SKU.
            </>
          ) : (
            <>
              Dùng lại giá Commerio <strong>{priceText(decidingOutside?.row.price)}</strong> và bật lại{' '}
              <strong>{decidingOutside?.row.sku}</strong> trên {shop?.shopName}.
            </>
          )
        }
        confirmLabel={decidingOutside?.action === 'accept-price' ? 'Dùng giá trên sàn' : 'Bật lại'}
        loading={outsideMut.isPending}
        onConfirm={handleOutside}
        onClose={() => setDecidingOutside(null)}
      />
      <ConfirmDialog
        open={Boolean(updatingContent)}
        title="Cập nhật thông tin lên sàn?"
        message={
          <>
            Đưa tên, mô tả, thuộc tính mới của <strong>{updatingContent?.sku}</strong> lên {shop?.shopName}; sàn sẽ duyệt lại.
            Thường sàn vẫn bán bản cũ trong lúc duyệt; nếu sàn ngừng bán để duyệt, listing chuyển Chờ sàn duyệt. Ảnh, giá
            và tồn không đổi.
          </>
        }
        confirmLabel="Cập nhật"
        loading={contentMut.isPending}
        onConfirm={handleUpdateContent}
        onClose={() => setUpdatingContent(null)}
      />
      <ConfirmDialog
        open={Boolean(pushing)}
        title="Đăng bán lên sàn?"
        message={
          <>
            Đăng bán {pushing?.length} SKU lên {shop?.shopName}. <strong>{newCount} SKU chưa có trên sàn</strong> sẽ được tạo
            thành sản phẩm mới, và tự liên kết với SKU sàn vừa tạo.
          </>
        }
        confirmLabel="Đăng bán"
        loading={pushMut.isPending}
        onConfirm={() => pushing && push(pushing)}
        onClose={() => setPushing(null)}
      />
      <ConfirmDialog
        open={deciding?.action === 'approve'}
        title="Duyệt liên kết SKU sàn?"
        message={
          <>
            Liên kết SKU sàn <strong>{deciding?.label}</strong> với <strong>{deciding?.target}</strong>. Đơn mới của SKU
            này trừ tồn theo liên kết mới; đơn đã nhận giữ liên kết cũ.
          </>
        }
        confirmLabel="Duyệt liên kết"
        loading={decideMut.isPending}
        onConfirm={() => void decide()}
        onClose={() => setDeciding(null)}
      />
      <ReasonDialog
        open={deciding?.action === 'reject'}
        title="Từ chối liên kết SKU sàn?"
        message={
          <>
            Từ chối yêu cầu liên kết SKU sàn <strong>{deciding?.label}</strong> với <strong>{deciding?.target}</strong>.
            Liên kết cũ giữ nguyên. Lý do được ghi vào Nhật ký thao tác của gian hàng.
          </>
        }
        label="Lý do từ chối"
        confirmLabel="Từ chối liên kết"
        destructive
        loading={decideMut.isPending}
        error={decideError}
        onConfirm={(reason) => void decide(reason)}
        onClose={() => setDeciding(null)}
      />
    </div>
  );
}
