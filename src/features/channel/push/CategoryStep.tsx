import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategorySuggestions, usePlatformCategories } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { codeMessage, problemMessage } from '@/api/problemMessages';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { ProductDetail } from '@/types/catalog';
import type { CategorySuggestion, PlatformCategory } from '@/types/shop';
import { columnParents, parentPath } from '@/features/catalog/platformCategory';
import { CategoryColumns } from '@/features/catalog/CategoryColumns';
import { CategoryPath } from '@/features/catalog/CategoryPath';
import { SearchResults } from '@/features/catalog/PlatformCategoryTree';
import { PERMISSION_LABELS, permissionBlocked, type SpecDraft } from '../specDraft';

interface CategoryStepProps {
  platform: string;
  label: string;
  companyId: string;
  /** Gian hàng gọi gợi ý (token của gian hàng); null khi công ty chưa có gian hàng nào của sàn */
  shopId: string | null;
  product: ProductDetail;
  draft: SpecDraft;
  /** `externalId` từ gốc tới category đang chọn, để mở sẵn nhánh; null khi chưa tải được */
  pathIds: string[] | null;
  /** Dưới ô đang chọn: "Trên sàn đang ở", khối đổi category trên sàn */
  children?: ReactNode;
  onPick: (c: { externalId: string; path: string }) => void;
  /** Gợi ý của gian hàng đang mở, để bước Xem lại biết quyền category (TikTok) */
  onSuggestions?: (items: CategorySuggestion[]) => void;
}

const lastName = (path: string) => path.split(' > ').at(-1) ?? path;

/** Bước 1: gợi ý của sàn theo sản phẩm, hoặc tìm/duyệt cây category (Documents/21 §18.5) */
export function CategoryStep({ platform, label, companyId, shopId, product, draft, pathIds, children, onPick, onSuggestions }: CategoryStepProps) {
  return (
    <div className="grid grid-cols-1 gap-5">
      {draft.externalCategoryId && (
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-lg border border-primary-border bg-accent px-3 py-2.5" aria-live="polite">
            <p className="text-xs text-muted-foreground">Đang chọn</p>
            <p className="text-sm">
              <CategoryPath path={draft.categoryPath} />{' '}
              <span className="font-mono text-xs text-muted-foreground">{draft.externalCategoryId}</span>
            </p>
          </div>
          {children}
        </div>
      )}
      <Suggestions
        platform={platform}
        label={label}
        companyId={companyId}
        shopId={shopId}
        product={product}
        draft={draft}
        onPick={onPick}
        onSuggestions={onSuggestions}
      />
      <CategoryBrowser
        platform={platform}
        label={label}
        selected={draft.externalCategoryId}
        pathIds={pathIds}
        onPick={onPick}
      />
    </div>
  );
}

