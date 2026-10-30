import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { KeyRound, Link2, PlugZap, Plus, RefreshCw, Settings2, Store, Unplug } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDisconnectShop, useShops, useShopPlatforms, useSyncShop } from '@/api/shops.api';
import { Skeleton } from '@/components/ui/skeleton';
import { shopPage, shopPlatformOptions } from './shopList';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDate, formatDateTime } from '@/utils/format';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { authorizationDeadline } from './shopSchemas';
import type { Shop, ShopConnectionResult, ShopPlatform } from '@/types/shop';
import { isUsable, platformLabel, STATUS_LABELS, STATUS_VARIANTS } from './shopSchemas';
import { useStartConnect } from './useStartConnect';
import { connectedToast } from './connectResult';
import { ShopTokenForm } from './ShopTokenForm';

const PLATFORM_HINTS: Record<string, string | undefined> = {
  tiktok: 'Đăng nhập TikTok Shop Seller Center để uỷ quyền.',
  shopee: 'Đăng nhập Shopee Open Platform để uỷ quyền.',
  lazada: 'Đăng nhập Lazada Seller Center để uỷ quyền.',
  mock: 'Sàn mô phỏng để thử luồng kết nối, không cần tài khoản sàn.',
};

/** UC-CH-01: gian hàng của công ty và kết nối gian hàng mới qua OAuth */
export function ShopListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canConnect = can(PERMISSIONS.shopConnect);
  const canDisconnect = can(PERMISSIONS.shopDisconnect);
  const canSync = can(PERMISSIONS.shopSync);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [disconnecting, setDisconnecting] = useState<Shop | null>(null);
  const [zeroStock, setZeroStock] = useState(false);
  const [adding, setAdding] = useState(false);
  // Sàn đang dán token trong hộp thoại; null: đang chọn sàn
  const [tokenFor, setTokenFor] = useState<ShopPlatform | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  const shopsQuery = useShops();
  const platformsQuery = useShopPlatforms({ enabled: canConnect && adding });
  const platforms = (platformsQuery.data?.items ?? []).filter((p) => p.connectable);
  const shopOptions = shopPlatformOptions(shopsQuery.data?.items ?? []);
  const visibleShops = shopPage(shopsQuery.data?.items ?? [], {
    page,
    pageSize,
    search: debouncedSearch,
    platform,
    status,
  });
  const syncMut = useSyncShop();
  const disconnectMut = useDisconnectShop();
  const connector = useStartConnect();

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  // Gian hàng đang thiết lập mở thẳng wizard (chỉ người có quyền kết nối)
  const openListings = (s: Shop) =>
    navigate(
      s.status === 'connecting' && canConnect
        ? ROUTES.company.shopSetup(companyId, s.id)
        : ROUTES.company.shop(companyId, s.id),
    );
  const closeAdding = () => {
    setAdding(false);
    setTokenFor(null);
  };
  const tokenConnected = (result: ShopConnectionResult) => {
    toast.success(connectedToast(result));
    closeAdding();
    if (result.created) navigate(ROUTES.company.shopSetup(companyId, result.shop.id));
  };
  const askDisconnect = (s: Shop) => {
    setZeroStock(false);
    setDisconnecting(s);
  };
  const needsReauth = (shopsQuery.data?.items ?? []).filter((s) => s.status === 'needs_reauth');

  const sync = async (s: Shop) => {
    try {
      await syncMut.mutateAsync(s.id);
      toast.success(`Đã đồng bộ đơn của ${s.shopName}`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const handleDisconnect = async () => {
    if (!disconnecting) return;
    try {
      await disconnectMut.mutateAsync({ id: disconnecting.id, version: disconnecting.version, zeroStock });
      toast.success(
        `Đã ngắt kết nối ${disconnecting.shopName}${zeroStock ? ', tồn trên sàn đã về 0' : ''}`,
      );
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        toast.warning(`${disconnecting.shopName} vừa được người khác sửa. Chưa có gì thay đổi, đã nạp lại danh sách.`);
        void shopsQuery.refetch();
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDisconnecting(null);
  };

  const columns = useMemo<ColumnDef<Shop>[]>(
    () => [
      {
        id: 'shopName',
        header: 'Gian hàng',
        meta: { className: 'min-w-56' },
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
        meta: { className: 'w-40' },
        cell: ({ row }) => platformLabel(row.original.platform, row.original.platformName ?? platformsQuery.data?.items.find((p) => p.platform === row.original.platform)?.name),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-44' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="grid justify-items-start gap-1">
              <Badge variant={STATUS_VARIANTS[s.status]} data-testid="shop-status">
                {STATUS_LABELS[s.status]}
              </Badge>
              {s.tokenExpiringSoon && (
                <span className="text-xs text-warning" data-testid="shop-expiring">
                  Sắp hết hạn{authorizationDeadline(s) && <> · Kết nối lại trước {formatDate(authorizationDeadline(s))}</>}
                </span>
              )}
              {s.status === 'active' && s.accessExpiresAt && (
                <span className="text-xs text-muted-foreground" data-testid="shop-token">
                  Access token đến {formatDateTime(s.accessExpiresAt)}
                  {s.refreshExpiresAt && <> · refresh token đến {formatDate(s.refreshExpiresAt)}</>}
                </span>
              )}
              {s.status === 'needs_reauth' && s.pendingJobs > 0 && (
                <span className="text-xs text-muted-foreground">{s.pendingJobs} việc đang chờ</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'listingCount',
        header: 'SKU đã ghép',
        meta: { className: 'w-28 text-right' },
      },
      {
        id: 'lastOrderSyncAt',
        header: 'Đồng bộ đơn gần nhất',
        meta: { className: 'w-44 whitespace-nowrap' },
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
        meta: { className: 'w-40 text-right' },
        cell: ({ row }) => {
          const s = row.original;
          const usable = isUsable(s.status);
          return (
            <div className="flex justify-end gap-1">
              {s.status === 'connecting' && canConnect ? (
                <RowAction label="Thiết lập" onClick={() => openListings(s)}>
                  <Settings2 />
                </RowAction>
              ) : (
                <RowAction label="Ghép SKU" onClick={() => openListings(s)}>
                  <Link2 />
                </RowAction>
              )}
              {canSync && usable && (
                <RowAction
                  label="Đồng bộ đơn"
                  reason={syncMut.isPending && syncMut.variables === s.id ? 'Đang đồng bộ...' : null}
                  onClick={() => sync(s)}
                >
                  <RefreshCw />
                </RowAction>
              )}
              {canConnect && (s.status === 'needs_reauth' || s.status === 'disconnected') && (
                <RowAction
                  label="Kết nối lại"
                  reason={connector.pending ? 'Đang chuyển sang sàn...' : null}
                  onClick={() => connector.start({ platform: s.platform, shopId: s.id })}
                >
                  <PlugZap />
                </RowAction>
              )}
              {canDisconnect && s.status !== 'disconnected' && (
                <RowAction label="Ngắt kết nối" destructive onClick={() => askDisconnect(s)}>
                  <Unplug />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canConnect, canDisconnect, canSync, companyId, syncMut.isPending, syncMut.variables, connector.pending, platformsQuery.data],
  );

  return (
    <div>
      <PageHeader
        title="Gian hàng"
        subtitle="Gian hàng trên các sàn đã kết nối với công ty. Ghép biến thể với SKU sàn để đồng bộ đơn, giá và tồn."
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={connector.pending}
                  onClick={() => connector.start({ platform: s.platform, shopId: s.id })}
                >
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
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="Tìm theo tên hoặc mã gian hàng..."
          />
          <FilterSelect
            label="Sàn"
            value={platform}
            onChange={withReset(setPlatform)}
            options={shopOptions}
          />
          <FilterSelect
            label="Trạng thái"
            value={status}
            onChange={withReset(setStatus)}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={visibleShops.items}
          getRowId={(r) => r.id}
          loading={shopsQuery.isLoading}
          fetching={shopsQuery.isFetching}
          empty={
            debouncedSearch || platform || status
              ? 'Không có gian hàng khớp bộ lọc'
              : 'Chưa có gian hàng nào. Bấm Thêm gian hàng để kết nối gian hàng đầu tiên.'
          }
          onRowClick={openListings}
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

      <Dialog open={adding} onOpenChange={(next) => !next && !connector.pending && !tokenBusy && closeAdding()}>
        <DialogContent className="sm:max-w-2xl" data-testid="connect-section">
          <DialogHeader>
            <DialogTitle>Thêm gian hàng</DialogTitle>
            <DialogDescription>
              Chọn sàn, đăng nhập tài khoản người bán và đồng ý cấp quyền. Commerio không lưu mật khẩu sàn.
            </DialogDescription>
          </DialogHeader>
          {tokenFor ? (
            <ShopTokenForm
              platform={tokenFor.platform}
              name={tokenFor.name}
              onBack={() => setTokenFor(null)}
              onBusyChange={setTokenBusy}
              onDone={tokenConnected}
            />
          ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {platformsQuery.isLoading ? (
              <div className="col-span-full grid gap-3 sm:grid-cols-2" role="status" aria-label="Đang tải sàn">
                <Skeleton className="h-32" /><Skeleton className="h-32" />
              </div>
            ) : platformsQuery.isError ? (
              <AlertMessage severity="error" className="col-span-full">
                <p>{getErrorMessage(platformsQuery.error)}</p>
                <Button variant="outline" size="sm" disabled={platformsQuery.isFetching} onClick={() => void platformsQuery.refetch()}>
                  Thử lại
                </Button>
              </AlertMessage>
            ) : platforms.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">
                Chưa có sàn nào được bật. Liên hệ quản trị nền tảng để kết nối sàn mới.
              </p>
            ) : platforms.map((p) => {
              const { platform: value, name } = p;
              const methods = p.methods ?? ['oauth'];
              const hint = PLATFORM_HINTS[value];
              const busy = connector.pending && connector.variables?.platform === value && !connector.variables.shopId;
              return (
                <div key={value} className="flex flex-col gap-3 rounded-lg border p-4" data-platform={value}>
                  <div className="flex items-center gap-2 font-medium">
                    <Store className="size-4 text-primary" />
                    {name}
                  </div>
                  {hint && <p className="flex-1 text-sm text-muted-foreground">{hint}</p>}
                  <div className="flex flex-wrap gap-2">
                    {methods.includes('oauth') && (
                      <Button
                        size="sm"
                        disabled={connector.pending}
                        aria-label={`Kết nối ${name}`}
                        onClick={() => connector.start({ platform: value })}
                      >
                        <PlugZap />
                        {busy ? 'Đang chuyển...' : `Đăng nhập ${name}`}
                      </Button>
                    )}
                    {methods.includes('token') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={connector.pending}
                        aria-label={`Dán token ${name}`}
                        onClick={() => setTokenFor(p)}
                      >
                        <KeyRound />
                        Dán token
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(disconnecting)}
        title="Ngắt kết nối gian hàng?"
        message={
          <>
            Ngắt <strong>{disconnecting?.shopName}</strong> ({disconnecting && platformLabel(disconnecting.platform, disconnecting.platformName)}).
            Commerio ngừng nhận đơn và ngừng đẩy giá, tồn lên gian hàng này; listing trên sàn được gỡ. Đơn và ghép SKU
            cũ vẫn giữ; kết nối lại thì listing được đưa lên lại.
            <div className="mt-3 flex items-start gap-2">
              <Checkbox
                id="zero-stock"
                checked={zeroStock}
                disabled={!disconnecting || !isUsable(disconnecting.status)}
                onCheckedChange={(v) => setZeroStock(v === true)}
              />
              <Label htmlFor="zero-stock" className="grid gap-0.5 font-normal text-foreground">
                Đặt tồn trên sàn về 0
                <span className="text-xs text-muted-foreground">
                  {disconnecting && !isUsable(disconnecting.status)
                    ? 'Không làm được: sàn đã thu hồi quyền.'
                    : 'Tránh khách đặt hàng trong lúc gỡ listing.'}
                </span>
              </Label>
            </div>
          </>
        }
        confirmLabel="Ngắt kết nối"
        destructive
        loading={disconnectMut.isPending}
        onConfirm={handleDisconnect}
        onClose={() => setDisconnecting(null)}
      />
    </div>
  );
}
