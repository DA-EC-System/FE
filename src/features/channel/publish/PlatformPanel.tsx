import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { ProductDetail } from '@/types/catalog';
import type { PlatformAttribute, ResolvedAttribute, Shop } from '@/types/shop';
import { CategoryPath } from '@/features/catalog/CategoryPath';
import { BRAND_CODES, CUSTOM_AXIS, ORIGIN_CODES, PROFILE_FIELDS, effectiveValue, fieldHint, valueLabel } from '../specDraft';
import { AttributeField } from '../push/AttributeField';
import { AttributesStep } from '../push/AttributesStep';
import { CategoryChangeBlock } from '../push/CategoryChangeBlock';
import { CategoryStep } from '../push/CategoryStep';
import { VariantsStep } from '../push/VariantsStep';
import { fieldId } from '../push/fieldIds';
import type { PlatformDraft } from './usePlatformDraft';
import { shopDisplayName } from '../shopList';

const SOURCE_LABELS: Record<ResolvedAttribute['source'], string> = {
  override: 'Đã nhập cho sản phẩm này',
  catalog: 'Thuộc tính sản phẩm',
  company: 'Hồ sơ công ty',
  default: 'Mặc định của sàn',
};

const AXIS_REASONS = new Set(['axis_unmapped', 'axis_shape', 'sales_required']);
const ATTRIBUTE_REASONS = new Set(['required', 'required_when']);

interface PlatformPanelProps {
  d: PlatformDraft;
  product: ProductDetail;
  companyId: string;
  /** Gian hàng đã chọn của sàn này */
  shops: Shop[];
  /** Gian hàng gọi gợi ý category, cascade */
  shopId: string | null;
  canEditProduct: boolean;
  canEditCompany: boolean;
}

/**
 * Bước "Bổ sung theo sàn" của một sàn (Documents/29 bước 4): chỉ hỏi phần app chưa tự điền được (`missing` của spec,
 * Documents/21 §18.8.2). Phần đã tự điền gom lại, mở ra xem và sửa; thuộc tính biến thể chỉ mở khi chưa tự khớp.
 */
