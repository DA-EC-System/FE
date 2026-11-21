import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useUpdateProduct } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { CountryCombobox } from '@/features/catalog/CountryCombobox';
import { countryName } from '@/features/catalog/countries';
import { productFactsBody } from '@/features/catalog/shared';
import type { ProductDetail } from '@/types/catalog';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { PlatformAttribute, SpecMissing, SpecValue } from '@/types/shop';
import { hasCondition } from '@/features/catalog/platformCategory';
import {
  attributeTab,
  BRAND_CODES,
  ORIGIN_CODES,
  PROFILE_FIELDS,
  conditionMet,
  effectiveValue,
  fieldHint,
  productValue,
  type AttributeTab,
  type ProductFacts,
  type SpecDraft,
} from '../specDraft';
import { AttributeField } from './AttributeField';
import { fieldId } from './fieldIds';


const TAB_TITLES: Record<AttributeTab, string> = {
  category: 'Attribute của category',
  product: 'Thông tin sản phẩm',
  company: 'Thông tin công ty',
};

interface AttributesStepProps {
  platform: string;
  label: string;
  companyId: string;
  productId: string;
  draft: SpecDraft;
  /** null khi chưa tải được attribute của leaf */
  attributes: PlatformAttribute[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  facts: ProductFacts;
  missing: SpecMissing[];
  errors: Record<string, string>;
  onChange: (code: string, value: SpecValue | null) => void;
  /** Ô cần nhảy tới (từ dòng thiếu, lỗi 422 của BE) */
  focus: string | null;
  onFocused: () => void;
  onFocusRequest: (code: string) => void;
  /** Gian hàng mở trang: route cascade của Lazada cần token gian hàng */
  shopId: string | null;
  /** Sản phẩm đang đẩy: tab Product info lưu xuất xứ, thương hiệu thẳng vào sản phẩm */
  product: ProductDetail;
  /** `product.manage`: sửa xuất xứ, thương hiệu tại chỗ */
  canEditProduct: boolean;
  /** `platform.company.manage`: hiện ô tick lưu vào hồ sơ công ty */
  canEditCompany: boolean;
  /** Mã attribute công ty đang tick "Lưu cũng vào hồ sơ công ty" */
  profileSync: Set<string>;
  onProfileSync: (code: string, checked: boolean) => void;
}

/** Bước 2: attribute của leaf chia ba tab theo `tier` (Documents/21 §18.5) */
export function AttributesStep(props: AttributesStepProps) {
  const { attributes, loading, error, missing, focus, onFocused } = props;
  const [tab, setTab] = useState<AttributeTab>('category');
  const props_ = attributes?.filter((a) => a.kind === 'property') ?? [];
  const byTab = (t: AttributeTab) => props_.filter((a) => attributeTab(a) === t);
  const missingCodes = new Set(missing.map((m) => m.code));
  const missIn = (t: AttributeTab) => byTab(t).filter((a) => missingCodes.has(a.code)).length;

  // Nhảy tới ô: đổi tab chứa attribute rồi cuộn, focus sau khi vẽ
  useEffect(() => {
    if (!focus) return;
    const a = props_.find((x) => x.code === focus);
    if (a && attributeTab(a) !== tab) {
      setTab(attributeTab(a));
      return;
    }
    const el = document.getElementById(fieldId(focus));
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
    onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy khi có ô cần nhảy tới hoặc vừa đổi tab
  }, [focus, tab]);

  if (loading) {
    return (
      <div className="grid gap-3" aria-busy>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error || !attributes) {
    return (
      <AlertMessage severity="error">
        {error ? problemMessage(error) : 'Chưa có attribute của category này.'} Thông tin đã nhập vẫn giữ; Commerio kiểm lại khi lưu.{' '}
        <button type="button" className="underline" onClick={props.onRetry}>
          Thử lại
        </button>
      </AlertMessage>
    );
  }
  const attrMissing = missing.filter((m) => m.reason === 'required' || m.reason === 'required_when');

  return (
    <div className="grid gap-4">
      {attrMissing.length ? (
        <AlertMessage severity="warning">
          <b>Còn thiếu {attrMissing.length} attribute bắt buộc.</b> Bấm để tới:{' '}
          <span className="inline-flex flex-wrap gap-1.5 align-middle">
            {attrMissing.map((m) => (
              <button
                key={m.code}
                type="button"
                className="rounded-sm border border-warning-border bg-background px-1.5 text-xs hover:border-warning"
                onClick={() => props.onFocusRequest(m.code)}
              >
                {m.label}
              </button>
            ))}
          </span>
        </AlertMessage>
      ) : (
        <AlertMessage severity="success">
          <b>Đủ attribute bắt buộc.</b> Các ô còn lại không bắt buộc, có thể bấm Tiếp.
        </AlertMessage>
      )}

      <div role="tablist" aria-label="Nhóm attribute" className="grid gap-2 sm:grid-cols-3">
        {(['category', 'product', 'company'] as const).map((t) => {
          const n = byTab(t).length;
          const miss = missIn(t);
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left',
                tab === t ? 'border-primary bg-accent' : 'hover:border-primary',
              )}
            >
              <span className="text-sm font-medium">{TAB_TITLES[t]}</span>
              {!n ? (
                <Badge variant="outline">Sàn không hỏi</Badge>
              ) : miss ? (
                <Badge variant="warning">Thiếu {miss} bắt buộc</Badge>
              ) : t === 'company' ? (
                <Badge variant="success">Tự điền</Badge>
              ) : (
                <Badge variant="success">Đủ</Badge>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={TAB_TITLES[tab]}>
        {tab === 'category' ? (
          <CategoryTab {...props} items={byTab('category')} missingCodes={missingCodes} />
        ) : tab === 'product' ? (
          <ProductTab {...props} items={byTab('product')} />
        ) : (
          <CompanyTab {...props} items={byTab('company')} missingCodes={missingCodes} />
        )}
      </div>
    </div>
  );
}

type TabProps = AttributesStepProps & { items: PlatformAttribute[] };

function CategoryTab({ items, label, draft, missingCodes, ...rest }: TabProps & { missingCodes: Set<string> }) {
  const required = items.filter((a) => a.required);
  const conditional = items.filter((a) => !a.required && hasCondition(a));
  const key = items.filter((a) => !a.required && !hasCondition(a) && a.isKey);
  const optional = items.filter((a) => !a.required && !hasCondition(a) && !a.isKey);
  const filledRequired = required.filter((a) => !missingCodes.has(a.code)).length;
  const card = (a: PlatformAttribute, badge?: React.ReactNode) => (
    <FieldCard key={a.code} {...rest} label={label} draft={draft} attribute={a} badge={badge} flagged={missingCodes.has(a.code)} />
  );
  if (!items.length) return <p className="text-sm text-muted-foreground">Category này không có attribute riêng trên {label}.</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">Attribute riêng của category này trên {label}, chỉ dùng cho sản phẩm này trên {label}.</p>
      <Section title="Bắt buộc" note={`${filledRequired}/${required.length} đã điền`}>
        {required.length ? (
          <div className="grid gap-3 md:grid-cols-2">{required.map((a) => card(a, <Badge variant="destructive">Bắt buộc</Badge>))}</div>
        ) : (
          <p className="text-sm text-muted-foreground">Category này không có attribute bắt buộc trên {label}.</p>
        )}
      </Section>
      {conditional.length > 0 && (
        <Section title="Bắt buộc theo điều kiện" note="bắt buộc khi một attribute khác chọn giá trị nhất định">
          <div className="grid gap-3 md:grid-cols-2">
            {conditional.map((a) =>
              card(a, conditionMet(a, draft.attributes) ? <Badge variant="destructive">Đang bắt buộc</Badge> : <Badge variant="outline">Theo điều kiện</Badge>),
            )}
          </div>
        </Section>
      )}
      {key.length > 0 && (
        <Section title="Key attributes" note={`điền vào thì điểm nội dung trên ${label} cao hơn`}>
          <div className="grid gap-3 md:grid-cols-2">{key.map((a) => card(a, <Badge variant="info">Key attribute</Badge>))}</div>
        </Section>
      )}
      {optional.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline">
            Không bắt buộc ({optional.length} ô)
            <span className="font-normal text-primary-text group-data-[state=open]:hidden">· Mở</span>
            <span className="hidden font-normal text-primary-text group-data-[state=open]:inline">· Thu gọn</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid gap-3 md:grid-cols-2">{optional.map((a) => card(a))}</div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function ProductTab({ items, label, facts, companyId, productId, product, canEditProduct }: TabProps) {
  const origin = items.find((a) => ORIGIN_CODES.has(a.code));
  const brand = items.find((a) => BRAND_CODES.has(a.code));
  const others = items.filter((a) => a !== origin && a !== brand);
  const [originCountry, setOriginCountry] = useState(facts.originCountry ?? '');
  const [brandText, setBrandText] = useState(facts.brand ?? '');
  // Sản phẩm vừa lưu (hoặc người khác sửa): nạp lại ô theo bản mới
  useEffect(() => {
    setOriginCountry(facts.originCountry ?? '');
    setBrandText(facts.brand ?? '');
  }, [facts.originCountry, facts.brand]);
  const update = useUpdateProduct();
  const dirty = originCountry !== (facts.originCountry ?? '') || brandText.trim() !== (facts.brand ?? '');
  const brandError = brandText.trim().length > 100 ? 'Thương hiệu tối đa 100 ký tự' : null;

  const save = async () => {
    try {
      await update.mutateAsync({ id: product.id, ...productFactsBody(product, { originCountry, brand: brandText }) });
      toast.success('Đã lưu vào sản phẩm, dùng chung cho mọi sàn.');
    } catch (e) {
      toast.error(
        problemCode(e) === 'version_conflict'
          ? 'Người khác vừa sửa sản phẩm này. Đã nạp bản mới nhất, chọn lại rồi bấm Lưu.'
          : (getProblem(e)?.errors?.originCountry ?? getProblem(e)?.errors?.brand ?? problemMessage(e)),
      );
    }
  };

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{label} không hỏi thông tin riêng theo sản phẩm ở category này.</p>;
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Xuất xứ, thương hiệu là thông tin của sản phẩm, <b className="font-medium text-foreground">dùng chung cho mọi sàn</b>. Lưu ở đây là lưu vào
        sản phẩm, trang sản phẩm cũng thấy.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {origin && (
          <div className={cn('grid gap-1.5 rounded-lg border p-3', !facts.originCountry && 'border-warning-border')}>
            <Label htmlFor={fieldId(origin.code)} className="flex flex-wrap items-center gap-1.5">
              {origin.label} {origin.required && <Badge variant="destructive">Bắt buộc</Badge>}
            </Label>
            {canEditProduct ? (
              <CountryCombobox id={fieldId(origin.code)} value={originCountry} onChange={setOriginCountry} disabled={update.isPending} />
            ) : (
              <span id={fieldId(origin.code)} tabIndex={-1} className="text-sm">
                {facts.originCountry ? countryName(facts.originCountry) : <span className="text-warning-text">Chưa điền</span>}
              </span>
            )}
          </div>
        )}
        {brand && (
          <div className="grid gap-1.5 rounded-lg border p-3">
            <Label htmlFor={fieldId(brand.code)}>{brand.label}</Label>
            {canEditProduct ? (
              <>
                <Input
                  id={fieldId(brand.code)}
                  value={brandText}
                  onChange={(e) => setBrandText(e.target.value)}
                  placeholder="Để trống là không thương hiệu (No Brand)"
                  maxLength={120}
                  aria-invalid={Boolean(brandError) || undefined}
                  disabled={update.isPending}
                />
                {brandError && <p className="text-xs text-destructive">{brandError}</p>}
              </>
            ) : (
              <span id={fieldId(brand.code)} tabIndex={-1} className="text-sm">
                {facts.brand ?? <span className="text-muted-foreground">Không thương hiệu (No Brand)</span>}
              </span>
            )}
          </div>
        )}
        {others.map((a) => (
          <div key={a.code} className="grid gap-1.5 rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">{a.label}</span>
            <span id={fieldId(a.code)} tabIndex={-1}>
              {productValue(a, facts) ?? <span className="text-warning-text">Chưa điền</span>}
            </span>
          </div>
        ))}
      </div>
      {canEditProduct ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={save} disabled={!dirty || Boolean(brandError) || update.isPending}>
            {update.isPending ? 'Đang lưu…' : 'Lưu vào sản phẩm'}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Chưa lưu. Cần lưu trước khi đăng.</span>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Cần quyền sửa sản phẩm để đổi.{' '}
          <Link className="font-medium text-primary-text underline" to={ROUTES.company.catalogProduct(companyId, productId)}>
            Xem trang sản phẩm
          </Link>
        </p>
      )}
    </div>
  );
}

function CompanyTab({ items, label, draft, missingCodes, companyId, canEditCompany, profileSync, onProfileSync, ...rest }: TabProps & { missingCodes: Set<string> }) {
  // Ô mà hồ sơ công ty còn trống (không có mặc định) và Commerio biết trường tương ứng của hồ sơ
  const blank = items.filter((a) => PROFILE_FIELDS[a.code] && !a.defaultValue);
  const profileHref = ROUTES.company.companyProfile(companyId);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Tổ chức chịu trách nhiệm về hàng hoá. Commerio điền sẵn từ hồ sơ công ty; chỉ sửa khi sản phẩm này khác.
      </p>
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <FieldCard
              key={a.code}
              {...rest}
              companyId={companyId}
              canEditCompany={canEditCompany}
              profileSync={profileSync}
              onProfileSync={onProfileSync}
              label={label}
              draft={draft}
              attribute={a}
              flagged={missingCodes.has(a.code)}
              footer={
                PROFILE_FIELDS[a.code] && !a.defaultValue && canEditCompany ? (
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      className="mt-0.5"
                      checked={profileSync.has(a.code)}
                      onCheckedChange={(v) => onProfileSync(a.code, v === true)}
                    />
                    Lưu cũng vào hồ sơ công ty để mọi sản phẩm sau tự điền
                  </label>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{label} không hỏi thông tin công ty ở category này.</p>
      )}
      {blank.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Hồ sơ công ty chưa có {blank.map((a) => a.label.toLocaleLowerCase('vi')).join(', ')}.{' '}
          {canEditCompany ? 'Điền ở ô trên, giữ ô tick để lưu luôn vào hồ sơ.' : 'Giá trị nhập ở đây chỉ lưu cho sản phẩm này; nhờ CEO hoặc Admin điền hồ sơ công ty.'}{' '}
          <a className="font-medium text-primary-text underline" href={profileHref} target="_blank" rel="noopener noreferrer">
            Mở hồ sơ công ty
          </a>
        </p>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">
        {title} {note && <span className="font-normal text-muted-foreground">· {note}</span>}
      </h3>
      {children}
    </section>
  );
}

function FieldCard({
  attribute: a,
  draft,
  errors,
  onChange,
  platform,
  shopId,
  badge,
  flagged,
  footer,
}: Omit<TabProps, 'items' | 'missing'> & {
  attribute: PlatformAttribute;
  badge?: React.ReactNode;
  flagged: boolean;
  footer?: React.ReactNode;
}) {
  const error = errors[`attributes.${a.code}`];
  const value = a.tier === 'company' ? effectiveValue(a, draft.attributes) : (draft.attributes[a.code] ?? null);
  const hint = fieldHint(a);
  return (
    <div className={cn('grid gap-1.5 rounded-lg border p-3', (error || flagged) && 'border-warning-border', error && 'border-destructive')}>
      <Label htmlFor={fieldId(a.code)} className="flex flex-wrap items-center gap-1.5">
        {a.label} {badge}
      </Label>
      <AttributeField
        attribute={a}
        value={value}
        onChange={(v) => onChange(a.code, v)}
        inputId={fieldId(a.code)}
        invalid={Boolean(error)}
        platform={platform}
        externalId={draft.externalCategoryId ?? ''}
        shopId={shopId}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive-text">{error}</p>}
      {footer}
    </div>
  );
}
