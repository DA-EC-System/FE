import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, PackagePlus, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ActionButton } from '@/components/common/ActionButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { NewProductDraftsCard } from './NewProductDraftsCard';
import { droppedDrafts } from './productDraft';
import { MoneyInput } from '@/components/common/MoneyInput';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { SecondPersonDialog } from '@/components/common/SecondPersonDialog';
import { RowAction } from '@/components/common/RowAction';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateGoodsReceipt,
  useExcludeRequestLine,
  usePurchaseRequest,
  usePurchaseRequestAction,
  useSavePurchaseRequest,
  useSupplierReturn,
  useSuppliers,
} from '@/api/purchasing.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { VariantPicker } from '@/features/inventory/VariantPicker';
import { NewProductFields, type NewProductErrors } from './NewProductFields';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { purchaseRequestMachine, type PurchaseRequestRecord } from '@/lib/machines/purchasing';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { formatMoneyInput, parseMoney } from '@/utils/price';
import { cn } from '@/lib/utils';
import type { Transition } from '@/lib/stateMachine';
import type {
  DeliveryMode,
  PurchaseRequest,
  PurchaseRequestAction,
  PurchaseRequestLineInput,
  PurchaseRequestStatus,
} from '@/types/purchasing';
import {
  DELIVERY_LABELS,
  RECEIPT_STATUS,
  REQUEST_STATUS,
  MAX_AXES,
  filledOptions,
  formatQty,
  newLineFromPrevious,
  optionsLabel,
  requestFormSchema,
  type RequestFormInput,
  type RequestFormOutput,
  type RequestLineDraft,
} from './shared';
import { DetailGrid, DocLink, Info, PageError, PageLoading, beforeUnloadGuard, blockedText, withApprovalHint } from './parts';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageGuide } from '@/guides/usePageGuide';

type RequestTransition = Transition<PurchaseRequest['status'], PurchaseRequestAction, PurchaseRequestRecord>;

const EDITABLE = new Set<PurchaseRequest['status']>(['draft', 'changes_requested']);

const emptyLine = (patch: Partial<RequestLineDraft>): RequestLineDraft => ({
  variantId: null,
  sku: '',
  productName: '',
  attributesLabel: '',
  isNew: false,
  parentMode: 'existing',
  parentId: '',
  parentName: '',
  groupId: '',
  options: [],
  quantity: '',
  unitCost: '',
  ...patch,
});

/** Dòng sản phẩm mới đã lưu → ô nhập */
const newProductDraft = (np: NonNullable<PurchaseRequest['lines'][number]['newProduct']>): Partial<RequestLineDraft> => {
  const options = Object.entries(np.optionValues).map(([axis, value]) => ({ axis, value }));
  if (np.parentId) return { parentMode: 'existing', parentId: np.parentId, parentName: np.parentName ?? np.name, groupId: np.groupId ?? '', options };
  while (options.length < MAX_AXES) options.push({ axis: '', value: '' });
  return { parentMode: 'new', parentId: '', parentName: np.parentName ?? np.name, groupId: np.groupId ?? '', options };
};

const toForm = (req: PurchaseRequest): RequestFormInput => ({
  supplierId: req.supplier.id,
  note: req.note,
  lines: req.lines.map((l) =>
    emptyLine({
      variantId: l.variantId,
      sku: l.sku ?? '',
      productName: l.productName,
      attributesLabel: l.attributesLabel,
      isNew: l.variantId === null,
      ...(l.variantId === null && l.newProduct ? newProductDraft(l.newProduct) : {}),
      quantity: String(l.quantity),
      unitCost: formatMoneyInput(l.unitCost),
    }),
  ),
});

const toLineInputs = (values: RequestFormOutput): PurchaseRequestLineInput[] =>
  values.lines.map((l) => {
    if (!l.isNew) return { variantId: l.variantId, newProduct: null, quantity: l.quantity, unitCost: l.unitCost };
    const options = filledOptions(l.options);
    const existing = l.parentMode === 'existing';
    return {
      variantId: null,
      newProduct: {
        parentId: existing ? l.parentId : null,
        parentName: existing ? null : l.parentName,
        groupId: existing ? null : l.groupId,
        optionValues: Object.fromEntries(options.map((o) => [o.axis, o.value])),
      },
      quantity: l.quantity,
      unitCost: l.unitCost,
    };
  });

/** Lỗi theo dòng của BE → ô trên form (`lines.<i>.<trường>`) */
const LINE_ERROR_FIELDS: Record<string, string> = {
  variantId: 'variantId',
  quantity: 'quantity',
  unitCost: 'unitCost',
  'newProduct.parentName': 'parentName',
  'newProduct.parentId': 'parentId',
  'newProduct.groupId': 'groupId',
  'newProduct.optionValues': 'options',
};

/** Đường chính trên thanh tiến trình (PATHS.pr của Test_UI) */
const REQUEST_PATH = ['draft', 'pending_approval', 'approved', 'ordered', 'received'] as const satisfies readonly PurchaseRequestStatus[];

