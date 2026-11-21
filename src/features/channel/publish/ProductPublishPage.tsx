import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useProduct } from '@/api/catalog.api';
import { problemMessage } from '@/api/problemMessages';
import { useProductListingRows, useProductSpecs, useShops } from '@/api/shops.api';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { ProductDetail } from '@/types/catalog';
import type { ProductListingRow, ProductSpecResult, Shop } from '@/types/shop';
import { RegroupNotice } from '@/features/catalog/RegroupNotice';
import { STATUS_META, isUsable, platformLabel } from '../shopSchemas';
import { PlatformPanel } from './PlatformPanel';
import { PublishPreview } from './PublishPreview';
import { initialSelection, selectedPlatforms, shopSummary } from './publishRows';
import { usePlatformDraft, type PlatformDraft } from './usePlatformDraft';

const STEPS = ['Chọn gian hàng', 'Bổ sung theo sàn', 'Xem trước và đăng'] as const;
type Step = 0 | 1 | 2;

/**
 * Đăng một sản phẩm đã hoàn thiện lên nhiều gian hàng của nhiều sàn (Documents/29 bước 4, Documents/25 §6.3, Documents/21
 * §18.9). Route `/c/:companyId/catalog/products/:productId/publish?shops=<id,id>&platform=<mã sàn>`.
 */
export function ProductPublishPage() {
  const { productId = '' } = useParams();
  const product = useProduct(productId);
  const shops = useShops();
  const rows = useProductListingRows(productId, true, (items) => (items.some((r) => r.listing?.status === 'pushing') ? 5000 : false));
  useBreadcrumb(product.data?.name);

  if (product.isLoading || shops.isLoading || rows.isLoading) return <PageSpinner />;
  const error = product.error ?? shops.error ?? rows.error;
  if (error || !product.data) return <AlertMessage severity="error">{problemMessage(error)}</AlertMessage>;
  return <PublishLoader product={product.data} shops={shops.data?.items ?? []} rows={rows.data ?? []} />;
}

/** Tải thông tin sàn của mọi sàn có gian hàng trước khi dựng bản nháp (mỗi sàn một bản, Documents/21 §18.8.2) */
function PublishLoader({ product, shops, rows }: { product: ProductDetail; shops: Shop[]; rows: ProductListingRow[] }) {
  const platforms = useMemo(() => [...new Set(shops.filter((s) => isUsable(s.status)).map((s) => s.platform))], [shops]);
  const specs = useProductSpecs(product.id, platforms);
  if (specs.some((q) => q.isLoading)) return <PageSpinner />;
  const failed = specs.find((q) => q.error);
  if (failed) return <AlertMessage severity="error">{problemMessage(failed.error)}</AlertMessage>;
  const initial = new Map(platforms.map((p, k) => [p, specs[k]!.data!]));
  return <PublishFlow product={product} shops={shops} rows={rows} platforms={platforms} initial={initial} />;
}

