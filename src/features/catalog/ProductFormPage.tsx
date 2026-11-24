import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
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
  fetchNextIncompleteProduct,
  useBulkSaveVariants,
  useAttributes,
  useGroups,
  useProductSettings,
  useCreateProduct,
  useDeleteProduct,
  useGroupTemplate,
  useProduct,
  useUpdateProduct,
} from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { useStock } from '@/api/inventory.api';
import { useProductListingRows, useProductSpecs, useShops } from '@/api/shops.api';
import { formatQty } from '@/features/inventory/shared';
import { LISTING_STATUS_LABELS, LISTING_STATUS_VARIANTS } from '@/features/channel/shopSchemas';
import type { ListingStatus, Marketplace, ProductListingRow } from '@/types/shop';
import { STOCK_STATE } from '@/features/inventory/shared';
import { isRouteMissing, problemCode, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
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
import { productNameCounter } from './productName';
import { axesNoticeText, groupChangeNotice, liveAxes, movingNoticeText, movingSpecNames } from './groupChange';
import { Input } from '@/components/ui/input';
import { CountryCombobox } from './CountryCombobox';
import { SizeChartField } from './SizeChartField';
import { HelpTip } from '@/components/common/HelpTip';
import { BusinessActionMenu, MAIN_LABEL_META, useBusinessAction, type ActionChoice } from './businessStatus';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { formatCurrency } from '@/utils/format';
import { Kpi, KpiStrip } from '@/components/common/KpiStrip';
import { SkuCode } from '@/components/common/SkuCode';
import {
  SHARED_TARGETS,
  productSuggestions,
  sharedTargetId,
  tabFromParam,
  type ProductFactField,
  type ProductTabKey,
  type SharedTarget,
} from './productTabs';
import { GROUP_FIELD_ID, missingForPublish, missingItems, parseMinQty, publishBlocker } from './completion';
import { ProductCompletionRail } from './ProductCompletionRail';
import { PlatformTab, PlatformTabLabel } from './PlatformTab';
import { NeedsAttentionBox } from './NeedsAttentionBox';
import { attentionItems, type AttentionAction } from './needsAttention';
import { focusField, focusWhenReady } from './focusField';
import { listingPollDelay } from '@/features/channel/listingPush';
import { usePushOutcomeToasts } from '@/features/channel/usePushOutcomeToasts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductMinQtyCard } from './ProductMinQtyCard';
import { SpecFieldDialog } from './specs/SpecFieldDialog';
import { RemoteSuggestion } from './RemoteSuggestion';
import { countryName } from './countries';
import { platformLabel } from './platformCategory';
import { ProductSkuSheet } from './ProductSkuSheet';
import { VariantImagesCard } from './VariantImagesCard';
import { activePlatforms, businessSummary, listingsByVariant, sellingShopCount, totalAvailable } from './productOverview';
import { ProductSpecsCard } from './specs/ProductSpecsCard';
import { CreatedNextSteps } from './CreatedNextSteps';
import type { ProductCreatedState } from './ProductFormRoute';
import {
  draftsFromProduct,
  isEmptySpec,
  specErrorsByField,
  specInputs,
  viewFromProduct,
  viewFromTemplate,
  type SpecDrafts,
  type SpecFieldView,
} from './specs/specValues';

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

/** Listing đã lên sàn thật (khung "Tiếp theo" xong việc); pushing, push_failed, rejected, delisted không tính */
const PUBLISHED_STATUSES: ReadonlySet<ListingStatus> = new Set(['live', 'under_review', 'platform_hold', 'hidden']);

const toImages = (p: ProductDetail): ImageItem[] =>
  [...p.images].sort((a, b) => a.position - b.position).map((i) => ({ fileId: i.fileId, url: i.url }));

/** UC-CP-02: tạo sản phẩm kèm tổ hợp biến thể; sửa thông tin, ảnh và biến thể */
export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isNew = !productId;
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
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
  // Form tạo cũng tải sẵn gian hàng: tạo xong dải tab sàn hiện ngay, không nhảy layout (FE#463)
  const shopsQuery = useShops({ enabled: canShop });
  // Còn SKU Đang đăng thì đọc lại mỗi 5 giây, tối đa 30 phút; dòng thôi Đang đăng thì toast kết quả (FE#462, §18.6.4)
  const pollFrom = useRef<number | null>(null);
  const listingsQuery = useProductListingRows(productId, canShop, (rows) => {
    const now = Date.now();
    const delay = listingPollDelay(rows, pollFrom.current ?? now, now);
    if (delay === false) {
      if (!rows.some((r) => r.listing?.status === 'pushing')) pollFrom.current = null;
      return false;
    }
    pollFrom.current ??= now;
    return delay;
  });
  usePushOutcomeToasts(listingsQuery.data, { companyId, canFix: canManage });
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
  const [axisUploading, setAxisUploading] = useState(false);
  const [draft, setDraft] = useState<VariantDraft>(emptyDraft);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [axisErrorsFromServer, setAxisErrorsFromServer] = useState<string[][]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Ngưỡng tồn mức sản phẩm (Documents/29 bước 3): form tạo áp sau khi tạo; trang sửa áp ở ProductMinQtyCard
  const [minQtyText, setMinQtyText] = useState('');
  const bulkSave = useBulkSaveVariants();
  // Thêm thuộc tính vào danh mục ngay từ form (Documents/21 §5.6)
  const [addingField, setAddingField] = useState(false);
  // "Lưu và sang sản phẩm kế": mở từ bộ lọc Chờ hoàn thiện (`?from=incomplete`)
  const nextAfterSave = useRef(false);
  // Thông số theo mẫu nhóm (Documents/21 §5.5): giá trị đang gõ, bản đã lưu để chỉ gửi ô đã đổi, lỗi BE theo thông số
  const [specDrafts, setSpecDrafts] = useState<SpecDrafts>({});
  const [specInitial, setSpecInitial] = useState<SpecDrafts>({});
  const [specErrors, setSpecErrors] = useState<Record<string, string>>({});
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

  // Giá trị sàn đang ghi để gợi ý ở tab Nội bộ (FE#417 F2)
  const specQueries = useProductSpecs(productId, platforms, canShop && !isNew);

  // Tab "Nội bộ" và một tab mỗi sàn có gian hàng đang hoạt động (bản phác trang-san-pham-tab/design/v2.html, chốt v2
  // câu 1, 2); tab đang mở ghi lên `?tab=` để gửi link được
  const shops = shopsQuery.data?.items ?? [];
  const tabPlatforms = !isNew && canShop ? platforms : [];
  const tab: ProductTabKey = tabFromParam(searchParams.get('tab'), tabPlatforms);
  // Tab sàn còn attribute sửa dở (PlatformTab báo lên), để hỏi lại khi rời tab/trang (FE#459)
  const [platformDirty, setPlatformDirty] = useState<Partial<Record<Marketplace, boolean>>>({});
  const onPlatformDirty = useCallback(
    (p: Marketplace, dirty: boolean) => setPlatformDirty((prev) => (Boolean(prev[p]) === dirty ? prev : { ...prev, [p]: dirty })),
    [],
  );
  const tabName = (t: string) => (t === 'commerio' ? 'Nội bộ' : platformLabel(t as Marketplace));
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
  // Ô dùng chung ở tab sàn hay hộp Cần xử lý: sang tab Nội bộ rồi cuộn, focus, nháy đúng ô sau khi tab hiện
  const [jump, setJump] = useState<{ shared: SharedTarget } | { id: string } | null>(null);
  const jumpTo = (target: SharedTarget) => {
    setTab('commerio');
    setJump({ shared: target });
  };
  useEffect(() => {
    if (tab !== 'commerio' || !jump) return;
    const id = 'id' in jump ? jump.id : sharedTargetId(jump.shared, (x) => document.getElementById(x) !== null);
    // Xoá `jump` trong cùng khung hình: xoá ngay thì effect chạy lại và huỷ khung hình trước khi kịp focus
    const frame = requestAnimationFrame(() => {
      focusField(id);
      setJump(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, jump]);
  // `?focus=<id>` (FE#462: nút sửa của lỗi đẩy, mục chặn): chờ ô hiện ở tab đang mở rồi cuộn, focus; xong thì xoá khỏi URL
  // để F5/Back không nhảy lại
  const focusParam = searchParams.get('focus');
  const productLoaded = Boolean(product);
  useEffect(() => {
    if (!focusParam || !productLoaded) return;
    return focusWhenReady(focusParam, () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('focus');
          return next;
        },
        { replace: true },
      ),
    );
  }, [focusParam, productLoaded, setSearchParams]);

  // Mẫu nhóm: form tạo đọc theo nhóm đang chọn; trang sửa chỉ đọc khi đổi sang nhóm khác (ngoài ra BE trả sẵn `specs`)
  const groupId = form.watch('groupId');
  const groupChanged = Boolean(product && groupId && groupId !== product.group.id);
  // Trang sửa cũng đọc mẫu: cần `version` để thêm thuộc tính vào danh mục và `allowedAttributes` (Documents/21 §5.6, §5.7)
  const templateQuery = useGroupTemplate(groupId || undefined);
  const template = templateQuery.data;
  // Thông tin vẽ của mọi thông số đã gặp, để giá trị của nhóm cũ vẫn hiện ở "Thông số khác" khi đổi nhóm
  const seenViews = useRef(new Map<string, SpecFieldView>());
  const templateViews = useMemo(() => {
    const views =
      isNew || groupChanged
        ? (template?.fields.map(viewFromTemplate) ?? [])
        : (product?.specs ?? []).filter((s) => s.inTemplate).map(viewFromProduct);
    return views;
  }, [isNew, groupChanged, template, product]);
  for (const v of [...templateViews, ...(product?.specs ?? []).map(viewFromProduct)]) seenViews.current.set(v.fieldId, v);
  const otherViews = [...seenViews.current.values()]
    .filter((v) => !templateViews.some((t) => t.fieldId === v.fieldId))
    .filter((v) => !isEmptySpec(specDrafts[v.fieldId]) || !isEmptySpec(specInitial[v.fieldId]))
    .map((v) => ({ ...v, inTemplate: false }));
  const allSpecViews = [...templateViews, ...otherViews];
  const setSpec = (fieldId: string, next: SpecDrafts[string]) => {
    setSpecDrafts((prev) => ({ ...prev, [fieldId]: next }));
    setSpecErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const { [fieldId]: _gone, ...rest } = prev;
      return rest;
    });
  };

  // Form tạo: chọn nhóm thì chọn sẵn trục chuẩn của mẫu, khi người dùng chưa gõ giá trị trục nào
  useEffect(() => {
    if (!isNew || !template) return;
    setDraft((prev) =>
      prev.axes.some((a) => a.values.length)
        ? prev
        : {
            ...prev,
            excluded: [],
            axes: template.axes.map((a) => ({ key: `tpl-${a.attributeId}`, attributeId: a.attributeId, name: a.name, values: [] })),
          },
    );
  }, [isNew, template]);

  // Nạp form một lần cho mỗi sản phẩm; refetch sau khi thêm biến thể không đè lên chỗ đang sửa
  const loadedId = useRef<string | null>(null);
  const load = (p: ProductDetail) => {
    reset({ name: p.name, groupId: p.group.id, description: p.description, originCountry: p.originCountry ?? '', brand: p.brand ?? '' });
    setImages(toImages(p));
    setSizeChart(p.sizeChart ? { fileId: p.sizeChart.fileId, url: p.sizeChart.url } : null);
    setVersion(p.version);
    const specs = draftsFromProduct(p.specs ?? []);
    setSpecDrafts(specs);
    setSpecInitial(specs);
    setSpecErrors({});
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

  // FE#463: khung "Tiếp theo" hiện theo `?created=1`; cuộn lên đầu và focus tiêu đề chỉ khi vừa chuyển tới từ form tạo
  // (PUSH/REPLACE kèm state), không khi Back/Forward hay tải lại (POP), một lần cho mỗi sản phẩm
  const justCreated = !isNew && searchParams.get('created') === '1';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const announcedId = useRef<string | null>(null);
  const arrivedId = navType !== 'POP' ? (location.state as ProductCreatedState | null)?.createdId : undefined;
  useEffect(() => {
    if (!product || arrivedId !== product.id || announcedId.current === product.id) return;
    announcedId.current = product.id;
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [arrivedId, product]);
  /** Gỡ `?created=1` (thay mục history hiện tại); `tab` kèm theo khi mở tab sàn từ khung, gộp một lần điều hướng */
  const closeCreated = (tabTo?: Marketplace) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('created');
        if (tabTo) next.set('tab', tabTo);
        return next;
      },
      { replace: true },
    );
  // Đã đăng lên sàn (bước cuối của khung) thì khung xong việc, gỡ cờ để Back/F5 không hiện lại. Chỉ tính trạng thái đã
  // lên sàn thật; đang đẩy, đẩy hỏng, bị từ chối thì khung vẫn hiện để làm lại
  const publishedAny = listingRows.some((r) => r.listing && PUBLISHED_STATUSES.has(r.listing.status));
  useEffect(() => {
    if (justCreated && publishedAny) closeCreated();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ theo hai cờ
  }, [justCreated, publishedAny]);
  // "Đăng sản phẩm" trong khung: gỡ cờ trên mục history của trang này trước, rồi mới sang trình đăng (hai điều hướng
  // liền nhau trong một lượt thì lượt sau huỷ lượt trước). setTimeout(navigate, 0) chỉ an toàn khi hai route này không có
  // loader/lazy (điều hướng xong ngay); thêm loader thì phải đợi lượt replace xong. Ref chặn bấm đúp tạo hai mục /publish
  const publishing = useRef(false);
  const publishFromCreated = (href: string) => {
    if (publishing.current) return;
    publishing.current = true;
    closeCreated();
    setTimeout(() => {
      navigate(href);
      publishing.current = false;
    }, 0);
  };

  /** Lỗi 422 của BE về đúng chỗ (AC-8) */
  const applyFieldErrors = (e: unknown) => {
    const fieldErrors = getProblem(e)?.errors;
    if (!fieldErrors) return false;
    (['name', 'groupId', 'description', 'originCountry', 'brand'] as const).forEach((f) => {
      if (fieldErrors[f]) setFieldError(f, { message: fieldErrors[f] });
    });
    setImagesError(fieldErrors.images);
    setSizeChartError(fieldErrors.sizeChart);
    setSpecErrors(specErrorsByField(fieldErrors, sentSpecs.current));
    // Lỗi trục phân loại theo nhóm (`axes.i.*`), lỗi `axes`/`variants` hiện dưới bảng
    const { byAxis, general } = axisServerErrors(fieldErrors, draft.axes.length);
    setAxisErrorsFromServer(byAxis);
    setVariantsError(general[0] ?? null);
    return true;
  };

  /** Mảng `specs` vừa gửi, để ghép lỗi `specs.<i>` về đúng thông số */
  const sentSpecs = useRef<ReturnType<typeof specInputs>>([]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setImagesError(undefined);
    setSizeChartError(undefined);
    setSpecErrors({});
    const imageFileIds = images.map((i) => i.fileId);
    const specs = isNew ? specInputs(allSpecViews, specDrafts) : specInputs(allSpecViews, specDrafts, specInitial);
    sentSpecs.current = specs;
    try {
      if (isNew) {
        setSubmitted(true);
        setAxisErrorsFromServer([]);
        const problem = draftError(draft);
        setVariantsError(problem);
        if (problem) return;
        // Xuất xứ, thương hiệu, thông số, giá và cân nặng từng variant điền ngay lúc tạo (Documents/21 §5.5)
        const { originCountry, brand, ...createValues } = values;
        const created = await createMut.mutateAsync({
          ...createValues,
          ...(originCountry && { originCountry }),
          ...(brand.trim() && { brand: brand.trim() }),
          ...(specs.length && { specs }),
          imageFileIds,
          ...(sizeChart && { sizeChartFileId: sizeChart.fileId }),
          ...draftBody(draft, attributes),
        });
        // FE#463: chuyển trang ngay khi POST xong (chi tiết đã ghi vào cache, ProductFormRoute giữ instance); ngưỡng tồn áp
        // sau ở nền, rồi mới báo một toast. Lỗi ngưỡng tồn thì sản phẩm vẫn tạo xong, mục "Ngưỡng tồn" còn ở thanh Còn thiếu
        // (Documents/29 bước 3)
        const minQty = parseMinQty(minQtyText);
        const done = `Đã tạo ${created.name} với ${created.variants.length} biến thể`;
        // Trang sửa bắt đầu như mount mới: bỏ nháp biến thể, ô ngưỡng tồn của form tạo
        setMinQtyText('');
        setDraft(emptyDraft);
        setSubmitted(false);
        const state: ProductCreatedState = { createdId: created.id };
        navigate(`${ROUTES.company.catalogProduct(companyId, created.id)}?created=1`, { replace: true, state });
        if (minQty !== null && created.variants.length) {
          try {
            const result = await bulkSave.mutateAsync(
              created.variants.map((v) => ({ variantId: v.id, version: v.version, reorderVersion: null, minQty })),
            );
            if (result.failed.length)
              toast.warning(`${done}. Chưa đặt được ngưỡng tồn cho ${result.failed.length} biến thể: ${result.failed[0].message}`);
            else toast.success(done);
          } catch (e) {
            toast.warning(`${done}. Chưa đặt được ngưỡng tồn: ${problemMessage(e)}`);
          }
        } else {
          toast.success(done);
        }
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
          ...(specs.length && { specs }),
          version,
        });
        load(saved);
        toast.success(`Đã lưu ${saved.name}`);
        if (nextAfterSave.current) {
          nextAfterSave.current = false;
          const next = await fetchNextIncompleteProduct(saved.id);
          // Tab Nội bộ vừa lưu nhưng state còn cũ trong lượt render này; tab sàn còn attribute chưa lưu thì vẫn hỏi
          if (!tabPlatforms.some((p) => platformDirty[p])) leave.allowNext();
          if (next) navigate(`${ROUTES.company.catalogProduct(companyId, next)}?from=incomplete`);
          else {
            toast.success('Đã hoàn thiện hết sản phẩm chờ hoàn thiện');
            backToList();
          }
        }
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

  // Hỏi lại khi rời trang hoặc rời tab mà còn chưa lưu (FE#459, cùng cách FE#319): nút "Lưu" ở tab Nội bộ, "Lưu
  // attribute {sàn}" ở tab sàn. Trang tạo mới không hỏi (chưa có gì để mất ngoài ô đang gõ)
  const internalDirty =
    !isNew &&
    (form.formState.isDirty ||
      JSON.stringify(specDrafts) !== JSON.stringify(specInitial) ||
      (product
        ? JSON.stringify(images.map((i) => i.fileId)) !== JSON.stringify(toImages(product).map((i) => i.fileId)) ||
          (sizeChart?.fileId ?? null) !== (product.sizeChart?.fileId ?? null)
        : false));
  const dirtyTabs = [...(internalDirty ? ['commerio'] : []), ...tabPlatforms.filter((p) => platformDirty[p])];
  const leave = useLeaveGuard(dirtyTabs.length > 0, {
    message: `Còn thay đổi chưa lưu ở tab ${dirtyTabs.map(tabName).join(', ')}. Rời trang thì các thay đổi này bị bỏ.`,
  });
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const requestTab = (next: string) => {
    if (next !== tab && dirtyTabs.includes(tab)) setPendingTab(next);
    else setTab(next);
  };

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={backToList}>
      <ArrowLeft />
      Về danh sách sản phẩm
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

  const busy = createMut.isPending || updateMut.isPending || bulkSave.isPending;
  const imagesBusy = uploading || chartUploading || axisUploading;
  const saveDisabled = busy || imagesBusy;
  const saveLabel = busy ? 'Đang lưu...' : imagesBusy ? 'Đang tải ảnh...' : isNew ? 'Tạo sản phẩm' : 'Lưu';
  const fromIncomplete = searchParams.get('from') === 'incomplete';
  // Danh mục mặc định đã tách (Documents/21 §5.7): gợi ý người dùng tự chọn danh mục hẹp hơn
  const currentGroup = groups.find((g) => g.id === groupId);
  // Đổi danh mục ở trang sửa: báo trước khi Lưu trục nào ngoài danh mục mới, thuộc tính nào sang "Thuộc tính khác" (FE#474)
  const groupNotice =
    product && groupChanged && template
      ? groupChangeNotice(liveAxes(product), template.allowedAttributes, movingSpecNames(otherViews, specDrafts, product.specs ?? []))
      : null;
  const groupNoticeLines = groupNotice ? [axesNoticeText(groupNotice.axes), movingNoticeText(groupNotice.moving)].filter(Boolean) : [];
  const saveAndNext = () => {
    nextAfterSave.current = true;
    void onSubmit().finally(() => {
      nextAfterSave.current = false;
    });
  };
  // Thanh "Còn thiếu" (Documents/29 bước 3): BE tính `missing` theo SKU; thuộc tính bắt buộc theo bản đang gõ
  const watched = form.watch();
  const missingInput = {
    variants: product?.variants,
    form: isNew ? { name: watched.name ?? '', groupId: watched.groupId ?? '', imageCount: images.length } : undefined,
    requiredSpecs: templateViews,
    specDrafts,
  };
  // Tên cũ ngắn hơn 25 ký tự: chỉ báo sau khi bấm Lưu (lỗi ở ô tên) và không chặn đăng, thao tác không lưu tên
  const missing = missingItems({ ...missingInput, nameInvalid: !isNew && Boolean(form.formState.errors.name) });
  const publishMissing = missingForPublish(missingInput);
  const specsDirty = JSON.stringify(specDrafts) !== JSON.stringify(specInitial);
  const imagesDirty = product ? JSON.stringify(images.map((i) => i.fileId)) !== JSON.stringify(toImages(product).map((i) => i.fileId)) : false;
  const blocker = publishBlocker({
    isNew,
    archived,
    canPublish: can(PERMISSIONS.listingManage),
    missing: publishMissing.map((m) => (m.skuCount ? `${m.label} (${m.skuCount} SKU)` : m.label)),
    dirty: form.formState.isDirty || specsDirty || imagesDirty,
  });
  // Hộp "Cần xử lý" đầu trang (chốt v2 câu 7): mỗi lỗi chặn một nút tới đúng chỗ sửa; vẫn báo tại chỗ
  const attention = product && !isNew ? attentionItems({ missing, variants: product.variants, rows: listingRows, platformName: platformLabel }) : [];
  const onAttention = (a: AttentionAction) => {
    if (a.kind === 'sku') setSpecVariantId(a.variantId);
    else if (a.kind === 'fee') navigate(ROUTES.company.financeConfigs(companyId));
    else if (a.kind === 'tab') setTab(a.platform);
    else {
      setTab('commerio');
      setJump({ id: a.target });
    }
  };
  // Xoá hẳn chỉ khi mọi SKU Chờ hoàn thiện (§17.2); BE kiểm thêm chứng từ, listing và trả 409 product_in_use
  const deletable = Boolean(product && canManage && product.variants.every((v) => v.readiness === 'incomplete'));
  const removeProduct = async () => {
    if (!product) return;
    try {
      await deleteMut.mutateAsync({ id: product.id, version: product.version });
      toast.success(`Đã xoá ${product.name}`);
      leave.allowNext();
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
          titleRef={titleRef}
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
                {!readOnly && (
                  <Button type="submit" form="product-form" className="lg:hidden" disabled={saveDisabled}>
                    {saveLabel}
                  </Button>
                )}
              </div>
            )
          }
        />

        {justCreated && product && (
          <CreatedNextSteps
            product={product}
            shops={canShop ? shops : null}
            shopsLoading={shopsQuery.isLoading}
            onOpenSku={canManage && !archived ? setSpecVariantId : null}
            onOpenTab={(p) => closeCreated(p)}
            publishHref={!blocker ? ROUTES.company.productPublish(companyId, product.id) : null}
            onPublish={publishFromCreated}
            publishBlocker={blocker}
            onClose={() => closeCreated()}
          />
        )}

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
            <Kpi label="Danh mục sản phẩm" value={<span className="text-lg">{product.group.name}</span>} />
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

        {product && !isNew && (
          <NeedsAttentionBox items={attention} product={product} platforms={tabPlatforms} shops={shops} onAction={onAttention} />
        )}

        <Tabs value={tab} onValueChange={requestTab} className="gap-4">
          {/* Giữ chỗ dải tab sàn khi gian hàng đang tải, để trang không nhảy (FE#463). Tải xong mà không có sàn nào hoạt
              động thì dải tab không hiện, trang vẫn co lại ~36px: chấp nhận, hiếm khi người tạo sản phẩm chưa có gian hàng */}
          {product && canShop && shopsQuery.isLoading && <Skeleton className="h-9 w-64" data-testid="platform-tabs-placeholder" />}
          {product && tabPlatforms.length > 0 && (
            <div className="max-w-full overflow-x-auto">
              <TabsList aria-label="Nơi bán">
                <TabsTrigger value="commerio">Nội bộ</TabsTrigger>
                {tabPlatforms.map((p) => (
                  <TabsTrigger key={p} value={p}>
                    <PlatformTabLabel product={product} platform={p} shops={shops} />
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}
          <TabsContent value="commerio" forceMount className="data-[state=inactive]:hidden">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
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
                  counter={productNameCounter(watched.name ?? '')}
                />
              </div>
              <FormField
                control={control}
                name="groupId"
                render={({ field }) => (
                  <FormItem id={GROUP_FIELD_ID} className="rounded-md">
                    <FormLabel>Danh mục sản phẩm</FormLabel>
                    <FormControl
                      aria-describedby={
                        [
                          currentGroup?.splitInto?.length && !readOnly && 'group-split-note',
                          groupNoticeLines.length > 0 && !readOnly && 'group-change-note',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
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
                    {/* Danh mục mặc định đã tách (Documents/21 §5.7): gợi ý ngay tại ô, không chiếm đầu trang (FE#464) */}
                    {currentGroup?.splitInto?.length && !readOnly ? (
                      <p id="group-split-note" className="text-sm text-info-text" data-testid="group-split-note">
                        Danh mục {currentGroup.renamedFrom ?? currentGroup.name} đã tách thành{' '}
                        {currentGroup.splitInto.map((g) => g.name).join(', ')}. Chọn danh mục hẹp hơn rồi Lưu.
                      </p>
                    ) : !form.formState.errors.groupId && !readOnly ? (
                      <FormDescription>Quyết định thuộc tính sản phẩm cần điền và biến thể gợi ý. Mã SKU tạo theo mẫu ở Cài đặt sản phẩm.</FormDescription>
                    ) : null}
                    {groupNoticeLines.length > 0 && !readOnly && (
                      <div id="group-change-note" className="grid gap-0.5 text-sm text-info-text" data-testid="group-change-note">
                        {groupNoticeLines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
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
                        <FormDescription>Dùng cho mọi sàn. Nhiều category trên sàn bắt buộc có xuất xứ.</FormDescription>
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
                        <FormDescription>Để trống thì sản phẩm đăng lên sàn là không thương hiệu.</FormDescription>
                        <FormMessage />
                        {remoteLines('brand', field.value)}
                      </FormItem>
                    )}
                  />
              </CardContent>
            </Card>

          <ProductSpecsCard
            groupName={groups.find((g) => g.id === groupId)?.name ?? (groupId ? (product?.group.name ?? null) : null)}
            templateViews={templateViews}
            otherViews={otherViews}
            drafts={specDrafts}
            onChange={setSpec}
            errors={specErrors}
            readOnly={readOnly}
            loading={(isNew || groupChanged) && templateQuery.isLoading}
            templateLink={can(PERMISSIONS.catalogSetup) && groupId ? ROUTES.company.catalogCategory(companyId, groupId) : null}
            onAddField={can(PERMISSIONS.catalogSetup) && template ? () => setAddingField(true) : undefined}
          />

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
                  content="Sàn bắt buộc với quần áo, giày dép. Thiếu ảnh này thì sàn từ chối khi đăng bán."
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
              <CardTitle>Biến thể (SKU)</CardTitle>
              {!isNew && !readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus />
                  Thêm biến thể
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
                  withFacts
                  allowed={
                    // Danh sách rỗng: danh mục chưa giới hạn, hiện mọi thuộc tính, không cảnh báo (Documents#230)
                    template?.allowedAttributes?.length
                      ? {
                          ids: template.allowedAttributes.map((a) => a.attributeId),
                          groupName: groups.find((g) => g.id === groupId)?.name ?? '',
                        }
                      : undefined
                  }
                  onImagesBusyChange={setAxisUploading}
                />
              ) : (
                <div className="grid gap-2">
                  <div className="overflow-x-auto rounded-md border">
                    <Table data-testid="variants">
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Thuộc tính biến thể</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          {canStock && <TableHead className="text-right">Có thể bán</TableHead>}
                          {canStock && canCost && <TableHead className="text-right">Giá vốn BQ</TableHead>}
                          <TableHead className="text-right">Giá chuẩn</TableHead>
                          <TableHead className="text-right">Giá muốn thực nhận</TableHead>
                          <TableHead className="text-right">Ngưỡng tồn</TableHead>
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
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap tabular-nums" data-testid="variant-target-price">
                              {priceText(v.targetNetPrice)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap tabular-nums" data-testid="variant-min-qty">
                              {v.minQty === null ? '—' : formatQty(v.minQty)}
                            </TableCell>
                            <TableCell data-testid="variant-readiness">
                              {v.businessStatus === 'archived' ? null : v.readiness === undefined ? (
                                NOT_COMPUTED
                              ) : v.readiness === 'ready' ? (
                                <span className="text-muted-foreground">Sẵn sàng</span>
                              ) : (
                                <Badge variant="warning" title={`Thiếu: ${missingText(v)}`}>
                                  Chờ hoàn thiện
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
                                    title="Giá chuẩn, giá muốn thực nhận, cân nặng, kích thước gói, ngưỡng tồn"
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

          <ProductMinQtyCard value={minQtyText} onChange={setMinQtyText} product={product} readOnly={readOnly} />
        </div>
        </form>
          </div>
          {!readOnly ? (
            <ProductCompletionRail
              items={missing}
              isNew={isNew}
              saveLabel={saveLabel}
              saveDisabled={saveDisabled}
              onSaveNext={fromIncomplete && !isNew ? () => void saveAndNext() : undefined}
              publishHref={product && !blocker ? ROUTES.company.productPublish(companyId, product.id) : null}
              publishBlocker={blocker}
            />
          ) : null}
        </div>
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
                  onDirtyChange={onPlatformDirty}
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
        {leave.dialog}
        <ConfirmDialog
          open={pendingTab !== null}
          title="Chuyển tab khi chưa lưu?"
          message={`Tab ${tabName(tab)} còn thay đổi chưa lưu. Chuyển tab vẫn giữ nguyên phần đang sửa để quay lại lưu; rời trang thì mất.`}
          confirmLabel="Chuyển tab"
          cancelLabel="Ở lại"
          onConfirm={() => {
            if (pendingTab) setTab(pendingTab);
            setPendingTab(null);
          }}
          onClose={() => setPendingTab(null)}
        />
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
      {template && (
        <SpecFieldDialog
          open={addingField}
          field={null}
          attachTo={{ groupId, groupName: groups.find((g) => g.id === groupId)?.name ?? '', version: template.version }}
          onClose={() => setAddingField(false)}
          onDone={(message) => {
            setAddingField(false);
            toast.success(message);
          }}
        />
      )}
      {product && (
        <VariantSpecDialog
          productId={product.id}
          variant={specVariant}
          siblings={product.variants}
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
