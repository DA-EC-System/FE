import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
import { AlertMessage } from '@/components/common/AlertMessage';
import { PlatformDetail } from '@/components/common/PlatformDetail';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  fetchProductSpec,
  useDecideMapping,
  useDelistListing,
  useIncompleteSpecs,
  useMatchListing,
  usePushListings,
  useRefreshRemoteSkus,
  useRemoteSkus,
  useRemoteSkusRefresh,
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
import {
  canUpdateContent,
  LISTED_STATUSES,
  LISTING_POLL_MAX_MS,
  listingPollDelay,
  listingStatusHint,
  outsideChangeHint,
  outsideChangeLabel,
  pendingRevisionHint,
  pendingRevisionLabel,
  pushErrorText,
  REPUSH_STATUSES,
  SPEC_FIX_CODES,
  pushBlockMessage,
  splitPushResults,
} from './listingPush';
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
type ListingTab = 'all' | 'unmatched' | 'pending' | 'not_listed' | 'stale' | 'failed' | 'held';

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

/** Lỗi đẩy của một biến thể; giữ `code` để gắn lối sửa (vd `category_unmapped`) */
/** Lỗi đẩy sửa được trong trang sản phẩm: hiện lối sang trang đó (FE#261) */
const PRODUCT_FIX_CODES = new Set<string | undefined>(['images_missing', 'size_chart_missing', 'listing_check_failed']);

/** Sàn lưu thông tin sàn của sản phẩm (Documents/21 §18.5) */
const SPEC_PLATFORMS: ReadonlySet<string> = new Set(['lazada', 'tiktok']);

function SpecLink({ label, onClick, testId = 'open-spec' }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    >
      {label}
    </Button>
  );
}

function EditProductLink({ companyId, productId }: { companyId: string; productId: string }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={(e) => {
        e.stopPropagation();
        navigate(ROUTES.company.catalogProduct(companyId, productId));
      }}
      data-testid="edit-product"
    >
      Sửa sản phẩm
    </Button>
  );
}

interface PushError {
  code?: string;
  message: string;
}

/**
 * Tab theo Test_UI `v-listing`. "Chưa ghép" là SKU trên sàn chưa ghép biến thể nào;
 * các tab còn lại lọc biến thể Commerio theo trạng thái listing (sơ đồ C2).
 */
