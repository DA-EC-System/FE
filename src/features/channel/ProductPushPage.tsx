import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useProduct } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { usePlatformCategory, useProductSpec, usePushListings, useSaveProductSpec, useShops } from '@/api/shops.api';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { ProductDetail } from '@/types/catalog';
import type { CategorySuggestion, ProductSpecResult, PushResult, Shop, SpecValue } from '@/types/shop';
import { platformLabel } from '@/features/catalog/platformCategory';
import { SPEC_FIX_CODES, pushBlockMessage, splitPushResults } from './listingPush';
import { isUsable } from './shopSchemas';
import {
  defaultAxisMap,
  draftFromSpec,
  firstErrorStep,
  firstStep,
  permissionBlocked,
  PERMISSION_LABELS,
  productAxes,
  specInput,
  specMissing,
  stepOfError,
  stepOfMissing,
  suggestValueMap,
  withAttribute,
  withAxis,
  withCategory,
  withValue,
  type PushStep,
  type SpecDraft,
} from './specDraft';
import { CategoryStep } from './push/CategoryStep';
import { AttributesStep } from './push/AttributesStep';
import { VariantsStep } from './push/VariantsStep';
import { axisFieldId, valueFieldId } from './push/fieldIds';
import { ReviewStep } from './push/ReviewStep';

const STEPS = ['Category', 'Attributes', 'Variants', 'Xem lại & đẩy'];

interface ShopOutcome {
  shop: Shop;
  queued: number;
  blocked: PushResult[];
  error: string | null;
}

/**
 * Trang 4 bước đẩy một sản phẩm lên sàn, hoặc bổ sung thông tin sàn cho sản phẩm đã ghép SKU (commerio-backend#400,
 * Documents/21 §18.5). Route `/c/:companyId/channel/products/:productId/push/:platform?shop=<id>`
 */
export function ProductPushPage() {
  const { productId = '', platform = '' } = useParams();
  const [search] = useSearchParams();
  const product = useProduct(productId);
  const spec = useProductSpec(productId, platform);
  const shops = useShops();
  useBreadcrumb(product.data?.name);

  if (product.isLoading || spec.isLoading || shops.isLoading) return <PageSpinner />;
  const error = product.error ?? spec.error ?? shops.error;
  if (error || !product.data || !spec.data) {
    return <AlertMessage severity="error">{problemMessage(error)}</AlertMessage>;
  }
  const platformShops = (shops.data?.items ?? []).filter((s) => s.platform === platform);
  return (
    <PushWizard
      key={`${productId}-${platform}`}
      platform={platform}
      product={product.data}
      initial={spec.data}
      shops={platformShops}
      shopParam={search.get('shop')}
      fillOnly={search.get('mode') === 'fill'}
    />
  );
}

interface WizardProps {
  platform: string;
  product: ProductDetail;
  initial: ProductSpecResult;
  shops: Shop[];
  shopParam: string | null;
  /** Mở từ Bổ sung thông tin: bước cuối chỉ Lưu */
  fillOnly: boolean;
}

