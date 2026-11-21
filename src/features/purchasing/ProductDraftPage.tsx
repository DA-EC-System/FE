import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useGroupTemplate } from '@/api/catalog.api';
import { useProductDraft, useSaveProductDraft } from '@/api/purchasing.api';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useCan } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
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

/** Cột số trên bảng Biến thể; Dài × Rộng × Cao gộp một cột như bản phác */
const SIZE_KEYS: VariantFactKey[] = ['lengthMm', 'widthMm', 'heightMm'];

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
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ severity: 'error' | 'warning'; msg: string; reload?: boolean } | null>(null);
  const loaded = useRef<string | null>(null);

  const load = (d: ProductDraft) => {
    loaded.current = `${d.id}:${d.version}`;
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

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => beforeUnloadGuard(dirty), [dirty]);

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
  const factCell = (row: 'defaults' | number, key: VariantFactKey, editable: boolean) => {
    const values = row === 'defaults' ? form.defaults : (form.variants[row] ?? EMPTY_FACTS);
    const errKey = row === 'defaults' ? `variantDefaults.${key}` : `variants.${row}.${key}`;
    const err = errors[errKey];
    const lockedMinQty = key === 'minQty' && !canMinQty;
    const rowName = row === 'defaults' ? 'mọi biến thể' : variantLabel(draft.variants[row]!.optionValues);
    return (
      <div className="grid gap-1">
        <Input
          value={values[key]}
          inputMode="numeric"
          aria-label={`${FACT_LABELS[key]} ${rowName}`}
          aria-invalid={Boolean(err)}
          disabled={!editable || lockedMinQty || busy}
          title={lockedMinQty ? 'Cần quyền chỉnh ngưỡng tồn' : undefined}
          placeholder={row === 'defaults' ? '' : form.defaults[key]}
          className="h-8 w-24 text-right"
          onChange={(e) => {
            const next = { ...values, [key]: e.target.value };
            if (row === 'defaults') patch({ defaults: next });
            else patch({ variants: form.variants.map((v, i) => (i === row ? next : v)) });
          }}
        />
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  };

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
              <Button variant="outline" disabled={!dirty || busy} onClick={() => load(draft)}>
                Huỷ
              </Button>
              <Button disabled={!dirty || busy} onClick={() => void save()}>
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

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Biến thể</TableHead>
                    <TableHead className="text-right">Giá muốn thực nhận (đ)</TableHead>
                    <TableHead className="text-right">Giá chuẩn (đ)</TableHead>
                    <TableHead className="text-right">Cân nặng (g)</TableHead>
                    <TableHead className="text-right">Dài × Rộng × Cao (mm)</TableHead>
                    <TableHead className="text-right">Ngưỡng tồn</TableHead>
                    <TableHead>SKU</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40 align-top">
                    <TableCell>
                      <p className="font-medium">Mọi biến thể</p>
                      <p className="text-xs text-muted-foreground">Ô trống ở dòng dưới lấy số này</p>
                    </TableCell>
                    {(['targetNetPrice', 'standardPrice', 'weightG'] as VariantFactKey[]).map((k) => (
                      <TableCell key={k} className="text-right">
                        {factCell('defaults', k, productEditable)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex justify-end gap-1">{SIZE_KEYS.map((k) => <span key={k}>{factCell('defaults', k, productEditable)}</span>)}</div>
                    </TableCell>
                    <TableCell className="text-right">{factCell('defaults', 'minQty', productEditable)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {draft.variants.map((v, i) => {
                    const editable = canEdit && !closed && v.variantId === null;
                    const rowErr = errors[`variants.${i}`];
                    return (
                      <TableRow key={variantLabel(v.optionValues)} className={cn('align-top', rowErr && 'border-b-2 border-b-destructive')}>
                        <TableCell>
                          <p className="font-medium">{variantLabel(v.optionValues)}</p>
                          {v.variantId !== null && (
                            <p className="text-xs text-muted-foreground">Đã tạo khi nhập kho. Sửa ở trang sản phẩm.</p>
                          )}
                          {v.variantId === null && created && (
                            <p className="text-xs text-muted-foreground">Chưa về hàng, vẫn sửa được</p>
                          )}
                          {rowErr && <p className="text-xs text-destructive">{rowErr}</p>}
                        </TableCell>
                        {(['targetNetPrice', 'standardPrice', 'weightG'] as VariantFactKey[]).map((k) => (
                          <TableCell key={k} className="text-right">
                            {factCell(i, k, editable)}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex justify-end gap-1">{SIZE_KEYS.map((k) => <span key={k}>{factCell(i, k, editable)}</span>)}</div>
                        </TableCell>
                        <TableCell className="text-right">{factCell(i, 'minQty', editable)}</TableCell>
                        <TableCell>
                          {v.variantId ? <Badge variant="outline">Đã tạo</Badge> : <span className="text-sm text-muted-foreground">Chưa có</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
