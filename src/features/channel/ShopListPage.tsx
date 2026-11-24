import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { MoreHorizontal, PlugZap, Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useShops, useShopPlatforms, useSyncShop } from '@/api/shops.api';
import { getErrorMessage } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDate, formatDateTime } from '@/utils/format';
import type { Shop } from '@/types/shop';
import {
  hasCategoryChangeIssue,
  lastOrderPull,
  missingReturnWindow,
  needsAction,
  shopDisplayName,
  shopPage,
  shopPlatformOptions,
  type ShopSegment,
} from './shopList';
import { RETURN_WINDOW_EDIT } from './ReturnWindowPanel';
import { authorizationDeadline, platformLabel, STATUS_META } from './shopSchemas';
import { useStartConnect } from './useStartConnect';
import { AddShopDialog } from './AddShopDialog';
import { ReconnectTokenDialog } from './ReconnectTokenDialog';
import { ShopDeleteDialog } from './ShopDeleteDialog';
import { ShopDisconnectDialog } from './ShopDisconnectDialog';
import { ShopRenameDialog } from './ShopRenameDialog';

/** Lý do một thao tác trên dòng bị khoá, theo trạng thái gian hàng (Test_UI) */
const BLOCKED_BY_STATUS: Record<Shop['status'], string | null> = {
  connecting: 'Chưa thiết lập',
  active: null,
  needs_reauth: 'Mất uỷ quyền, cần kết nối lại',
  disconnected: 'Đã ngắt kết nối',
};

