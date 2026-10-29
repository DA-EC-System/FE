import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Link2, PlugZap, RefreshCw, Settings2, Store, Unplug } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDisconnectShop, useShops, useSyncShop } from '@/api/shops.api';
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
import { tokenExpiringSoon } from '@/lib/machines/channel';
import type { Marketplace, Shop } from '@/types/shop';
import { isUsable, PLATFORM_LABELS, STATUS_LABELS, STATUS_VARIANTS } from './shopSchemas';
import { useStartConnect } from './useStartConnect';

const PLATFORMS: { value: Marketplace; hint: string }[] = [
  { value: 'tiktok', hint: 'Đăng nhập TikTok Shop Seller Center để uỷ quyền.' },
  { value: 'shopee', hint: 'Đăng nhập Shopee Open Platform để uỷ quyền.' },
  { value: 'lazada', hint: 'Đăng nhập Lazada Seller Center để uỷ quyền.' },
  { value: 'mock', hint: 'Sàn mô phỏng để thử luồng kết nối, không cần tài khoản sàn.' },
];

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

  const shopsQuery = useShops({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    platform: platform || undefined,
    status: status || undefined,
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
        cell: ({ row }) => PLATFORM_LABELS[row.original.platform],
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
              {tokenExpiringSoon(s.status, s.refreshExpiresAt) && (
                <span className="text-xs text-warning" data-testid="shop-expiring">
                  Sắp hết hạn · Kết nối lại trước {formatDate(s.refreshExpiresAt)}
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
        header: '',
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
    [canConnect, canDisconnect, canSync, companyId, syncMut.isPending, syncMut.variables, connector.pending],
  );

  return (
    <div>
      <PageHeader
        title="Gian hàng"
        subtitle="Gian hàng trên các sàn đã kết nối với công ty. Ghép biến thể với SKU sàn để đồng bộ đơn, giá và tồn."
      />

      {canConnect && (
        <Card className="mb-6" data-testid="connect-section">
          <CardHeader>
            <CardTitle>Kết nối gian hàng</CardTitle>
            <CardDescription>
              Chọn sàn, đăng nhập tài khoản người bán và đồng ý cấp quyền. Commerio không lưu mật khẩu sàn.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PLATFORMS.map(({ value, hint }) => {
              const busy = connector.pending && connector.variables?.platform === value && !connector.variables.shopId;
              return (
                <div key={value} className="flex flex-col gap-3 rounded-lg border p-4" data-platform={value}>
                  <div className="flex items-center gap-2 font-medium">
                    <Store className="size-4 text-primary" />
                    {PLATFORM_LABELS[value]}
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{hint}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={connector.pending}
                    aria-label={`Kết nối ${PLATFORM_LABELS[value]}`}
                    onClick={() => connector.start({ platform: value })}
                  >
                    <PlugZap />
                    {busy ? 'Đang chuyển...' : 'Kết nối'}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
            options={PLATFORMS.map((p) => ({ value: p.value, label: PLATFORM_LABELS[p.value] }))}
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
          data={shopsQuery.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={shopsQuery.isLoading}
          fetching={shopsQuery.isFetching}
          empty={
            debouncedSearch || platform || status
              ? 'Không có gian hàng khớp bộ lọc'
              : 'Chưa có gian hàng nào. Kết nối gian hàng đầu tiên ở khu phía trên.'
          }
          onRowClick={openListings}
          pagination={{
            page,
            pageSize,
            total: shopsQuery.data?.total ?? 0,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <ConfirmDialog
        open={Boolean(disconnecting)}
        title="Ngắt kết nối gian hàng?"
        message={
          <>
            Ngắt <strong>{disconnecting?.shopName}</strong> ({disconnecting && PLATFORM_LABELS[disconnecting.platform]}).
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