function PublishFlow({
  product,
  shops,
  rows,
  platforms,
  initial,
}: {
  product: ProductDetail;
  shops: Shop[];
  rows: ProductListingRow[];
  platforms: string[];
  initial: ReadonlyMap<string, ProductSpecResult>;
}) {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const [search] = useSearchParams();
  const can = useCan();
  const canEditProduct = can(PERMISSIONS.productManage);
  const canEditCompany = can(PERMISSIONS.companyManage);
  const usable = shops.filter((s) => isUsable(s.status));
  const [selected, setSelected] = useState<ReadonlySet<string>>(() =>
    initialSelection(usable, rows, { shops: search.get('shops'), platform: search.get('platform') }),
  );
  const [step, setStep] = useState<Step>(() => (search.get('platform') && selected.size ? 1 : 0));
  const [focusPlatform, setFocusPlatform] = useState<string | null>(search.get('platform'));
  const [status, setStatus] = useState<ReadonlyMap<string, PlatformStatus>>(new Map());
  const chosenPlatforms = selectedPlatforms(usable, selected);

  const goTo = (s: Step) => {
    setStep(s);
    window.scrollTo(0, 0);
  };

  return (
    <div>
      <Link
        to={ROUTES.company.catalogProduct(companyId, product.id)}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Về trang sản phẩm
      </Link>
      <PageHeader
        title={`Đăng sản phẩm: ${product.name}`}
        subtitle={`${product.variants.filter((v) => !v.archivedAt).length} SKU`}
        help="Đăng một lần lên nhiều gian hàng. Mỗi sàn chỉ hỏi phần Commerio chưa tự điền được; gian hàng cùng sàn dùng chung thông tin sàn."
      />

      <nav aria-label="Các bước" className="mb-4 flex flex-wrap gap-1.5">
        {STEPS.map((name, k) => (
          <button
            key={name}
            type="button"
            onClick={() => goTo(k as Step)}
            disabled={k > 0 && !selected.size}
            aria-current={step === k ? 'step' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-sm text-muted-foreground disabled:opacity-50',
              step === k && 'border-primary bg-accent font-semibold text-primary-text',
              k < step && 'border-success-border text-success-text',
            )}
          >
            {k < step && <Check className="size-3.5" aria-hidden />}
            {k < step && <span className="sr-only"> (đã qua)</span>}
            {k + 1}. {name}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <ShopPicker
          product={product}
          shops={shops}
          rows={rows}
          status={status}
          selected={selected}
          onToggle={(id, on) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          companyId={companyId}
        />
      )}
      {/* Mỗi sàn một bản nháp, luôn gắn để không mất phần đã nhập khi chuyển bước; chỉ hiện ở bước 2 */}
      <div className={cn('grid gap-4', step !== 1 && 'hidden')}>
        {platforms.map((p) => {
          const platformShops = usable.filter((s) => s.platform === p && selected.has(s.id));
          return (
            <PlatformSlot
              key={p}
              platform={p}
              label={platformLabel(p, usable.find((s) => s.platform === p)?.platformName)}
              product={product}
              initial={initial.get(p)!}
              companyId={companyId}
              shops={platformShops}
              suggestShopId={platformShops[0]?.id ?? usable.find((s) => s.platform === p)?.id ?? null}
              visible={chosenPlatforms.includes(p)}
              focus={step === 1 && focusPlatform === p}
              onFocused={() => setFocusPlatform(null)}
              canEditProduct={canEditProduct}
              canEditCompany={canEditCompany}
              onStatus={(st) =>
                setStatus((prev) => {
                  const cur = prev.get(p);
                  if (cur && cur.ready === st.ready && cur.missing === st.missing) return prev;
                  return new Map(prev).set(p, st);
                })
              }
            />
          );
        })}
      </div>
      {step === 2 && (
        <PublishPreview
          product={product}
          companyId={companyId}
          shops={usable.filter((s) => selected.has(s.id))}
          rows={rows.filter((r) => selected.has(r.shopId))}
          readyPlatforms={new Set(chosenPlatforms.filter((p) => status.get(p)?.ready))}
          onFixPlatform={(p) => {
            setFocusPlatform(p);
            goTo(1);
          }}
        />
      )}

      <div className="mt-4 flex items-center gap-2">
        {step > 0 && (
          <Button type="button" variant="outline" onClick={() => goTo((step - 1) as Step)}>
            Quay lại
          </Button>
        )}
        <span className="flex-1" />
        {step < 2 && (
          <Button type="button" onClick={() => goTo((step + 1) as Step)} disabled={!selected.size}>
            Tiếp
          </Button>
        )}
      </div>
    </div>
  );
}

/** Tình trạng thông tin của một sàn, báo lên trang để bước chọn và bước xem trước dùng */
interface PlatformStatus {
  ready: boolean;
  missing: number;
}

/** Sàn đủ thông tin: không thiếu gì, đã lưu, không còn sửa dở */
const isReady = (d: PlatformDraft) => Boolean(d.saved.spec && !d.dirty && d.missing.length === 0);

function PlatformSlot({
  platform,
  label,
  product,
  initial,
  companyId,
  shops,
  suggestShopId,
  visible,
  focus,
  onFocused,
  canEditProduct,
  canEditCompany,
  onStatus,
}: {
  platform: string;
  label: string;
  product: ProductDetail;
  initial: ProductSpecResult;
  companyId: string;
  shops: Shop[];
  suggestShopId: string | null;
  visible: boolean;
  focus: boolean;
  onFocused: () => void;
  canEditProduct: boolean;
  canEditCompany: boolean;
  onStatus: (s: PlatformStatus) => void;
}) {
  const d = usePlatformDraft({ platform, label, product, initial, shopId: suggestShopId, canEditCompany });
  const ready = isReady(d);
  const missing = d.missing.length;
  useEffect(() => onStatus({ ready, missing }), [ready, missing]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ báo khi tình trạng đổi
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus || !ref.current) return;
    ref.current.scrollIntoView({ block: 'start' });
    onFocused();
  }, [focus, onFocused]);
  if (!visible) return null;
  return (
    <div ref={ref}>
      <PlatformPanel
        d={d}
        product={product}
        companyId={companyId}
        shops={shops}
        shopId={suggestShopId}
        canEditProduct={canEditProduct}
        canEditCompany={canEditCompany}
      />
    </div>
  );
}

