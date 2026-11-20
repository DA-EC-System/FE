import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormTextField } from '@/components/common/FormTextField';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useAttributes,
  useGroups,
  useProductSettings,
  useCreateProduct,
  useDeleteProduct,
  useProduct,
  useUpdateProduct,
} from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { useStock } from '@/api/inventory.api';
import { useProductListingRows, useProductSpecs, useShops } from '@/api/shops.api';
import { formatQty } from '@/features/inventory/shared';
import { LISTING_STATUS_LABELS, LISTING_STATUS_VARIANTS } from '@/features/channel/shopSchemas';
import type { ProductListingRow } from '@/types/shop';
import { STOCK_STATE } from '@/features/inventory/shared';
import { isRouteMissing, problemCode, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { priceText } from '@/utils/price';
import { mainLabel, variantMachine } from '@/lib/machines/product';
import { MISSING_LABELS, type ProductDetail, type ProductVariant, type VariantPresence } from '@/types/catalog';
import { ProductImagesField, type ImageItem } from './ProductImagesField';
import { VariationEditor } from './VariationEditor';
import { GroupCombobox } from './GroupCombobox';
import { axisServerErrors, draftBody, draftError, emptyDraft, type VariantDraft } from './variantDraft';
import { AddVariantDialog } from './AddVariantDialog';
import { VariantSpecDialog } from './VariantSpecDialog';
import { productPatchBody, productSchema, sizeChartPatch, type ProductForm } from './shared';
import { Input } from '@/components/ui/input';
import { CountryCombobox } from './CountryCombobox';
import { SizeChartField } from './SizeChartField';
import { HelpTip } from '@/components/common/HelpTip';
import { BusinessActionMenu, MAIN_LABEL_META, useBusinessAction, type ActionChoice } from './businessStatus';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { formatCurrency } from '@/utils/format';
import { Kpi, KpiStrip } from '@/components/common/KpiStrip';
import { SkuCode } from '@/components/common/SkuCode';
import { PlatformTab, PlatformTabLabel } from './PlatformTab';
import { focusField } from './focusField';
import {
  SHARED_TARGETS,
  sharedTargetId,
  productSuggestions,
  tabFromParam,
  visiblePlatforms,
  type ProductFactField,
  type ProductTabKey,
  type SharedTarget,
} from './productTabs';
import { RemoteSuggestion } from './RemoteSuggestion';
import { countryName } from './countries';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { platformLabel } from './platformCategory';
import { ProductSkuSheet } from './ProductSkuSheet';
import { VariantImagesCard } from './VariantImagesCard';
import { activePlatforms, businessSummary, listingsByVariant, sellingShopCount, totalAvailable } from './productOverview';

const PRESENCE_LABELS: Record<VariantPresence, string> = {
  live: 'Đang bán',
  pending: 'Sàn đang duyệt',
  error: 'Listing lỗi',
  not_listed: 'Chưa đăng bán',
};

/** Thao tác trên một SKU; lưu trữ bị khoá kèm lý do khi còn tồn hoặc chứng từ mở */
const variantChoices = (v: ProductVariant): ActionChoice[] =>
  variantMachine.transitions
    .filter((t) => (typeof t.from === 'string' ? t.from === v.businessStatus : t.from.includes(v.businessStatus)))
    .map((t) => ({ action: t.action, blocked: t.action === 'archive' ? v.archiveBlockers : undefined }));

const missingText = (v: ProductVariant) => v.missing.map((k) => MISSING_LABELS[k]).join(', ');

/** BE luôn trả độ hoàn thiện và hiện diện (§17.1); thiếu thì không đoán */
const NOT_COMPUTED = <span className="text-muted-foreground">Chưa có dữ liệu</span>;

/** "200 g · 300×250×20 mm"; thiếu thì gạch ngang */
function specText(v: ProductVariant) {
  const weight = v.weightG === null ? null : `${v.weightG.toLocaleString('vi-VN')} g`;
  const dims =
    v.lengthMm === null || v.widthMm === null || v.heightMm === null
      ? null
      : `${v.lengthMm}×${v.widthMm}×${v.heightMm} mm`;
  return [weight, dims].filter(Boolean).join(' · ') || '—';
}

const FACT_LABELS: Record<ProductFactField, string> = { originCountry: 'xuất xứ', brand: 'thương hiệu', description: 'mô tả' };

const toImages = (p: ProductDetail): ImageItem[] =>
  [...p.images].sort((a, b) => a.position - b.position).map((i) => ({ fileId: i.fileId, url: i.url }));

/** UC-CP-02: tạo sản phẩm kèm tổ hợp biến thể; sửa thông tin, ảnh và biến thể */
export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isNew = !productId;
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();

  const productQuery = useProduct(productId);
  const product = productQuery.data;
  useBreadcrumb(isNew ? 'Thêm sản phẩm' : product?.name);
  const groupsQuery = useGroups();
  const settingsQuery = useProductSettings();
  const attributesQuery = useAttributes();
  const groups = groupsQuery.data ?? [];
  const attributes = attributesQuery.data ?? [];
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const business = useBusinessAction();

  const archived = product?.status === 'archived';
  const canManage = can(PERMISSIONS.productManage);
  const readOnly = !canManage || archived;

  // US-SP-11 (commerio-backend#467): sàn, listing, tồn theo quyền; thiếu quyền thì không gọi API để khỏi 403
  const canShop = can(PERMISSIONS.shopView);
  const canStock = can(PERMISSIONS.stockView);
  const canCost = can(PERMISSIONS.costView);
  const shopsQuery = useShops({ enabled: canShop && !isNew });
  const listingsQuery = useProductListingRows(productId, canShop);
  const stockQuery = useStock({ productId, pageSize: 100 }, { enabled: canStock && !isNew });
  const platforms = activePlatforms(shopsQuery.data?.items ?? []);
  const listingRows = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const listed = useMemo(() => listingsByVariant(listingRows), [listingRows]);
  const levels = useMemo(() => new Map((stockQuery.data?.items ?? []).map((l) => [l.variantId, l])), [stockQuery.data]);
  const [skuVariantId, setSkuVariantId] = useState<string | null>(null);
  const [skuTab, setSkuTab] = useState<'stock' | 'shops'>('stock');
  const openSku = (id: string, tab: 'stock' | 'shops') => {
    setSkuTab(tab);
    setSkuVariantId(id);
  };
  const retry = (refetch: () => unknown) => (
    <>
      Không tải được.{' '}
      <button type="button" className="cursor-pointer font-medium underline underline-offset-2" onClick={() => refetch()}>
        Thử lại
      </button>
    </>
  );

  const [images, setImages] = useState<ImageItem[]>([]);
  const [imagesError, setImagesError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [sizeChart, setSizeChart] = useState<ImageItem | null>(null);
  const [sizeChartError, setSizeChartError] = useState<string | undefined>();
  const [chartUploading, setChartUploading] = useState(false);
  const [draft, setDraft] = useState<VariantDraft>(emptyDraft);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [axisErrorsFromServer, setAxisErrorsFromServer] = useState<string[][]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // `?spec=` mở luôn hộp Thông tin SKU (FE#326: nút Sửa cân nặng ở lỗi đẩy của trang gian hàng)
  // Cùng điều kiện với nút bút chì: có quyền, sản phẩm và biến thể chưa lưu trữ. Đóng hộp thì xoá `spec` khỏi URL để F5/Back
  // không mở lại
  const [searchParams, setSearchParams] = useSearchParams();
  const [specVariantId, setSpecVariantId] = useState<string | null>(() => searchParams.get('spec'));
  const specVariant =
    canManage && !archived
      ? (product?.variants.find((v) => v.id === specVariantId && v.businessStatus !== 'archived') ?? null)
      : null;
  const closeSpec = () => {
    setSpecVariantId(null);
    if (searchParams.has('spec')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('spec');
          return next;
        },
        { replace: true },
      );
    }
  };

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', groupId: '', description: '', originCountry: '', brand: '' },
  });
  const { control, reset, setError: setFieldError } = form;

  // FE#417: tab Commerio và một tab mỗi sàn đã có spec hoặc listing; tab đang mở ghi lên `?tab=` để gửi link được
  const shops = shopsQuery.data?.items ?? [];
  const specQueries = useProductSpecs(productId, platforms, canShop && !isNew);
  const tabPlatforms = visiblePlatforms(platforms, (p) => Boolean(specQueries[platforms.indexOf(p)]?.data?.spec), listingRows);
  const tab: ProductTabKey = tabFromParam(searchParams.get('tab'), tabPlatforms);
  const setTab = (next: string) =>
    setSearchParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        if (next === 'commerio') q.delete('tab');
        else q.set('tab', next);
        return q;
      },
      { replace: true },
    );
  // "Dùng chung · sửa ở Commerio": sang tab Commerio rồi cuộn, focus, nháy đúng ô sau khi tab hiện
  const [jump, setJump] = useState<SharedTarget | null>(null);
  const jumpTo = (target: SharedTarget) => {
    setTab('commerio');
    setJump(target);
  };
  useEffect(() => {
    if (tab !== 'commerio' || !jump) return;
    const id = sharedTargetId(jump, (x) => document.getElementById(x) !== null);
    // Xoá `jump` trong cùng khung hình: xoá ngay thì effect chạy lại và huỷ khung hình trước khi kịp focus
    const frame = requestAnimationFrame(() => {
      focusField(id);
      setJump(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, jump]);

  // Nạp form một lần cho mỗi sản phẩm; refetch sau khi thêm biến thể không đè lên chỗ đang sửa
  const loadedId = useRef<string | null>(null);
  const load = (p: ProductDetail) => {
    reset({ name: p.name, groupId: p.group.id, description: p.description, originCountry: p.originCountry ?? '', brand: p.brand ?? '' });
    setImages(toImages(p));
    setSizeChart(p.sizeChart ? { fileId: p.sizeChart.fileId, url: p.sizeChart.url } : null);
    setVersion(p.version);
  };
  useEffect(() => {
    if (product && loadedId.current !== product.id) {
      loadedId.current = product.id;
      load(product);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // FE#417 F2: giá trị sàn đang ghi (`remote` của spec, commerio-backend#497) khác bản đã lưu. Chỉ ghi khi người dùng bấm
  // "Dùng giá trị này"; ghi riêng trường đó kèm version, các ô khác đang sửa dở giữ nguyên
  const remotes = platforms.flatMap((p, i) => {
    const remote = specQueries[i]?.data?.remote;
    return remote ? [{ platform: p, remote }] : [];
  });
  const [applying, setApplying] = useState<string | null>(null);
  const applyRemote = async (field: ProductFactField, value: string, key: string) => {
    if (!product) return;
    setApplying(key);
    try {
      const saved = await updateMut.mutateAsync({ id: product.id, ...productPatchBody(product, { [field]: value }) });
      setVersion(saved.version);
      form.resetField(field, { defaultValue: value });
      toast.success(`Đã lưu ${FACT_LABELS[field]} theo giá trị trên sàn`);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        void productQuery.refetch();
        toast.warning('Người khác vừa sửa sản phẩm này. Đã tải bản mới nhất, xem lại rồi bấm lại.');
      } else {
        toast.error(problemMessage(e));
      }
    } finally {
      setApplying(null);
    }
  };
  const remoteLines = (field: ProductFactField, current: string, show: (v: string) => string = (v) => v) =>
    product
      ? remotes.flatMap(({ platform, remote }) => {
          const value = productSuggestions(product, remote)[field];
          if (!value || current.trim() === value) return [];
          const key = `${field}-${platform}`;
          return [
            <RemoteSuggestion
              key={key}
              platformName={platformLabel(platform)}
              shopName={remote.shopName}
              readAt={remote.readAt}
              value={show(value)}
              onUse={readOnly ? null : () => applyRemote(field, value, key)}
              busy={applying === key}
            />,
          ];
        })
      : null;

  const backToList = () => navigate(ROUTES.company.catalog(companyId));

  /** Lỗi 422 của BE về đúng chỗ (AC-8) */
  const applyFieldErrors = (e: unknown) => {
    const fieldErrors = getProblem(e)?.errors;
    if (!fieldErrors) return false;
    (['name', 'groupId', 'description', 'originCountry', 'brand'] as const).forEach((f) => {
      if (fieldErrors[f]) setFieldError(f, { message: fieldErrors[f] });
    });
    setImagesError(fieldErrors.images);
    setSizeChartError(fieldErrors.sizeChart);
    // Lỗi trục phân loại theo nhóm (`axes.i.*`), lỗi `axes`/`variants` hiện dưới bảng
    const { byAxis, general } = axisServerErrors(fieldErrors, draft.axes.length);
    setAxisErrorsFromServer(byAxis);
    setVariantsError(general[0] ?? null);
    return true;
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setImagesError(undefined);
    setSizeChartError(undefined);
    const imageFileIds = images.map((i) => i.fileId);
    try {
      if (isNew) {
        setSubmitted(true);
        setAxisErrorsFromServer([]);
        const problem = draftError(draft);
        setVariantsError(problem);
        if (problem) return;
        // Tạo sản phẩm chưa nhận xuất xứ, thương hiệu (CreateProductBody): điền sau khi tạo
        const { originCountry: _origin, brand: _brand, ...createValues } = values;
        const created = await createMut.mutateAsync({
          ...createValues,
          imageFileIds,
          ...(sizeChart && { sizeChartFileId: sizeChart.fileId }),
          ...draftBody(draft, attributes),
        });
        toast.success(`Đã tạo ${created.name} với ${created.variants.length} variant`);
        navigate(ROUTES.company.catalogProduct(companyId, created.id), { replace: true });
      } else {
        const saved = await updateMut.mutateAsync({
          id: productId,
          name: values.name,
          description: values.description,
          groupId: values.groupId,
          originCountry: values.originCountry || null,
          brand: values.brand.trim() || null,
          imageFileIds,
          ...sizeChartPatch(product?.sizeChart?.fileId ?? null, sizeChart?.fileId ?? null),
          version,
        });
        load(saved);
        toast.success(`Đã lưu ${saved.name}`);
      }
    } catch (e) {
      const latest = conflictCurrent<ProductDetail>(e);
      if (problemCode(e) === 'version_conflict' && latest) {
        load(latest);
        setError('Người khác vừa sửa sản phẩm này. Đã nạp bản mới nhất; thay đổi của bạn chưa lưu, hãy nhập lại.');
        return;
      }
      // §17.4: gỡ hết ảnh khi SKU còn trên sàn
      if (problemCode(e) === 'listing_field_required') {
        applyFieldErrors(e);
        setError(problemMessage(e));
        return;
      }
      if (problemCode(e) === 'name_taken') {
        setFieldError('name', { message: getProblem(e)?.errors?.name ?? 'Đã có sản phẩm cùng tên' });
        return;
      }
      if (!applyFieldErrors(e)) setError(problemMessage(e));
    }
  });

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={backToList}>
      <ArrowLeft />
      Danh sách sản phẩm
    </Button>
  );

  if (!isNew && productQuery.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!isNew && productQuery.isError) {
    // C4: không có hoặc của công ty khác đều là 404 (AC-15)
    const notFound = getProblem(productQuery.error)?.status === 404 && !isRouteMissing(productQuery.error);
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : 'Không tải được sản phẩm'} />
        <AlertMessage severity="error">{problemMessage(productQuery.error)}</AlertMessage>
      </div>
    );
  }

  const busy = createMut.isPending || updateMut.isPending;
  // Xoá hẳn chỉ khi mọi SKU Chờ hoàn thiện (§17.2); BE kiểm thêm chứng từ, listing và trả 409 product_in_use
  const deletable = Boolean(product && canManage && product.variants.every((v) => v.readiness === 'incomplete'));
  const removeProduct = async () => {
    if (!product) return;
    try {
      await deleteMut.mutateAsync({ id: product.id, version: product.version });
      toast.success(`Đã xoá ${product.name}`);
      backToList();
    } catch (e) {
      toast.error(problemMessage(e));
      setDeleteOpen(false);
    }
  };
  const title = isNew ? 'Thêm sản phẩm' : readOnly ? (product?.name ?? '') : 'Sửa sản phẩm';

  return (
    <Form {...form}>
        {back}
        <PageHeader
          title={title}
          subtitle={
            product ? (
              <>
                Mã SP <span className="font-mono" data-testid="product-code">{product.code}</span> · Cập nhật lần cuối{' '}
                {formatDateTime(product.updatedAt)}
              </>
            ) : undefined
          }
          action={
            readOnly && !deletable ? null : (
              <div className="flex flex-wrap gap-2">
                {deletable && (
                  <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)}>
                    <Trash2 />
                    Xoá hẳn
                  </Button>
                )}
                {!readOnly && tab === 'commerio' && (
                  <Button type="submit" form="product-form" disabled={busy || uploading || chartUploading}>
                    {busy ? 'Đang lưu...' : uploading || chartUploading ? 'Đang tải ảnh...' : isNew ? 'Tạo sản phẩm' : 'Lưu'}
                  </Button>
                )}
              </div>
            )
          }
        />

        {archived && (
          <AlertMessage severity="info" className="mb-4">
            Sản phẩm đã lưu trữ nên chỉ xem được; Khôi phục từng SKU để bán tiếp. SKU của sản phẩm không cấp lại cho sản phẩm khác.
          </AlertMessage>
        )}
        {error && (
          <AlertMessage severity="warning" className="mb-4">
            {error}
          </AlertMessage>
        )}

        {product && (
          <KpiStrip label="Tóm tắt sản phẩm" className="mb-4">
            <Kpi label="Nhóm hàng" value={<span className="text-lg">{product.group.name}</span>} />
            <Kpi
              label="SKU theo trạng thái"
              value={product.variants.length}
              unit="SKU"
              detail={businessSummary(product.variants)}
            />
            {canStock && (
              <Kpi
                label="Tổng có thể bán"
                help="Cộng số có thể bán của mọi SKU: tồn thực trừ đang giữ cho đơn và khoá chờ duyệt. Đây là số đẩy lên sàn."
                value={formatQty(totalAvailable([...levels.values()]))}
                loading={stockQuery.isLoading}
                error={stockQuery.isError ? retry(stockQuery.refetch) : undefined}
              />
            )}
            {canShop && (
              <Kpi
                label="Gian hàng đang bán"
                help="Số gian hàng có ít nhất một SKU của sản phẩm đang hoạt động trên sàn."
                value={sellingShopCount(listingRows)}
                loading={listingsQuery.isLoading}
                error={listingsQuery.isError ? retry(listingsQuery.refetch) : undefined}
              />
            )}
          </KpiStrip>
        )}

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          {!isNew && canShop && platforms.length > 0 && (
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="max-w-full overflow-x-auto">
                <TabsList aria-label="Nơi bán">
                  <TabsTrigger value="commerio">Commerio (nội bộ)</TabsTrigger>
                  {product &&
                    tabPlatforms.map((p) => (
                      <TabsTrigger key={p} value={p}>
                        <PlatformTabLabel product={product} platform={p} shops={shops} />
                      </TabsTrigger>
                    ))}
                </TabsList>
              </div>
              {product && can(PERMISSIONS.listingManage) && !archived && (
                <div className="flex flex-wrap gap-2 pb-1.5">
                  {platforms
                    .filter((p) => !tabPlatforms.includes(p))
                    .map((p) => (
                      <Button key={p} asChild variant="outline" size="sm">
                        <Link to={ROUTES.company.productPush(companyId, product.id, p)}>
                          <Plus />
                          Lên {platformLabel(p)}
                        </Link>
                      </Button>
                    ))}
                </div>
              )}
            </div>
          )}
          {!isNew && canShop && !shopsQuery.isLoading && !shopsQuery.isError && !platforms.length && (
            <p className="text-sm text-muted-foreground">
              Công ty chưa kết nối gian hàng nào.{' '}
              <Link to={ROUTES.company.shops(companyId)} className="font-medium text-primary-text underline">
                Kết nối gian hàng
              </Link>{' '}
              để đưa sản phẩm lên sàn.
            </p>
          )}
          <TabsContent value="commerio" forceMount className="data-[state=inactive]:hidden">
        <form id="product-form" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin cơ bản</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div id={SHARED_TARGETS.name} className="rounded-md">
                <FormTextField
                  control={control}
                  name="name"
                  label="Tên sản phẩm"
                  autoFocus={isNew}
                  readOnly={readOnly}
                />
              </div>
              <FormField
                control={control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nhóm hàng</FormLabel>
                    <FormControl>
                      <GroupCombobox
                        value={field.value}
                        onChange={field.onChange}
                        groups={groups}
                        fallback={product?.group}
                        loading={groupsQuery.isLoading}
                        disabled={readOnly}
                        invalid={Boolean(form.formState.errors.groupId)}
                        canCreate={can(PERMISSIONS.productManage) || can(PERMISSIONS.catalogSetup)}
                      />
                    </FormControl>
                    <FormMessage />
                    {!form.formState.errors.groupId && !readOnly && (
                      <FormDescription>Để lọc sản phẩm trong app; mã SKU sinh theo mẫu của công ty</FormDescription>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem id={SHARED_TARGETS.description} className="rounded-md md:col-span-2">
                    <FormLabel>Mô tả</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} readOnly={readOnly} />
                    </FormControl>
                    <FormMessage />
                    {remoteLines('description', field.value)}
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {!isNew && (
            <Card>
              <CardHeader>
                <CardTitle>Thông tin dùng chung cho các sàn</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="originCountry"
                    render={({ field }) => (
                      <FormItem id={SHARED_TARGETS.origin} className="rounded-md">
                        <FormLabel>Xuất xứ</FormLabel>
                        <FormControl>
                          <CountryCombobox value={field.value} onChange={field.onChange} disabled={readOnly} />
                        </FormControl>
                        <FormDescription>Dùng chung cho mọi sàn; TikTok bắt buộc ở nhiều category</FormDescription>
                        <FormMessage />
                        {remoteLines('originCountry', field.value, countryName)}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem id={SHARED_TARGETS.brand} className="rounded-md">
                        <FormLabel>Thương hiệu</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Để trống là không thương hiệu" maxLength={120} readOnly={readOnly} />
                        </FormControl>
                        <FormDescription>Lazada nhận "No Brand" khi để trống</FormDescription>
                        <FormMessage />
                        {remoteLines('brand', field.value)}
                      </FormItem>
                    )}
                  />
                {tabPlatforms.length > 0 && (
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    Dùng cho: {tabPlatforms.map(platformLabel).join(' · ')}. Sửa ở đây thì mọi sàn đọc theo.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {product && canShop && listingsQuery.isError && (
            <AlertMessage severity="warning">
              Không tải được listing của sản phẩm: {problemMessage(listingsQuery.error)}{' '}
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => listingsQuery.refetch()}>
                Thử lại
              </Button>
            </AlertMessage>
          )}
          {product && canStock && stockQuery.isError && (
            <AlertMessage severity="warning">
              Không tải được tồn kho của sản phẩm: {problemMessage(stockQuery.error)}{' '}
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => stockQuery.refetch()}>
                Thử lại
              </Button>
            </AlertMessage>
          )}

          <Card id={SHARED_TARGETS.images}>
            <CardHeader>
              <CardTitle>Ảnh sản phẩm</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductImagesField
                value={images}
                onChange={(next) => {
                  setImages(next);
                  setImagesError(undefined);
                }}
                onBusyChange={setUploading}
                disabled={readOnly}
                error={imagesError}
              />
            </CardContent>
          </Card>

          {product && <VariantImagesCard product={product} readOnly={readOnly} onSaved={(p) => setVersion(p.version)} />}

          <Card id={SHARED_TARGETS.sizeChart}>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-1">
                Bảng size
                <HelpTip
                  topic="Bảng size"
                  content="Lazada, TikTok bắt buộc với quần áo, giày dép. Thiếu ảnh này thì sàn từ chối khi đăng bán."
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SizeChartField
                value={sizeChart}
                onChange={(next) => {
                  setSizeChart(next);
                  setSizeChartError(undefined);
                }}
                onBusyChange={setChartUploading}
                disabled={readOnly}
                error={sizeChartError}
              />
            </CardContent>
          </Card>

          <Card id={SHARED_TARGETS.variants}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Variant</CardTitle>
              {!isNew && !readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus />
                  Thêm variant
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isNew ? (
                <VariationEditor
                  attributes={attributes}
                  loading={attributesQuery.isLoading}
                  settings={settingsQuery.data}
                  value={draft}
                  onChange={(next) => {
                    setDraft(next);
                    setVariantsError(null);
                    setAxisErrorsFromServer([]);
                  }}
                  error={variantsError}
                  serverAxisErrors={axisErrorsFromServer}
                  submitted={submitted}
                />
              ) : (
                <div className="grid gap-2">
                  <div className="overflow-x-auto rounded-md border">
                    <Table data-testid="variants">
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Thuộc tính phân loại</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          {canStock && <TableHead className="text-right">Có thể bán</TableHead>}
                          {canStock && canCost && <TableHead className="text-right">Giá vốn BQ</TableHead>}
                          <TableHead className="text-right">Giá bán lẻ</TableHead>
                          <TableHead>Thông tin</TableHead>
                          {canManage && <TableHead className="w-24" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {product?.variants.map((v) => (
                          <TableRow
                            key={v.id}
                            data-row-id={v.id}
                            className={cn(v.businessStatus === 'archived' && 'text-muted-foreground')}
                          >
                            <TableCell className="whitespace-nowrap">
                              <SkuCode
                                code={v.sku}
                                hint={canStock || canShop ? 'Xem tồn kho và listing' : undefined}
                                onClick={canStock || canShop ? () => openSku(v.id, canStock ? 'stock' : 'shops') : undefined}
                                className={cn(v.businessStatus === 'archived' && 'line-through')}
                              />
                            </TableCell>
                            <TableCell>
                              {v.attributes.map((a) => `${a.attributeName}: ${a.value}`).join(', ') ||
                                'Mặc định'}
                            </TableCell>
                            <TableCell data-testid="variant-status">
                              {v.presence === undefined && v.businessStatus === 'selling' ? (
                                NOT_COMPUTED
                              ) : (
                                <span className="flex flex-wrap items-center gap-1">
                                  <StatusBadge status={mainLabel(v.businessStatus, v.presence)} statuses={MAIN_LABEL_META} />
                                  {/* Nhãn phụ: đang bán nhưng có listing lỗi ở gian hàng khác */}
                                  {v.businessStatus === 'selling' && v.presence === 'live' && v.hasListingError && (
                                    <Badge variant="destructive" data-flag="error">
                                      Listing lỗi
                                    </Badge>
                                  )}
                                </span>
                              )}
                              {v.businessStatus !== 'archived' && (
                                <div className="mt-1" data-testid="variant-shops">
                                  {canShop && listed.get(v.id)?.length ? (
                                    <ShopSummary rows={listed.get(v.id)!} onOpen={() => openSku(v.id, 'shops')} />
                                  ) : v.presence !== undefined && v.listingCount ? (
                                    <span className="text-[12.5px] text-muted-foreground">
                                      {PRESENCE_LABELS[v.presence]} · {v.listingCount} gian hàng
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </TableCell>
                            {canStock && (
                              <TableCell className="text-right whitespace-nowrap tabular-nums" data-testid="variant-stock">
                                {(() => {
                                  const l = levels.get(v.id);
                                  if (stockQuery.isLoading) return <Skeleton className="ms-auto h-4 w-20" />;
                                  if (!l) return <span className="text-muted-foreground">—</span>;
                                  return (
                                    <>
                                      <span className="inline-flex items-center gap-1.5">
                                        {l.state !== 'in_stock' && (
                                          <Badge variant={STOCK_STATE[l.state].variant}>{STOCK_STATE[l.state].label}</Badge>
                                        )}
                                        <span className="font-semibold">{formatQty(l.available)}</span>
                                      </span>
                                      <span className="block text-[12.5px] text-muted-foreground">
                                        Thực {formatQty(l.onHand)} · Giữ {formatQty(l.reserved)}
                                      </span>
                                    </>
                                  );
                                })()}
                              </TableCell>
                            )}
                            {canStock && canCost && (
                              <TableCell className="text-right whitespace-nowrap tabular-nums" data-testid="variant-cost">
                                {levels.get(v.id)?.avgCost == null ? '—' : formatCurrency(levels.get(v.id)!.avgCost!)}
                              </TableCell>
                            )}
                            <TableCell className="text-right whitespace-nowrap tabular-nums">
                              <span data-testid="variant-price">{priceText(v.standardPrice)}</span>
                              <span className="block text-[12.5px] text-muted-foreground" data-testid="variant-target-price">
                                Thực nhận {priceText(v.targetNetPrice)}
                              </span>
                            </TableCell>
                            <TableCell data-testid="variant-readiness">
                              {v.businessStatus === 'archived' ? null : v.readiness === undefined ? (
                                NOT_COMPUTED
                              ) : v.readiness === 'ready' ? (
                                <span className="text-muted-foreground">Đủ thông tin</span>
                              ) : (
                                <Badge variant="warning" title={`Thiếu: ${missingText(v)}`}>
                                  Thiếu thông tin
                                </Badge>
                              )}
                              {v.readiness === 'incomplete' && v.businessStatus !== 'archived' && (
                                <div className="mt-0.5 text-xs text-muted-foreground">Thiếu {missingText(v)}</div>
                              )}
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right whitespace-nowrap">
                                {v.businessStatus !== 'archived' && !archived && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Sửa thông tin ${v.sku}`}
                                    title="Giá bán lẻ, thực nhận mong muốn, cân nặng, kích thước đóng gói"
                                    onClick={() => setSpecVariantId(v.id)}
                                  >
                                    <Pencil />
                                  </Button>
                                )}
                                <BusinessActionMenu
                                  label={`Đổi trạng thái ${v.sku}`}
                                  choices={variantChoices(v)}
                                  onSelect={(action) =>
                                    business.request({ productId: product.id, name: v.sku, action, variantIds: [v.id] })
                                  }
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {variantsError && <AlertMessage severity="error">{variantsError}</AlertMessage>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </form>
          </TabsContent>
          {product &&
            tabPlatforms.map((p) => (
              <TabsContent key={p} value={p} forceMount className="data-[state=inactive]:hidden">
                <PlatformTab
                  companyId={companyId}
                  product={product}
                  platform={p}
                  shops={shops}
                  rows={listingRows}
                  canEditSpec={can(PERMISSIONS.listingManage) && !archived}
                  canEditProduct={!readOnly}
                  onJump={jumpTo}
                />
              </TabsContent>
            ))}
        </Tabs>

        {product && (
          <AddVariantDialog
            open={addOpen}
            product={product}
            settings={settingsQuery.data}
            attributes={attributes}
            loading={attributesQuery.isLoading}
            onClose={() => setAddOpen(false)}
            onDone={(message) => {
              setAddOpen(false);
              toast.success(message);
            }}
            onRestore={(variantId) => {
              setAddOpen(false);
              const sku = product.variants.find((v) => v.id === variantId)?.sku ?? 'SKU đã lưu trữ';
              business.request({ productId: product.id, name: sku, action: 'restore', variantIds: [variantId] });
            }}
          />
        )}

        {business.dialog}
        {product && (
          <ConfirmDialog
            open={deleteOpen}
            title={`Xoá hẳn ${product.name}?`}
            message="Sản phẩm và các SKU bị xoá, không khôi phục được. Chỉ xoá được sản phẩm chưa dùng ở chứng từ, tồn kho hay sàn nào; sản phẩm đã dùng thì Lưu trữ."
            confirmLabel="Xoá hẳn"
            destructive
            loading={deleteMut.isPending}
            onConfirm={removeProduct}
            onClose={() => setDeleteOpen(false)}
          />
        )}
      {product && (
        <ProductSkuSheet
          companyId={companyId}
          variant={product.variants.find((v) => v.id === skuVariantId) ?? null}
          rows={listingRows.filter((r) => r.variantId === skuVariantId)}
          tab={skuTab}
          specText={(v) => specText(v)}
          canStock={canStock}
          canShop={canShop}
          canCost={canCost}
          onClose={() => setSkuVariantId(null)}
        />
      )}
      {product && (
        <VariantSpecDialog
          productId={product.id}
          variant={specVariant}
          onClose={closeSpec}
          onDone={(message) => {
            closeSpec();
            toast.success(message);
          }}
        />
      )}
    </Form>
  );
}

/**
 * Tóm tắt listing của SKU trong cột Trạng thái (audit FE#405): số gian hàng, mỗi gian hàng một chấm màu kèm tên trạng thái
 * cho trình đọc màn hình, và số listing cần xem bằng chữ; bấm mở tab Gian hàng của ngăn SKU
 */
function ShopSummary({ rows, onOpen }: { rows: ProductListingRow[]; onOpen: () => void }) {
  const issues = rows.filter((r) => ['push_failed', 'rejected', 'platform_hold'].includes(r.listing!.status)).length;
  const dot: Record<string, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
    info: 'bg-info',
  };
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-[12.5px] text-muted-foreground hover:text-primary-text focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Listing trên ${rows.length} gian hàng: ${rows.map((r) => `${r.shopName} ${LISTING_STATUS_LABELS[r.listing!.status]}`).join(', ')}`}
    >
      <span className="inline-flex gap-0.5" aria-hidden>
        {rows.map((r) => (
          <span
            key={r.shopId}
            className={cn('size-2 rounded-full border', dot[LISTING_STATUS_VARIANTS[r.listing!.status]] ?? 'bg-muted')}
            title={`${r.shopName}: ${LISTING_STATUS_LABELS[r.listing!.status]}`}
          />
        ))}
      </span>
      {rows.length} gian hàng
      {issues > 0 && <span className="font-medium text-destructive">· {issues} lỗi</span>}
    </button>
  );
}