const LISTING_TABS: { value: ListingTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unmatched', label: 'Chưa ghép' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'not_listed', label: 'Chưa lên sàn' },
  { value: 'stale', label: 'Giá chưa đẩy' },
  { value: 'failed', label: 'Đẩy lỗi' },
  { value: 'held', label: 'Sàn khoá, đã ẩn' },
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
  const canEditProduct = can(PERMISSIONS.productManage);
  /** Quyết thay đổi ngoài app: `listing.manage` + vai trò CEO (§18.3, commerio-backend#360) */
  const canDecideOutside = canManage && Boolean(companyContext?.roles.includes('CEO'));
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
  // Lượt tải SKU sàn chạy nền (§18.3, BE#361): mở trang lần đầu hay bấm Tải lại thì BE chạy nền, FE hỏi lại tới khi xong
  const remoteRefresh = remoteQuery.data?.refresh ?? null;
  const refreshPoll = useRemoteSkusRefresh(shopId, remoteRefresh);
  const refreshing = refreshMut.isPending || refreshPoll.running;
  /** Lượt do người dùng bấm Tải lại: xong thì báo bằng toast */
  const userRefresh = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const retrySeconds = remoteRefresh?.status === 'failed' ? (remoteRefresh.error?.retryAfterSeconds ?? null) : null;
  // Đếm ngược số phút được tải lại theo `error.retryAfterSeconds`, tính từ lúc nhận phản hồi
  useEffect(() => {
    if (!retrySeconds) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [retrySeconds]);
  const secondsLeft =
    retrySeconds === null ? null : Math.max(0, retrySeconds - Math.max(0, now - remoteQuery.dataUpdatedAt) / 1000);
  const refreshFailure =
    remoteRefresh?.status === 'failed' && remoteRefresh.error
      ? remoteRefreshErrorMessage(remoteRefresh.error, secondsLeft)
      : null;
  useEffect(() => {
    if (!remoteRefresh || remoteRefresh.status === 'running' || userRefresh.current !== remoteRefresh.startedAt) return;
    userRefresh.current = null;
    if (remoteRefresh.status === 'succeeded') toast.success('Đã tải lại SKU trên sàn');
    else if (remoteRefresh.error) {
      toast.error(remoteRefreshErrorMessage(remoteRefresh.error, remoteRefresh.error.retryAfterSeconds));
    }
  }, [remoteRefresh]);
  const pushMut = usePushListings();
  const delistMut = useDelistListing();
  const outsideMut = useResolveOutsideChange();
  const contentMut = useUpdateListingContent();
  const decideMut = useDecideMapping();
  const syncMut = useSyncListings();
  const listingReview = shop?.capabilities.listingReview ?? false;
  const { startTour } = usePageGuide('shop-listings', { ready: Boolean(shop) && listingsQuery.isSuccess });
  const connector = useStartConnect();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ListingTab>('all');
  const [delisting, setDelisting] = useState<ListingRow | null>(null);
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
  /** Biến thể đang đọc thông tin sàn trước khi đẩy sản phẩm mới */
  const [checkingSpec, setCheckingSpec] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
    p.variantId ? (items.find((r) => r.variantId === p.variantId)?.sku ?? 'biến thể khác') : 'Không quản tồn';

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
          ? `Đã duyệt ghép SKU sàn ${label}`
          : `Đã từ chối ghép SKU sàn ${label}. Ghép cũ giữ nguyên.`,
      );
      reloadMatching();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.errors?.reason) {
        setDecideError(problem.errors.reason);
      } else if (problem?.code === 'version_conflict') {
        setDeciding(null);
        toast.warning(`Ghép SKU sàn ${label} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại dữ liệu.`);
        reloadMatching();
      } else if (problem?.code === 'invalid_transition') {
        setDeciding(null);
        toast.info(`Yêu cầu ghép SKU sàn ${label} đã được xử lý hoặc không còn. Đã nạp lại dữ liệu.`);
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
        <RowAction label="Duyệt ghép" onClick={() => openDecide('approve', listingId, version, label, p)}>
          <Check />
        </RowAction>
        <RowAction label="Từ chối ghép" destructive onClick={() => openDecide('reject', listingId, version, label, p)}>
          <X />
        </RowAction>
      </>
    ) : null;

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

  // Tải lại SKU sàn (§18.3, BE#361): 202 thì chờ lượt chạy nền xong mới báo; 200 là lượt thành công trong 60 giây.
  // Lỗi trả ngay trên POST (429 kèm số phút chờ, gian hàng chưa nối) báo luôn
  const refreshRemote = () =>
    refreshMut.mutate(shopId, {
      onSuccess: (data) => {
        if (!('items' in data) && data.refresh?.status === 'running') userRefresh.current = data.refresh.startedAt;
        else toast.success('Đã tải lại SKU trên sàn');
      },
      onError: (e) =>
        toast.error(
          isTimeout(e)
            ? 'Sàn trả danh sách SKU quá lâu. Thử lại sau ít phút; danh sách đang có vẫn giữ nguyên.'
            : problemMessage(e, 'remote_skus'),
        ),
    });

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
      const done = action === 'restore' ? `Đã đẩy lại giá Commerio cho ${row.sku}` : `Đã nhận giá trên sàn cho ${row.sku}`;
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
          ? `Đã đưa nội dung mới của ${row.sku} lên sàn. Sàn tạm ngừng bán để duyệt lại.`
          : `Đã đưa nội dung mới của ${row.sku} lên sàn. Sàn đang duyệt, listing vẫn bán bản cũ.`,
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
   * Đẩy sản phẩm mới một dòng: thông tin sàn đủ thì hỏi rồi đẩy như cũ, chưa có hay còn thiếu thì mở trang 4 bước
   * (commerio-backend#400). Đẩy nhiều dòng một lần vẫn gửi thẳng, dòng thiếu thông tin sàn có nút Sửa thông tin sàn
   */
  const requestNewPush = async (row: ListingRow) => {
    if (!specPlatform) return requestPush([row]);
    setCheckingSpec(row.variantId);
    try {
      const spec = await fetchProductSpec(queryClient, companyId, row.productId, specPlatform);
      if (spec.spec && !spec.missing.length) requestPush([row]);
      else openSpec(row.productId);
    } catch (e) {
      toast.error(problemMessage(e));
    } finally {
      setCheckingSpec(null);
    }
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
        toast.success(`Đã xếp ${queued} biến thể vào hàng đẩy lên sàn. Trang tự cập nhật khi sàn trả kết quả.`);
        setSelection(new Set());
      }
      if (blocked.length) toast.warning(`${blocked.length} biến thể không đẩy được, xem lý do ở cột Trạng thái`);
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
          ? 'Đã xếp lượt đồng bộ với sàn. Bảng tự tải lại sau khoảng 15 giây; chưa thấy đổi thì tải lại trang.'
          : 'Gian hàng đã có lượt đồng bộ đang chờ, không xếp thêm.',
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
  /**
   * Dòng đã ghép SKU mà thông tin sàn chưa có hoặc còn thiếu: nút Bổ sung thông tin (AC11). ListingRow chưa mang trạng
   * thái spec nên đọc GET spec theo từng sản phẩm (ghi ở worklog FE2)
   */
  const matchedProductIds = useMemo(
    () => (specPlatform ? [...new Set(items.filter((r) => r.listing && onPlatform(r.listing.status)).map((r) => r.productId))] : []),
    [items, specPlatform],
  );
  const incompleteSpecs = useIncompleteSpecs(matchedProductIds, specPlatform);
  const incompleteKey = [...incompleteSpecs].join(',');

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
      {
        accessorKey: 'sku',
        header: 'SKU Commerio',
        meta: { className: 'w-40' },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
      },
      {
        id: 'price',
        header: 'Giá ở gian hàng này',
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
          // Tên trong bản sao SKU sàn (FE#294): chưa tải hoặc SKU đã xoá trên sàn thì không hiện
          const remoteTitle = canMatch && l.externalSkuId ? remoteTitles.get(l.externalSkuId) : undefined;
          return (
            <div className="grid" data-testid="remote-sku">
              <span className="font-mono text-xs">{l.sellerSku || '—'}</span>
              <span className="font-mono text-xs text-muted-foreground">{l.externalSkuId ?? 'Sàn chưa trả mã'}</span>
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
        cell: ({ row }) => {
          const r = row.original;
          const err = pushErrors.get(r.variantId);
          if (err) {
            return (
              <div className="flex flex-col items-start gap-1">
                <span className="text-destructive" data-testid="push-error">
                  {err.message}
                </span>
                {err.code && SPEC_FIX_CODES.has(err.code) && canManage && specPlatform && (
                  <SpecLink label="Sửa thông tin sàn" onClick={() => openSpec(r.productId)} />
                )}
                {PRODUCT_FIX_CODES.has(err.code) && canEditProduct && (
                  <EditProductLink companyId={companyId} productId={r.productId} />
                )}
              </div>
            );
          }
          const l = r.listing;
          if (!l) return <Badge variant="info">Chưa lên sàn</Badge>;
          const live = onPlatform(l.status);
          const pushErr = (l.status === 'push_failed' || l.status === 'pushing') && l.pushError ? pushErrorText(l.pushError) : null;
          const note =
            l.status === 'rejected'
              ? l.rejectReason
              : pushErr
                ? l.status === 'pushing'
                  ? `Đang thử lại (${l.pushAttempts} lần): ${pushErr.text}`
                  : pushErr.text
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
              {l.pendingMapping && (
                <PendingBadge id={`pending-${r.variantId}`} pending={l.pendingMapping} target={pendingTarget(l.pendingMapping)} />
              )}
              {note && (
                <span
                  className={l.status === 'hidden' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
                  data-testid="listing-note"
                >
                  {note}
                </span>
              )}
              <PlatformDetail text={pushErr?.platformMessage} />
              {l.status === 'push_failed' &&
                l.pushError &&
                PRODUCT_FIX_CODES.has(l.pushError.code) &&
                canEditProduct && <EditProductLink companyId={companyId} productId={r.productId} />}
              {l.status === 'push_failed' && l.pushError && SPEC_FIX_CODES.has(l.pushError.code) && canManage && specPlatform && (
                <SpecLink label="Sửa thông tin sàn" onClick={() => openSpec(r.productId)} />
              )}
              {onPlatform(l.status) && incompleteSpecs.has(r.productId) && canManage && (
                <SpecLink label="Bổ sung thông tin sàn" onClick={() => openSpec(r.productId, true)} testId="fill-spec" />
              )}
              {l.outsideChange && (
                <SyncBadge
                  id={`outside-change-${r.variantId}`}
                  variant="warning"
                  label={outsideChangeLabel(l.outsideChange)}
                  hint={outsideChangeHint(l.outsideChange)}
                  testId="outside-change"
                />
              )}
              {l.pendingRevision && (
                <SyncBadge
                  id={`pending-revision-${r.variantId}`}
                  variant={l.pendingRevision.status === 'failed' ? 'destructive' : 'secondary'}
                  label={pendingRevisionLabel(l.pendingRevision)}
                  hint={pendingRevisionHint(l.pendingRevision)}
                  testId="pending-revision"
                />
              )}
              {l.pendingRevision?.status === 'failed' && (
                <span className="text-xs text-destructive" data-testid="revision-reason">
                  {l.pendingRevision.rejectReason ? `Sàn báo: ${l.pendingRevision.rejectReason}` : 'Sàn không nêu lý do'}
                </span>
              )}
              {l.status === 'hidden' && !l.outsideChange && l.hiddenBy !== 'zero_stock' && (
                <SyncBadge
                  id={`hidden-paused-${r.variantId}`}
                  variant="secondary"
                  label="Đã ẩn: SKU tạm ngừng"
                  hint="Bỏ tạm ngừng ở trang sản phẩm thì SKU tự hiện lại trên sàn. Không ẩn hoặc hiện tay ở đây."
                  testId="hidden-paused"
                />
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
              {/* Đẩy tồn lỗi thì BE giữ stockSync='pending' kèm stockSyncError: chỉ hiện nhãn lỗi bên dưới */}
              {live && l.stockSync === 'pending' && !l.stockSyncError && (
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
              ? 'Đang đẩy, chờ sàn trả kết quả'
              : status && LISTED_STATUSES.includes(status)
                ? 'Đã lên sàn. Giá và tồn cập nhật bằng nút Đồng bộ'
                : null;
          return (
            <div className="flex justify-end gap-1" data-guide={canMatch ? 'listings-match' : undefined}>
              {r.listing &&
                decideActions(r.listing.id, r.listing.version, r.listing.sellerSku || r.sku, r.listing.pendingMapping)}
              {canMatch && (
                <RowAction
                  label={r.listing ? 'Đổi ghép' : 'Ghép'}
                  reason={matchBlock(r)}
                  onClick={() => (r.listing ? openRemap(r) : openMatch({ from: 'variant', row: r }))}
                >
                  <Link2 />
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
                  reason={pushMut.isPending ? 'Đang đẩy...' : checkingSpec === r.variantId ? 'Đang đọc thông tin sàn...' : busy}
                  onClick={() => (r.listing ? requestPush([r]) : void requestNewPush(r))}
                >
                  <Upload />
                </RowAction>
              )}
              {canDecideOutside && r.listing?.outsideChange && (
                <>
                  <RowAction
                    label="Bật lại, đẩy giá Commerio"
                    reason={outsideMut.isPending ? 'Đang gửi...' : null}
                    onClick={() => setDecidingOutside({ row: r, action: 'restore' })}
                  >
                    <Power />
                  </RowAction>
                  {r.listing.outsideChange.kind === 'price_changed' && (
                    <RowAction
                      label="Nhận giá trên sàn"
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
                  label="Sửa nội dung"
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
  }, [canManage, canMatch, canEditProduct, canDecide, canDecideOutside, outsideMut.isPending, contentMut.isPending, shop?.platform, companyId, items, remoteSkus, remoteTitles, selection, rows, allFilteredSelected, someFilteredSelected, pushErrors, checkingSpec, incompleteKey, specPlatform, remoteQuery.isError, pushMut.isPending, listingReview]);

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
        id: 'pending',
        header: 'Trạng thái',
        meta: { className: 'min-w-40' },
        cell: ({ row }) => {
          const r = row.original;
          const current = r.matchedVariantId
            ? `Đang ghép ${items.find((x) => x.variantId === r.matchedVariantId)?.sku ?? 'biến thể khác'}`
            : r.mode === 'unmanaged'
              ? 'Đang không quản tồn'
              : 'Chưa ghép';
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
        title={shop ? `Sản phẩm trên sàn và giá · ${shop.shopName}` : 'Sản phẩm trên sàn và giá'}
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
      {shop && <OpeningStocktakeBanner shop={shop} companyId={companyId} />}
      {shop && <ReturnWindowPanel shop={shop} />}
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:ms-auto md:self-center">
            <p className="text-sm text-muted-foreground" data-testid="match-summary">
              Đã ghép {items.filter((r) => r.listing).length} / {items.length} biến thể
            </p>
            {/* Bản sao SKU sàn dùng chung cho mọi tab (tên trên sàn, hộp Đổi ghép, tab Chưa ghép) nên Tải lại nằm ở đây (FE#294) */}
            {canMatch && (
              <>
                <p className="text-sm text-muted-foreground" data-testid="remote-synced">
                  {refreshPoll.running
                    ? 'Đang tải SKU trên sàn, bảng tự cập nhật khi xong.'
                    : remoteQuery.data?.syncedAt
                      ? `SKU trên sàn tải lúc ${formatDateTime(remoteQuery.data.syncedAt)}`
                      : null}
                </p>
                <Button size="sm" variant="outline" disabled={refreshing} onClick={refreshRemote}>
                  <RefreshCw className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} />
                  {refreshing ? 'Đang tải danh sách SKU…' : 'Tải lại'}
                </Button>
              </>
            )}
          </div>
        </FilterBar>
        {usable && canMatch && (refreshFailure || refreshPoll.stuck || refreshPoll.error) && (
          <div className="px-4 pb-3" data-testid="remote-refresh-alert">
            <AlertMessage severity={refreshPoll.stuck ? 'warning' : 'error'}>
              {refreshPoll.stuck
                ? 'Tải danh sách SKU lâu bất thường. Tải lại trang để xem kết quả.'
                : refreshPoll.error
                  ? problemMessage(refreshPoll.error, 'remote_skus')
                  : refreshFailure}
            </AlertMessage>
          </div>
        )}
        {tab === 'unmatched' || tab === 'pending' ? (
          <div data-testid="remote-section">
            <p className="max-w-prose px-4 pb-3 text-sm text-muted-foreground" data-testid="remote-hint">
              {tab === 'pending'
                ? canDecide
                  ? 'SKU sàn có yêu cầu ghép chờ CEO duyệt. Duyệt thì ghép mới có hiệu lực; từ chối thì ghép cũ giữ nguyên.'
                  : 'SKU sàn có yêu cầu ghép chờ CEO duyệt. Trong lúc chờ, ghép cũ giữ nguyên.'
                : 'SKU trên sàn chưa ghép với biến thể nào. Ghép để đơn của các SKU này trừ đúng tồn và nhận giá từ Commerio. Vừa thêm SKU trên sàn thì bấm Tải lại.'}
            </p>
            {!usable ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground">
                Không tải được SKU trên sàn khi gian hàng chưa kết nối.
              </p>
            ) : !can(PERMISSIONS.listingMatch) ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground">Xem SKU sàn chưa ghép cần quyền ghép SKU.</p>
            ) : remoteQuery.isError ? (
              <div className="px-4 pb-6">
                <AlertMessage severity="error">{problemMessage(remoteQuery.error, 'remote_skus')}</AlertMessage>
              </div>
            ) : (
              <DataTable
                columns={remoteColumns}
                data={remoteRows}
                getRowId={(r) => r.externalSkuId}
                loading={remoteQuery.isLoading || (refreshPoll.running && !remoteQuery.data?.syncedAt)}
                fetching={remoteQuery.isFetching}
                empty={
                  searching
                    ? 'Không có SKU sàn khớp ô tìm kiếm'
                    : tab === 'pending'
                      ? 'Không có yêu cầu ghép nào chờ duyệt'
                      : remoteQuery.data && !remoteQuery.data.syncedAt
                        ? 'Chưa có danh sách SKU trên sàn'
                        : 'Mọi SKU trên sàn đã được ghép'
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
        open={Boolean(decidingOutside)}
        title={decidingOutside?.action === 'accept-price' ? 'Nhận giá trên sàn?' : 'Bật lại trên sàn?'}
        message={
          decidingOutside?.action === 'accept-price' ? (
            <>
              Lấy giá <strong>{priceText(decidingOutside.row.listing?.outsideChange?.platformPrice)}</strong> đang có trên sàn làm
              giá riêng của <strong>{decidingOutside.row.sku}</strong> ở {shop?.shopName}, rồi bật lại SKU.
            </>
          ) : (
            <>
              Đẩy lại giá Commerio <strong>{priceText(decidingOutside?.row.price)}</strong> và bật lại{' '}
              <strong>{decidingOutside?.row.sku}</strong> trên {shop?.shopName}.
            </>
          )
        }
        confirmLabel={decidingOutside?.action === 'accept-price' ? 'Nhận giá trên sàn' : 'Bật lại'}
        loading={outsideMut.isPending}
        onConfirm={handleOutside}
        onClose={() => setDecidingOutside(null)}
      />
      <ConfirmDialog
        open={Boolean(updatingContent)}
        title="Sửa nội dung trên sàn?"
        message={
          <>
            Đưa tên, mô tả, thuộc tính mới của <strong>{updatingContent?.sku}</strong> lên {shop?.shopName}; sàn sẽ duyệt lại.
            Thường sàn vẫn bán bản cũ trong lúc duyệt; nếu sàn ngừng bán để duyệt, listing chuyển Chờ sàn duyệt. Ảnh, giá
            và tồn không đổi.
          </>
        }
        confirmLabel="Đưa lên sàn"
        loading={contentMut.isPending}
        onConfirm={handleUpdateContent}
        onClose={() => setUpdatingContent(null)}
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
      <ConfirmDialog
        open={deciding?.action === 'approve'}
        title="Duyệt ghép SKU sàn?"
        message={
          <>
            Ghép SKU sàn <strong>{deciding?.label}</strong> với <strong>{deciding?.target}</strong>. Đơn mới của SKU
            này trừ tồn theo ghép mới; đơn đã nhận giữ ghép cũ.
          </>
        }
        confirmLabel="Duyệt ghép"
        loading={decideMut.isPending}
        onConfirm={() => void decide()}
        onClose={() => setDeciding(null)}
      />
      <ReasonDialog
        open={deciding?.action === 'reject'}
        title="Từ chối ghép SKU sàn?"
        message={
          <>
            Từ chối yêu cầu ghép SKU sàn <strong>{deciding?.label}</strong> với <strong>{deciding?.target}</strong>.
            Ghép cũ giữ nguyên; người xin ghép thấy lý do trong nhật ký.
          </>
        }
        label="Lý do từ chối"
        confirmLabel="Từ chối ghép"
        destructive
        loading={decideMut.isPending}
        error={decideError}
        onConfirm={(reason) => void decide(reason)}
        onClose={() => setDeciding(null)}
      />
    </div>
  );
}

/** Nhãn "Chờ CEO duyệt" của ghép chờ (§18.6.5): tooltip nêu người xin, lúc xin và đích ghép */
function PendingBadge({ id, pending, target }: { id: string; pending: PendingMapping; target: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" data-testid="pending-mapping" tabIndex={0} aria-describedby={id}>
          Chờ CEO duyệt
        </Badge>
      </TooltipTrigger>
      <TooltipContent id={id} className="max-w-64" data-testid="pending-mapping-hint">
        {pending.requestedBy.name} xin ghép với {target} · {formatDateTime(pending.requestedAt)}
      </TooltipContent>
    </Tooltip>
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
  variant: 'secondary' | 'destructive' | 'warning';
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