export function PlatformPanel({ d, product, companyId, shops, shopId, canEditProduct, canEditCompany }: PlatformPanelProps) {
  const [changingCategory, setChangingCategory] = useState(!d.draft.externalCategoryId);
  const [editAxes, setEditAxes] = useState(false);
  const attrMissing = d.missing.filter((m) => ATTRIBUTE_REASONS.has(m.reason));
  const axisMissing = d.missing.filter((m) => AXIS_REASONS.has(m.reason));
  const categoryMissing = d.missing.filter((m) => m.reason === 'category_changed' || m.reason === 'category_removed');
  const ready = d.missing.length === 0 && !d.dirty && Boolean(d.saved.spec);
  // Category nhận ít trục hơn sản phẩm: lý do chặn chính, đưa lên đầu bước 2 kèm lối xử lý (FE#459)
  const axisOver = d.draft.externalCategoryId && d.caps && d.axes.length > d.caps.maxAxes ? d.caps.maxAxes : null;
  const changeCategory = () => {
    setChangingCategory(true);
    requestAnimationFrame(() => document.getElementById(`category-${d.platform}`)?.scrollIntoView({ block: 'center' }));
  };
  const byCode = new Map((d.attrs ?? []).map((a) => [a.code, a]));
  // Lỗi 422 rơi vào attribute không nằm trong phần thiếu: mở sẵn khối sửa mọi attribute
  const otherErrors = Object.keys(d.errors).some((k) => k.startsWith('attributes.') && !attrMissing.some((m) => `attributes.${m.code}` === k));

  return (
    <section aria-label={`Thông tin ${d.label}`} className="rounded-xl border">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="text-base font-semibold">{d.label}</h3>
        <span className="text-sm text-muted-foreground">· {shops.map((s) => shopDisplayName(s)).join(', ')}</span>
        <span className="flex-1" />
        {ready ? (
          <Badge variant="success">
            <Check className="size-3.5" /> Đủ thông tin
          </Badge>
        ) : d.missing.length ? (
          <Badge variant="warning">Còn {d.missing.length} mục</Badge>
        ) : (
          <Badge variant="info">Chưa lưu</Badge>
        )}
      </header>

      <div className="grid gap-5 px-4 py-4">
        {axisOver !== null && (
          <AlertMessage severity="error">
            <p>
              <b>Chưa đăng được vào category này.</b> {d.label} chỉ nhận tối đa {axisOver} thuộc tính biến thể ở category đang
              chọn, sản phẩm có {d.axes.length} ({d.axes.map((a) => a.name).join(', ')}).
            </p>
            <p className="text-muted-foreground">Chọn category khác nhận đủ {d.axes.length} thuộc tính biến thể.</p>
            <Button type="button" size="sm" variant="outline" onClick={changeCategory}>
              Đổi category
            </Button>
          </AlertMessage>
        )}
        {/* Category */}
        <div className="grid gap-2" id={`category-${d.platform}`}>
          <h4 className="text-sm font-semibold">Category</h4>
          {d.draft.externalCategoryId && !changingCategory ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <CategoryPath path={d.draft.categoryPath} />
              {categoryMissing.length > 0 && <Badge variant="warning">{categoryMissing[0]!.label}</Badge>}
              {/* Vùng bấm tối thiểu 24×24 (FE#464) */}
              <Button type="button" variant="link" size="sm" className="h-6 min-w-6 px-1" onClick={() => setChangingCategory(true)}>
                Đổi
              </Button>
            </div>
          ) : (
            <CategoryStep
              platform={d.platform}
              label={d.label}
              companyId={companyId}
              shopId={shopId}
              product={product}
              draft={d.draft}
              pathIds={d.leaf.data?.category.pathIds ?? null}
              onPick={(c) => {
                d.pickCategory(c.externalId, c.path);
                setChangingCategory(false);
              }}
            >
              <CategoryChangeBlock
                platform={d.platform}
                label={d.label}
                companyId={companyId}
                productId={product.id}
                shops={shops}
                draftPath={d.draft.categoryPath}
                draftCategoryId={d.draft.externalCategoryId ?? ''}
                saved={d.saved}
                sizeChartRule={d.leaf.data?.category.sizeChartRule ?? null}
                onConflict={d.reload}
              />
            </CategoryStep>
          )}
          {d.errors.externalCategoryId && <p className="text-sm text-destructive-text">{d.errors.externalCategoryId}</p>}
        </div>

        {d.draft.externalCategoryId && (
          <>
            {/* Attribute còn thiếu */}
            <div className="grid gap-2">
              <h4 className="text-sm font-semibold">
                Còn thiếu {attrMissing.length ? <span className="font-normal text-muted-foreground">· {attrMissing.length} attribute</span> : null}
              </h4>
              {d.leaf.isLoading ? (
                <div className="grid gap-2" aria-busy>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : d.leaf.isError || !d.attrs ? (
                <AlertMessage severity="error">
                  {problemMessage(d.leaf.error)} Thông tin đã nhập vẫn giữ.{' '}
                  <button type="button" className="underline" onClick={() => void d.leaf.refetch()}>
                    Thử lại
                  </button>
                </AlertMessage>
              ) : attrMissing.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {attrMissing.map((m) => {
                    const a = byCode.get(m.code);
                    if (!a) return null;
                    return (
                      <MissingField
                        key={m.code}
                        d={d}
                        attribute={a}
                        conditional={m.reason === 'required_when'}
                        shopId={shopId}
                        productHref={ROUTES.company.catalogProduct(companyId, product.id)}
                        canEditCompany={canEditCompany}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-success-text">
                  <Check className="size-4" /> Không còn attribute bắt buộc nào phải nhập.
                </p>
              )}
            </div>

            {/* Đã tự điền */}
            {d.attrs && <AutoFilled d={d} attrs={d.attrs} />}

            {/* Thuộc tính biến thể */}
            {d.axes.length > 0 && (
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold">Thuộc tính biến thể</h4>
                {axisMissing.length || editAxes || Object.keys(d.errors).some((k) => k.startsWith('axisMap.') || k.startsWith('valueMap.')) ? (
                  <VariantsStep
                    label={d.label}
                    axes={d.axes}
                    sales={d.sales}
                    caps={d.caps}
                    draft={d.draft}
                    errors={d.errors}
                    onAxis={d.setAxis}
                    onValue={d.setValue}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      {d.axes
                        .map((axis) => {
                          const code = d.draft.axisMap[axis.attributeId];
                          const target = code === CUSTOM_AXIS ? axis.name : (d.sales?.find((s) => s.code === code)?.label ?? axis.name);
                          return `${axis.name} → ${target}`;
                        })
                        .join(' · ')}
                    </span>
                    <Badge variant="success">
                      <Check className="size-3.5" /> Tự khớp
                    </Badge>
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setEditAxes(true)}>
                      Sửa
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Sửa attribute khác (ghi đè phần tự điền, attribute không bắt buộc) */}
            {d.attrs && (
              <Collapsible defaultOpen={otherErrors}>
                <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold">
                  <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
                  Mọi attribute của category
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <AttributesStep
                    platform={d.platform}
                    label={d.label}
                    companyId={companyId}
                    productId={product.id}
                    draft={d.draft}
                    attributes={d.attrs}
                    loading={false}
                    error={null}
                    onRetry={() => void d.leaf.refetch()}
                    facts={d.facts}
                    missing={d.missing}
                    errors={d.errors}
                    onChange={d.setAttribute}
                    focus={null}
                    onFocused={() => undefined}
                    onFocusRequest={(code) => document.getElementById(fieldId(code))?.focus()}
                    product={product}
                    canEditProduct={canEditProduct}
                    canEditCompany={canEditCompany}
                    profileSync={d.profileSync}
                    onProfileSync={d.toggleProfileSync}
                    shopId={shopId}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <Button type="button" onClick={() => void d.save()} disabled={!d.draft.externalCategoryId || d.saving || (!d.dirty && Boolean(d.saved.spec))}>
          {d.saving && <Loader2 className="animate-spin" />}
          {d.saving ? 'Đang lưu…' : `Lưu thông tin ${d.label}`}
        </Button>
        {d.dirty && <span className="text-sm text-muted-foreground">Chưa lưu. Lưu xong mới đăng được.</span>}
      </footer>
    </section>
  );
}

function MissingField({
  d,
  attribute: a,
  conditional,
  shopId,
  productHref,
  canEditCompany,
}: {
  d: PlatformDraft;
  attribute: PlatformAttribute;
  conditional: boolean;
  shopId: string | null;
  productHref: string;
  canEditCompany: boolean;
}) {
  const error = d.errors[`attributes.${a.code}`];
  const shared = ORIGIN_CODES.has(a.code) || BRAND_CODES.has(a.code) || a.tier === 'product';
  // Xuất xứ, thương hiệu là thông tin chung của sản phẩm: sửa ở trang sản phẩm (hoàn thiện và đăng là hai bước riêng)
  if (shared) {
    return (
      <div className="grid gap-1.5 rounded-lg border border-warning-border p-3 text-sm">
        <span className="font-medium">{a.label}</span>
        <span className="text-muted-foreground">
          Thông tin chung của sản phẩm, dùng cho mọi sàn.{' '}
          <Link className="font-medium text-primary-text underline" to={productHref}>
            Sửa ở trang sản phẩm
          </Link>
        </span>
      </div>
    );
  }
  const value = a.tier === 'company' ? effectiveValue(a, d.draft.attributes) : (d.draft.attributes[a.code] ?? null);
  const hint = fieldHint(a);
  return (
    <div className={cn('grid gap-1.5 rounded-lg border border-warning-border p-3', error && 'border-destructive')}>
      <Label htmlFor={fieldId(a.code)} className="flex flex-wrap items-center gap-1.5">
        {a.label} <Badge variant="destructive">{conditional ? 'Đang bắt buộc' : 'Bắt buộc'}</Badge>
      </Label>
      <AttributeField
        attribute={a}
        value={value}
        onChange={(v) => d.setAttribute(a.code, v)}
        inputId={fieldId(a.code)}
        invalid={Boolean(error)}
        platform={d.platform}
        externalId={d.draft.externalCategoryId ?? ''}
        shopId={shopId}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive-text">{error}</p>}
      {a.tier === 'company' && PROFILE_FIELDS[a.code] && !a.defaultValue && canEditCompany && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
          <Checkbox className="mt-0.5" checked={d.profileSync.has(a.code)} onCheckedChange={(v) => d.toggleProfileSync(a.code, v === true)} />
          Lưu cũng vào hồ sơ công ty để mọi sản phẩm sau tự điền
        </label>
      )}
    </div>
  );
}

/** Attribute đã tự điền (nguồn khác "đã nhập cho sản phẩm này"), gom lại để người bán biết app đã điền gì */
function AutoFilled({ d, attrs }: { d: PlatformDraft; attrs: PlatformAttribute[] }) {
  const resolved = d.saved.resolved ?? {};
  const items = attrs
    .filter((a) => a.kind === 'property')
    .map((a) => ({ a, r: resolved[a.code] }))
    .filter((x): x is { a: PlatformAttribute; r: ResolvedAttribute } => Boolean(x.r) && x.r!.source !== 'override');
  if (!items.length) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold">
        <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
        Đã tự điền {items.length} attribute
        <span className="font-normal text-muted-foreground">· từ thuộc tính sản phẩm, hồ sơ công ty</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {items.map(({ a, r }) => (
            <div key={a.code} className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{a.label}:</dt>
              <dd className="font-medium">{valueLabel(a, r.value)}</dd>
              <dd className="text-xs text-muted-foreground">({SOURCE_LABELS[r.source]})</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Muốn đổi riêng cho sàn này thì sửa ở "Mọi attribute của category".</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
