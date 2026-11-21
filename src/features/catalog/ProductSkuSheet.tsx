import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StockDetailBody } from '@/features/inventory/StockDetailDrawer';
import { formatQty } from '@/features/inventory/shared';
import { LISTING_STATUS_LABELS, LISTING_STATUS_VARIANTS, STOCK_SYNC_LABELS } from '@/features/channel/shopSchemas';
import { ROUTES } from '@/router/routes';
import { priceText } from '@/utils/price';
import type { ProductVariant } from '@/types/catalog';
import type { ProductListingRow } from '@/types/shop';
import { platformLabel } from './platformCategory';

const PRICE_SOURCE_LABELS = { standard: 'giá chuẩn', shop: 'giá theo gian hàng', override: 'giá đặt tay' } as const;

interface Props {
  companyId: string;
  variant: ProductVariant | null;
  /** Mọi dòng của SKU này ở các gian hàng (kể cả chưa lên sàn) */
  rows: ProductListingRow[];
  /** Tab mở sẵn: bấm mã SKU mở Tồn kho, bấm tóm tắt gian hàng mở Gian hàng */
  tab: 'stock' | 'shops';
  /** "200 g · 300×250×20 mm" (cột đã chuyển từ bảng sang ngăn này, audit FE#405) */
  specText: (v: ProductVariant) => string;
  canStock: boolean;
  canShop: boolean;
  canCost: boolean;
  onClose: () => void;
}

/**
 * Chi tiết một SKU ở trang sản phẩm (Documents/27 US-SP-11 tiêu chí 8, commerio-backend#467): tab Tồn kho dùng lại thân
 * chi tiết tồn của trang Tồn kho; tab Gian hàng là listing của SKU ở từng gian hàng. Tab nào thiếu quyền thì không hiện
 */
export function ProductSkuSheet({ companyId, variant, rows, tab, specText, canStock, canShop, canCost, onClose }: Props) {
  const label = variant?.attributes.map((a) => a.value).join(' / ');
  const first = tab === 'shops' && canShop ? 'shops' : canStock ? 'stock' : 'shops';
  return (
    <Sheet open={Boolean(variant)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{variant?.sku ?? ''}</SheetTitle>
          <SheetDescription>{label || 'Mặc định'}</SheetDescription>
        </SheetHeader>
        {variant && (
          <dl className="mx-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border p-3 text-sm" data-testid="sku-info">
            <dt className="text-muted-foreground">Giá chuẩn</dt>
            <dd className="text-right tabular-nums">{priceText(variant.standardPrice)}</dd>
            <dt className="text-muted-foreground">Giá muốn thực nhận</dt>
            <dd className="text-right tabular-nums">{priceText(variant.targetNetPrice)}</dd>
            <dt className="text-muted-foreground">Cân nặng · kích thước</dt>
            <dd className="text-right tabular-nums" data-testid="variant-spec">
              {specText(variant)}
            </dd>
          </dl>
        )}
        {variant && (
          <Tabs key={`${variant.id}-${first}`} defaultValue={first} className="px-4 pb-6">
            <TabsList>
              {canStock && <TabsTrigger value="stock">Tồn kho</TabsTrigger>}
              {canShop && <TabsTrigger value="shops">Gian hàng</TabsTrigger>}
            </TabsList>
            {canStock && (
              <TabsContent value="stock" className="grid gap-3 pt-3">
                <StockDetailBody variantId={variant.id} canCost={canCost} />
                <Link to={ROUTES.company.inventory(companyId)} className="text-sm text-primary hover:underline">
                  Xem ở Tồn kho
                </Link>
              </TabsContent>
            )}
            {canShop && (
              <TabsContent value="shops" className="pt-3">
                <ShopListings companyId={companyId} rows={rows} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ShopListings({ companyId, rows }: { companyId: string; rows: ProductListingRow[] }) {
  if (!rows.length) return <EmptyState compact icon={Store} title="Công ty chưa có gian hàng nào đang kết nối" />;
  return (
    <Table data-testid="sku-listings">
      <TableHeader>
        <TableRow>
          <TableHead>Gian hàng</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead className="text-right">Giá</TableHead>
          <TableHead className="text-right whitespace-nowrap">Tồn trên sàn</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const l = r.listing;
          const error = l?.pushError ?? l?.stockSyncError ?? l?.priceSyncError ?? null;
          return (
            <TableRow key={r.shopId}>
              <TableCell>
                <Link to={ROUTES.company.shop(companyId, r.shopId)} className="font-medium break-all text-primary hover:underline">
                  {r.shopName}
                </Link>
                <span className="block text-xs text-muted-foreground">{platformLabel(r.platform)}</span>
              </TableCell>
              <TableCell>
                {l ? (
                  <Badge variant={LISTING_STATUS_VARIANTS[l.status]}>{LISTING_STATUS_LABELS[l.status]}</Badge>
                ) : (
                  <span className="text-muted-foreground">Chưa lên sàn</span>
                )}
                {l && l.stockSync !== 'synced' && (
                  <span className="block text-xs text-muted-foreground">{STOCK_SYNC_LABELS[l.stockSync]}</span>
                )}
                {error && <span className="block text-xs text-destructive">{error.message}</span>}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {priceText(r.price)}
                {r.priceSource && (
                  <span className="block text-xs text-muted-foreground">{PRICE_SOURCE_LABELS[r.priceSource]}</span>
                )}
                {l?.lastPushedPrice != null && l.lastPushedPrice !== r.price && (
                  <span className="block text-xs text-muted-foreground">Trên sàn {priceText(l.lastPushedPrice)}</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {l?.platformStock == null ? '—' : formatQty(l.platformStock)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