function Suggestions({
  platform,
  label,
  companyId,
  shopId,
  product,
  draft,
  onPick,
  onSuggestions,
}: Omit<CategoryStepProps, 'pathIds' | 'children'>) {
  const q = useCategorySuggestions(shopId, product.id);
  const items = q.data?.items;
  const first = items?.[0];
  // Lazada: dòng đầu chọn sẵn khi sản phẩm chưa có category (FE-1)
  useEffect(() => {
    if (items) onSuggestions?.(items);
    if (first && !draft.externalCategoryId && !permissionBlocked(first.permission)) onPick(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có kết quả gợi ý mới
  }, [items]);

  const api = platform === 'tiktok' ? 'Recommend Category' : 'GetCategorySuggestion';
  const heading = (
    <h3 className="text-sm font-semibold">
      {label} gợi ý cho “{product.name}” <span className="font-normal text-muted-foreground">· API {api}</span>
    </h3>
  );
  const editLink = (text: string) => (
    <Link className="font-medium text-primary-text underline" to={ROUTES.company.catalogProduct(companyId, product.id)}>
      {text}
    </Link>
  );

  if (!shopId) {
    return (
      <div className="grid gap-2">
        {heading}
        <AlertMessage severity="info">Công ty chưa có gian hàng {label} nào nên chưa lấy được gợi ý. Tìm category bên dưới.</AlertMessage>
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className="grid gap-2" aria-busy>
        {heading}
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (q.isError) {
    const problem = getProblem(q.error);
    const body =
      problem?.code === 'product_name_too_short' ? (
        <AlertMessage severity="warning">
          {label} chỉ gợi ý khi tên sản phẩm dài từ <b>{problem.min ?? 25} ký tự</b>; tên hiện có {product.name.trim().length} ký tự.
          TikTok cũng bắt tên đủ dài khi đẩy, nên sửa tên trước, hoặc tìm category bên dưới. {editLink('Sửa tên sản phẩm')}
        </AlertMessage>
      ) : problem?.code === 'images_missing' ? (
        <AlertMessage severity="warning">
          {label} gợi ý theo tên và ảnh đầu của sản phẩm, mà sản phẩm chưa có ảnh. {editLink('Thêm ảnh ở trang sản phẩm')}, hoặc
          tìm category bên dưới.
        </AlertMessage>
      ) : problem?.code === 'shop_not_connected' ? (
        <AlertMessage severity="info">Gian hàng chưa kết nối nên chưa lấy được gợi ý. Tìm category bên dưới.</AlertMessage>
      ) : (
        <AlertMessage severity="error">
          {problemMessage(q.error)}{' '}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Thử lại
          </button>
        </AlertMessage>
      );
    return (
      <div className="grid gap-2">
        {heading}
        {body}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2">
      {heading}
      {!items?.length ? (
        <AlertMessage severity="info">{label} không đoán được category cho sản phẩm này. Tìm category bên dưới.</AlertMessage>
      ) : (
        <div role="radiogroup" aria-label={`Gợi ý của ${label}`} className="grid grid-cols-1 gap-1.5">
          {items.map((s, k) => {
            const blocked = permissionBlocked(s.permission);
            const on = draft.externalCategoryId === s.externalId;
            return (
              <button
                key={s.externalId}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={blocked}
                onClick={() => onPick(s)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                  on ? 'border-primary bg-accent' : 'hover:border-primary',
                  blocked && 'cursor-not-allowed opacity-60 hover:border-border',
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{lastName(s.path)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{parentPath(s.path)}</span>
                  {blocked && <span className="block text-xs text-destructive-text">{codeMessage('category_not_permitted')}</span>}
                </span>
                <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
                  {k === 0 && <Badge variant="purple">{label} đề xuất nhất</Badge>}
                  {s.permission && (
                    <Badge variant={blocked ? 'destructive' : 'success'}>{PERMISSION_LABELS[s.permission]}</Badge>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tìm (≥ 2 ký tự, không cần dấu) hoặc duyệt cây theo cột; chỉ category cấp cuối chọn được */
function CategoryBrowser({
  platform,
  label,
  selected,
  pathIds,
  onPick,
}: {
  platform: string;
  label: string;
  selected: string | null;
  pathIds: string[] | null;
  onPick: (c: PlatformCategory) => void;
}) {
  const [query, setQuery] = useState('');
  // Cột đang mở (cha của từng cột sau cột gốc); mở sẵn nhánh của category đang chọn khi biết `pathIds`
  const [trail, setTrail] = useState<string[]>(() => (pathIds ? columnParents(pathIds).slice(1) as string[] : []));
  const pathKey = pathIds?.join('/') ?? '';
  useEffect(() => {
    if (pathIds) setTrail(columnParents(pathIds).slice(1) as string[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ mở lại khi category đang chọn đổi nhánh
  }, [pathKey]);
  const search = useDebounce(query.trim(), 300);
  const searching = query.trim().length >= 2 && search.length >= 2;
  const results = usePlatformCategories(platform, { search }, searching);
  const pickFromSearch = (c: PlatformCategory) => {
    onPick(c);
    setQuery('');
    setTrail(columnParents(c.pathIds ?? []).slice(1) as string[]);
  };
  return (
    <div className="grid grid-cols-1 gap-2" role="group" aria-label={`Chọn category ${label}`}>
      <h3 className="text-sm font-semibold">Hoặc tìm trong cây {label}</h3>
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
      {query.trim().length === 1 && <p className="text-xs text-muted-foreground">Nhập ít nhất 2 ký tự.</p>}
      {searching ? (
        <div className="max-h-[300px] min-h-[120px] overflow-auto rounded-lg border p-1.5" role="tree" aria-label={`Kết quả tìm category ${label}`}>
          <SearchResults
            loading={results.isLoading || search !== query.trim()}
            error={results.isError ? results.error : null}
            items={results.data?.items ?? []}
            selected={selected}
            onSelect={pickFromSearch}
          />
        </div>
      ) : (
        <CategoryColumns platform={platform} label={label} selected={selected} trail={trail} onTrail={setTrail} onSelect={onPick} />
      )}
      {/* Đã chọn thì thẻ "Đang chọn" ở đầu bước đã hiện đường dẫn, không lặp lại ở đây */}
      {!selected && <p className="text-sm text-muted-foreground">Chưa chọn category cấp cuối.</p>}
      {query && (
        <Button type="button" variant="link" size="sm" className="h-auto justify-self-start p-0" onClick={() => setQuery('')}>
          Xoá ô tìm
        </Button>
      )}
    </div>
  );
}
