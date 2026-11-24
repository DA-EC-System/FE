import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSaveProductSpec } from '@/api/shops.api';
import { useInvalidateCatalog, useUpdateVariant } from '@/api/catalog.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { getProblem } from '@/api/client';
import { LISTING_STATUS_LABELS, LISTING_STATUS_VARIANTS } from '@/features/channel/shopSchemas';
import { AttributeField } from '@/features/channel/push/AttributeField';
import { CategoryChangeBlock } from '@/features/channel/push/CategoryChangeBlock';
import {
  BRAND_CODES,
  ORIGIN_CODES,
  draftFromSpec,
  fieldHint,
  isFilled,
  mergedValues,
  specInput,
  specMissing,
  valueLabel,
  valueSource,
  valuesChanged,
  withAttribute,
  type SpecDraft,
} from '@/features/channel/specDraft';
import { formatQty } from '@/features/inventory/shared';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import { priceText } from '@/utils/price';
import type { ProductDetail, VariantUpdateInput } from '@/types/catalog';
import type {
  Marketplace,
  PlatformAttribute,
  ProductListingRow,
  ProductSpec,
  ProductSpecResult,
  RemoteProductFacts,
  RemoteVariantFacts,
  ResolvedAttribute,
  Shop,
  SpecMissing,
  SpecValue,
} from '@/types/shop';
import { CategoryPath } from './CategoryPath';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { focusField } from './focusField';
import { usePlatformTab } from './usePlatformTab';
import { RemoteSuggestion } from './RemoteSuggestion';
import { RegroupNotice } from './RegroupNotice';
import { platformLabel, shopsOnPlatform } from './platformCategory';
import { platformDrift } from './productOverview';
import {
  attributeGroups,
  attributeSource,
  listingsByShop,
  platformFieldId,
  platformSectionId,
  variantsMissingShipping,
  variantSuggestion,
  type FieldSource,
  type SharedGap,
  type SharedTarget,
} from './productTabs';

const ATTR_REASONS = new Set<SpecMissing['reason']>(['required', 'required_when']);

interface Props {
  companyId: string;
  product: ProductDetail;
  platform: Marketplace;
  shops: readonly Shop[];
  rows: readonly ProductListingRow[];
  /** `channel.listing.manage` và sản phẩm chưa lưu trữ: sửa attribute bắt buộc tại chỗ */
  canEditSpec: boolean;
  /** `catalog.product.manage` và chưa lưu trữ: nhãn "sửa ở Nội bộ", không thì "xem ở Nội bộ" */
  canEditProduct: boolean;
  /** Sang tab Nội bộ, cuộn tới ô dùng chung */
  onJump: (target: SharedTarget) => void;
  /** Báo trang khi attribute có/không còn sửa dở, để hỏi lại khi rời tab/trang (FE#459) */
  onDirtyChange?: (platform: Marketplace, dirty: boolean) => void;
}

/**
 * Tab một sàn của trang sản phẩm (FE#417), bố cục theo Seller Center: thông tin cơ bản, attribute, chi tiết, bán hàng
 * theo gian hàng, bảng kích cỡ, vận chuyển. Attribute bắt buộc sửa và lưu tại chỗ qua `PUT …/specs/:platform`
 * (Documents/21 §18.5); ô dùng chung chỉ xem, bấm nhãn thì sang tab Nội bộ
 */