const ACTION_CONFIRM: Partial<Record<PurchaseRequestAction, { title: string; message: string }>> = {
  submit: { title: 'Gửi duyệt', message: 'Đơn chờ CEO duyệt; trong lúc chờ không sửa được, bấm Rút lại để sửa.' },
  resubmit: { title: 'Gửi lại', message: 'Đơn chờ CEO duyệt lại.' },
  withdraw: { title: 'Rút lại', message: 'Đơn quay về nháp để sửa.' },
  approve: {
    title: 'Duyệt',
    message: 'Giá nhập được chốt. Dòng không duyệt sẽ không đặt hàng.',
  },
  order: { title: 'Đã đặt hàng', message: 'Số lượng chưa nhận được cộng vào Hàng đang về của từng SKU. Kho tạo phiếu nhập kho khi hàng tới.' },
  cancel: { title: 'Huỷ đơn', message: 'Đơn bị huỷ, không đặt hàng tiếp được.' },
};

const REASON_TEXT: Partial<Record<PurchaseRequestAction, string>> = {
  request_changes: 'Đơn quay về người lập để sửa rồi gửi lại.',
  reject: 'Đơn kết thúc, không đặt hàng.',
  close_short: 'Không chờ phần NCC chưa giao nữa: số Hàng đang về giảm, phiếu nhập kho giao thiếu chuyển sang Đã xử lý.',
  cancel: 'Đơn bị huỷ; Hàng đang về giảm theo số chưa nhận.',
};

/**
 * Đề nghị nhập (sơ đồ A1). Mua hàng lập nháp một nhà cung cấp nhiều dòng (biến thể có sẵn hoặc sản phẩm mới),
 * gửi duyệt; CEO khác người lập duyệt (loại dòng nếu cần), trả về hoặc từ chối. Đặt nhà cung cấp rồi kho lập phiếu nhận.
 * `/purchasing/requests/new?from=<phiếu trả>` là đề nghị bù hàng điền sẵn từ phiếu trả nhà cung cấp.
 */
