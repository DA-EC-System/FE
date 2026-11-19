import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { PlatformAttribute, SpecMissing, SpecValue } from '@/types/shop';
import { hasCondition } from '@/features/catalog/platformCategory';
import {
  attributeTab,
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
  category: 'Category attributes',
  product: 'Product info',
  company: 'Company info',
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
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-semibold">
            <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
            Không bắt buộc ({optional.length} ô)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid gap-3 md:grid-cols-2">{optional.map((a) => card(a))}</div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function ProductTab({ items, label, facts, companyId, productId }: TabProps) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Xuất xứ, thương hiệu lấy từ trang sản phẩm Commerio, dùng chung cho mọi sàn. Muốn đổi thì sửa ở trang sản phẩm.
      </p>
      {items.length ? (
        <div className="grid gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm sm:grid-cols-[max-content_1fr]">
          {items.map((a) => {
            const v = productValue(a, facts);
            return (
              <div key={a.code} className="contents">
                <span className="text-muted-foreground">
                  {a.label} {a.required && <Badge variant="destructive">Bắt buộc</Badge>}
                </span>
                <span id={fieldId(a.code)} tabIndex={-1}>
                  {v ?? (a.code === 'brand' ? <span className="text-muted-foreground">Không thương hiệu (No Brand)</span> : <span className="text-warning-text">Chưa điền</span>)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{label} không hỏi thông tin riêng theo sản phẩm ở category này.</p>
      )}
      <Link className="justify-self-start text-sm font-medium text-primary-text underline" to={ROUTES.company.catalogProduct(companyId, productId)}>
        Sửa ở trang sản phẩm
      </Link>
    </div>
  );
}

function CompanyTab({ items, label, draft, missingCodes, ...rest }: TabProps & { missingCodes: Set<string> }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Tổ chức chịu trách nhiệm về hàng hoá. Commerio điền sẵn từ hồ sơ công ty; chỉ sửa khi sản phẩm này khác.
      </p>
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <FieldCard key={a.code} {...rest} label={label} draft={draft} attribute={a} flagged={missingCodes.has(a.code)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{label} không hỏi thông tin công ty ở category này.</p>
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
}: Omit<TabProps, 'items' | 'missing'> & { attribute: PlatformAttribute; badge?: React.ReactNode; flagged: boolean }) {
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
    </div>
  );
}