function PushWizard({ platform, product, initial, shops, shopParam, fillOnly }: WizardProps) {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const label = platformLabel(platform);
  const [draft, setDraft] = useState<SpecDraft>(() => draftFromSpec(initial.spec));
  const [step, setStep] = useState<PushStep>(() => firstStep(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [outcome, setOutcome] = useState<ShopOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** Category đọc từ sàn lúc ghép SKU: không đổi ở trang này */
  const locked = draft.source === 'match';

  const usable = shops.filter((s) => isUsable(s.status));
  const fromParam = shops.find((s) => s.id === shopParam);
  /** Gian hàng gọi gợi ý: gian hàng mở trang, không thì gian hàng dùng được đầu tiên */
  const suggestShop = (fromParam && isUsable(fromParam.status) ? fromParam : usable[0]) ?? null;
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(fromParam && isUsable(fromParam.status) ? [fromParam.id] : usable.map((s) => s.id)),
  );

  const leaf = usePlatformCategory(platform, draft.externalCategoryId, suggestShop?.id);
  const attrs = leaf.data?.attributes ?? null;
  const sales = useMemo(() => attrs?.filter((a) => a.kind === 'sales') ?? null, [attrs]);
  const axes = useMemo(() => productAxes(product.variants), [product.variants]);
  const facts = { originCountry: product.originCountry ?? null, brand: product.brand ?? null };
  const missing = draft.externalCategoryId
    ? specMissing(attrs, draft, axes, facts)
    : [{ code: 'category', label: `Chưa chọn category ${label}`, reason: 'category_changed' as const }];

  // Gợi ý trục ↔ sales attribute, giá trị ↔ giá trị chuẩn khi đã có attribute của leaf (không ghi đè ô đã chọn)
  useEffect(() => {
    if (!sales) return;
    setDraft((d) => {
      const axisMap = defaultAxisMap(axes, sales, d.axisMap);
      return { ...d, axisMap, valueMap: suggestValueMap(axes, axisMap, sales, d.valueMap) };
    });
  }, [sales, axes]);

  // Quyền category của gian hàng gọi gợi ý (TikTok): khoá ô gian hàng đó ở bước 4
  const blockedShops = useMemo(() => {
    const map = new Map<string, string>();
    const hit = suggestions.find((s) => s.externalId === draft.externalCategoryId);
    if (suggestShop && hit?.permission && permissionBlocked(hit.permission)) map.set(suggestShop.id, PERMISSION_LABELS[hit.permission]);
    return map;
  }, [suggestions, draft.externalCategoryId, suggestShop]);

  const goTo = (s: PushStep) => {
    if (s > 0 && !draft.externalCategoryId) return;
    setStep(s);
    window.scrollTo(0, 0);
  };
  const jump = (key: string) => {
    const s = stepOfError(key);
    setStep(s);
    const [, code = key] = key.split(/\.(.*)/s);
    if (s === 1) setFocus(code);
    else if (s === 2) setTimeout(() => document.getElementById(key.startsWith('axisMap') ? axisFieldId(code) : valueFieldId(code))?.focus(), 50);
  };
  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  const save = useSaveProductSpec();
  const push = usePushListings();

  const submit = async () => {
    if (busy || !draft.externalCategoryId) return;
    setBusy(true);
    setErrors({});
    setOutcome(null);
    try {
      let saved: ProductSpecResult;
      try {
        saved = await save.mutateAsync({ productId: product.id, platform, input: specInput(draft, attrs, axes) });
      } catch (e) {
        const problem = getProblem(e);
        if (problem?.errors && Object.keys(problem.errors).length) {
          setErrors(problem.errors);
          const first = Object.keys(problem.errors).find((k) => stepOfError(k) === firstErrorStep(problem.errors!));
          if (first) jump(first);
          toast.error('Còn ô chưa hợp lệ, xem các ô viền đỏ.');
        } else if (problem?.code === 'version_conflict' && problem.current) {
          const current = problem.current as ProductSpecResult;
          setDraft(draftFromSpec(current.spec));
          setStep(firstStep(current));
          toast.warning(`Người khác vừa sửa thông tin ${label} của sản phẩm này. Đã nạp bản mới nhất, xem lại rồi bấm lại.`);
        } else {
          toast.error(problemMessage(e));
        }
        return;
      }
      setDraft(draftFromSpec(saved.spec));
      if (fillOnly) {
        toast.success(saved.missing.length ? `Đã lưu. Còn thiếu ${saved.missing.length} mục.` : `Đã lưu thông tin ${label} của sản phẩm.`);
        return;
      }
      const variantIds = product.variants.filter((v) => !v.archivedAt).map((v) => v.id);
      const targets = shops.filter((s) => selected.has(s.id) && !blockedShops.has(s.id));
      const results: ShopOutcome[] = [];
      for (const shop of targets) {
        try {
          const { queued, blocked } = splitPushResults(await push.mutateAsync({ shopId: shop.id, variantIds }));
          results.push({ shop, queued, blocked, error: null });
        } catch (e) {
          results.push({ shop, queued: 0, blocked: [], error: problemMessage(e) });
        }
      }
      setOutcome(results);
      const total = results.reduce((n, r) => n + r.queued, 0);
      if (total) toast.success(`Đã xếp ${total} SKU chờ đẩy lên ${label}.`);
      else toast.error('Chưa SKU nào được đẩy, xem lý do từng gian hàng.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = Boolean(draft.externalCategoryId) && (fillOnly || [...selected].some((id) => !blockedShops.has(id)));
  const backTo = fromParam ? ROUTES.company.shop(companyId, fromParam.id) : ROUTES.company.shops(companyId);
  const title = `${fillOnly ? 'Thông tin sàn' : 'Đẩy lên sàn'}: ${product.name}`;
  const activeVariants = product.variants.filter((v) => !v.archivedAt).length;

  return (
    <div>
      <Link to={backTo} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {fromParam ? `Về ${fromParam.shopName}` : 'Về danh sách gian hàng'}
      </Link>
      <PageHeader
        title={title}
        subtitle={`${label} · ${activeVariants} variant${locked ? ' · category lấy từ sàn khi ghép SKU' : ''}`}
        help="Thông tin sàn (category, attribute, mapping variant) lưu theo sản phẩm và sàn, dùng chung cho mọi gian hàng cùng sàn. Lưu xong mới đẩy."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="gap-0 py-0">
          <nav aria-label="Các bước" className="flex flex-wrap gap-1.5 border-b px-4 py-3">
            {STEPS.map((step_, k) => {
              const name = k === 3 && fillOnly ? 'Xem lại & lưu' : step_;
              const s = k as PushStep;
              // Đã qua và không còn thiếu ở bước đó (bước 4 không có phần thiếu riêng)
              const done = k < step && !missing.some((m) => stepOfMissing(m.reason) === k);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => goTo(s)}
                  disabled={k > 0 && !draft.externalCategoryId}
                  aria-current={step === s ? 'step' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm text-muted-foreground disabled:opacity-50',
                    step === s && 'border-primary bg-accent font-semibold text-primary-text',
                    done && 'border-success-border text-success-text',
                  )}
                >
                  {done && <Check className="size-3.5" />}
                  {k + 1}. {name}
                </button>
              );
            })}
          </nav>
          <div className="px-5 py-4">
            {step === 0 && (
              <CategoryStep
                platform={platform}
                label={label}
                companyId={companyId}
                shopId={suggestShop?.id ?? null}
                product={product}
                draft={draft}
                locked={locked}
                onPick={(c) => {
                  setDraft((d) => withCategory(d, c.externalId, c.path));
                  clearError('externalCategoryId');
                }}
                onSuggestions={setSuggestions}
              />
            )}
            {step === 0 && errors.externalCategoryId && (
              <p className="mt-2 text-sm text-destructive-text">{errors.externalCategoryId}</p>
            )}
            {step === 1 && (
              <AttributesStep
                platform={platform}
                label={label}
                companyId={companyId}
                productId={product.id}
                draft={draft}
                attributes={attrs}
                loading={leaf.isLoading}
                error={leaf.isError ? leaf.error : null}
                onRetry={() => void leaf.refetch()}
                facts={facts}
                missing={missing}
                errors={errors}
                onChange={(code: string, value: SpecValue | null) => {
                  setDraft((d) => withAttribute(d, code, value));
                  clearError(`attributes.${code}`);
                }}
                focus={focus}
                onFocused={() => setFocus(null)}
                onFocusRequest={setFocus}
              />
            )}
            {step === 2 && (
              <VariantsStep
                platform={platform}
                label={label}
                axes={axes}
                sales={sales}
                draft={draft}
                errors={errors}
                onAxis={(axis, code) => {
                  setDraft((d) => {
                    const next = withAxis(d, axis, code);
                    return sales ? { ...next, valueMap: suggestValueMap([axis], next.axisMap, sales, next.valueMap) } : next;
                  });
                  clearError(`axisMap.${axis.attributeId}`);
                }}
                onValue={(valueId, optionId) => {
                  setDraft((d) => withValue(d, valueId, optionId));
                  clearError(`valueMap.${valueId}`);
                }}
              />
            )}
            {step === 3 && (
              <ReviewStep
                label={label}
                product={product}
                draft={draft}
                sales={sales}
                missing={missing}
                fillOnly={fillOnly}
                shops={shops}
                selected={selected}
                blockedShops={blockedShops}
                onToggleShop={(id, on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
                onGoto={goTo}
              />
            )}
            {step === 3 && outcome && (
              <Outcome
                outcome={outcome}
                platform={label}
                companyId={companyId}
                skuOf={new Map(product.variants.map((v) => [v.id, v.sku]))}
                onFix={(code) => goTo(code === 'spec_incomplete' || code === 'listing_check_failed' ? 1 : 0)} />
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-5 py-3">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => goTo((step - 1) as PushStep)}>
                Quay lại
              </Button>
            )}
            <span className="flex-1" />
            {step < 3 ? (
              <Button type="button" onClick={() => goTo((step + 1) as PushStep)} disabled={!draft.externalCategoryId}>
                Tiếp
              </Button>
            ) : (
              <Button type="button" onClick={() => void submit()} disabled={!canSubmit || busy}>
                {busy ? 'Đang gửi…' : fillOnly ? 'Lưu' : `Lưu và đẩy lên ${label}`}
              </Button>
            )}
          </div>
        </Card>

        <Card className="gap-0 py-0 text-sm" aria-label="Tóm tắt">
          <SummaryRow title="Category" ok={Boolean(draft.externalCategoryId) && !missing.some((m) => stepOfMissing(m.reason) === 0)} onEdit={() => goTo(0)}>
            {draft.externalCategoryId ? draft.categoryPath.split(' > ').at(-1) : 'Chưa chọn'}
          </SummaryRow>
          <SummaryRow
            title="Attributes"
            ok={draft.externalCategoryId && attrs ? !missing.some((m) => stepOfMissing(m.reason) === 1) : undefined}
            onEdit={draft.externalCategoryId ? () => goTo(1) : undefined}
          >
            {!draft.externalCategoryId
              ? '—'
              : leaf.isLoading
                ? 'Đang tải…'
                : !attrs
                  ? 'Chưa tải được attribute'
                  : (() => {
                      const n = missing.filter((m) => stepOfMissing(m.reason) === 1).length;
                      return n ? `Thiếu ${n} bắt buộc` : 'Đủ bắt buộc';
                    })()}
          </SummaryRow>
          <SummaryRow
            title="Variants"
            ok={draft.externalCategoryId ? !missing.some((m) => m.reason === 'axis_unmapped') : undefined}
            onEdit={draft.externalCategoryId ? () => goTo(2) : undefined}
          >
            {axes.length ? `${axes.map((a) => a.name).join(' × ')} · ${activeVariants} SKU` : `Không có, ${activeVariants} SKU`}
          </SummaryRow>
          {!fillOnly && (
            <SummaryRow title="Gian hàng" ok={canSubmit} onEdit={draft.externalCategoryId ? () => goTo(3) : undefined}>
              {selected.size ? shops.filter((s) => selected.has(s.id)).map((s) => s.shopName).join(', ') : 'Chưa chọn'}
            </SummaryRow>
          )}
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ title, ok, onEdit, children }: { title: string; ok?: boolean; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b px-4 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="flex items-center gap-1.5">
          {ok === true && <Check className="size-3.5 flex-none text-success-text" aria-label="Đủ" />}
          {ok === false && <span className="size-2 flex-none rounded-full bg-warning" aria-label="Chưa đủ" />}
          <span className="truncate">{children}</span>
        </div>
      </div>
      {onEdit && (
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onEdit}>
          Sửa
        </Button>
      )}
    </div>
  );
}

function Outcome({
  outcome,
  platform,
  companyId,
  skuOf,
  onFix,
}: {
  outcome: ShopOutcome[];
  skuOf: ReadonlyMap<string, string>;
  platform: string;
  companyId: string;
  onFix: (code: string) => void;
}) {
  return (
    <section className="mt-5 grid gap-2" aria-label="Kết quả đẩy">
      <h3 className="text-sm font-semibold">Kết quả</h3>
      {outcome.map((o) => (
        <div key={o.shop.id} className="rounded-lg border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <b>{o.shop.shopName}</b>
            {o.error ? (
              <span className="text-destructive-text">{o.error}</span>
            ) : (
              <span className={o.queued ? 'text-success-text' : 'text-muted-foreground'}>
                {o.queued ? `Đã xếp ${o.queued} SKU chờ đẩy` : 'Không SKU nào được xếp'}
                {o.blocked.length ? `, ${o.blocked.length} SKU bị chặn` : ''}
              </span>
            )}
            {o.queued > 0 && (
              <Link className="ml-auto text-primary-text underline" to={ROUTES.company.shop(companyId, o.shop.id)}>
                Xem ở Sản phẩm trên sàn
              </Link>
            )}
          </div>
          {o.blocked.length > 0 && (
            <ul className="mt-1 grid gap-0.5">
              {o.blocked.map((r) => (
                <li key={r.variantId} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{skuOf.get(r.variantId) ?? r.variantId}</span>
                  <span>{r.code ? pushBlockMessage(r.code, r.message, platform) : r.message}</span>
                  {r.code && SPEC_FIX_CODES.has(r.code) && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => onFix(r.code!)}>
                      Sửa
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