export function PlatformTab({ companyId, product, platform, shops, rows, canEditSpec, canEditProduct, onJump, onDirtyChange }: Props) {
  const data = usePlatformTab(product, platform, shops);
  const resolved = data.specQuery.data?.resolved;
  const { specQuery, spec, leaf, attrs, axes, missing, gaps, noCategory } = data;
  const label = platformLabel(platform);
  const listed = rows.some((r) => r.platform === platform && r.listing && r.listing.status !== 'delisted');
  const pushHref = ROUTES.company.productPush(companyId, product.id, platform, undefined, listed);

  const [draft, setDraft] = useState<SpecDraft>(() => draftFromSpec(spec));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Bản đã lưu đổi (vừa lưu, người khác sửa, refetch): nạp lại nháp
  useEffect(() => {
    setDraft(draftFromSpec(spec));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theo version của bản đã lưu
  }, [spec?.version, spec?.externalCategoryId]);
  const save = useSaveProductSpec();
  // Chọn category tại chỗ (FE#459); sản phẩm đã lên sàn thì lưu xong còn bấm đổi trên sàn ở khối dưới ô category (FE#474)
  const [pickingCategory, setPickingCategory] = useState(false);
  // Ô đang mở sửa riêng cho sàn mà chưa có giá trị ghi đè ("Chỉ điền cho {sàn}" ở ô trống)
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());
  // Chỉ bật Lưu khi giá trị hiển thị thật sự khác bản đã lưu ("Sửa riêng" mà giữ nguyên thì chưa đổi)
  const dirty = spec ? valuesChanged(draft.attributes, spec.attributes, resolved) : false;
  useEffect(() => {
    onDirtyChange?.(platform, dirty);
  }, [dirty, platform, onDirtyChange]);
  // Giá trị mỗi ô: ghi đè trong nháp > giá trị BE tự điền (Documents/21 §18.8.2)
  const values = mergedValues(draft.attributes, resolved);
  const otherMissing = missing.filter((m) => !ATTR_REASONS.has(m.reason));
  // Đang sửa thì tính lại phần attribute ở FE; phần trục, category giữ của BE (cần luật trục của leaf)
  const draftMissing =
    dirty && spec && attrs
      ? [
          ...specMissing(attrs, { attributes: values, axisMap: draft.axisMap, categoryStatus: spec.categoryStatus }, axes, data.facts).filter(
            (m) => ATTR_REASONS.has(m.reason),
          ),
          ...otherMissing,
        ]
      : missing;
  const missingCodes = new Set(draftMissing.filter((m) => ATTR_REASONS.has(m.reason)).map((m) => m.code));
  const groups = attrs ? attributeGroups(attrs, values) : null;
  // Mọi attribute sửa được tại chỗ (chốt v2 câu 4): bắt buộc mở sẵn, không bắt buộc gập
  const editRow = (a: PlatformAttribute) =>
    spec ? (
      <AttributeRow
        key={a.code}
        attribute={a}
        values={values}
        overrides={draft.attributes}
        resolved={resolved}
        fieldSources={spec.fieldSources}
        platform={platform}
        externalId={draft.externalCategoryId ?? ''}
        shopId={data.shop?.id ?? null}
        label={label}
        canEdit={canEditSpec}
        editing={editing.has(a.code)}
        flagged={missingCodes.has(a.code)}
        error={errors[`attributes.${a.code}`]}
        onChange={(v) => setDraft((d) => withAttribute(d, a.code, v))}
        onOverride={(v) => overrideOf(a.code, v)}
        onJump={onJump}
        companyProfileHref={ROUTES.company.companyProfile(companyId)}
      />
    ) : null;
  const extraMissing = otherMissing.filter((m) => m.code !== 'category');
  const overrideOf = (code: string, value: SpecValue | null) => {
    setDraft((d) => withAttribute(d, code, value));
    setEditing((s) => {
      const next = new Set(s);
      if (value === null) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const sharedLabel = canEditProduct ? 'Dùng chung · sửa ở Nội bộ' : 'Dùng chung · xem ở Nội bộ';
  const gapOf = (t: SharedTarget) => gaps.find((g) => g.target === t);

  const onSave = async () => {
    if (!spec || save.isPending) return;
    setErrors({});
    try {
      const saved = await save.mutateAsync({ productId: product.id, platform, input: specInput(draft, attrs, axes) });
      setDraft(draftFromSpec(saved.spec));
      setEditing(new Set());
      toast.success(saved.missing.length ? `Đã lưu. ${label} còn thiếu ${saved.missing.length} mục.` : `Đã lưu attribute ${label}.`);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.errors && Object.keys(problem.errors).length) {
        setErrors(problem.errors);
        const first = Object.keys(problem.errors).find((k) => k.startsWith('attributes.'));
        if (first) focusField(platformFieldId(platform, first.slice('attributes.'.length)));
        toast.error('Còn ô chưa hợp lệ, xem các ô viền đỏ.');
      } else if (problem?.code === 'version_conflict' && problem.current) {
        setDraft(draftFromSpec((problem.current as ProductSpecResult).spec));
        void specQuery.refetch();
        toast.warning(`Người khác vừa sửa thông tin ${label} của sản phẩm này. Đã nạp bản mới nhất, xem lại rồi lưu lại.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
  };

  /** "Đi tới trường thiếu": ô attribute sửa được ở tab này trước, rồi tới ô dùng chung ở tab Nội bộ */
  const goToFirstMissing = () => {
    const attr = draftMissing.find((m) => ATTR_REASONS.has(m.reason) && !ORIGIN_CODES.has(m.code));
    if (attr) return focusField(platformFieldId(platform, attr.code));
    if (draftMissing.some((m) => ORIGIN_CODES.has(m.code))) return onJump('origin');
    if (gaps[0]) return onJump(gaps[0].target);
    focusField(platformFieldId(platform, 'category'));
  };

  if (specQuery.isLoading) {
    return (
      <div className="grid gap-3" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (specQuery.isError) {
    return (
      <AlertMessage severity="error">
        Không tải được thông tin {label}: {problemMessage(specQuery.error)}{' '}
        <button type="button" className="cursor-pointer font-medium underline" onClick={() => specQuery.refetch()}>
          Thử lại
        </button>
      </AlertMessage>
    );
  }

  const attrMissingCount = missingCodes.size;
  const sizeRule = leaf.data?.category.sizeChartRule ?? null;
  const sections = [
    { key: 'basic', title: 'Thông tin cơ bản', miss: (gapOf('images') ? 1 : 0) + (noCategory || otherMissing.some((m) => m.code === 'category') ? 1 : 0) },
    ...(spec ? [{ key: 'attrs', title: 'Attribute', miss: attrMissingCount }] : []),
    ...(extraMissing.length ? [{ key: 'extra', title: 'Sàn đòi thêm', miss: extraMissing.length }] : []),
    { key: 'detail', title: 'Chi tiết sản phẩm', miss: gapOf('description') ? 1 : 0 },
    { key: 'sales', title: 'Giá và tồn kho', miss: 0 },
    ...(sizeRule && sizeRule !== 'unsupported' ? [{ key: 'size', title: 'Bảng kích cỡ', miss: gapOf('sizeChart') ? 1 : 0 }] : []),
    { key: 'ship', title: 'Vận chuyển', miss: gapOf('variants') ? 1 : 0 },
  ];
  const total = attrMissingCount + gaps.length + (noCategory ? 1 : 0) + otherMissing.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
      <nav aria-label={`Mục của tab ${label}`} className="lg:sticky lg:top-4">
        <ul className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
          {sections.map((s) => (
            <li key={s.key}>
              <a
                href={`#${platformSectionId(platform, s.key)}`}
                onClick={(e) => {
                  e.preventDefault();
                  focusField(platformSectionId(platform, s.key));
                }}
                className="flex min-h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-sm hover:border-primary hover:text-primary-text lg:border-transparent"
              >
                {s.title}
                {s.miss > 0 && (
                  <Badge variant="warning" aria-label={`thiếu ${s.miss}`}>
                    {s.miss}
                  </Badge>
                )}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid min-w-0 gap-4">
        {spec?.source === 'match' && (
          <AlertMessage severity={total ? 'warning' : 'info'}>
            <b>Thông tin {label} đọc từ sàn khi ghép SKU</b> · {formatDateTime(spec.updatedAt)}.{' '}
            {total
              ? `Còn thiếu ${total} trường bắt buộc mà sàn không trả về khi ghép.`
              : 'Đã đủ trường bắt buộc.'}{' '}
            {total > 0 && (
              <button type="button" className="cursor-pointer font-medium underline underline-offset-2" onClick={goToFirstMissing}>
                Đi tới trường thiếu
              </button>
            )}
          </AlertMessage>
        )}
        {spec?.source !== 'match' && total > 0 && (
          <AlertMessage severity="warning">
            <b>
              {label} còn thiếu {total} trường bắt buộc.
            </b>{' '}
            <button type="button" className="cursor-pointer font-medium underline underline-offset-2" onClick={goToFirstMissing}>
              Đi tới trường thiếu
            </button>
          </AlertMessage>
        )}

        <Section id={platformSectionId(platform, 'basic')} title="Thông tin cơ bản" miss={sections[0].miss}>
          <div className="grid gap-3 md:grid-cols-2">
            <ReadField label="Tên sản phẩm" required source="shared" sourceLabel={sharedLabel} onJump={() => onJump('name')}>
              {product.name}
            </ReadField>
            <ReadField
              label="Hình ảnh"
              required
              source="shared"
              sourceLabel={sharedLabel}
              onJump={() => onJump('images')}
              missing={gapOf('images') && 'Bắt buộc, chưa có ảnh. Tải ở tab Nội bộ, mọi sàn dùng chung.'}
            >
              {product.images.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {[...product.images]
                    .sort((a, b) => a.position - b.position)
                    .slice(0, 6)
                    .map((img, i) => (
                      <img
                        key={img.fileId}
                        src={img.url}
                        alt={i === 0 ? `Ảnh bìa ${product.name}` : `Ảnh ${i + 1} của ${product.name}`}
                        width={48}
                        height={48}
                        loading="lazy"
                        className="size-12 rounded-md border object-cover"
                      />
                    ))}
                  {product.images.length > 6 && (
                    <span className="self-center text-xs text-muted-foreground">+{product.images.length - 6}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Chưa có ảnh</span>
              )}
            </ReadField>
            <div id={platformFieldId(platform, 'category')} tabIndex={-1} className="rounded-lg md:col-span-2">
              <ReadField
                label="Category"
                required
                source={spec?.source === 'match' ? 'match' : spec ? 'own' : undefined}
                platformName={label}
                missing={noCategory && `Chưa chọn category ${label}. Chọn category để sửa nội dung trên sàn.`}
                action={
                  canEditSpec && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setPickingCategory(true)}>
                      {spec ? 'Đổi category' : 'Chọn category'}
                    </Button>
                  )
                }
              >
                {spec ? <CategoryPath path={spec.categoryPath} /> : <span className="text-muted-foreground">Chưa chọn</span>}
                {spec && <CategoryNotes spec={spec} rows={rows} platform={platform} showDrift={!listed} />}
                {/* Đã lên sàn: category lưu trong Commerio khác trên sàn thì đổi trên sàn bằng lượt chạy nền (FE#474) */}
                {listed && spec && specQuery.data && (
                  <CategoryChangeBlock
                    platform={platform}
                    label={label}
                    companyId={companyId}
                    productId={product.id}
                    shops={shopsOnPlatform(shops, platform)}
                    draftPath={spec.categoryPath}
                    draftCategoryId={spec.externalCategoryId}
                    saved={specQuery.data}
                    sizeChartRule={leaf.data?.category.sizeChartRule ?? null}
                    onConflict={() => void specQuery.refetch()}
                  />
                )}
              </ReadField>
            </div>
          </div>
        </Section>

        {spec && (
          <Section id={platformSectionId(platform, 'attrs')} title="Attribute" miss={attrMissingCount}>
            {leaf.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !groups ? (
              <AlertMessage severity="warning">
                {leaf.isError ? problemMessage(leaf.error) : `Chưa có attribute của category này trên ${label}.`}{' '}
                <button type="button" className="cursor-pointer font-medium underline" onClick={() => leaf.refetch()}>
                  Thử lại
                </button>
              </AlertMessage>
            ) : (
              <div className="grid gap-5">
                <Group title="Attribute bắt buộc" note={canEditSpec ? 'sửa và lưu ngay tại đây' : 'chỉ xem: cần quyền quản lý listing để sửa'}>
                  {groups.required.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {groups.required.map(editRow)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Category này không có attribute bắt buộc trên {label}.</p>
                  )}
                  <Collapsible>
                    <CollapsibleTrigger className="group flex min-h-9 cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
                      Giá trị tự điền lấy từ đâu
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ol className="grid list-decimal gap-0.5 pt-1 pl-9 text-xs text-muted-foreground">
                        <li>Bạn sửa riêng cho {label}.</li>
                        <li>Thuộc tính gốc của sản phẩm (xuất xứ, thương hiệu, thuộc tính sản phẩm của danh mục) qua ánh xạ sang attribute của {label}.</li>
                        <li>Hồ sơ công ty.</li>
                        <li>Mặc định của sàn.</li>
                      </ol>
                      <p className="pt-1 pl-4 text-xs text-muted-foreground">
                        Giá trị sửa riêng trùng thuộc tính gốc thì không lưu riêng: sau này thuộc tính gốc đổi, {label} đổi theo.
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                </Group>

                {groups.key.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="group flex min-h-9 cursor-pointer items-center gap-1 text-sm font-semibold">
                      <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
                      Key attributes ({groups.key.length})
                      <span className="font-normal text-muted-foreground">· điền đủ thì điểm nội dung trên {label} cao hơn</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="grid gap-3 md:grid-cols-2">{groups.key.map(editRow)}</div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {groups.other.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="group flex min-h-9 cursor-pointer items-center gap-1 text-sm font-semibold">
                      <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
                      Không bắt buộc ({groups.other.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="grid gap-3 md:grid-cols-2">{groups.other.map(editRow)}</div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                  {canEditSpec && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" onClick={onSave} disabled={!dirty || save.isPending}>
                        {save.isPending ? 'Đang lưu...' : `Lưu attribute ${label}`}
                      </Button>
                      {dirty && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setDraft(draftFromSpec(spec));
                            setEditing(new Set());
                          }}
                          disabled={save.isPending}
                        >
                          Bỏ thay đổi
                        </Button>
                      )}
                      {!dirty && <span className="text-xs text-muted-foreground">Chưa có thay đổi</span>}
                    </div>
                  )}
              </div>
            )}
          </Section>
        )}

        {extraMissing.length > 0 && (
          <Section id={platformSectionId(platform, 'extra')} title="Sàn đòi thêm" miss={extraMissing.length}>
            <ExtraMissing
              items={extraMissing}
              label={label}
              pushHref={canEditSpec ? pushHref : null}
              newProductHref={ROUTES.company.catalogNew(companyId)}
            />
          </Section>
        )}

        <Section id={platformSectionId(platform, 'detail')} title="Chi tiết sản phẩm" miss={sections.find((s) => s.key === 'detail')!.miss}>
          <ReadField
            label="Mô tả"
            required
            source="shared"
            sourceLabel={sharedLabel}
            onJump={() => onJump('description')}
            missing={gapOf('description') && 'Bắt buộc, chưa có mô tả. Điền ở tab Nội bộ, mọi sàn dùng chung.'}
          >
            {product.description.trim() ? (
              <p className="line-clamp-4 whitespace-pre-line">{product.description}</p>
            ) : (
              <span className="text-muted-foreground">Chưa có</span>
            )}
          </ReadField>
        </Section>

        <Section id={platformSectionId(platform, 'sales')} title={sections.find((s) => s.key === 'sales')!.title} perShop>
          <RegroupNotice productId={product.id} platform={platform} shops={shops} />
          <SalesTable companyId={companyId} platform={platform} rows={rows} />
        </Section>

        {sizeRule && sizeRule !== 'unsupported' && (
          <Section id={platformSectionId(platform, 'size')} title="Bảng kích cỡ" miss={gapOf('sizeChart') ? 1 : 0}>
            <ReadField
              label="Ảnh bảng size"
              required={sizeRule === 'required'}
              source="shared"
              sourceLabel={sharedLabel}
              onJump={() => onJump('sizeChart')}
              missing={gapOf('sizeChart') && `Category này trên ${label} bắt buộc ảnh bảng size. Tải ở tab Nội bộ.`}
            >
              {product.sizeChart ? (
                <img
                  src={product.sizeChart.url}
                  alt={`Bảng size của ${product.name}`}
                  width={96}
                  height={96}
                  loading="lazy"
                  className="size-24 rounded-md border object-contain"
                />
              ) : (
                <span className="text-muted-foreground">Chưa có ảnh bảng size</span>
              )}
            </ReadField>
          </Section>
        )}

        <Section id={platformSectionId(platform, 'ship')} title="Vận chuyển" miss={gapOf('variants') ? 1 : 0}>
          <ShippingTable
            product={product}
            gap={gapOf('variants')}
            sharedLabel={sharedLabel}
            onJump={() => onJump('variants')}
            remote={specQuery.data?.remote ?? null}
            platformName={label}
            canEdit={canEditProduct}
          />
          <ReadField label="Cách giao hàng" source="platform">
            <span className="text-muted-foreground">
              Theo cài đặt của sàn. Commerio không sửa.
            </span>
          </ReadField>
        </Section>
      {canEditSpec && (
        <CategoryPickerDialog
          open={pickingCategory}
          onOpenChange={setPickingCategory}
          companyId={companyId}
          product={product}
          platform={platform}
          label={label}
          shopId={data.shop?.id ?? null}
          spec={spec}
          pathIds={leaf.data?.category.pathIds ?? null}
          dirty={dirty}
          listed={listed}
        />
      )}
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  miss = 0,
  perShop,
  children,
}: {
  id: string;
  title: string;
  miss?: number;
  perShop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} tabIndex={-1} className="scroll-mt-4 outline-none">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          {perShop && <Badge variant="outline">Theo gian hàng</Badge>}
          {miss > 0 && <Badge variant="warning">Thiếu {miss} bắt buộc</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

function Group({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title} {note && <span className="font-normal text-muted-foreground">· {note}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

type BadgeSource = FieldSource | 'platform';

/** Nhãn nguồn của một ô; ô dùng chung là nút sang tab Nội bộ */
function SourceBadge({ source, label, platformName, onJump }: { source: BadgeSource; label?: string; platformName?: string; onJump?: () => void }) {
  if (source === 'shared') {
    return (
      <button
        type="button"
        onClick={onJump}
        className="relative inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm border border-primary-border bg-accent px-1.5 py-0.5 text-xs font-medium text-primary-text after:absolute after:-inset-1.5 hover:border-primary"
      >
        {label}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </button>
    );
  }
  if (source === 'company') return <Badge variant="info">Từ hồ sơ công ty</Badge>;
  if (source === 'override') return <Badge variant="purple">Bạn sửa riêng cho {platformName}</Badge>;
  if (source === 'catalog') return <Badge variant="primary">{label ?? 'Từ thuộc tính sản phẩm'}</Badge>;
  if (source === 'default') return <Badge variant="neutral">Mặc định của sàn</Badge>;
  if (source === 'match') return <Badge variant="purple">Đọc từ sàn khi ghép</Badge>;
  if (source === 'platform') return <Badge variant="secondary">Sàn quản lý</Badge>;
  return <Badge variant="outline">Riêng cho {platformName}</Badge>;
}

function ReadField({
  label,
  required,
  source,
  sourceLabel,
  platformName,
  onJump,
  missing,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  source?: BadgeSource;
  sourceLabel?: string;
  platformName?: string;
  onJump?: () => void;
  missing?: string | false | null | SharedGap;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid gap-1.5 rounded-lg border p-3', missing && 'border-destructive-border bg-destructive-soft/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span>
            {required && (
              <span className="mr-1 text-destructive-text" aria-hidden>
                *
              </span>
            )}
            {label}
            {required && <span className="sr-only"> (bắt buộc)</span>}
          </span>
          {source && <SourceBadge source={source} label={sourceLabel} platformName={platformName} onJump={onJump} />}
        </div>
        {action}
      </div>
      <div className="min-w-0 text-sm break-words">{children}</div>
      {typeof missing === 'string' && <p className="text-xs text-destructive-text">{missing}</p>}
    </div>
  );
}

function CategoryNotes({
  spec,
  rows,
  platform,
  showDrift,
}: {
  spec: NonNullable<ProductSpecResult['spec']>;
  rows: readonly ProductListingRow[];
  platform: Marketplace;
  /** Đã lên sàn thì CategoryChangeBlock hiện "Trên … đang ở", không lặp ở đây */
  showDrift: boolean;
}) {
  const drift = showDrift ? platformDrift(rows, platform, spec) : [];
  const shopName = (shopId: string) => rows.find((r) => r.shopId === shopId)?.shopName ?? '';
  return (
    <div className="mt-1 grid gap-1">
      {spec.categoryStatus === 'changed' && (
        <p className="text-xs text-warning-text">Sàn đã đổi thông tin của category này. Bấm Đổi category để kiểm lại attribute trước lần đẩy sau.</p>
      )}
      {spec.categoryStatus === 'removed' && (
        <p className="text-xs text-destructive-text">Category này không còn trên sàn. Chọn category mới trước khi đẩy hoặc cập nhật nội dung.</p>
      )}
      {drift.map((d) => (
        <p key={`${d.shopId}/${d.externalProductId}`} className="flex flex-wrap items-start gap-1 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>Trên {shopName(d.shopId)} đang ở:</span>
          {d.fromPath ? <CategoryPath path={d.fromPath} /> : <span className="font-mono">{d.fromId}</span>}
        </p>
      ))}
    </div>
  );
}

/** Tên thông số gốc của thương hiệu, xuất xứ (cột của sản phẩm); thông số của nhóm BE chưa trả tên nên ghi chung */
const productFieldName = (code: string) => (ORIGIN_CODES.has(code) ? 'Xuất xứ' : BRAND_CODES.has(code) ? 'Thương hiệu' : null);
const catalogLabel = (code: string) => {
  const name = productFieldName(code);
  return name ? `Từ thuộc tính sản phẩm: ${name}` : 'Từ thuộc tính sản phẩm';
};

/**
 * Một attribute bắt buộc ở tab sàn (Documents/21 §18.8.2). Ô đã tự điền (thông số gốc, hồ sơ công ty, mặc định sàn) chỉ
 * xem, kèm "Sửa riêng cho {sàn}"; ô đang sửa riêng có "Về giá trị gốc"; ô chưa có giá trị thì sửa ngay (thương hiệu,
 * xuất xứ thì mời điền ở tab Nội bộ trước, vì mọi sàn dùng chung)
 */
function AttributeRow({
  attribute: a,
  values,
  overrides,
  resolved,
  fieldSources,
  platform,
  externalId,
  shopId,
  label,
  canEdit,
  editing,
  flagged,
  error,
  onChange,
  onOverride,
  onJump,
  companyProfileHref,
}: {
  attribute: PlatformAttribute;
  values: Record<string, SpecValue>;
  overrides: Record<string, SpecValue>;
  resolved: Record<string, ResolvedAttribute> | undefined;
  fieldSources?: ProductSpec['fieldSources'];
  platform: Marketplace;
  externalId: string;
  shopId: string | null;
  label: string;
  canEdit: boolean;
  /** Người dùng vừa bấm "Sửa riêng" / "Chỉ điền cho" ở ô này */
  editing: boolean;
  flagged: boolean;
  error?: string;
  onChange: (v: SpecValue | null) => void;
  /** Bật sửa riêng với giá trị ban đầu (chuỗi rỗng là ô trống), null là bỏ sửa riêng */
  onOverride: (v: SpecValue | null) => void;
  onJump: (t: SharedTarget) => void;
  /** Trang hồ sơ công ty: ô `tier = 'company'` còn trống thì mời điền ở đó */
  companyProfileHref: string;
}) {
  const value = values[a.code] ?? null;
  const overridden = isFilled(overrides[a.code]);
  // Ô chưa có giá trị thì không có nguồn: không gắn nhãn, chỉ báo "Chưa có giá trị" kèm lối đi điền
  const empty = !isFilled(value) && !overridden && !editing;
  const source = attributeSource(a, fieldSources, valueSource(a.code, overrides, resolved));
  const isProduct = a.tier === 'product';
  const fieldName = productFieldName(a.code);
  const fieldId = resolved?.[a.code]?.fieldId;
  const jumpTarget: SharedTarget = ORIGIN_CODES.has(a.code)
    ? 'origin'
    : BRAND_CODES.has(a.code)
      ? 'brand'
      : fieldId
        ? `spec:${fieldId}`
        : 'specs';
  const showEditor = canEdit && (editing || overridden || (!isFilled(value) && !isProduct));
  const id = platformFieldId(platform, a.code);

  const link = (text: string, onClick: () => void) => (
    <button type="button" className="cursor-pointer text-xs font-medium text-primary-text underline-offset-2 hover:underline" onClick={onClick}>
      {text}
    </button>
  );
  const actions: React.ReactNode[] = [];
  if (canEdit && (overridden || editing)) {
    if (resolved?.[a.code] || isProduct) actions.push(<span key="back">{link('Về giá trị gốc', () => onOverride(null))}</span>);
  } else if (source === 'catalog') {
    actions.push(<span key="jump">{link('Sửa ở tab Nội bộ', () => onJump(jumpTarget))}</span>);
    if (canEdit) actions.push(<span key="own">{link(`Sửa riêng cho ${label}`, () => onOverride(value ?? ''))}</span>);
  } else if (!isFilled(value) && isProduct) {
    actions.push(<span key="jump">{link(`Điền ${fieldName ?? a.label} ở tab Nội bộ`, () => onJump(jumpTarget))}</span>);
    if (canEdit) actions.push(<span key="own">{link(`Chỉ điền cho ${label}`, () => onOverride(''))}</span>);
  } else if (canEdit && isFilled(value) && (source === 'company' || source === 'default')) {
    actions.push(<span key="own">{link(`Sửa riêng cho ${label}`, () => onOverride(value))}</span>);
  } else if (empty && a.tier === 'company') {
    actions.push(
      <Link key="profile" to={companyProfileHref} className="text-xs font-medium text-primary-text underline-offset-2 hover:underline">
        Điền ở hồ sơ công ty
      </Link>,
    );
  }
  const actionRow = actions.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{actions}</div>;
  const missingText = flagged
    ? isProduct
      ? `Bắt buộc, chưa điền. Điền ${fieldName ?? a.label} ở tab Nội bộ để mọi sàn dùng chung, hoặc chỉ điền cho ${label}.`
      : 'Bắt buộc, chưa điền.'
    : null;

  if (!showEditor) {
    return (
      <ReadField
        label={a.label}
        required
        source={empty ? undefined : source}
        sourceLabel={source === 'catalog' ? catalogLabel(a.code) : source === 'shared' ? 'Dùng chung · sửa ở Nội bộ' : undefined}
        platformName={label}
        onJump={() => onJump(jumpTarget)}
        missing={missingText}
      >
        <div className="grid gap-1.5" id={id} tabIndex={-1}>
          <span>{valueLabel(a, value) || <span className="text-muted-foreground">Chưa có giá trị</span>}</span>
          {actionRow}
        </div>
      </ReadField>
    );
  }
  const hint = fieldHint(a);
  return (
    <div
      className={cn('grid gap-1.5 rounded-lg border p-3', flagged && 'border-destructive-border bg-destructive-soft/40', error && 'border-destructive')}
      data-field={a.code}
    >
      <Label htmlFor={id} className="flex flex-wrap items-center gap-1.5">
        <span>
          <span className="mr-1 text-destructive-text" aria-hidden>
            *
          </span>
          {a.label}
          <span className="sr-only"> (bắt buộc)</span>
        </span>
        {overridden || editing ? (
          <SourceBadge source={fieldSources?.[a.code] === 'match' && !editing ? 'match' : 'override'} platformName={label} />
        ) : (
          !empty && <SourceBadge source={source} platformName={label} />
        )}
      </Label>
      <AttributeField
        attribute={a}
        value={overrides[a.code] ?? (overridden || editing ? null : value)}
        onChange={onChange}
        inputId={id}
        invalid={Boolean(error) || flagged}
        platform={platform}
        externalId={externalId}
        shopId={shopId}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {missingText && !error && <p className="text-xs text-destructive-text">{missingText}</p>}
      {error && (
        <p className="text-xs text-destructive-text" role="alert">
          {error}
        </p>
      )}
      {actionRow}
    </div>
  );
}

/** Mục sàn sẽ từ chối ngoài attribute: trục chưa ánh xạ, sales attribute bắt buộc, bộ trục không hợp (§18.8.6) */
function ExtraMissing({
  items,
  label,
  pushHref,
  newProductHref,
}: {
  items: SpecMissing[];
  label: string;
  /** null khi không có quyền sửa thông tin sàn */
  pushHref: string | null;
  newProductHref: string;
}) {
  const btn = (to: string, text: string, primary = false) => (
    <Button key={text} asChild size="sm" variant={primary ? 'default' : 'outline'}>
      <Link to={to}>{text}</Link>
    </Button>
  );
  return (
    <ul className="grid gap-2">
      {items.map((m) => {
        let title: string;
        let body: string | null = null;
        const actions: React.ReactNode[] = [];
        if (m.reason === 'axis_unmapped') {
          title = `Thuộc tính biến thể “${m.label}” chưa ánh xạ sang ${label}`;
          body = `Chưa có sales attribute của ${label} khớp với thuộc tính biến thể này, và category này không nhận tên thuộc tính biến thể tự đặt. Chọn sales attribute cho thuộc tính biến thể ở bước Bổ sung theo sàn.`;
          if (pushHref) actions.push(btn(pushHref, 'Ánh xạ trên trang đẩy', true));
        } else if (m.reason === 'sales_required') {
          title = `Category bắt buộc phân loại theo “${m.label}”`;
          body =
            'Sản phẩm chưa có thuộc tính biến thể nào ánh xạ tới sales attribute này. Thuộc tính biến thể của sản phẩm không thêm được sau khi tạo: chọn category khác, hoặc lập sản phẩm mới có thuộc tính biến thể này.';
          if (pushHref) actions.push(btn(pushHref, 'Chọn category khác', true));
          actions.push(btn(newProductHref, 'Lập sản phẩm mới'));
        } else if (m.reason === 'axis_shape') {
          title = 'Thuộc tính biến thể của sản phẩm không hợp với category';
          body = m.label;
          if (pushHref) actions.push(btn(pushHref, 'Chọn category khác', true));
        } else {
          title = m.label;
        }
        return (
          <li key={`${m.reason}-${m.code}`} className="grid gap-1 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm">
            <p className="font-medium text-warning-text">{title}</p>
            {body && <p>{body}</p>}
            {actions.length > 0 && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Giá, tồn, trạng thái theo từng gian hàng của sàn (`GET /channel/products/:id/listings`) */
function SalesTable({ companyId, platform, rows }: { companyId: string; platform: Marketplace; rows: readonly ProductListingRow[] }) {
  const shops = listingsByShop(rows, platform);
  const [shopId, setShopId] = useState<string | null>(null);
  const shop = shops.find((s) => s.shopId === shopId) ?? shops[0];
  if (!shop) return <p className="text-sm text-muted-foreground">Chưa có gian hàng {platformLabel(platform)} nào đang kết nối.</p>;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {shops.length > 1 ? (
          <Tabs value={shop.shopId} onValueChange={setShopId}>
            <div className="max-w-full overflow-x-auto">
              <TabsList variant="segmented" aria-label="Gian hàng">
                {shops.map((s) => (
                  <TabsTrigger key={s.shopId} value={s.shopId}>
                    {s.shopName}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        ) : (
          <span className="text-sm font-medium break-all">{shop.shopName}</span>
        )}
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to={ROUTES.company.shop(companyId, shop.shopId)}>
            Mở gian hàng
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Giá, tồn và trạng thái theo từng gian hàng. Category và attribute dùng chung cho mọi gian hàng {platformLabel(platform)}.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU người bán</TableHead>
            <TableHead>SKU trên sàn</TableHead>
            <TableHead>Phân loại</TableHead>
            <TableHead className="text-right">Giá đang bán</TableHead>
            <TableHead className="text-right whitespace-nowrap">Tồn trên sàn</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shop.rows.map((r) => {
            const l = r.listing;
            return (
              <TableRow key={r.variantId}>
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell className="font-mono text-xs break-all">{l?.externalSkuId ?? '—'}</TableCell>
                <TableCell>{r.attributesLabel || '—'}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{l ? priceText(r.price) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{l?.platformStock == null ? '—' : formatQty(l.platformStock)}</TableCell>
                <TableCell>
                  {l ? (
                    <Badge variant={LISTING_STATUS_VARIANTS[l.status]}>{LISTING_STATUS_LABELS[l.status]}</Badge>
                  ) : (
                    <span className="text-muted-foreground">Chưa lên sàn</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ShippingTable({
  product,
  gap,
  sharedLabel,
  onJump,
  remote,
  platformName,
  canEdit,
}: {
  product: ProductDetail;
  gap: SharedGap | undefined;
  sharedLabel: string;
  onJump: () => void;
  /** Bản sàn đang ghi (commerio-backend#497): hiện "{sàn} đang ghi … [Dùng giá trị này]" khi khác SKU */
  remote: RemoteProductFacts | null;
  platformName: string;
  canEdit: boolean;
}) {
  const lacking = new Set(variantsMissingShipping(product.variants).map((v) => v.id));
  const variants = product.variants.filter((v) => v.businessStatus !== 'archived');
  const update = useUpdateVariant();
  const reload = useInvalidateCatalog();
  const [busyId, setBusyId] = useState<string | null>(null);
  const shippingText = (f: Pick<RemoteVariantFacts, 'weightG' | 'lengthMm' | 'widthMm' | 'heightMm'>) =>
    `${f.weightG === null ? '— g' : `${f.weightG.toLocaleString('vi-VN')} g`} · ${
      f.lengthMm === null || f.widthMm === null || f.heightMm === null ? '— mm' : `${f.lengthMm}×${f.widthMm}×${f.heightMm} mm`
    }`;

  /** Ghi số sàn vào SKU khi người dùng bấm; gửi kèm version của SKU, lệch thì tải lại và báo như hộp Thông tin SKU */
  const use = async (variantId: string, version: number, patch: Omit<VariantUpdateInput, 'version'>) => {
    setBusyId(variantId);
    try {
      const saved = await update.mutateAsync({ productId: product.id, variantId, version, ...patch });
      const sku = saved.variants.find((v) => v.id === variantId)?.sku ?? '';
      toast.success(`Đã lấy cân nặng, kích thước của ${platformName} cho ${sku}`);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        void reload();
        toast.warning('Người khác vừa sửa SKU này. Đã tải số mới nhất, xem lại rồi bấm lại.');
      } else {
        toast.error(problemMessage(e));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ReadField
      label="Cân nặng và kích thước kiện"
      required
      source="shared"
      sourceLabel={sharedLabel}
      onJump={onJump}
      missing={gap && `${lacking.size} SKU chưa có cân nặng hoặc kích thước. Sửa ở bảng Biến thể của tab Nội bộ.`}
    >
      <ul className="grid gap-2">
        {variants.map((v) => {
          const rv = remote?.variants.find((x) => x.variantId === v.id);
          const patch = variantSuggestion(v, rv);
          return (
            <li key={v.id} className="grid gap-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="font-mono text-xs">{v.sku}</span>
                <span className="tabular-nums">{shippingText(v)}</span>
                {lacking.has(v.id) && <Badge variant="warning">Thiếu</Badge>}
              </div>
              {remote && rv && patch && (
                <RemoteSuggestion
                  platformName={platformName}
                  shopName={remote.shopName}
                  readAt={remote.readAt}
                  value={shippingText(rv)}
                  onUse={canEdit ? () => use(v.id, v.version, patch) : null}
                  busy={busyId === v.id}
                />
              )}
            </li>
          );
        })}
      </ul>
    </ReadField>
  );
}

/** Nhãn tab một sàn: tên sàn kèm "Thiếu N" (cùng cách đếm với nội dung tab) */
export function PlatformTabLabel({ product, platform, shops }: { product: ProductDetail; platform: Marketplace; shops: readonly Shop[] }) {
  const { count, specQuery } = usePlatformTab(product, platform, shops);
  return (
    <>
      {platformLabel(platform)}
      {specQuery.isSuccess && count > 0 && <Badge variant="warning">Thiếu {count}</Badge>}
    </>
  );
}