function ShopPicker({
  product,
  shops,
  rows,
  status,
  selected,
  onToggle,
  companyId,
}: {
  product: ProductDetail;
  shops: Shop[];
  rows: ProductListingRow[];
  status: ReadonlyMap<string, PlatformStatus>;
  selected: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  companyId: string;
}) {
  const platforms = [...new Set(shops.map((s) => s.platform))];
  if (!shops.length) {
    return (
      <AlertMessage severity="info">
        Công ty chưa kết nối gian hàng nào.{' '}
        <Link className="font-medium underline" to={ROUTES.company.shops(companyId)}>
          Kết nối gian hàng
        </Link>
      </AlertMessage>
    );
  }
  return (
    <div className="grid gap-4">
      {platforms.map((p) => {
        const st = status.get(p);
        const label = platformLabel(p, shops.find((s) => s.platform === p)?.platformName);
        return (
          <section key={p} aria-label={label} className="grid gap-2">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {label}
              {st && (st.ready ? <Badge variant="success">Đủ thông tin sàn</Badge> : <Badge variant="warning">{st.missing ? `Còn ${st.missing} mục thông tin sàn` : 'Thông tin sàn chưa lưu'}</Badge>)}
            </h3>
            <RegroupNotice productId={product.id} platform={p} shops={shops} />
            <div className="grid gap-2 md:grid-cols-2">
              {shops
                .filter((s) => s.platform === p)
                .map((s) => {
                  const usable = isUsable(s.status);
                  const sum = shopSummary(rows, s.id);
                  const id = `pick-${s.id}`;
                  return (
                    <label
                      key={s.id}
                      htmlFor={id}
                      className={cn(
                        'flex min-h-14 items-start gap-3 rounded-lg border p-3 text-sm',
                        usable ? 'cursor-pointer hover:border-primary' : 'opacity-60',
                        selected.has(s.id) && 'border-primary bg-accent',
                      )}
                    >
                      <Checkbox id={id} className="mt-0.5" disabled={!usable} checked={selected.has(s.id)} onCheckedChange={(v) => onToggle(s.id, v === true)} />
                      <span className="grid gap-0.5">
                        <span className="font-medium">{s.shopName}</span>
                        <span className="text-muted-foreground">
                          {!usable
                            ? `${STATUS_META[s.status].label}: ${STATUS_META[s.status].hint}`
                            : sum.total
                              ? sum.onPlatform === sum.total
                                ? `Đã đăng đủ ${sum.total} SKU`
                                : `Đã đăng ${sum.onPlatform}/${sum.total} SKU`
                              : 'Chưa đăng SKU nào'}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** `/channel/products/:productId/push/:platform?shop=` của trang đẩy cũ → màn Đăng sản phẩm, bước bổ sung của sàn */
export function LegacyPushRedirect() {
  const { productId = '', platform = '' } = useParams();
  const [search] = useSearchParams();
  const { companyContext } = useAuth();
  const shop = search.get('shop');
  return <Navigate replace to={ROUTES.company.productPush(companyContext?.companyId ?? '', productId, platform, shop ?? undefined)} />;
}
