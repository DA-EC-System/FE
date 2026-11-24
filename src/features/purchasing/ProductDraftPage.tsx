import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EditableGrid, type EditableGridApi, type GridColumn, type SaveResult } from '@/components/common/EditableGrid';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useGroupTemplate } from '@/api/catalog.api';
import { useProductDraft, useSaveProductDraft } from '@/api/purchasing.api';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { MISSING_LABELS, type VariantMissing } from '@/types/catalog';
import type { ProductDraft, ProductDraftInput, VariantFactKey } from '@/types/purchasing';
import { formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissions';
import { ProductImagesField, type ImageItem } from '@/features/catalog/ProductImagesField';
import { SizeChartField } from '@/features/catalog/SizeChartField';
import { CountryCombobox } from '@/features/catalog/CountryCombobox';
import { ValueImage } from '@/features/catalog/AxisImagesField';
import { ProductSpecsCard } from '@/features/catalog/specs/ProductSpecsCard';
import { specErrorsByField, specInputs, viewFromTemplate, type SpecDrafts } from '@/features/catalog/specs/specValues';
import { PageError, PageLoading, beforeUnloadGuard } from './parts';
import {
  EMPTY_FACTS,
  FACT_LABELS,
  axesOf,
  axisValues,
  changedFacts,
  draftFieldErrors,
  editableVariantIndexes,
  factsDraft,
  parseFact,
  parseFacts,
  requestClosed,
  specDraftsOf,
  variantLabel,
  type FactsDraft,
} from './productDraft';

interface DraftForm {
  description: string;
  brand: string;
  originCountry: string;
  images: ImageItem[];
  sizeChart: ImageItem | null;
  specs: SpecDrafts;
  imageAxis: string | null;
  /** khoá `${axis}\u0000${value}` */
  optionImages: Record<string, ImageItem>;
  defaults: FactsDraft;
  variants: FactsDraft[];
}

const imageKey = (axis: string, value: string) => `${axis}\u0000${value}`;

const toForm = (d: ProductDraft): DraftForm => ({
  description: d.description,
  brand: d.brand ?? '',
  originCountry: d.originCountry ?? '',
  images: d.images,
  sizeChart: d.sizeChart,
  specs: specDraftsOf(d.specs),
  imageAxis: d.imageAxis,
  optionImages: Object.fromEntries(d.optionImages.map((o) => [imageKey(o.axis, o.value), { fileId: o.fileId, url: o.url }])),
  defaults: factsDraft(d.variantDefaults),
  variants: d.variants.map(factsDraft),
});

/** Dòng của bảng Biến thể: `index` null là dòng "Mọi biến thể", còn lại là chỉ số trong `draft.variants` */
interface VariantRow {
  id: string;
  index: number | null;
}

/** Cột số của bảng Biến thể (FE#476: mỗi ô một số nên Dài, Rộng, Cao tách cột) */
const FACT_COLUMNS: { key: VariantFactKey; header: string }[] = [
  { key: 'targetNetPrice', header: 'Giá muốn thực nhận (đ)' },
  { key: 'standardPrice', header: 'Giá chuẩn (đ)' },
  { key: 'weightG', header: 'Cân nặng (g)' },
  { key: 'lengthMm', header: 'Dài (mm)' },
  { key: 'widthMm', header: 'Rộng (mm)' },
  { key: 'heightMm', header: 'Cao (mm)' },
  { key: 'minQty', header: 'Ngưỡng tồn' },
];

/** "150000" → "150.000"; chữ khác giữ nguyên */
const showFact = (v: string) => (/^\d+$/.test(v) ? Number(v).toLocaleString('vi-VN') : v);

/**
 * Soạn trước sản phẩm mới (Documents/29 bước 1; Documents/21 §16.3 "Bản soạn trước"; bản phác
 * `.claude/issues/luong-san-pham/design/soan-truoc-va-phieu-nhap-kho.html` màn 2, Thành duyệt 21/11/2026). Sản phẩm chưa
 * có trong danh sách: nhập kho mới tạo, nội dung ở đây được chép sang. Trang riêng, không phải hộp thoại (chốt câu 2).
 */
export function ProductDraftPage() {
  const navigate = useNavigate();
  const { draftId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canEdit = can(PERMISSIONS.purchaseRequestManage) || can(PERMISSIONS.productManage);
  const canMinQty = can(PERMISSIONS.reorderManage);

  const query = useProductDraft(draftId);
  const draft = query.data;
  useBreadcrumb(draft?.parentName);
  const templateQuery = useGroupTemplate(draft?.groupId ?? undefined);
  const saveMut = useSaveProductDraft();

  const [form, setForm] = useState<DraftForm | null>(null);
  const [dirty, setDirty] = useState(false);
  /** Bảng Biến thể còn ô chữ sai chưa vào bản soạn: tính là còn thay đổi, chặn Lưu bản soạn */
  const [gridInvalid, setGridInvalid] = useState(false);
  const gridRef = useRef<EditableGridApi>(null);
  const unsaved = dirty || gridInvalid;
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ severity: 'error' | 'warning'; msg: string; reload?: boolean } | null>(null);
  /** Đổi khi nạp lại form (Huỷ, lưu xong, tải lại): dựng lại bảng Biến thể để bỏ trạng thái lưu, lỗi cũ trên ô */
  const [formKey, setFormKey] = useState(0);
  const loaded = useRef<string | null>(null);

  const load = (d: ProductDraft) => {
    loaded.current = `${d.id}:${d.version}`;
    setFormKey((k) => k + 1);
    setForm(toForm(d));
    setDirty(false);
    setErrors({});
  };

  useEffect(() => {
    if (draft && loaded.current === null) load(draft);
  }, [draft]);

  const closed = draft ? requestClosed(draft.requestStatus) : false;
  const created = Boolean(draft?.productId);
  const productEditable = canEdit && !closed && !created;
  const anyEditable = canEdit && !closed && Boolean(draft?.variants.some((v) => v.variantId === null));
  const busy = saveMut.isPending || uploading > 0;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => beforeUnloadGuard(unsaved), [unsaved]);

  const templateViews = useMemo(() => templateQuery.data?.fields.map(viewFromTemplate) ?? [], [templateQuery.data]);
  const axes = draft ? axesOf(draft.variants) : [];

  const patch = (p: Partial<DraftForm>) => {
    setForm((f) => (f ? { ...f, ...p } : f));
    setDirty(true);
  };
  const onBusy = (b: boolean) => setUploading((n) => Math.max(0, n + (b ? 1 : -1)));

  const back = () =>
    draft && can(PERMISSIONS.purchaseRequestManage)
      ? navigate(ROUTES.company.purchaseRequest(companyId, draft.requestId))
      : navigate(ROUTES.company.productDrafts(companyId));

  if (query.isError) return <PageError message={getErrorMessage(query.error)} onBack={back} />;
  if (!draft || !form) return <PageLoading />;

  const save = async () => {
    setNotice(null);
    // Chữ sai trên bảng chưa vào bản soạn: lưu lúc này là gửi số cũ mà không báo (review PR #481)
    const bad = gridRef.current?.firstInvalid();
    if (bad) {
      setNotice({ severity: 'error', msg: 'Có ô số chưa đúng. Xem các ô báo đỏ.' });
      gridRef.current?.focusCell(bad.rowId, bad.columnId, { edit: true });
      return;
    }
    const fieldErrors: Record<string, string> = {};
    const defaults = parseFacts(form.defaults, { withMinQty: canMinQty });
    for (const [k, m] of Object.entries(defaults.errors)) fieldErrors[`variantDefaults.${k}`] = m;
    // PUT gộp theo ô (Documents/21 §16.3, Documents#236): chỉ gửi trường, ô đã đổi; ô vắng là giữ, null là xoá
    const variantRows = editableVariantIndexes(draft).flatMap((i) => {
      const parsed = parseFacts(form.variants[i] ?? EMPTY_FACTS, { withMinQty: canMinQty });
      for (const [k, m] of Object.entries(parsed.errors)) fieldErrors[`variants.${i}.${k}`] = m;
      const changed = changedFacts(parsed.value, draft.variants[i]!);
      return changed ? [{ i, body: { optionValues: draft.variants[i]!.optionValues, ...changed } }] : [];
    });
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      setNotice({ severity: 'error', msg: 'Có ô số chưa đúng. Xem các ô báo đỏ.' });
      return;
    }
    const sent = variantRows.map((v) => v.i);
    const body: ProductDraftInput = { version: draft.version };
    if (variantRows.length) body.variants = variantRows.map((v) => v.body);
    const init = toForm(draft);
    const specs = productEditable ? specInputs(templateViews, form.specs, init.specs) : [];
    if (productEditable) {
      if (form.description !== init.description) body.description = form.description;
      if (form.brand.trim() !== init.brand) body.brand = form.brand.trim() || null;
      if (form.originCountry !== init.originCountry) body.originCountry = form.originCountry || null;
      const ids = form.images.map((i) => i.fileId);
      if (ids.join() !== init.images.map((i) => i.fileId).join()) body.imageFileIds = ids;
      if ((form.sizeChart?.fileId ?? null) !== (init.sizeChart?.fileId ?? null)) body.sizeChartFileId = form.sizeChart?.fileId ?? null;
      if (specs.length) body.specs = specs;
      const optionImages = form.imageAxis
        ? axisValues(draft.variants, form.imageAxis).flatMap((value) => {
            const img = form.optionImages[imageKey(form.imageAxis!, value)];
            return img ? [{ axis: form.imageAxis!, value, fileId: img.fileId }] : [];
          })
        : [];
      const initImages = draft.optionImages.map((o) => `${o.axis}:${o.value}:${o.fileId}`).join();
      if (form.imageAxis !== init.imageAxis || optionImages.map((o) => `${o.axis}:${o.value}:${o.fileId}`).join() !== initImages) {
        body.imageAxis = form.imageAxis;
        body.optionImages = optionImages;
      }
      const defaultsChanged = changedFacts(defaults.value, draft.variantDefaults);
      if (defaultsChanged) body.variantDefaults = defaultsChanged;
    }
    try {
      const next = await saveMut.mutateAsync({ id: draft.id, ...body });
      load(next);
      toast.success(`Đã lưu bản soạn ${next.parentName}`);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict') {
        setNotice({ severity: 'warning', msg: 'Có người vừa sửa bản soạn này. Tải lại để xem bản mới rồi sửa tiếp.', reload: true });
        return;
      }
      if (problem?.code === 'draft_closed') {
        loaded.current = null;
        void query.refetch();
      }
      const mapped = draftFieldErrors(problem?.errors ?? {}, sent);
      setErrors({ ...mapped, ...prefixed(specErrorsByField(problem?.errors ?? {}, specs), 'spec.') });
      setNotice({
        severity: 'error',
        msg: Object.keys(mapped).length ? `${problem?.title ?? 'Dữ liệu không hợp lệ'}. Xem các ô báo đỏ.` : problemMessage(e),
      });
    }
  };

  const reload = async () => {
    setNotice(null);
    loaded.current = null;
    const { data } = await query.refetch();
    if (data) load(data);
  };

  const missing = draft.readiness.missing.map((m) => MISSING_LABELS[m as VariantMissing] ?? m);
  const factsOf = (r: VariantRow) => (r.index === null ? form.defaults : (form.variants[r.index] ?? EMPTY_FACTS));
  const errorKey = (r: VariantRow, key: string) => (r.index === null ? `variantDefaults.${key}` : `variants.${r.index}.${key}`);
  const rowReadOnly = (r: VariantRow): string | false => {
    if (saveMut.isPending) return 'Đang lưu bản soạn';
    if (closed) return 'Đề nghị nhập hàng đã kết thúc';
    if (r.index === null) return productEditable ? false : 'Sản phẩm đã tạo khi nhập kho. Sửa ở trang sản phẩm.';
    return draft.variants[r.index]!.variantId === null ? false : 'Đã tạo khi nhập kho. Sửa ở trang sản phẩm.';
  };

  /** Ô sửa ghi vào bản soạn trên trang, không gọi API theo ô; bấm Lưu bản soạn mới gửi (FE#476) */
  const saveFact = async (r: VariantRow, columnId: string, value: unknown): Promise<SaveResult<number>> => {
    const key = columnId as VariantFactKey;
    const text = value === null || value === undefined ? '' : String(value);
    setForm((f) => {
      if (!f) return f;
      if (r.index === null) return { ...f, defaults: { ...f.defaults, [key]: text } };
      return { ...f, variants: f.variants.map((v, i) => (i === r.index ? { ...v, [key]: text } : v)) };
    });
    setDirty(true);
    const errKey = errorKey(r, key);
    setErrors((e) => {
      if (!(errKey in e)) return e;
      const next = { ...e };
      delete next[errKey];
      return next;
    });
    return { ok: true, version: 0 };
  };

  const variantRows: VariantRow[] = [{ id: 'defaults', index: null }, ...draft.variants.map((_, i) => ({ id: `v${i}`, index: i }))];
  const variantColumns: GridColumn<VariantRow>[] = [
    {
      id: 'variant',
      header: 'Biến thể',
      sticky: true,
      className: 'min-w-48',
      render: (r) => {
        if (r.index === null) {
          return (
            <div className="whitespace-normal">
              <p className="font-medium">Mọi biến thể</p>
              <p className="text-xs text-muted-foreground">Ô trống ở dòng dưới lấy số này</p>
            </div>
          );
        }
        const v = draft.variants[r.index]!;
        const rowErr = errors[`variants.${r.index}`];
        return (
          <div className="whitespace-normal">
            <p className="font-medium">{variantLabel(v.optionValues)}</p>
            {v.variantId !== null && <p className="text-xs text-muted-foreground">Đã tạo khi nhập kho. Sửa ở trang sản phẩm.</p>}
            {v.variantId === null && created && <p className="text-xs text-muted-foreground">Chưa về hàng, vẫn sửa được</p>}
            {rowErr && <p className="text-xs text-destructive-text">{rowErr}</p>}
          </div>
        );
      },
    },
    ...FACT_COLUMNS.map(
      ({ key, header }): GridColumn<VariantRow> => ({
        id: key,
        header,
        label: FACT_LABELS[key],
        numeric: true,
        className: key === 'targetNetPrice' || key === 'standardPrice' ? 'min-w-32' : 'min-w-24',
        render: (r) => {
          const v = factsOf(r)[key].trim();
          if (v) return showFact(v);
          // Ô trống của biến thể lấy số ở dòng Mọi biến thể
          const fallback = r.index === null ? '' : form.defaults[key].trim();
          return fallback ? (
            <span className="text-muted-foreground" title="Theo dòng Mọi biến thể">
              {showFact(fallback)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
        edit: {
          raw: (r) => factsOf(r)[key],
          parse: (raw) => parseFact(key, raw),
          readOnly: (r) => rowReadOnly(r) || (key === 'minQty' && !canMinQty ? 'Cần quyền chỉnh ngưỡng tồn' : false),
        },
      }),
    ),
    {
      id: 'sku',
      header: 'SKU',
      render: (r) =>
        r.index === null ? null : draft.variants[r.index]!.variantId ? (
          <Badge variant="outline">Đã tạo</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Chưa có</span>
        ),
    },
  ];

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={back}>
        <ArrowLeft />
        {can(PERMISSIONS.purchaseRequestManage) ? `Đề nghị nhập hàng ${draft.requestNumber}` : 'Hàng mới sắp về cần soạn'}
      </Button>
      <PageHeader
        title={`Soạn trước sản phẩm mới: ${draft.parentName}`}
        subtitle={[
          `Từ Đề nghị nhập hàng ${draft.requestNumber}`,
          `NCC ${draft.supplierName}`,
          draft.expectedDeliveryDate ? `Ngày hẹn giao ${formatDate(draft.expectedDeliveryDate)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        help="Soạn trước ảnh, mô tả, thuộc tính sản phẩm trong lúc chờ hàng về. Khi nhập kho, sản phẩm và các biến thể có hàng về được tạo, nội dung ở đây được chép sang."
        action={
          anyEditable ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!unsaved || busy} onClick={() => load(draft)}>
                Huỷ
              </Button>
              <Button disabled={!unsaved || busy} onClick={() => void save()}>
                <Save />
                {saveMut.isPending ? 'Đang lưu…' : 'Lưu bản soạn'}
              </Button>
            </div>
          ) : undefined
        }
      />

      {notice && (
        <AlertMessage severity={notice.severity} className="mb-4" onClose={() => setNotice(null)}>
          {notice.msg}
          {notice.reload && (
            <Button variant="outline" size="sm" className="ms-2" onClick={() => void reload()}>
              Tải lại
            </Button>
          )}
        </AlertMessage>
      )}
      {closed ? (
        <AlertMessage severity="info" className="mb-4">
          Đề nghị nhập hàng đã kết thúc, không sửa bản soạn được nữa.
        </AlertMessage>
      ) : created ? (
        <AlertMessage severity="info" className="mb-4">
          Sản phẩm đã được tạo khi nhập kho. Thông tin sản phẩm, ảnh, thuộc tính sửa ở trang sản phẩm; biến thể chưa về hàng
          vẫn sửa được ở đây.{' '}
          <Link
            to={ROUTES.company.catalogProduct(companyId, draft.productId!)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Mở trang sản phẩm
          </Link>
        </AlertMessage>
      ) : (
        <AlertMessage severity="info" className="mb-4">
          Chưa có sản phẩm trong danh sách sản phẩm. Khi nhập kho, sản phẩm và các biến thể có hàng về được tạo, nội dung ở đây
          được chép sang.
        </AlertMessage>
      )}
      {!created && (
        <p className="mb-4 text-sm">
          {missing.length ? (
            <>
              <span className="font-medium">Còn thiếu:</span> {missing.join(', ')}.{' '}
            </>
          ) : (
            <span className="font-medium text-success-text">Đủ thông tin. </span>
          )}
          <span className="text-muted-foreground">
            Không bắt buộc soạn đủ. Thiếu thì sau khi nhập kho sản phẩm hiện Chờ hoàn thiện.
          </span>
        </p>
      )}

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin sản phẩm</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="draft-name">Tên sản phẩm</Label>
              <Input id="draft-name" value={draft.parentName} disabled />
              <p className="text-xs text-muted-foreground">Đổi tên trên đề nghị khi đề nghị còn nháp.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="draft-group">Danh mục sản phẩm</Label>
              <Input id="draft-group" value={draft.groupName} disabled />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="draft-brand">Thương hiệu</Label>
              <Input
                id="draft-brand"
                value={form.brand}
                maxLength={100}
                disabled={!productEditable}
                aria-invalid={Boolean(errors.brand)}
                onChange={(e) => patch({ brand: e.target.value })}
              />
              {errors.brand && <p className="text-xs text-destructive">{errors.brand}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="draft-origin">Xuất xứ</Label>
              <CountryCombobox
                id="draft-origin"
                value={form.originCountry}
                disabled={!productEditable}
                invalid={Boolean(errors.originCountry)}
                onChange={(code) => patch({ originCountry: code })}
              />
              {errors.originCountry && <p className="text-xs text-destructive">{errors.originCountry}</p>}
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="draft-description">Mô tả</Label>
              <Textarea
                id="draft-description"
                rows={4}
                maxLength={5000}
                value={form.description}
                disabled={!productEditable}
                aria-invalid={Boolean(errors.description)}
                onChange={(e) => patch({ description: e.target.value })}
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ảnh sản phẩm</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ProductImagesField
              value={form.images}
              onChange={(images) => patch({ images })}
              onBusyChange={onBusy}
              disabled={!productEditable}
              error={errors.imageFileIds}
            />
            <div className="grid gap-1.5">
              <Label>Bảng kích cỡ</Label>
              <SizeChartField
                value={form.sizeChart}
                onChange={(sizeChart) => patch({ sizeChart })}
                onBusyChange={onBusy}
                disabled={!productEditable}
                error={errors.sizeChartFileId}
              />
            </div>
          </CardContent>
        </Card>

        <ProductSpecsCard
          groupName={draft.groupId ? draft.groupName : null}
          templateViews={templateViews}
          otherViews={[]}
          drafts={form.specs}
          onChange={(fieldId, d) => patch({ specs: { ...form.specs, [fieldId]: d } })}
          errors={unprefixed(errors, 'spec.')}
          readOnly={!productEditable}
          loading={templateQuery.isLoading}
          templateLink={null}
        />

        <Card>
          <CardHeader>
            <CardTitle>Biến thể</CardTitle>
            <p className="text-sm text-muted-foreground">
              {axes.length ? `Biến thể theo: ${axes.join(', ')}` : 'Sản phẩm không có biến thể'} · {draft.variants.length} biến thể
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {axes.length > 0 && (
              <div className="grid gap-2">
                <Label>Ảnh theo giá trị thuộc tính</Label>
                <RadioGroup
                  value={form.imageAxis ?? ''}
                  onValueChange={(v) => patch({ imageAxis: v || null })}
                  className="flex flex-wrap gap-4"
                  disabled={!productEditable}
                >
                  {['', ...axes].map((a) => (
                    <label key={a || 'none'} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={a} aria-label={a || 'Không dùng'} />
                      {a || 'Không dùng'}
                    </label>
                  ))}
                </RadioGroup>
                {form.imageAxis && (
                  <div className="flex flex-wrap gap-3">
                    {axisValues(draft.variants, form.imageAxis).map((value) => {
                      const key = imageKey(form.imageAxis!, value);
                      return productEditable ? (
                        <ValueImage
                          key={key}
                          label={value}
                          image={form.optionImages[key]}
                          onBusyChange={onBusy}
                          onChange={(img) => {
                            const next = { ...form.optionImages };
                            if (img) next[key] = img;
                            else delete next[key];
                            patch({ optionImages: next });
                          }}
                        />
                      ) : (
                        <div key={key} className="grid w-24 gap-1 text-center text-xs">
                          {form.optionImages[key] ? (
                            <img src={form.optionImages[key].url} alt={`Ảnh ${value}`} className="size-24 rounded-md border object-cover" />
                          ) : (
                            <span className="grid size-24 place-items-center rounded-md border text-muted-foreground">Chưa có ảnh</span>
                          )}
                          {value}
                        </div>
                      );
                    })}
                  </div>
                )}
                {errors.optionImages && <p className="text-xs text-destructive">{errors.optionImages}</p>}
              </div>
            )}

            <div className="overflow-hidden rounded-md border" data-testid="draft-variants">
              <EditableGrid
                key={formKey}
                apiRef={gridRef}
                onInvalidChange={setGridInvalid}
                gridId="purchasing-product-draft-variants"
                aria-label="Biến thể"
                columns={variantColumns}
                rows={variantRows}
                getRowId={(r) => r.id}
                rowLabel={(r) => (r.index === null ? 'mọi biến thể' : variantLabel(draft.variants[r.index]!.optionValues))}
                getVersion={() => 0}
                save={saveFact}
                canEdit={anyEditable}
                cellError={(r, columnId) => errors[errorKey(r, columnId)]}
                rowClassName={(r) => (r.index === null ? 'bg-muted/40' : undefined)}
              />
            </div>
            {!canMinQty && anyEditable && (
              <p className="text-xs text-muted-foreground">Ngưỡng tồn cần quyền chỉnh ngưỡng tồn; bạn chưa có quyền này nên ô bị khoá.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message="Nội dung bản soạn chưa lưu sẽ bị bỏ."
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

const prefixed = (errs: Record<string, string>, p: string) => Object.fromEntries(Object.entries(errs).map(([k, v]) => [p + k, v]));
const unprefixed = (errs: Record<string, string>, p: string) =>
  Object.fromEntries(Object.entries(errs).flatMap(([k, v]) => (k.startsWith(p) ? [[k.slice(p.length), v]] : [])));
