import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
import type { CategorySuggestion, PlatformCategory, SuggestError, UsedCategory } from '@/types/shop';
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
  const [recent, setRecent] = useState<UsedCategory[]>([]);
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
        label={label}
        companyId={companyId}
        shopId={shopId}
        product={product}
        draft={draft}
        onPick={onPick}
        onSuggestions={onSuggestions}
        onRecent={setRecent}
      />
      <CategoryBrowser
        platform={platform}
        label={label}
        selected={draft.externalCategoryId}
        pathIds={pathIds}
        recent={recent}
        onPick={onPick}
      />
    </div>
  );
}

function Suggestions({
  label,
  companyId,
  shopId,
  product,
  draft,
  onPick,
  onSuggestions,
  onRecent,
}: Omit<CategoryStepProps, 'pathIds' | 'children' | 'platform'> & { onRecent: (items: UsedCategory[]) => void }) {
  const q = useCategorySuggestions(shopId, product.id);
  const data = q.data;
  const items = data?.items;
  const group = data?.group;
  // Ba nguồn theo thứ tự Documents/21 §18.5: sàn gợi ý, cùng nhóm hàng, công ty dùng gần đây. Chưa chọn category thì
  // chọn sẵn dòng đầu chọn được của nguồn sớm nhất
  useEffect(() => {
    if (!data) return;
    const all = [...data.items, ...(data.group ?? []), ...(data.recent ?? [])];
    onSuggestions?.(all);
    onRecent(data.recent ?? []);
    // Chỉ chọn sẵn từ gợi ý của sàn và nhóm hàng; "dùng gần đây" là của sản phẩm khác nhóm, để người dùng tự bấm
    const first = [...data.items, ...(data.group ?? [])].find((c) => !permissionBlocked(c.permission));
    if (first && !draft.externalCategoryId) onPick(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có kết quả gợi ý mới
  }, [data]);

  const groupName = product.group.name;
  const editLink = (text: string) => (
    <Link className="font-medium text-primary-text underline" to={ROUTES.company.catalogProduct(companyId, product.id)}>
      {text}
    </Link>
  );
  const groupCount = new Map((group ?? []).map((g) => [g.externalId, g.productCount]));
  const fallback = `chọn từ category danh mục ${groupName} đã dùng hoặc tìm trong cây bên dưới.`;

  let sourceOne: ReactNode;
  if (!shopId) {
    sourceOne = (
      <AlertMessage severity="info">Công ty chưa có gian hàng {label} nào nên chưa lấy được gợi ý. Tìm category bên dưới.</AlertMessage>
    );
  } else if (q.isLoading) {
    sourceOne = (
      <div className="grid gap-1.5" aria-busy>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (q.isError) {
    sourceOne =
      getProblem(q.error)?.code === 'shop_not_connected' ? (
        <AlertMessage severity="info">Gian hàng chưa kết nối nên chưa lấy được gợi ý. Tìm category bên dưới.</AlertMessage>
      ) : (
        <AlertMessage severity="error">
          {problemMessage(q.error)} <RetryButton onClick={() => void q.refetch()} />
        </AlertMessage>
      );
  } else if (data?.suggestError) {
    sourceOne = (
      <SuggestErrorAlert
        error={data.suggestError}
        label={label}
        name={product.name}
        fallback={fallback}
        editLink={editLink}
        onRetry={() => void q.refetch()}
      />
    );
  } else if (!items?.length) {
    sourceOne = (
      <AlertMessage severity="info">
        {label} không đoán được category cho sản phẩm này. Xem category các sản phẩm cùng danh mục bên dưới, hoặc tìm trong cây.
      </AlertMessage>
    );
  } else {
    sourceOne = (
      <div role="radiogroup" aria-label={`Gợi ý của ${label}`} className="grid grid-cols-1 gap-1.5">
        {items.map((s, k) => {
          const used = groupCount.get(s.externalId);
          return (
            <CategoryCard
              key={s.externalId}
              category={s}
              selected={draft.externalCategoryId === s.externalId}
              onPick={onPick}
              badges={
                <>
                  {k === 0 && <Badge variant="purple">{label} đề xuất nhất</Badge>}
                  {used ? (
                    <Badge variant="primary">
                      Nhóm {groupName} đã dùng · {used} sản phẩm
                    </Badge>
                  ) : (
                    s.usedByCompany && <Badge variant="neutral">Công ty đã dùng</Badge>
                  )}
                </>
              }
            />
          );
        })}
      </div>
    );
  }

  // Category cùng nhóm trùng gợi ý của sàn thì chỉ hiện ở nguồn 1, kèm badge số sản phẩm
  const restGroup = (group ?? []).filter((g) => !items?.some((i) => i.externalId === g.externalId));
  return (
    <>
      <section aria-labelledby="cat-src-1" className="grid grid-cols-1 gap-2">
        <SourceHeading id="cat-src-1" step="1 / 3 · gợi ý của sàn">
          {label} gợi ý cho “{product.name}”
        </SourceHeading>
        {sourceOne}
      </section>
      {/* Luôn hiện đủ ba nguồn để số thứ tự không nhảy; nguồn 2 đọc chung lời gọi gợi ý nên theo trạng thái của nó */}
      <section aria-labelledby="cat-src-2" className="grid grid-cols-1 gap-2">
          <SourceHeading id="cat-src-2" step="2 / 3 · theo danh mục sản phẩm">
            Sản phẩm cùng danh mục {groupName} đã dùng trên {label}
          </SourceHeading>
          {!shopId ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Kết nối gian hàng {label} để xem category các sản phẩm danh mục {groupName} đã dùng.
            </p>
          ) : q.isLoading ? (
            <Skeleton className="h-14 w-full" aria-busy />
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Chưa đọc được category danh mục {groupName} đã dùng. Bấm Thử lại ở trên.</p>
          ) : !group?.length ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Chưa có sản phẩm nào khác trong danh mục {groupName} lên {label}. Category bạn chọn lần này sẽ thành gợi ý cho các sản
              phẩm sau của danh mục.
            </p>
          ) : !restGroup.length ? (
            <p className="text-sm text-muted-foreground">
              Category danh mục {groupName} đã dùng trùng với gợi ý của {label} ở trên.
            </p>
          ) : (
            <div role="radiogroup" aria-label={`Category danh mục ${groupName} đã dùng`} className="grid grid-cols-1 gap-1.5">
              {restGroup.map((c) => (
                <CategoryCard
                  key={c.externalId}
                  category={c}
                  selected={draft.externalCategoryId === c.externalId}
                  onPick={onPick}
                  badges={<Badge variant="primary">{c.productCount} sản phẩm</Badge>}
                />
              ))}
            </div>
          )}
      </section>
    </>
  );
}

function SourceHeading({ id, step, children }: { id: string; step: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 id={id} className="min-w-0 text-sm font-semibold break-words">
        {children}
      </h3>
      <span className="text-xs text-muted-foreground">{step}</span>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="font-medium underline" onClick={onClick}>
      Thử lại
    </button>
  );
}

/** Lý do sàn không gợi ý được; mọi câu đều trỏ sang nguồn 2 và cây (Documents/21 §18.8.5) */
function SuggestErrorAlert({
  error,
  label,
  name,
  fallback,
  editLink,
  onRetry,
}: {
  error: SuggestError;
  label: string;
  name: string;
  fallback: string;
  editLink: (text: string) => ReactNode;
  onRetry: () => void;
}) {
  if (error.code === 'product_name_too_short') {
    const min = error.min ?? 25;
    return (
      <AlertMessage severity="warning">
        Tên dưới <b>{min} ký tự</b> nên {label} không gợi ý được (tên hiện có {name.trim().length} ký tự). Sửa tên sản phẩm (đủ{' '}
        {min} ký tự) để nhận gợi ý, hoặc {fallback} {editLink('Sửa tên sản phẩm')}
      </AlertMessage>
    );
  }
  if (error.code === 'images_missing') {
    return (
      <AlertMessage severity="warning">
        {label} gợi ý theo tên và ảnh đầu của sản phẩm, mà sản phẩm chưa có ảnh. {editLink('Thêm ảnh ở trang sản phẩm')}, hoặc{' '}
        {fallback}
      </AlertMessage>
    );
  }
  return (
    <AlertMessage severity="warning">
      {label} chưa trả lời được lúc này. Hãy {fallback} <RetryButton onClick={onRetry} />
    </AlertMessage>
  );
}

/** Thẻ radio một category: tên lá, đường dẫn cha, badge; category sàn không cho đăng thì khoá */
function CategoryCard({
  category,
  selected,
  onPick,
  badges,
}: {
  category: CategorySuggestion;
  selected: boolean;
  onPick: (c: { externalId: string; path: string }) => void;
  badges?: ReactNode;
}) {
  const blocked = permissionBlocked(category.permission);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={blocked}
      onClick={() => onPick(category)}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
        selected ? 'border-primary bg-accent' : 'hover:border-primary',
        blocked && 'cursor-not-allowed opacity-60 hover:border-border',
      )}
    >
      <span className="min-w-0">
        <span className="block font-medium">{lastName(category.path)}</span>
        <span className="block truncate text-xs text-muted-foreground" title={category.path}>
          {parentPath(category.path)}
        </span>
        {blocked && <span className="block text-xs text-destructive-text">{codeMessage('category_not_permitted')}</span>}
      </span>
      <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
        {badges}
        {category.permission && (
          <Badge variant={blocked ? 'destructive' : 'success'}>{PERMISSION_LABELS[category.permission]}</Badge>
        )}
      </span>
    </button>
  );
}

