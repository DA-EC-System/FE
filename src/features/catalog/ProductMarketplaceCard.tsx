import { Link } from 'react-router-dom';
import { AlertTriangle, RotateCw, Store } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductSpec } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import type { Marketplace, ProductListingRow } from '@/types/shop';
import { CategoryPath } from './CategoryPath';
import { platformLabel } from './platformCategory';
import { platformDrift } from './productOverview';

const SOURCE_LABELS = { push: 'Chọn lúc đẩy', match: 'Đọc từ sàn khi ghép' } as const;

interface Props {
  companyId: string;
  productId: string;
  platforms: Marketplace[];
  /** Listing của sản phẩm ở mọi gian hàng (`GET /channel/products/:productId/listings`) */
  rows: ProductListingRow[];
  loading: boolean;
  /** Có `channel.listing.manage`: hiện nút Sửa/Chọn category */
  canManage: boolean;
}

/**
 * Khối "Trên sàn" của trang sản phẩm (Documents/27 US-SP-11 tiêu chí 2–5, commerio-backend#467): mỗi sàn công ty có gian
 * hàng một dòng, gồm category đủ đường dẫn, nguồn, đủ/thiếu attribute, category đổi trên sàn và listing lệch category.
 * Đổi category làm ở trang đẩy (`apply-category`, PR1 của #467), ở đây chỉ dẫn sang
 */
export function ProductMarketplaceCard({ companyId, productId, platforms, rows, loading, canManage }: Props) {
  return (
    <Card data-testid="product-marketplaces">
      <CardHeader>
        <CardTitle>Trên sàn</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : !platforms.length ? (
          <EmptyState
            compact
            icon={Store}
            title="Công ty chưa kết nối gian hàng nào"
            description="Kết nối gian hàng để chọn category và đưa sản phẩm lên sàn."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={ROUTES.company.shops(companyId)}>Kết nối gian hàng</Link>
              </Button>
            }
          />
        ) : (
          platforms.map((p) => (
            <PlatformRow
              key={p}
              companyId={companyId}
              productId={productId}
              platform={p}
              rows={rows}
              canManage={canManage}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PlatformRow({
  companyId,
  productId,
  platform,
  rows,
  canManage,
}: {
  companyId: string;
  productId: string;
  platform: Marketplace;
  rows: ProductListingRow[];
  canManage: boolean;
}) {
  const query = useProductSpec(productId, platform);
  const label = platformLabel(platform);
  const spec = query.data?.spec ?? null;
  const missing = query.data?.missing ?? [];
  // Sản phẩm đã có trên sàn này thì chỉ bổ sung thông tin sàn (bước cuối là Lưu), không đẩy mới
  const listed = rows.some((r) => r.platform === platform && r.listing && r.listing.status !== 'delisted');
  const editHref = ROUTES.company.productPush(companyId, productId, platform, undefined, listed);
  const drift = spec ? platformDrift(rows, platform, spec) : [];
  const shopName = (shopId: string) => rows.find((r) => r.shopId === shopId)?.shopName ?? '';

  return (
    <div className="grid gap-2 rounded-md border p-3" data-platform={platform}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {canManage && !query.isLoading && !query.isError && (
          <Button asChild variant="outline" size="sm">
            <Link to={editHref}>{spec ? 'Sửa category' : 'Chọn category'}</Link>
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <Skeleton className="h-5 w-2/3" />
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          {problemMessage(query.error)}
          <Button type="button" variant="ghost" size="sm" onClick={() => query.refetch()}>
            <RotateCw />
            Thử lại
          </Button>
        </div>
      ) : !spec ? (
        <p className="text-sm text-muted-foreground">Chưa chọn category {label}</p>
      ) : (
        <>
          <CategoryPath path={spec.categoryPath} className="text-sm" />
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{SOURCE_LABELS[spec.source]}</Badge>
            {missing.length ? (
              <Badge variant="warning" title={missing.map((m) => m.label).join(', ')}>
                Thiếu {missing.length} attribute
              </Badge>
            ) : (
              <Badge variant="success">Đủ attribute</Badge>
            )}
            {spec.categoryStatus === 'changed' && <Badge variant="warning">Category đã đổi trên sàn</Badge>}
            {spec.categoryStatus === 'removed' && <Badge variant="destructive">Category đã bị sàn xoá</Badge>}
          </div>
          {drift.map((d) => (
            <p key={`${d.shopId}/${d.externalProductId}`} className="flex flex-wrap items-start gap-1 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>Trên {shopName(d.shopId)} đang ở:</span>
              {d.fromPath ? <CategoryPath path={d.fromPath} /> : <span className="font-mono">{d.fromId}</span>}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