/** Dòng chữ nhỏ dưới chip trạng thái */
function StatusLine({ shop, companyId }: { shop: Shop; companyId: string }) {
  const deadline = authorizationDeadline(shop);
  return (
    <>
      {shop.status === 'connecting' && (
        <span className="text-xs text-muted-foreground" data-testid="shop-status-line">
          Đã uỷ quyền, chưa thiết lập
        </span>
      )}
      {shop.status === 'active' && shop.tokenExpiringSoon && (
        <span className="text-xs text-warning" data-testid="shop-expiring">
          Sắp hết hạn uỷ quyền{deadline && <> · Kết nối lại trước {formatDate(deadline)}</>}
        </span>
      )}
      {shop.status === 'needs_reauth' && shop.statusChangedAt && (
        <span className="text-xs text-muted-foreground" data-testid="shop-status-line">
          Từ {formatDateTime(shop.statusChangedAt)}
        </span>
      )}
      {shop.status === 'disconnected' && (
        <span className="text-xs text-muted-foreground" data-testid="shop-status-line">
          {shop.statusChangedAt ? `Từ ${formatDate(shop.statusChangedAt)}, vẫn giữ lịch sử` : 'Vẫn giữ lịch sử'}
        </span>
      )}
      {missingReturnWindow(shop) && (
        // Bấm thì mở trang gian hàng với ô sửa hạn trả đang mở (FE#273); không kích hoạt bấm dòng
        <Link
          to={`${ROUTES.company.shop(companyId, shop.id)}?${RETURN_WINDOW_EDIT}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-warning underline underline-offset-2"
          data-testid="shop-missing-return-window"
        >
          Chưa đặt hạn trả hàng
        </Link>
      )}
      {hasCategoryChangeIssue(shop) && (
        <Link
          to={`${ROUTES.company.shop(companyId, shop.id)}?tab=category`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-warning underline underline-offset-2"
          data-testid="shop-category-change-issues"
        >
          Đổi category trên sàn chưa xong ({shop.categoryChangeIssues})
        </Link>
      )}
      {shop.pendingJobs > 0 && (
        <span className="text-xs text-muted-foreground" data-testid="shop-pending-jobs">
          {shop.pendingJobs} cập nhật chờ gửi sàn
        </span>
      )}
    </>
  );
}

/** UC-CH-01: gian hàng của công ty và kết nối gian hàng mới qua OAuth */
export function ShopListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canConnect = can(PERMISSIONS.shopConnect);
  const canDisconnect = can(PERMISSIONS.shopDisconnect);
  const canSync = can(PERMISSIONS.shopSync);
  const canFeeConfig = can(PERMISSIONS.financeConfigManage) || can(PERMISSIONS.financeConfigApprove);
  // Xoá gian hàng đã ngắt (commerio-backend#398): quyền ngắt và vai trò CEO
  const canDelete = canDisconnect && Boolean(companyContext?.roles.includes('CEO'));

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [platform, setPlatform] = useState('');
  const [segment, setSegment] = useState<ShopSegment>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [disconnecting, setDisconnecting] = useState<Shop | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [tokenReconnecting, setTokenReconnecting] = useState<Shop | null>(null);
  // Màn kết quả "Thêm gian hàng khác" quay về đây và mở luôn hộp thêm
  const [adding, setAdding] = useState(
    () => canConnect && Boolean((location.state as { addShop?: boolean } | null)?.addShop),
  );
  // Đang ở trang này mà chọn "Thêm gian hàng" trong bảng lệnh (FE#133): điều hướng mới mang addShop thì mở hộp
  const [seenNav, setSeenNav] = useState(location.key);
  if (seenNav !== location.key) {
    setSeenNav(location.key);
    if (canConnect && (location.state as { addShop?: boolean } | null)?.addShop) setAdding(true);
  }

  const shopsQuery = useShops();
  const allShops = shopsQuery.data?.items ?? [];
  // Tên sàn cho cột Sàn và cách nối của từng sàn (Kết nối lại bằng token, commerio-backend#398): tải khi có quyền kết nối
  const platformsQuery = useShopPlatforms({ enabled: canConnect });
  const shopOptions = shopPlatformOptions(allShops);
  const actionCount = allShops.filter(needsAction).length;
  const visibleShops = shopPage(allShops, { page, pageSize, search: debouncedSearch, platform, segment });
  // Lấy từ danh sách mới nhất: nạp lại sau 409 thì hộp xoá gửi version mới
  const deleting = deletingId ? (allShops.find((s) => s.id === deletingId) ?? null) : null;
  const renaming = renamingId ? (allShops.find((s) => s.id === renamingId) ?? null) : null;
  const syncMut = useSyncShop();
  const connector = useStartConnect();

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const openShop = (s: Shop) => navigate(ROUTES.company.shop(companyId, s.id));
  // Gian hàng đang thiết lập mở thẳng wizard (chỉ người có quyền kết nối)
  const openRow = (s: Shop) =>
    navigate(
      s.status === 'connecting' && canConnect
        ? ROUTES.company.shopSetup(companyId, s.id)
        : ROUTES.company.shop(companyId, s.id),
    );
  // Cách nối sàn cho phép (GET /channel/shops/platforms); null khi chưa tải
  const methodsOf = (code: string) => platformsQuery.data?.items.find((p) => p.platform === code)?.methods ?? null;
  // Dán token cho đúng gian hàng đang mất quyền hoặc đã ngắt (gửi shopId, commerio-backend#398)
  const canTokenReconnect = (s: Shop) =>
    canConnect && (s.status === 'needs_reauth' || s.status === 'disconnected') && Boolean(methodsOf(s.platform)?.includes('token'));
  // Kết nối lại: uỷ quyền trên sàn kèm shopId; sàn chỉ cho dán token thì mở hộp dán token của gian hàng đó
  const reconnect = (s: Shop) => {
    const methods = methodsOf(s.platform);
    if (methods && !methods.includes('oauth') && methods.includes('token')) setTokenReconnecting(s);
    else void connector.start({ platform: s.platform, shopId: s.id });
  };
  const needsReauth = allShops.filter((s) => s.status === 'needs_reauth');

  const sync = async (s: Shop) => {
    try {
      const r = await syncMut.mutateAsync(s.id);
      toast.success(`Đã đồng bộ đơn của ${shopDisplayName(s)}: ${r.created} đơn mới, ${r.updated} đơn cập nhật`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const columns = useMemo<ColumnDef<Shop>[]>(
    () => [
      {
        id: 'shopName',
        header: 'Gian hàng',
        meta: { className: 'min-w-52' },
        // Tên hiển thị trước; tên trên sàn (có khi là mã thô SANDBOX_VN…) xuống dòng phụ kèm mã gian hàng (FE#464)
        cell: ({ row }) => {
          const s = row.original;
          const name = shopDisplayName(s);
          return (
            <div className="min-w-0">
              <p className="truncate font-medium" data-testid="shop-display-name">
                {name}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground" title={`${s.shopName} · ${s.externalShopId}`}>
                {name !== s.shopName && <>{s.shopName} · </>}
                {s.externalShopId}
              </p>
            </div>
          );
        },
      },
      {
        id: 'platform',
        header: 'Sàn',
        meta: { className: 'w-32' },
        cell: ({ row }) =>
          platformLabel(
            row.original.platform,
            row.original.platformName ?? platformsQuery.data?.items.find((p) => p.platform === row.original.platform)?.name,
          ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-48' },
        cell: ({ row }) => (
          <div className="grid justify-items-start gap-1">
            <span data-testid="shop-status" className="inline-flex">
              <StatusBadge status={row.original.status} statuses={STATUS_META} />
            </span>
            <StatusLine shop={row.original} companyId={companyId} />
          </div>
        ),
      },
      {
        accessorKey: 'listingCount',
        header: 'SKU đã liên kết',
        meta: { className: 'w-20 text-right' },
      },
      {
        id: 'unlinked',
        header: 'SKU sàn chưa liên kết',
        meta: { className: 'w-24 text-right' },
        // §18.12: gian hàng đang bán còn SKU sàn chưa liên kết thì mở thẳng tab đó; BE cũ chưa trả thì "—"
        cell: ({ row }) => {
          const n = row.original.unlinkedSkuCount;
          if (n === undefined) return <span className="text-muted-foreground">—</span>;
          if (!n || row.original.status !== 'active') return n;
          return (
            <Link
              to={`${ROUTES.company.shop(companyId, row.original.id)}?tab=unmatched`}
              className="font-medium text-warning-text underline-offset-4 hover:underline"
              data-testid="shop-unlinked-link"
              onClick={(e) => e.stopPropagation()}
            >
              {n}
            </Link>
          );
        },
      },
      {
        id: 'orders7d',
        header: 'Đơn 7 ngày',
        meta: { className: 'w-24 text-right' },
        // BE chưa trả orders7d (phần 18.7.1 còn lại) thì "—", không để ô trống
        cell: ({ row }) => row.original.orders7d ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'feeConfig',
        header: 'Phí sàn & thuế',
        meta: { className: 'w-28' },
        cell: ({ row }) => {
          const s = row.original;
          if (s.status === 'disconnected') return <span className="text-muted-foreground">Không áp dụng</span>;
          return s.feeConfigVersion != null ? `Phiên bản ${s.feeConfigVersion}` : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'lastOrderSyncAt',
        header: 'Đồng bộ đơn gần nhất',
        meta: { className: 'w-40 whitespace-nowrap' },
        // Mốc muộn nhất của mọi lượt kéo đơn, gồm lượt đơn còn mở sau thiết lập: khớp với "Đơn 7 ngày" (FE#464)
        cell: ({ row }) => {
          const s = row.original;
          const pull = lastOrderPull(s);
          return (
            <div className="grid gap-0.5" data-testid="shop-last-order-pull">
              {pull ? formatDateTime(pull.at) : <span className="text-muted-foreground">Chưa đồng bộ</span>}
              {pull?.openOrdersOnly && <span className="text-xs text-muted-foreground">Đơn còn mở lúc thiết lập</span>}
              {s.orderPullError && (
                <span className="text-xs text-destructive" title={s.orderPullError}>
                  Lượt kéo gần nhất lỗi
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        meta: { className: 'w-36 text-right' },
        cell: ({ row }) => {
          const s = row.original;
          const lost = s.status === 'needs_reauth' || s.status === 'disconnected';
          const blocked = BLOCKED_BY_STATUS[s.status];
          const syncing = syncMut.isPending && syncMut.variables === s.id;
          const primary =
            lost && canConnect ? (
              <Button size="sm" disabled={connector.pending} onClick={() => reconnect(s)}>
                Kết nối lại
              </Button>
            ) : s.status === 'connecting' && canConnect ? (
              <Button size="sm" onClick={() => navigate(ROUTES.company.shopSetup(companyId, s.id))}>
                Thiết lập
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => openShop(s)}>
                Listing & giá
              </Button>
            );
          const setupReason =
            s.status === 'connecting' ? null : s.status === 'active' ? 'Đã xong thiết lập lần đầu' : blocked;
          return (
            // Dòng bảng bấm được để mở gian hàng: nút trong ô không mở theo
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {primary}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Thao tác khác với ${shopDisplayName(s)}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem onSelect={() => openShop(s)}>Listing & giá</DropdownMenuItem>
                  {canConnect && <DropdownMenuItem onSelect={() => setRenamingId(s.id)}>Đổi tên hiển thị</DropdownMenuItem>}
                  {canConnect && (
                    <MenuItem
                      label="Thiết lập lần đầu"
                      reason={setupReason}
                      onSelect={() => navigate(ROUTES.company.shopSetup(companyId, s.id))}
                    />
                  )}
                  {canSync && (
                    <MenuItem
                      label="Đồng bộ đơn ngay"
                      reason={blocked ?? (syncing ? 'Đang đồng bộ đơn...' : null)}
                      onSelect={() => void sync(s)}
                    />
                  )}
                  {canFeeConfig && (
                    <MenuItem
                      label="Phí sàn & thuế"
                      reason={s.status === 'disconnected' ? 'Đã ngắt kết nối' : null}
                      onSelect={() => navigate(ROUTES.company.financeConfigs(companyId))}
                    />
                  )}
                  {((canDisconnect && s.status !== 'disconnected') ||
                    ((canConnect || canDelete) && s.status === 'disconnected') ||
                    canTokenReconnect(s)) && <DropdownMenuSeparator />}
                  {canDisconnect && s.status !== 'disconnected' && (
                    <DropdownMenuItem variant="destructive" onSelect={() => setDisconnecting(s)}>
                      Ngắt kết nối
                    </DropdownMenuItem>
                  )}
                  {canConnect && s.status === 'disconnected' && (
                    <DropdownMenuItem disabled={connector.pending} onSelect={() => reconnect(s)}>
                      Kết nối lại
                    </DropdownMenuItem>
                  )}
                  {canTokenReconnect(s) && (
                    <DropdownMenuItem disabled={connector.pending} onSelect={() => setTokenReconnecting(s)}>
                      Kết nối lại bằng token
                    </DropdownMenuItem>
                  )}
                  {canDelete && s.status === 'disconnected' && (
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeletingId(s.id)}>
                      Xoá gian hàng
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canConnect, canDisconnect, canDelete, canSync, canFeeConfig, companyId, syncMut.isPending, syncMut.variables, connector.pending, platformsQuery.data],
  );

  return (
    <div>
      <PageHeader
        title="Gian hàng"
        subtitle="Gian hàng trên các sàn đã kết nối với công ty."
        help="Mỗi SKU sàn cần liên kết với một SKU trong kho. Đơn về từ sàn sẽ trừ đúng tồn của SKU đó, và Commerio đồng bộ tồn, giá lên sàn theo SKU đã liên kết. Tồn và giá sửa ở Commerio; trạng thái giao hàng lấy từ sàn. Gian hàng mới phải xong thiết lập lần đầu mới bắt đầu đồng bộ đơn và tồn."
        action={
          canConnect ? (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Thêm gian hàng
            </Button>
          ) : null
        }
      />

      {needsReauth.map((s) => (
        <div key={s.id} className="mb-4" data-testid="reauth-banner">
          <AlertMessage severity="warning">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{shopDisplayName(s)}</strong> cần kết nối lại: sàn đã thu hồi quyền, chưa đồng bộ đơn và tồn được.
                {s.pendingJobs > 0 && ` ${s.pendingJobs} cập nhật chờ gửi sàn, sẽ gửi ngay khi kết nối lại.`}
              </span>
              {canConnect && (
                <Button size="sm" variant="outline" disabled={connector.pending} onClick={() => reconnect(s)}>
                  <PlugZap />
                  Kết nối lại
                </Button>
              )}
            </div>
          </AlertMessage>
        </div>
      ))}

      {shopsQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(shopsQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <Tabs value={segment} onValueChange={(v) => withReset(setSegment)(v as ShopSegment)}>
            <TabsList variant="segmented" aria-label="Nhóm gian hàng">
              <TabsTrigger value="all">Tất cả</TabsTrigger>
              <TabsTrigger value="needs_action">Cần xử lý {actionCount}</TabsTrigger>
              <TabsTrigger value="disconnected">Đã ngắt kết nối</TabsTrigger>
            </TabsList>
          </Tabs>
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="Tìm theo tên hoặc ID gian hàng..."
          />
          <FilterSelect
            loading={shopsQuery.isLoading}
            label="Sàn"
            value={platform}
            onChange={withReset(setPlatform)}
            options={shopOptions}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={visibleShops.items}
          getRowId={(r) => r.id}
          loading={shopsQuery.isLoading}
          fetching={shopsQuery.isFetching}
          empty={
            debouncedSearch || platform || segment !== 'all'
              ? 'Không có gian hàng khớp bộ lọc'
              : 'Chưa có gian hàng nào. Bấm Thêm gian hàng để kết nối gian hàng đầu tiên.'
          }
          onRowClick={openRow}
          pagination={{
            page: visibleShops.page,
            pageSize,
            total: visibleShops.total,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>

      {canConnect && <AddShopDialog open={adding} companyId={companyId} onClose={() => setAdding(false)} />}
      {canConnect && (
        <ReconnectTokenDialog
          shop={tokenReconnecting}
          platformName={platformsQuery.data?.items.find((p) => p.platform === tokenReconnecting?.platform)?.name}
          companyId={companyId}
          onClose={() => setTokenReconnecting(null)}
        />
      )}

      <ShopDisconnectDialog
        shop={disconnecting}
        companyId={companyId}
        onClose={() => setDisconnecting(null)}
        onConflict={() => void shopsQuery.refetch()}
      />

      {canConnect && (
        <ShopRenameDialog shop={renaming} onClose={() => setRenamingId(null)} onConflict={() => void shopsQuery.refetch()} />
      )}

      {canDelete && (
        <ShopDeleteDialog
          shop={deleting}
          onClose={() => setDeletingId(null)}
          onStale={() => void shopsQuery.refetch()}
        />
      )}
    </div>
  );
}

/** Mục trong menu "...": bị khoá thì hiện lý do ngay dưới tên */
function MenuItem({ label, reason, onSelect }: { label: string; reason: string | null; onSelect: () => void }) {
  return (
    <DropdownMenuItem disabled={Boolean(reason)} onSelect={onSelect} className="flex-col items-start gap-0.5">
      <span>{label}</span>
      {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
    </DropdownMenuItem>
  );
}