/** Tìm (≥ 2 ký tự, không cần dấu) hoặc duyệt cây theo cột; chỉ category cấp cuối chọn được */
function CategoryBrowser({
  platform,
  label,
  selected,
  pathIds,
  recent,
  onPick,
}: {
  platform: string;
  label: string;
  selected: string | null;
  pathIds: string[] | null;
  /** Category công ty dùng gần đây (BE đã bỏ trùng hai nguồn trên), hiện thành chip dưới ô tìm */
  recent: UsedCategory[];
  onPick: (c: { externalId: string; path: string }) => void;
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
      <SourceHeading id="cat-src-3" step="3 / 3 · cây category của sàn">
        Hoặc tìm trong cây {label}
      </SourceHeading>
      <div className="relative">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm category, không cần dấu (vd: ao thun)"
          aria-label={`Tìm category ${label}`}
        />
      </div>
      {query.trim().length === 1 && <p className="text-xs text-muted-foreground">Nhập ít nhất 2 ký tự.</p>}
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Category công ty dùng gần đây">
          <span className="text-xs text-muted-foreground">Công ty dùng gần đây:</span>
          {recent.map((c) => {
            const blocked = permissionBlocked(c.permission);
            const on = selected === c.externalId;
            return (
              <button
                key={c.externalId}
                type="button"
                title={blocked ? `${c.path} · ${codeMessage('category_not_permitted')}` : c.path}
                aria-pressed={on}
                disabled={blocked}
                onClick={() => onPick(c)}
                className={cn(
                  'inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs transition-colors',
                  on ? 'border-primary bg-accent text-primary-text' : 'hover:border-primary hover:text-primary-text',
                  blocked && 'cursor-not-allowed opacity-60',
                )}
              >
                {lastName(c.path)} · {c.productCount}
              </button>
            );
          })}
        </div>
      )}
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
