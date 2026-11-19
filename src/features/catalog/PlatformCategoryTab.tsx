import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Dot, RefreshCw, Search } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { PlatformAttribute, PlatformCategory } from '@/types/shop';
import { SIZE_CHART_LABELS, groupAttributes, hasCondition, inputSummary, parentPath, platformLabel } from './platformCategory';

/** Tab Lazada, TikTok của trang Danh mục & thuộc tính: cây category và attribute của sàn, chỉ đọc (Documents/21 §18.5) */
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
      if (queued) toast.success(`Đã xếp lượt đồng bộ cây category ${label}. Việc chạy nền, mở lại tab sau ít phút để thấy bản mới.`);
      else toast.info(`Đã có lượt đồng bộ ${label} đang chờ chạy, không xếp thêm.`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const syncButton = can(PERMISSIONS.shopSync) ? (
    <Button variant="outline" size="sm" onClick={runSync} disabled={sync.isPending}>
      <RefreshCw className={cn(sync.isPending && 'animate-spin')} />
      Đồng bộ ngay
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
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm category, không cần dấu (vd: ao thun)"
                  aria-label={`Tìm category ${label}`}
                  className="pl-8"
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
                  onSelect={setSelected}
                />
              ) : (
                <TreeLevel platform={platform} parentId={null} depth={0} open={open} selected={selected} onToggle={toggle} onSelect={setSelected} />
              )}
            </div>
          </div>
          <div className="min-w-0 px-5 py-4">
            {selected ? (
              <LeafDetail platform={platform} externalId={selected} />
            ) : (
              <EmptyState title="Chọn một leaf category bên trái" description="Leaf có dấu chấm; mở category cha để xem các leaf bên dưới." />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

interface TreeLevelProps {
  platform: string;
  parentId: string | null;
  depth: number;
  open: ReadonlySet<string>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

function TreeLevel({ platform, parentId, depth, open, selected, onToggle, onSelect }: TreeLevelProps) {
  const level = usePlatformCategories(platform, parentId ? { parentId } : {});
  const indent = { paddingLeft: 8 + depth * 16 };
  if (level.isLoading) {
    return (
      <div className="grid gap-1 py-1" style={indent}>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }
  if (level.isError) {
    return (
      <p className="py-1 text-sm text-destructive-text" style={indent}>
        {problemMessage(level.error)}{' '}
        <button type="button" className="underline" onClick={() => void level.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }
  return (
    <>
      {level.data?.items.map((c) => {
        const isOpen = open.has(c.externalId);
        return (
          <div key={c.externalId} role="treeitem" aria-expanded={c.isLeaf ? undefined : isOpen} aria-selected={selected === c.externalId}>
            <button
              type="button"
              onClick={() => (c.isLeaf ? onSelect(c.externalId) : onToggle(c.externalId))}
              className={cn(
                'flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left text-sm hover:bg-muted',
                selected === c.externalId && 'bg-accent text-primary-text',
              )}
              style={indent}
            >
              <span className="flex size-4 flex-none items-center justify-center text-muted-foreground">
                {c.isLeaf ? <Dot className="size-5 text-primary" /> : isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </span>
              <span className="truncate">{c.name}</span>
              <RemovedBadge category={c} />
            </button>
            {!c.isLeaf && isOpen && (
              <TreeLevel
                platform={platform}
                parentId={c.externalId}
                depth={depth + 1}
                open={open}
                selected={selected}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function RemovedBadge({ category }: { category: PlatformCategory }) {
  return category.status === 'removed' ? (
    <Badge variant="destructive" className="ml-auto">
      Sàn đã bỏ
    </Badge>
  ) : null;
}

interface SearchResultsProps {
  loading: boolean;
  error: unknown;
  items: PlatformCategory[];
  selected: string | null;
  onSelect: (id: string) => void;
}

function SearchResults({ loading, error, items, selected, onSelect }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="grid gap-2 px-2 py-1">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (error) return <AlertMessage severity="error" className="mx-1.5">{problemMessage(error)}</AlertMessage>;
  if (!items.length) return <EmptyState compact title="Không thấy leaf category nào" description="Thử từ khác, hoặc xoá ô tìm để duyệt cây." />;
  return (
    <div role="group">
      {items.map((c) => (
        <button
          key={c.externalId}
          type="button"
          role="treeitem"
          aria-selected={selected === c.externalId}
          onClick={() => onSelect(c.externalId)}
          className={cn(
            'block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted',
            selected === c.externalId && 'bg-accent',
          )}
        >
          <span className="flex items-center gap-2 text-sm">
            {c.name}
            <RemovedBadge category={c} />
          </span>
          <span className="block text-xs text-muted-foreground">{parentPath(c.path) || 'Cấp gốc'}</span>
        </button>
      ))}
    </div>
  );
}

function detailError(error: unknown, label: string): string {
  switch (problemCode(error)) {
    case 'shop_not_connected':
      return `Chưa lấy được attribute: công ty chưa có gian hàng ${label} đang kết nối. Kết nối gian hàng rồi mở lại category này.`;
    case 'marketplace_unavailable':
      return `${label} đang lỗi nên chưa lấy được attribute của category này. Thử lại sau ít phút.`;
    case 'category_not_leaf':
      return 'Đây là category cha. Sàn chỉ nhận sản phẩm ở leaf category.';
    default:
      return problemMessage(error);
  }
}

const SOURCE_LABELS = { push: 'chọn lúc đẩy', match: 'lấy từ sàn khi ghép SKU' } as const;

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
          {category.status === 'removed' && <Badge variant="destructive">Sàn đã bỏ category này</Badge>}
          {category.sizeChartRule && (
            <Badge variant={category.sizeChartRule === 'required' ? 'warning' : 'neutral'}>{SIZE_CHART_LABELS[category.sizeChartRule]}</Badge>
          )}
          {fetchedAt && <span>Attribute lấy từ sàn lúc {formatDateTime(fetchedAt)}</span>}
          {stale && (
            <Badge variant="warning" title={`${label} lỗi khi lấy lại attribute, đang hiện bản đã lưu`}>
              Bản cũ
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
          {a.isKey && <Badge variant="purple">Key</Badge>}
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
