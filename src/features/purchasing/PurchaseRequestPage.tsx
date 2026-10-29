import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, PackagePlus, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ActionButton } from '@/components/common/ActionButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { SecondPersonDialog } from '@/components/common/SecondPersonDialog';
import { RowAction } from '@/components/common/RowAction';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useCategories } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { codeMessage, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { VariantPicker } from '@/features/inventory/VariantPicker';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { purchaseRequestMachine, type PurchaseRequestRecord } from '@/lib/machines/purchasing';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
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
  formatQty,
  requestFormSchema,
  type RequestFormInput,
  type RequestFormOutput,
  type RequestLineDraft,
} from './shared';
import { DocLink, Info, PageError, PageLoading, beforeUnloadGuard } from './parts';

type RequestTransition = Transition<PurchaseRequest['status'], PurchaseRequestAction, PurchaseRequestRecord>;

const EDITABLE = new Set<PurchaseRequest['status']>(['draft', 'changes_requested']);

const emptyLine = (patch: Partial<RequestLineDraft>): RequestLineDraft => ({
  variantId: null,
  sku: '',
  productName: '',
  attributesLabel: '',
  isNew: false,
  newName: '',
  categoryId: '',
  quantity: '',
  unitCost: '',
  ...patch,
});

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
      newName: l.newProduct?.name ?? '',
      categoryId: l.newProduct?.categoryId ?? '',
      quantity: String(l.quantity),
      unitCost: l.unitCost === null ? '' : String(l.unitCost),
    }),
  ),
});

const toLineInputs = (values: RequestFormOutput): PurchaseRequestLineInput[] =>
  values.lines.map((l) => ({
    variantId: l.isNew ? null : l.variantId,
    newProduct: l.isNew ? { name: l.newName, categoryId: l.categoryId } : null,
    quantity: l.quantity,
    unitCost: l.unitCost,
  }));

/** Đường chính trên thanh tiến trình (PATHS.pr của Test_UI) */
const REQUEST_PATH = ['draft', 'pending_approval', 'approved', 'ordered', 'received'] as const satisfies readonly PurchaseRequestStatus[];

const ACTION_CONFIRM: Partial<Record<PurchaseRequestAction, { title: string; message: string }>> = {
  submit: { title: 'Gửi duyệt', message: 'Đề nghị chờ CEO duyệt; trong lúc chờ không sửa được, rút lại để sửa.' },
  resubmit: { title: 'Gửi lại', message: 'Đề nghị chờ CEO duyệt lại.' },
  withdraw: { title: 'Rút lại', message: 'Đề nghị quay về nháp để sửa.' },
  approve: {
    title: 'Duyệt',
    message: 'Giá nhập được chốt; dòng sản phẩm mới được tạo SKU. Dòng đã loại không đặt NCC.',
  },
  order: { title: 'Đã đặt NCC', message: 'Số lượng còn chờ được cộng vào "đang về" của từng biến thể. Kho lập phiếu nhận khi hàng tới.' },
  cancel: { title: 'Huỷ đề nghị', message: 'Đề nghị bị huỷ, không đặt NCC được nữa.' },
};

const REASON_TEXT: Partial<Record<PurchaseRequestAction, string>> = {
  request_changes: 'Đề nghị quay về người lập để sửa rồi gửi lại.',
  reject: 'Đề nghị kết thúc, không đặt NCC.',
  close_short: 'Phần còn chờ bị bỏ: "đang về" giảm, phiếu giao thiếu chuyển sang đã xử lý.',
  cancel: 'Đề nghị đã duyệt hoặc đã đặt bị huỷ; "đang về" giảm theo phần còn chờ.',
};

