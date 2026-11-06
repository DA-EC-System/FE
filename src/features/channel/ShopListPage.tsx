import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { needsAction, shopPage, shopPlatformOptions, type ShopSegment } from './shopList';
import { authorizationDeadline, platformLabel, STATUS_META } from './shopSchemas';
import { useStartConnect } from './useStartConnect';
import { AddShopDialog } from './AddShopDialog';
import { ShopDisconnectDialog } from './ShopDisconnectDialog';

/** Lý do một thao tác trên dòng bị khoá, theo trạng thái gian hàng (Test_UI) */
const BLOCKED_BY_STATUS: Record<Shop['status'], string | null> = {
  connecting: 'Chưa thiết lập',
  active: null,
  needs_reauth: 'Mất uỷ quyền, cần kết nối lại',
  disconnected: 'Đã ngắt',
};

/** Dòng chữ nhỏ dưới chip trạng thái */
function StatusLine({ shop }: { shop: Shop }) {
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
      {shop.pendingJobs > 0 && (
        <span className="text-xs text-muted-foreground" data-testid="shop-pending-jobs">
          {shop.pendingJobs} việc đang chờ
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

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [platform, setPlatform] = useState('');
  const [segment, setSegment] = useState<ShopSegment>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [disconnecting, setDisconnecting] = useState<Shop | null>(null);
  // Màn kết quả "Thêm gian hàng khác" quay về đây và mở luôn hộp thêm
  const [adding, setAdding] = useState(
    () => canConnect && Boolean((location.state as { addShop?: boolean } | null)?.addShop),
  );

  const shopsQuery = useShops();
  const allShops = shopsQuery.data?.items ?? [];
  // Tên sàn cho cột Sàn: đã tải khi mở hộp thêm thì dùng, không gọi riêng
  const platformsQuery = useShopPlatforms({ enabled: false });
  const shopOptions = shopPlatformOptions(allShops);
  const actionCount = allShops.filter(needsAction).length;
  const visibleShops = shopPage(allShops, { page, pageSize, search: debouncedSearch, platform, segment });
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
  const reconnect = (s: Shop) => connector.start({ platform: s.platform, shopId: s.id });
  const needsReauth = allShops.filter((s) => s.status === 'needs_reauth');

  const sync = async (s: Shop) => {
    try {
      const r = await syncMut.mutateAsync(s.id);
      toast.success(`Đã kéo đơn của ${s.shopName}: ${r.created} đơn mới, ${r.updated} đơn cập nhật`);
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
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.shopName}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.original.externalShopId}</p>
          </div>
        ),
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
            <StatusLine shop={row.original} />
          </div>
        ),
      },
      {
        accessorKey: 'listingCount',
        header: 'Sản phẩm trên sàn',
        meta: { className: 'w-20 text-right' },
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
        header: 'Cấu hình phí',
        meta: { className: 'w-28' },
        cell: ({ row }) => {
          const s = row.original;
          if (s.status === 'disconnected') return <span className="text-muted-foreground">Không áp</span>;
          return s.feeConfigVersion != null ? `Bản ${s.feeConfigVersion}` : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'lastOrderSyncAt',
        header: 'Đồng bộ gần nhất',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.lastOrderSyncAt ? (
            formatDateTime(row.original.lastOrderSyncAt)
          ) : (
            <span className="text-muted-foreground">Chưa đồng bộ</span>
          ),
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
                Sản phẩm trên sàn
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
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Thao tác khác với ${s.shopName}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem onSelect={() => openShop(s)}>Sản phẩm trên sàn và giá</DropdownMenuItem>
                  {canConnect && (
                    <MenuItem
                      label="Thiết lập lại"
                      reason={setupReason}
                      onSelect={() => navigate(ROUTES.company.shopSetup(companyId, s.id))}
                    />
                  )}
                  {canSync && (
                    <MenuItem
                      label="Kéo đơn ngay"
                      reason={blocked ?? (syncing ? 'Đang kéo đơn...' : null)}
                      onSelect={() => void sync(s)}
                    />
                  )}
                  {canFeeConfig && (
                    <MenuItem
                      label="Cấu hình phí"
                      reason={s.status === 'disconnected' ? 'Đã ngắt' : null}
                      onSelect={() => navigate(ROUTES.company.financeConfigs(companyId))}
                    />
                  )}
                  {((canDisconnect && s.status !== 'disconnected') || (canConnect && s.status === 'disconnected')) && (
                    <DropdownMenuSeparator />
                  )}
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canConnect, canDisconnect, canSync, canFeeConfig, companyId, syncMut.isPending, syncMut.variables, connector.pending, platformsQuery.data],
  );

  return (
    <div>
      <PageHeader
        title="Gian hàng"
        subtitle="Gian hàng trên các sàn đã kết nối với công ty. Ghép biến thể với SKU sàn để đồng bộ đơn, giá và tồn."
        help="Commerio giữ tồn và giá, sàn giữ thông tin giao vận. Gian hàng mới phải xong thiết lập lần đầu mới bắt đầu kéo đơn và đẩy tồn."
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
                <strong>{s.shopName}</strong> cần kết nối lại: sàn đã thu hồi quyền, chưa kéo đơn và chưa đẩy tồn được.
                {s.pendingJobs > 0 && ` ${s.pendingJobs} việc đang chờ, sẽ chạy ngay khi kết nối lại.`}
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
              <TabsTrigger value="disconnected">Đã ngắt</TabsTrigger>
            </TabsList>
          </Tabs>
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="Tìm theo tên hoặc mã gian hàng..."
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

      <ShopDisconnectDialog
        shop={disconnecting}
        companyId={companyId}
        onClose={() => setDisconnecting(null)}
        onConflict={() => void shopsQuery.refetch()}
      />
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
