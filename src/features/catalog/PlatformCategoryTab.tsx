import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePlatformCategories, usePlatformCategory, useSyncPlatformCategories } from '@/api/shops.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { PlatformAttribute } from '@/types/shop';
import { SIZE_CHART_LABELS, groupAttributes, hasCondition, inputSummary, parentPath, platformLabel } from './platformCategory';
import { SearchResults, TreeLevel } from './PlatformCategoryTree';

/** Tab Lazada, TikTok của trang Nhóm hàng & thuộc tính: cây category và attribute của sàn, chỉ đọc (Documents/21 §18.5) */
export function PlatformCategoryTab({ platform }: { platform: string }) {
  const can = useCan();
  const label = platformLabel(platform);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const search = useDebounce(query.trim(), 300);
  const searching = search.length >= 2;

  const roots = usePlatformCategories(platform, {});
  const results = usePlatformCategories(platform, { search }, searching);
  const sync = useSyncPlatformCategories();
  const syncedAt = roots.data?.syncedAt ?? null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runSync = async () => {
    try {
      const { queued } = await sync.mutateAsync(platform);
      if (queued) toast.success(`Đã bắt đầu đồng bộ category ${label}. Mở lại tab sau ít phút để thấy bản mới.`);
      else toast.info(`Đang có một lần đồng bộ ${label} chưa xong, chờ ít phút rồi mở lại tab.`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const syncButton = can(PERMISSIONS.shopSync) ? (
    <Button variant="outline" size="sm" onClick={runSync} disabled={sync.isPending}>
      {sync.isPending ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
    </Button>
  ) : null;

  const neverSynced = roots.isSuccess && roots.data.items.length === 0;

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm text-muted-foreground">
        <span>
          {roots.isLoading ? (
            'Đang tải…'
          ) : syncedAt ? (
            <>
              Đồng bộ lần cuối <b className="text-foreground">{formatDateTime(syncedAt)}</b> · tự đồng bộ mỗi đêm
            </>
          ) : (
            'Chưa đồng bộ cây category lần nào'
          )}
        </span>
        <span className="ml-auto">{syncButton}</span>
      </div>

      {roots.isError ? (
        <div className="p-4">
          <AlertMessage severity="error">{problemMessage(roots.error)}</AlertMessage>
        </div>
      ) : neverSynced ? (
        <EmptyState
          title={`Chưa có cây category của ${label}`}
          description="Cây được đồng bộ mỗi đêm. Bấm Đồng bộ ngay để lấy ngay bây giờ."
          action={syncButton}
        />
      ) : (
        <div className="grid min-h-[560px] md:grid-cols-[minmax(300px,400px)_1fr]">
          <div className="flex min-w-0 flex-col border-b md:border-r md:border-b-0">
            <div className="p-3">
              <div className="relative">
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm category, không cần dấu (vd: ao thun)"
                  aria-label={`Tìm category ${label}`}
                />
              </div>
              {query.trim().length === 1 && <p className="mt-1 text-xs text-muted-foreground">Nhập ít nhất 2 ký tự.</p>}
            </div>
            <div className="max-h-[600px] min-h-0 flex-1 overflow-auto px-1.5 pb-3" role="tree" aria-label={`Cây category ${label}`}>
              {searching ? (
                <SearchResults
                  loading={results.isLoading}
                  error={results.isError ? results.error : null}
                  items={results.data?.items ?? []}
                  selected={selected}
                  onSelect={(c) => setSelected(c.externalId)}
                />
              ) : (
                <TreeLevel
                  platform={platform}
                  parentId={null}
                  depth={0}
                  open={open}
                  selected={selected}
                  onToggle={toggle}
                  onSelect={(c) => setSelected(c.externalId)}
                />
              )}
            </div>
          </div>
          <div className="min-w-0 px-5 py-4">
            {selected ? (
              <LeafDetail platform={platform} externalId={selected} />
            ) : (
              <EmptyState title="Chọn một category cấp cuối bên trái" description="Category cấp cuối có dấu chấm; mở category cha để xem." />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function detailError(error: unknown, label: string): string {
  switch (problemCode(error)) {
    case 'shop_not_connected':
      return `Chưa lấy được attribute: công ty chưa kết nối gian hàng ${label}. Kết nối gian hàng rồi mở lại category này.`;
    case 'marketplace_unavailable':
      return `${label} đang lỗi nên chưa lấy được attribute của category này. Thử lại sau ít phút.`;
    case 'category_not_leaf':
      return 'Đây là category cha. Sàn chỉ nhận sản phẩm ở category cấp cuối.';
    default:
      return problemMessage(error);
  }
}

const SOURCE_LABELS = { push: 'chọn lúc đăng bán', match: 'lấy từ sàn khi liên kết SKU' } as const;

function LeafDetail({ platform, externalId }: { platform: string; externalId: string }) {
  const companyId = useAuth().companyContext?.companyId ?? '';
  const label = platformLabel(platform);
  const detail = usePlatformCategory(platform, externalId);

  if (detail.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <AlertMessage severity="error">
        {detailError(detail.error, label)}{' '}
        <button type="button" className="underline" onClick={() => void detail.refetch()}>
          Thử lại
        </button>
      </AlertMessage>
    );
  }

  const { category, attributes, fetchedAt, stale, products } = detail.data;
  const groups = groupAttributes(attributes);
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs text-muted-foreground">{parentPath(category.path) || 'Cấp gốc'}</p>
        <h3 className="text-lg font-semibold">{category.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            ID <span className="font-mono">{category.externalId}</span>
          </span>
          {category.status === 'removed' && <Badge variant="destructive">Sàn đã ngừng dùng</Badge>}
          {category.sizeChartRule && (
            <Badge variant={category.sizeChartRule === 'required' ? 'warning' : 'neutral'}>{SIZE_CHART_LABELS[category.sizeChartRule]}</Badge>
          )}
          {fetchedAt && <span>Attribute lấy từ sàn lúc {formatDateTime(fetchedAt)}</span>}
          {stale && (
            <Badge variant="warning" title={`${label} lỗi khi lấy lại attribute, đang hiện bản đã lưu`}>
              Dữ liệu cũ
            </Badge>
          )}
        </div>
      </div>

      <section>
        <h4 className="mb-2 text-sm font-semibold">Sản phẩm đang dùng</h4>
        {products.length ? (
          <ul className="grid gap-1 text-sm">
            {products.map((p) => (
              <li key={p.productId} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                <Link className="text-primary hover:underline" to={ROUTES.company.catalogProduct(companyId, p.productId)}>
                  {p.name}
                </Link>
                <span className="text-xs text-muted-foreground">{SOURCE_LABELS[p.source]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có sản phẩm nào của công ty dùng category này.</p>
        )}
      </section>

      {groups.length ? (
        groups.map((g) => (
          <section key={g.key}>
            <h4 className="text-sm font-semibold">
              {g.title} <span className="font-normal text-muted-foreground">{g.items.length}</span>
            </h4>
            {g.hint && <p className="text-xs text-muted-foreground">{g.hint}</p>}
            <div className="mt-2 divide-y rounded-md border">
              {g.items.map((a) => (
                <AttributeRow key={a.code} attribute={a} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState compact title="Sàn không yêu cầu attribute nào cho category này" />
      )}
    </div>
  );
}

function AttributeRow({ attribute: a }: { attribute: PlatformAttribute }) {
  return (
    <Collapsible className="px-3 py-2 text-sm">
      <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{a.label}</span>
          {a.required && <Badge variant="warning">Bắt buộc</Badge>}
          {!a.required && hasCondition(a) && <Badge variant="info">Bắt buộc theo điều kiện</Badge>}
          {a.isKey && <Badge variant="purple">Quan trọng</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{a.code}</span> · {inputSummary(a)}
          {a.options.length > 0 && (
            <CollapsibleTrigger className="ml-2 text-primary hover:underline">Xem lựa chọn</CollapsibleTrigger>
          )}
          {a.defaultValue && (
            <div>
              Giá trị từ hồ sơ công ty: <span className="text-foreground">{a.defaultValue}</span>
            </div>
          )}
        </div>
      </div>
      {a.options.length > 0 && (
        <CollapsibleContent className="mt-2 flex flex-wrap gap-1">
          {a.options.map((o) => (
            <Badge key={o.id} variant="neutral" title={`Mã ${o.id}`}>
              {o.label}
            </Badge>
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