/**
 * Đề nghị nhập (sơ đồ A1). Mua hàng lập nháp một NCC nhiều dòng (biến thể có sẵn hoặc sản phẩm mới),
 * gửi duyệt; CEO khác người lập duyệt (loại dòng nếu cần), trả về hoặc từ chối. Đặt NCC rồi kho lập phiếu nhận.
 * `/purchasing/requests/new?from=<phiếu trả>` là đề nghị bù hàng điền sẵn từ phiếu trả NCC.
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
  const returnQuery = useSupplierReturn(fromReturnId ?? undefined);
  const suppliersQuery = useSuppliers({}, { enabled: canManage });
  const categoriesQuery = useCategories();
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
    formState: { errors, isDirty },
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
  const [reasonFor, setReasonFor] = useState<RequestTransition | null>(null);
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

  // Bù hàng: điền NCC và dòng từ phiếu trả NCC (giá nhập theo giá vốn của phiếu nếu được xem)
  const source = returnQuery.data;
  useEffect(() => {
    if (!source || loaded.current === `from:${source.id}`) return;
    loaded.current = `from:${source.id}`;
    reset(
      {
        supplierId: source.supplier?.id ?? '',
        note: `Bù hàng theo phiếu trả ${source.number}`,
        lines: source.lines.map((l) =>
          emptyLine({
            variantId: l.variantId,
            sku: l.sku,
            productName: l.productName,
            attributesLabel: l.attributesLabel,
            quantity: String(l.quantity),
            unitCost: l.unitCost === null ? '' : String(l.unitCost),
          }),
        ),
      },
      { keepDefaultValues: true },
    );
  }, [source, reset]);

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
  const options = purchaseRequestMachine.options(req?.status ?? 'draft', actor, record);
  const canExclude = req?.status === 'pending_approval' && canApprove && req.createdById !== actor.accountId;
  const canCreateReceipt = canReceive && (req?.status === 'ordered' || req?.status === 'partially_received');

  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<PurchaseRequest>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({
        severity: 'warning',
        msg: 'Đề nghị vừa được người khác sửa hoặc duyệt. Form đã hiện bản mới nhất, chưa có gì thay đổi.',
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
      const m = /^lines\.(\d+)\.(variantId|quantity|unitCost|newProduct\.name|newProduct\.categoryId)$/.exec(path);
      if (m) {
        const key = m[2] === 'newProduct.name' ? 'newName' : m[2] === 'newProduct.categoryId' ? 'categoryId' : m[2];
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

  const runAction = async (target: PurchaseRequest, action: PurchaseRequestAction, reason?: string) => {
    try {
      const next = await actionMut.mutateAsync({ id: target.id, action, version: target.version, reason });
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

  const onExclude = async (lineId: string, excluded: boolean) => {
    if (!req) return;
    try {
      const next = await excludeMut.mutateAsync({ id: req.id, lineId, excluded, version });
      load(next);
    } catch (e) {
      handleError(e);
    }
  };

  const backToList = () => navigate(ROUTES.company.purchasing(companyId));

  if (isNew && !canManage) {
    return <PageError severity="warning" message="Bạn không có quyền lập đề nghị nhập." onBack={backToList} />;
  }
  if (reqQuery.isError) return <PageError message={getErrorMessage(reqQuery.error)} onBack={backToList} />;
  if (!isNew && !req) return <PageLoading />;

  const showCost = editable || Boolean(req?.lines.some((l) => l.unitCost !== null));
  const showProgress = Boolean(req && !EDITABLE.has(req.status) && req.status !== 'pending_approval');
  const supplierOptions = (suppliersQuery.data ?? []).filter((s) => s.active || s.id === supplierId);
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;
  const confirmText = confirm ? ACTION_CONFIRM[confirm] : undefined;
  const total = lines.reduce((s, l) => {
    const q = Number(l.quantity);
    const c = Number(l.unitCost.replace(/[\s.,]/g, ''));
    return Number.isFinite(q) && Number.isFinite(c) ? s + q * c : s;
  }, 0);
  const colCount = 2 + (showCost ? 1 : 0) + (showProgress ? 3 : 0) + (editable || canExclude ? 1 : 0);
  const title = req ? `Đề nghị nhập ${req.number}` : fromReturnId ? 'Lập đề nghị bù hàng' : 'Lập đề nghị nhập';

  const textInput = (i: number, key: 'quantity' | 'unitCost' | 'newName', label: string, name: string) => {
    const err = errors.lines?.[i]?.[key];
    return (
      <div className="grid gap-1">
        <Input
          {...register(`lines.${i}.${key}`)}
          aria-label={`${label} ${name}`}
          inputMode={key === 'newName' ? undefined : 'numeric'}
          aria-invalid={Boolean(err)}
          className={cn('h-8', key !== 'newName' && 'text-right')}
        />
        {err && <p className="text-start text-xs text-destructive">{err.message}</p>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Một nhà cung cấp mỗi đề nghị. CEO duyệt rồi mới đặt hàng; đã đặt thì số còn chờ hiện ở cột đang về của tồn kho."
        action={
          <div className="flex flex-wrap gap-2">
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
                Lập phiếu nhận
              </Button>
            )}
            {(isNew ? options.filter((o) => o.transition.action === 'submit') : options).map(({ transition: t, blocked }) => {
              const danger = t.action === 'cancel' || t.action === 'reject' || t.action === 'close_short';
              return (
                <ActionButton
                  key={`${t.action}-${String(t.needsReason)}`}
                  variant={danger || t.action === 'withdraw' || t.action === 'request_changes' ? 'outline' : 'default'}
                  className={cn(danger && 'text-destructive hover:text-destructive')}
                  blockedReason={blocked && codeMessage(blocked)}
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
          Đề nghị bù hàng cho phiếu trả {source.number}. Lưu xong, phiếu trả sẽ liên kết tới đề nghị này.
        </AlertMessage>
      )}

      {req && (
        <Card className="mb-4 py-4">
          <CardContent className="mb-2 border-b pb-4">
            <LifecycleSteps
              path={REQUEST_PATH}
              current={req.status}
              history={req.statusHistory}
              statuses={REQUEST_STATUS}
              isFinal={purchaseRequestMachine.isFinal}
              blocked={options.flatMap(({ transition: t, blocked }) =>
                blocked ? [{ label: t.label, reason: codeMessage(blocked) }] : [],
              )}
            />
          </CardContent>
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
            <Info label="Còn chờ">{formatQty(req.outstanding)}</Info>
            {req.totalCost !== null && <Info label="Giá trị">{formatCurrency(req.totalCost)}</Info>}
            {req.sourceReturn && (
              <Info label="Bù hàng cho">
                <DocLink companyId={companyId} docRef={req.sourceReturn} />
              </Info>
            )}
            {req.receipts.length > 0 && (
              <Info label="Phiếu nhận">
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
                  onValueChange={(v) => setValue('supplierId', v, { shouldDirty: true, shouldValidate: true })}
                >
                  <SelectTrigger id="req-supplier" className="w-full" aria-invalid={Boolean(errors.supplierId)}>
                    <SelectValue placeholder="Chọn nhà cung cấp" />
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

          {editable && (
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
              <Button type="button" variant="outline" disabled={busy} onClick={() => append(emptyLine({ isNew: true }))}>
                <Plus />
                Sản phẩm mới
              </Button>
            </div>
          )}
          {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}

          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="request-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Biến thể</TableHead>
                  <TableHead className="w-32 text-right">Số lượng</TableHead>
                  {showCost && <TableHead className="w-40 text-right">Giá nhập</TableHead>}
                  {showProgress && (
                    <>
                      <TableHead className="w-24 text-right">Đã nhận</TableHead>
                      <TableHead className="w-24 text-right">Lỗi giữ</TableHead>
                      <TableHead className="w-24 text-right">Còn chờ</TableHead>
                    </>
                  )}
                  {(editable || canExclude) && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!fields.length && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                      {editable ? 'Tìm biến thể có sẵn hoặc thêm sản phẩm mới.' : 'Đề nghị không có dòng nào.'}
                    </TableCell>
                  </TableRow>
                )}
                {fields.map((f, i) => {
                  const line = req?.lines[i];
                  const live = lines[i] ?? f;
                  const lineErrors = errors.lines?.[i];
                  const name = f.sku || live.newName || `dòng ${i + 1}`;
                  return (
                    <TableRow
                      key={f.key}
                      data-row-id={line?.id ?? f.variantId ?? `new-${i}`}
                      className={cn('align-top', line?.excluded && 'opacity-60')}
                    >
                      <TableCell>
                        {live.isNew && editable ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            {textInput(i, 'newName', 'Tên sản phẩm mới', name)}
                            <div className="grid gap-1">
                              <Select
                                value={live.categoryId}
                                onValueChange={(v) =>
                                  setValue(`lines.${i}.categoryId`, v, { shouldDirty: true, shouldValidate: true })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-full"
                                  aria-label={`Danh mục ${name}`}
                                  aria-invalid={Boolean(lineErrors?.categoryId)}
                                >
                                  <SelectValue placeholder="Danh mục" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(categoriesQuery.data ?? []).map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {lineErrors?.categoryId && (
                                <p className="text-xs text-destructive">{lineErrors.categoryId.message}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-medium">
                              {f.sku || line?.newProduct?.name || live.newName}
                              {(live.isNew || line?.newProduct) && (
                                <Badge variant="info" className="ms-2">
                                  Sản phẩm mới
                                </Badge>
                              )}
                              {line?.excluded && (
                                <Badge variant="secondary" className="ms-2">
                                  Đã loại
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {line?.newProduct && !line.variantId
                                ? `Danh mục ${line.newProduct.categoryName}`
                                : `${f.productName}${f.attributesLabel ? ` · ${f.attributesLabel}` : ''}`}
                            </p>
                          </>
                        )}
                        {lineErrors?.variantId && <p className="text-xs text-destructive">{lineErrors.variantId.message}</p>}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? textInput(i, 'quantity', 'Số lượng', name) : formatQty(line?.quantity ?? 0)}
                      </TableCell>
                      {showCost && (
                        <TableCell className="text-right">
                          {editable
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
                              <span title={`Đóng thiếu ${line.closedShort}`}>0 (đóng thiếu {formatQty(line.closedShort)})</span>
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
                              label={line.excluded ? 'Lấy lại dòng' : 'Loại dòng'}
                              destructive={!line.excluded}
                              reason={busy ? 'Đang lưu' : null}
                              onClick={() => onExclude(line.id, !line.excluded)}
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

      {req && req.statusHistory.length > 0 && (
        <Card className="mt-4 py-4">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline history={req.statusHistory} statuses={REQUEST_STATUS} />
          </CardContent>
        </Card>
      )}

      <SecondPersonDialog
        open={confirm === 'approve'}
        title={`Duyệt ${req?.number ?? 'đề nghị'}?`}
        createdByName={req?.createdBy ?? ''}
        selfApproval={req?.createdById === actor.accountId}
        loading={busy}
        onConfirm={() => onConfirmAction('approve')}
        onClose={() => setConfirm(null)}
      >
        {confirmText?.message}
      </SecondPersonDialog>
      <ConfirmDialog
        open={Boolean(confirmText) && confirm !== 'approve'}
        title={`${confirmText?.title ?? ''} ${req?.number ?? 'đề nghị'}?`}
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
          onCreate={async (deliveryMode, note) => {
            try {
              const created = await receiptMut.mutateAsync({ requestId: req.id, deliveryMode, note });
              toast.success(`Đã lập phiếu nhận ${created.number}`);
              navigate(ROUTES.company.goodsReceipt(companyId, created.id));
            } catch (e) {
              setReceiving(false);
              handleError(e);
            }
          }}
        />
      )}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message="Thay đổi trên đề nghị chưa được lưu sẽ bị bỏ."
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

function CreateReceiptDialog({
  open,
  number,
  loading,
  onClose,
  onCreate,
}: {
  open: boolean;
  number: string;
  loading: boolean;
  onClose: () => void;
  onCreate: (mode: DeliveryMode, note: string) => void;
}) {
  const [mode, setMode] = useState<DeliveryMode>('waiting');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setMode('waiting');
      setNote('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lập phiếu nhận cho {number}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Phiếu lấy các dòng còn chờ của đề nghị. Kho nhập số báo giao và số kiểm được rồi ghi sổ một lần.
        </p>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeliveryMode)} className="grid gap-2">
          {(Object.keys(DELIVERY_LABELS) as DeliveryMode[]).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={m} aria-label={DELIVERY_LABELS[m]} />
              {DELIVERY_LABELS[m]}
            </label>
          ))}
        </RadioGroup>
        <div className="grid gap-1.5">
          <Label htmlFor="receipt-note">Ghi chú</Label>
          <Textarea id="receipt-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button disabled={loading} onClick={() => onCreate(mode, note.trim())}>
            {loading ? 'Đang lập...' : 'Lập phiếu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