export function PurchaseRequestPage() {
  const navigate = useNavigate();
  const { requestId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = requestId === 'new';
  const fromReturnId = isNew ? searchParams.get('from') : null;
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.purchaseRequestManage);
  const canApprove = can(PERMISSIONS.purchaseRequestApprove);
  const canReceive = can(PERMISSIONS.goodsReceiptManage);
  const actor = useTransitionActor();

  const reqQuery = usePurchaseRequest(isNew ? undefined : requestId);
  const req = reqQuery.data;
  useBreadcrumb(isNew ? 'Tạo đơn' : req?.number);
  const { startTour } = usePageGuide('purchase-request', { ready: isNew || Boolean(req) });
  // Phiếu trả NCC mà đề nghị bù hàng: lập mới thì từ `?from=`, đã lưu thì phiếu đã gắn (#365: khoá giá theo dòng gốc).
  const replacementOf = fromReturnId ?? req?.sourceReturn?.id ?? null;
  const returnQuery = useSupplierReturn(replacementOf ?? undefined);
  const suppliersQuery = useSuppliers({}, { enabled: canManage });
  const editable = canManage && (isNew || (req ? EDITABLE.has(req.status) : false));

  const saveMut = useSavePurchaseRequest();
  const actionMut = usePurchaseRequestAction();
  const excludeMut = useExcludeRequestLine();
  const receiptMut = useCreateGoodsReceipt();
  const busy = saveMut.isPending || actionMut.isPending || excludeMut.isPending || receiptMut.isPending;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<RequestFormInput, unknown, RequestFormOutput>({
    // Dòng trên form giữ thêm SKU, tên để hiển thị; schema chỉ kiểm ô nhập nên phải ép kiểu
    resolver: zodResolver(requestFormSchema) as unknown as Resolver<RequestFormInput, unknown, RequestFormOutput>,
    defaultValues: { supplierId: '', note: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const supplierId = useWatch({ control, name: 'supplierId' });

  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<PurchaseRequestAction | null>(null);
  /** Hỏi trước khi lưu làm mất bản soạn trước (đổi tên sản phẩm mới, Documents/21 §16.3) */
  const [dropAsk, setDropAsk] = useState<{ text: string; resolve: (ok: boolean) => void } | null>(null);
  const [reasonFor, setReasonFor] = useState<RequestTransition | null>(null);
  const [excludeFor, setExcludeFor] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const loaded = useRef<string | null>(null);
  const skipBlock = useRef(false);

  useEffect(() => {
    if (req && loaded.current !== req.id) {
      loaded.current = req.id;
      reset(toForm(req));
      setVersion(req.version);
    }
  }, [req, reset]);

  // Bù hàng: điền nhà cung cấp và dòng từ phiếu trả nhà cung cấp (giá nhập theo giá vốn của phiếu nếu được xem)
  const source = returnQuery.data;
  useEffect(() => {
    if (!fromReturnId || !source || loaded.current === `from:${source.id}`) return;
    loaded.current = `from:${source.id}`;
    reset(
      {
        supplierId: source.supplier?.id ?? '',
        note: `Đổi hàng theo phiếu trả hàng NCC ${source.number}`,
        lines: source.lines.map((l) =>
          emptyLine({
            variantId: l.variantId,
            sku: l.sku,
            productName: l.productName,
            attributesLabel: l.attributesLabel,
            quantity: String(l.quantity),
            unitCost: formatMoneyInput(l.unitCost),
          }),
        ),
      },
      { keepDefaultValues: true },
    );
  }, [fromReturnId, source, reset]);

  /** Giá dòng gốc của phiếu trả cho SKU (#365): đề nghị bù hàng không sửa được giá; null là không khoá. */
  const lockedCost = (variantId: string | null | undefined): number | null => {
    if (!source || !variantId) return null;
    return source.lines.find((l) => l.variantId === variantId)?.unitCost ?? null;
  };
  /** Số đã trả của SKU trên phiếu trả (#365): đề nghị bù không đặt quá số này; null khi không phải đề nghị bù */
  const returnedQty = (variantId: string | null | undefined): number | null => {
    if (!source || !variantId) return null;
    return source.lines.find((l) => l.variantId === variantId)?.quantity ?? null;
  };

  const load = (latest: PurchaseRequest) => {
    loaded.current = latest.id;
    reset(toForm(latest));
    setVersion(latest.version);
  };

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !skipBlock.current && editable && isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => beforeUnloadGuard(editable && isDirty), [editable, isDirty]);

  const taken = useMemo(() => new Set(fields.flatMap((f) => (f.variantId ? [f.variantId] : []))), [fields]);

  const record: PurchaseRequestRecord = {
    createdBy: req?.createdById ?? actor.accountId,
    lineCount: lines.length,
    activeLines: req ? req.lines.filter((l) => !l.excluded).length : lines.length,
    receiptCount: req?.receipts.filter((r) => r.status !== 'cancelled').length ?? 0,
    countingReceipts: req?.countingReceipts ?? 0,
  };
  const baseOptions = purchaseRequestMachine.options(req?.status ?? 'draft', actor, record);
  const options = req ? withApprovalHint(purchaseRequestMachine, req.status, baseOptions) : baseOptions;
  const canExclude = req?.status === 'pending_approval' && canApprove && req.createdById !== actor.accountId;
  const canCreateReceipt = canReceive && (req?.status === 'ordered' || req?.status === 'partially_received');

  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<PurchaseRequest>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({
        severity: 'warning',
        msg: 'Đơn vừa được người khác sửa hoặc duyệt. Form đã hiện bản mới nhất, chưa có gì thay đổi.',
      });
      return;
    }
    if (problem?.code === 'not_draft' || problem?.code === 'invalid_transition') {
      loaded.current = null;
      void reqQuery.refetch();
    }
    const fieldErrors = problem?.errors ?? {};
    let placed = 0;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)\.(.+)$/.exec(path);
      // Lỗi theo từng trục (`newProduct.optionValues.<tên trục>`: tên trục, giá trị quá dài) gắn vào ô phân loại
      const key = m ? (LINE_ERROR_FIELDS[m[2]!] ?? (m[2]!.startsWith('newProduct.optionValues.') ? 'options' : undefined)) : undefined;
      if (m && key) {
        setError(`lines.${Number(m[1])}.${key as 'quantity'}`, { message });
        placed++;
      } else if (path === 'supplierId' || path === 'note') {
        setError(path, { message });
        placed++;
      }
    }
    setNotice({
      severity: 'error',
      msg: fieldErrors.lines ?? (placed ? `${problem?.title ?? 'Dữ liệu không hợp lệ'}. Xem các ô báo đỏ.` : problemMessage(e)),
    });
  };

  const save = async (values: RequestFormOutput): Promise<PurchaseRequest | null> => {
    setNotice(null);
    // Đề nghị bù hàng (#365): số mỗi dòng không quá số đã trả của SKU đó trên phiếu trả; BE cũng chặn (422)
    if (source) {
      let over = 0;
      values.lines.forEach((l, i) => {
        const returned = returnedQty(l.variantId);
        if (returned !== null && l.quantity > returned) {
          setError(`lines.${i}.quantity`, { message: `Không quá số đã trả ${formatQty(returned)}` });
          over++;
        }
      });
      if (over) return null;
    }
    try {
      if (isNew) {
        const created = await saveMut.mutateAsync({
          supplierId: values.supplierId,
          note: values.note,
          lines: toLineInputs(values),
          sourceReturnId: fromReturnId,
        });
        load(created);
        skipBlock.current = true;
        navigate(ROUTES.company.purchaseRequest(companyId, created.id), { replace: true });
        skipBlock.current = false;
        return created;
      }
      if (!isDirty && req) return { ...req, version };
      const { dropped, renamedTo } = droppedDrafts(req?.productDrafts ?? [], toLineInputs(values));
      if (dropped.length) {
        const names = dropped.map((d) => `«${d.parentName}»`).join(', ');
        const why = renamedTo ? `vì tên đổi thành «${renamedTo}»` : 'vì không còn dòng sản phẩm mới nào mang tên này';
        const ok = await new Promise<boolean>((resolve) =>
          setDropAsk({ text: `Bản soạn trước của ${names} (ảnh, mô tả, thuộc tính) sẽ bị xoá ${why}.`, resolve }),
        );
        if (!ok) return null;
      }
      const saved = await saveMut.mutateAsync({
        id: requestId,
        supplierId: values.supplierId,
        note: values.note,
        lines: toLineInputs(values),
        version,
      });
      load(saved);
      return saved;
    } catch (e) {
      handleError(e);
      return null;
    }
  };

  const onSave = handleSubmit(async (values) => {
    const saved = await save(values);
    if (saved) toast.success(`Đã lưu nháp ${saved.number}`);
  });

  const runAction = async (
    target: PurchaseRequest,
    action: PurchaseRequestAction,
    reason?: string,
    extra?: { expectedDeliveryDate: string; supplierOrderCode: string | null },
  ) => {
    try {
      const next = await actionMut.mutateAsync({ id: target.id, action, version: target.version, reason, ...extra });
      load(next);
      toast.success(`${next.number}: ${REQUEST_STATUS[next.status].label.toLowerCase()}`);
      return true;
    } catch (e) {
      if (reason !== undefined) setReasonError(problemMessage(e));
      else handleError(e);
      return false;
    }
  };

  const onConfirmAction = (action: PurchaseRequestAction) => {
    setConfirm(null);
    // Gửi duyệt từ nháp: lưu thay đổi trước rồi chuyển bằng version mới
    if ((action === 'submit' || action === 'resubmit') && (isNew || editable)) {
      void handleSubmit(async (values) => {
        const saved = await save(values);
        if (saved) await runAction(saved, action);
      })();
      return;
    }
    if (req) void runAction({ ...req, version }, action);
  };

  const onReason = async (reason: string) => {
    if (!req || !reasonFor) return;
    setReasonError(null);
    if (await runAction({ ...req, version }, reasonFor.action, reason)) setReasonFor(null);
  };

  const onExclude = async (lineId: string, excluded: boolean, reason?: string) => {
    if (!req) return false;
    try {
      const next = await excludeMut.mutateAsync({ id: req.id, lineId, excluded, reason, version });
      load(next);
      return true;
    } catch (e) {
      if (reason !== undefined) setReasonError(problemMessage(e));
      else handleError(e);
      return false;
    }
  };

  const backToList = () => navigate(ROUTES.company.purchasing(companyId));

  if (isNew && !canManage) {
    return <PageError severity="warning" message="Bạn không có quyền tạo đề nghị nhập hàng." onBack={backToList} />;
  }
  if (reqQuery.isError) return <PageError message={getErrorMessage(reqQuery.error)} onBack={backToList} />;
  if (!isNew && !req) return <PageLoading />;

  const showCost = editable || Boolean(req?.lines.some((l) => l.unitCost !== null));
  const showProgress = Boolean(req && !EDITABLE.has(req.status) && req.status !== 'pending_approval');
  const supplierOptions = (suppliersQuery.data ?? []).filter((s) => s.active || s.id === supplierId);
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;
  const baseConfirm = confirm ? ACTION_CONFIRM[confirm] : undefined;
  // Câu "tạo khi nhập kho" chỉ khi đề nghị có dòng sản phẩm mới (kiểm người bán KB3 3.7)
  const confirmText =
    baseConfirm && confirm === 'approve' && req?.lines.some((l) => l.newProduct)
      ? { ...baseConfirm, message: `${baseConfirm.message} Sản phẩm, biến thể mới sẽ được tạo khi nhập kho.` }
      : baseConfirm;
  const total = lines.reduce((s, l) => {
    const q = Number(l.quantity);
    const c = parseMoney(l.unitCost);
    return Number.isFinite(q) && c.ok && c.value !== null ? s + q * c.value : s;
  }, 0);
  const colCount = 2 + (showCost ? 1 : 0) + (showProgress ? 3 : 0) + (editable || canExclude ? 1 : 0);
  const title = req ? `Đề nghị nhập hàng ${req.number}` : fromReturnId ? 'Tạo đề nghị nhập hàng đổi' : 'Tạo đề nghị nhập hàng';
  const lifecycleBlocked = options.flatMap(({ transition: t, blocked }) =>
    blocked && blocked !== 'forbidden' ? [{ label: t.label, reason: blockedText(t.action, blocked) ?? '' }] : [],
  );

  const textInput = (i: number, key: 'quantity' | 'unitCost', label: string, name: string, hint?: string) => {
    const err = errors.lines?.[i]?.[key];
    return (
      <div className="grid gap-1">
        {key === 'unitCost' ? (
          // Ô tiền dùng chung (FE#385): phân cách nghìn khi gõ, chuỗi mơ hồ báo lỗi khi lưu
          <Controller
            control={control}
            name={`lines.${i}.unitCost`}
            render={({ field }) => (
              <MoneyInput
                ref={field.ref}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-label={`${label} ${name}`}
                aria-invalid={Boolean(err)}
                className="h-8"
              />
            )}
          />
        ) : (
          <Input
            {...register(`lines.${i}.${key}`)}
            aria-label={`${label} ${name}`}
            inputMode="numeric"
            aria-invalid={Boolean(err)}
            className="h-8 text-right"
          />
        )}
        {hint && !err && <p className="text-xs text-muted-foreground">{hint}</p>}
        {err && <p className="text-start text-xs text-destructive">{err.message}</p>}
      </div>
    );
  };

  const patchLine = (i: number, patch: Partial<RequestLineDraft>) => {
    for (const [k, v] of Object.entries(patch)) {
      // Trường của dòng có kiểu khác nhau (chuỗi, mảng trục): ép kiểu một lần ở đây
      setValue(`lines.${i}.${k}` as `lines.${number}.parentName`, v as never, { shouldDirty: true, shouldValidate: isSubmitted });
    }
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Mỗi đề nghị nhập hàng một NCC."
        help="Nhân viên nhập hàng tạo nháp rồi gửi duyệt. Người duyệt phải khác người lập. Duyệt xong thì đặt hàng với NCC; số chưa nhận hiện ở cột Hàng đang về của tồn kho. Hàng tới thì Kho tạo phiếu nhập kho từ đơn."
        onTour={startTour}
        action={
          <div className="flex flex-wrap gap-2" data-guide="pr-actions">
            <Button variant="outline" onClick={backToList}>
              <ArrowLeft />
              Danh sách
            </Button>
            {editable && (
              <Button variant="outline" disabled={busy || (!isNew && !isDirty)} onClick={onSave}>
                <Save />
                Lưu nháp
              </Button>
            )}
            {canCreateReceipt && (
              <Button variant="outline" disabled={busy} onClick={() => setReceiving(true)}>
                <PackagePlus />
                Tạo phiếu nhập kho
              </Button>
            )}
            {(isNew ? options.filter((o) => o.transition.action === 'submit') : options).map(({ transition: t, blocked }) => {
              const danger = t.action === 'cancel' || t.action === 'reject' || t.action === 'close_short';
              return (
                <ActionButton
                  key={`${t.action}-${String(t.needsReason)}`}
                  variant={danger || t.action === 'withdraw' || t.action === 'request_changes' ? 'outline' : 'default'}
                  className={cn(danger && 'text-destructive hover:text-destructive')}
                  blockedReason={blockedText(t.action, blocked)}
                  disabled={busy}
                  onClick={() => (t.needsReason ? setReasonFor(t) : setConfirm(t.action))}
                >
                  {t.label}
                </ActionButton>
              );
            })}
          </div>
        }
      />

      {notice && (
        <AlertMessage severity={notice.severity} className="mb-4" onClose={() => setNotice(null)}>
          {notice.msg}
        </AlertMessage>
      )}
      {source && (
        <AlertMessage severity="info" className="mb-4">
          Đơn đặt hàng đổi cho phiếu trả hàng NCC {source.number}. Lưu xong, phiếu trả sẽ liên kết tới đơn này.
        </AlertMessage>
      )}

      {req && (
        <Card className="mb-4 py-4" data-guide="pr-steps">
          <CardContent>
            <LifecycleSteps
              path={REQUEST_PATH}
              current={req.status}
              history={req.statusHistory}
              statuses={REQUEST_STATUS}
              isFinal={purchaseRequestMachine.isFinal}
              blocked={lifecycleBlocked}
            />
          </CardContent>
        </Card>
      )}

      <DetailGrid
        history={
          req && req.statusHistory.length > 0 ? (
            <StatusTimeline history={req.statusHistory} statuses={REQUEST_STATUS} />
            ) : undefined
          }
        >
        {req && (
          <Card className="py-4" data-guide="pr-info">
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Info label="Trạng thái">
                <div className="flex flex-wrap items-center gap-1" data-testid="request-status">
                  <StatusBadge status={req.status} statuses={REQUEST_STATUS} />
                  {req.supplierShort && <Badge variant="destructive">NCC giao thiếu</Badge>}
                </div>
              </Info>
              <Info label="Người lập">
                {req.createdBy} · {formatDateTime(req.createdAt)}
              </Info>
              <Info label="Chưa nhận">{formatQty(req.outstanding)}</Info>
              {req.totalCost !== null && <Info label="Tổng tiền">{formatCurrency(req.totalCost)}</Info>}
              {req.sourceReturn && (
                <Info label="Đổi hàng cho phiếu trả">
                  <DocLink companyId={companyId} docRef={req.sourceReturn} />
                </Info>
              )}
              {req.receipts.length > 0 && (
                <Info label="Phiếu nhập kho">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {req.receipts.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1">
                        <DocLink companyId={companyId} docRef={r} />
                        <StatusBadge status={r.status} statuses={RECEIPT_STATUS} />
                      </span>
                    ))}
                  </div>
                </Info>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="py-4">
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="req-supplier">Nhà cung cấp</Label>
                {editable ? (
                  <Select
                    value={supplierId}
                    disabled={suppliersQuery.isLoading}
                    onValueChange={(v) => setValue('supplierId', v, { shouldDirty: true, shouldValidate: true })}
                  >
                    <SelectTrigger id="req-supplier" className="w-full" aria-invalid={Boolean(errors.supplierId)}>
                      <SelectValue placeholder={suppliersQuery.isLoading ? 'Đang tải nhà cung cấp…' : 'Chọn nhà cung cấp'} />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {!s.active && ' (ngừng giao dịch)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{req?.supplier.name}</p>
                )}
                {errors.supplierId && <p className="text-sm text-destructive">{errors.supplierId.message}</p>}
                {editable && suppliersQuery.isSuccess && !supplierOptions.length && (
                  <p className="text-xs text-muted-foreground">
                    Chưa có nhà cung cấp đang giao dịch.{' '}
                    <Link className="text-primary hover:underline" to={ROUTES.company.purchasing(companyId, 'suppliers')}>
                      Thêm nhà cung cấp
                    </Link>
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-note">Ghi chú</Label>
                {editable ? (
                  <Textarea id="req-note" rows={1} aria-invalid={Boolean(errors.note)} {...register('note')} />
                ) : (
                  <p className="text-sm whitespace-pre-line">{req?.note || '—'}</p>
                )}
                {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
              </div>
            </div>

            {editable && source && (
              <AlertMessage severity="info">
                Đơn đặt hàng đổi cho phiếu trả hàng NCC {source.number}: chỉ SKU đã trả, số không quá số đã trả, giá theo dòng gốc.
              </AlertMessage>
            )}
            {editable && !source && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-64 flex-1">
                  <VariantPicker
                    taken={taken}
                    disabled={busy}
                    onPick={(level) =>
                      append(
                        emptyLine({
                          variantId: level.variantId,
                          sku: level.sku,
                          productName: level.productName,
                          attributesLabel: level.attributesLabel,
                        }),
                      )
                    }
                  />
                </div>
                <Button type="button" variant="outline" disabled={busy} onClick={() => append(emptyLine(newLineFromPrevious(lines)))}>
                  <Plus />
                  Thêm sản phẩm mới
                </Button>
              </div>
            )}
            {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}

            <div className="overflow-x-auto rounded-md border" data-guide="pr-lines">
              <Table data-testid="request-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm / SKU</TableHead>
                    <TableHead className="w-32 text-right">Số lượng</TableHead>
                    {showCost && <TableHead className="w-40 text-right">Giá nhập</TableHead>}
                    {showProgress && (
                      <>
                        <TableHead className="w-24 text-right">Đã nhận</TableHead>
                        <TableHead className="w-24 text-right">Hàng lỗi giữ lại</TableHead>
                        <TableHead className="w-24 text-right">Chưa nhận</TableHead>
                      </>
                    )}
                    {(editable || canExclude) && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!fields.length && (
                    <TableRow>
                      <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                        {editable ? 'Tìm SKU có sẵn hoặc thêm sản phẩm mới.' : 'Đơn không có dòng nào.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {fields.map((f, i) => {
                    const line = req?.lines[i];
                    const live = lines[i] ?? f;
                    const lineErrors = errors.lines?.[i];
                    const name = f.sku || live.parentName || `dòng ${i + 1}`;
                    const np = line?.newProduct;
                    const returned = returnedQty(live.variantId);
                    return (
                      <TableRow
                        key={f.key}
                        data-row-id={line?.id ?? f.variantId ?? `new-${i}`}
                        className={cn('align-top', line?.excluded && 'opacity-60')}
                      >
                        <TableCell>
                          {live.isNew && editable ? (
                            <NewProductFields
                              line={live}
                              name={name}
                              index={i}
                              errors={lineErrors as NewProductErrors | undefined}
                              disabled={busy}
                              onChange={(patch) => patchLine(i, patch)}
                            />
                          ) : (
                            <>
                              <p className="font-medium">
                                {f.sku || np?.parentName || np?.name || live.parentName}
                                {(live.isNew || np) && (
                                  <Badge variant="info" className="ms-2">
                                    {/* Thêm vào sản phẩm có sẵn là biến thể mới, không phải sản phẩm mới (KB3 3.8) */}
                                    {(np ? np.parentId !== null : live.parentMode === 'existing') ? 'Biến thể mới' : 'Sản phẩm mới'}
                                  </Badge>
                                )}
                                {line?.excluded && (
                                  <Badge variant="secondary" className="ms-2">
                                    Không duyệt
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {np && !line?.variantId
                                  ? [
                                      optionsLabel(np.optionValues),
                                      np.parentId
                                        ? 'Thêm vào sản phẩm có sẵn'
                                        : `Danh mục sản phẩm ${np.groupName}`,
                                      'Tạo khi nhập kho',
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')
                                  : `${f.productName}${f.attributesLabel ? ` · ${f.attributesLabel}` : ''}`}
                              </p>
                              {line?.excluded && line.excludedReason && (
                                <p className="text-xs text-muted-foreground" data-testid="excluded-reason">
                                  Lý do không duyệt: {line.excludedReason}
                                </p>
                              )}
                            </>
                          )}
                          {lineErrors?.variantId && <p className="text-xs text-destructive">{lineErrors.variantId.message}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          {editable
                            ? textInput(i, 'quantity', 'Số lượng', name, returned !== null ? `Đã trả ${formatQty(returned)}` : undefined)
                            : formatQty(line?.quantity ?? 0)}
                        </TableCell>
                        {showCost && (
                          <TableCell className="text-right">
                            {editable && source && lockedCost(live.variantId) !== null ? (
                              <div className="grid gap-1" data-testid="locked-cost">
                                <span aria-label={`Giá nhập ${name}`}>{formatCurrency(lockedCost(live.variantId)!)}</span>
                                <span className="text-xs text-muted-foreground">Theo giá dòng gốc {source.number}</span>
                                {lineErrors?.unitCost && <p className="text-xs text-destructive">{lineErrors.unitCost.message}</p>}
                              </div>
                            ) : editable
                              ? textInput(i, 'unitCost', 'Giá nhập', name)
                              : line?.unitCost === null || line?.unitCost === undefined
                                ? '—'
                                : formatCurrency(line.unitCost)}
                          </TableCell>
                        )}
                        {showProgress && (
                          <>
                            <TableCell className="text-right">{formatQty(line?.received ?? 0)}</TableCell>
                            <TableCell className="text-right">{formatQty(line?.defective ?? 0)}</TableCell>
                            <TableCell className={cn('text-right', (line?.outstanding ?? 0) > 0 && 'font-medium')}>
                              {line?.closedShort ? (
                                <span title={`Bỏ ${line.closedShort} khi đóng đơn thiếu hàng`}>0 (bỏ {formatQty(line.closedShort)})</span>
                              ) : (
                                formatQty(line?.outstanding ?? 0)
                              )}
                            </TableCell>
                          </>
                        )}
                        {(editable || canExclude) && (
                          <TableCell>
                            {editable && (
                              <RowAction label="Bỏ dòng" destructive reason={busy ? 'Đang lưu' : null} onClick={() => remove(i)}>
                                <Trash2 />
                              </RowAction>
                            )}
                            {canExclude && line && (
                              <RowAction
                                label={line.excluded ? 'Duyệt lại dòng' : 'Không duyệt dòng'}
                                destructive={!line.excluded}
                                reason={busy ? 'Đang lưu' : null}
                                // Loại dòng bắt buộc lý do (BE#243); lấy lại thì không cần
                                onClick={() => (line.excluded ? void onExclude(line.id, false) : setExcludeFor(line.id))}
                              >
                                {line.excluded ? <Undo2 /> : <X />}
                              </RowAction>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {editable && total > 0 && (
              <p className="text-end text-sm text-muted-foreground">
                Tạm tính <span className="font-medium text-foreground">{formatCurrency(total)}</span>
              </p>
            )}
          </CardContent>
        </Card>
        {req && <NewProductDraftsCard request={req} companyId={companyId} />}
      </DetailGrid>

      <SecondPersonDialog
        open={confirm === 'approve'}
        title={`Duyệt ${req?.number ?? 'đơn'}?`}
        createdByName={req?.createdBy ?? ''}
        selfApproval={req?.createdById === actor.accountId}
        loading={busy}
        onConfirm={() => onConfirmAction('approve')}
        onClose={() => setConfirm(null)}
      >
        {confirmText?.message}
      </SecondPersonDialog>
      <OrderDialog
        open={confirm === 'order'}
        number={req?.number ?? ''}
        loading={busy}
        onClose={() => setConfirm(null)}
        onOrder={(extra) => {
          setConfirm(null);
          if (req) void runAction({ ...req, version }, 'order', undefined, extra);
        }}
      />
      <ReasonDialog
        open={excludeFor !== null}
        title={`Không duyệt dòng trong ${req?.number ?? 'đơn'}`}
        message="Dòng không duyệt sẽ không đặt hàng; lý do hiện dưới dòng."
        label="Lý do không duyệt"
        confirmLabel="Không duyệt dòng"
        destructive
        loading={busy}
        error={reasonError}
        onConfirm={async (reason) => {
          setReasonError(null);
          if (excludeFor && (await onExclude(excludeFor, true, reason))) setExcludeFor(null);
        }}
        onClose={() => {
          setExcludeFor(null);
          setReasonError(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(confirmText) && confirm !== 'approve' && confirm !== 'order'}
        title={`${confirmText?.title ?? ''} ${req?.number ?? 'đơn'}?`}
        message={confirmText?.message ?? ''}
        confirmLabel={confirmText?.title}
        cancelLabel={confirm === 'cancel' ? 'Giữ lại' : undefined}
        destructive={confirm === 'cancel'}
        loading={busy}
        onConfirm={() => confirm && onConfirmAction(confirm)}
        onClose={() => setConfirm(null)}
      />
      <ReasonDialog
        open={reasonFor !== null}
        title={`${reasonFor?.label ?? ''} ${req?.number ?? ''}`}
        message={reasonFor ? REASON_TEXT[reasonFor.action] : undefined}
        confirmLabel={reasonFor?.label}
        destructive={reasonFor?.action !== 'request_changes'}
        loading={busy}
        error={reasonError}
        onConfirm={onReason}
        onClose={() => {
          setReasonFor(null);
          setReasonError(null);
        }}
      />
      {req && (
        <CreateReceiptDialog
          open={receiving}
          number={req.number}
          loading={receiptMut.isPending}
          onClose={() => setReceiving(false)}
          shortReceipts={req.receipts.filter((r) => r.status === 'short')}
          onCreate={async (deliveryMode, note, followsUpReceiptId) => {
            try {
              const created = await receiptMut.mutateAsync({
                requestId: req.id,
                deliveryMode,
                note,
                ...(followsUpReceiptId && { followsUpReceiptId }),
              });
              toast.success(`Đã tạo phiếu nhập kho ${created.number}`);
              navigate(ROUTES.company.goodsReceipt(companyId, created.id));
            } catch (e) {
              setReceiving(false);
              handleError(e);
            }
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(dropAsk)}
        title="Đổi tên sản phẩm mới?"
        message={dropAsk?.text ?? ''}
        confirmLabel="Đổi tên, xoá bản soạn"
        cancelLabel="Giữ tên cũ"
        destructive
        onConfirm={() => {
          dropAsk?.resolve(true);
          setDropAsk(null);
        }}
        onClose={() => {
          dropAsk?.resolve(false);
          setDropAsk(null);
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message="Thay đổi trên đơn chưa được lưu sẽ bị bỏ."
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

const NO_FOLLOW_UP = 'none';

function CreateReceiptDialog({
  open,
  number,
  loading,
  shortReceipts,
  onClose,
  onCreate,
}: {
  open: boolean;
  number: string;
  loading: boolean;
  /** Phiếu Giao thiếu của cùng đề nghị: phiếu mới có thể là lần giao bù của một phiếu trong số này (BE#244) */
  shortReceipts: { id: string; number: string }[];
  onClose: () => void;
  onCreate: (mode: DeliveryMode, note: string, followsUpReceiptId: string | null) => void;
}) {
  const [mode, setMode] = useState<DeliveryMode>('waiting');
  const [note, setNote] = useState('');
  const [followsUp, setFollowsUp] = useState(NO_FOLLOW_UP);
  useEffect(() => {
    if (open) {
      setMode('waiting');
      setNote('');
      setFollowsUp(NO_FOLLOW_UP);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo phiếu nhập kho cho {number}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Phiếu lấy các dòng chưa nhận của đơn. Kho nhập số NCC giao và số kiểm đạt rồi xác nhận nhập kho một lần.
        </p>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeliveryMode)} className="grid gap-2">
          {(Object.keys(DELIVERY_LABELS) as DeliveryMode[]).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={m} aria-label={DELIVERY_LABELS[m]} />
              {DELIVERY_LABELS[m]}
            </label>
          ))}
        </RadioGroup>
        {shortReceipts.length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="receipt-follows-up">Giao bù cho phiếu</Label>
            <Select value={followsUp} onValueChange={setFollowsUp}>
              <SelectTrigger id="receipt-follows-up" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FOLLOW_UP}>Không phải giao bù</SelectItem>
                {shortReceipts.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.number} (giao thiếu)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="receipt-note">Ghi chú</Label>
          <Textarea id="receipt-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button disabled={loading} onClick={() => onCreate(mode, note.trim(), followsUp === NO_FOLLOW_UP ? null : followsUp)}>
            {loading ? 'Đang tạo...' : 'Tạo phiếu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Đã đặt nhà cung cấp: ngày nhà cung cấp hẹn giao bắt buộc, mã đơn bên nhà cung cấp tuỳ chọn (25 §3.2, BE#243) */
function OrderDialog({
  open,
  number,
  loading,
  onClose,
  onOrder,
}: {
  open: boolean;
  number: string;
  loading: boolean;
  onClose: () => void;
  onOrder: (extra: { expectedDeliveryDate: string; supplierOrderCode: string | null }) => void;
}) {
  const [date, setDate] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDate('');
      setCode('');
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đã đặt hàng {number}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Số lượng chưa nhận được cộng vào Hàng đang về của từng SKU. Kho tạo phiếu nhập kho khi hàng tới.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="order-date">
            Ngày giao dự kiến<span className="text-destructive"> *</span>
          </Label>
          <Input id="order-date" type="date" required aria-required value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(error)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="order-code">Mã đơn của NCC (nếu có)</Label>
          <Input id="order-code" maxLength={100} value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button
            disabled={loading}
            onClick={() => {
              if (!date) {
                setError('Nhập ngày NCC hẹn giao');
                return;
              }
              onOrder({ expectedDeliveryDate: date, supplierOrderCode: code.trim() || null });
            }}
          >
            Xác nhận đã đặt hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
