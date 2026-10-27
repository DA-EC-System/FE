import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, FilePlus2, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { RowAction } from '@/components/common/RowAction';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useSaveSupplierReturn, useSupplierReturn, useSupplierReturnAction, useSuppliers } from '@/api/purchasing.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { VariantPicker } from '@/features/inventory/VariantPicker';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { supplierReturnMachine, type SupplierReturnRecord } from '@/lib/machines/purchasing';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import type {
  SupplierReturn,
  SupplierReturnAction,
  SupplierReturnActionInput,
  SupplierReturnCancelDecision,
} from '@/types/purchasing';
import {
  CANCEL_DECISION_LABELS,
  RETURN_STATUS,
  formatQty,
  refundSchema,
  returnFormSchema,
  type ReturnFormInput,
  type ReturnFormOutput,
} from './shared';
import { DocLink, Info, PageError, PageLoading, beforeUnloadGuard } from './parts';

const toForm = (r: SupplierReturn): ReturnFormInput => ({
  supplierId: r.supplier?.id ?? '',
  note: r.note,
  lines: r.lines.map((l) => ({
    variantId: l.variantId,
    sku: l.sku,
    productName: l.productName,
    attributesLabel: l.attributesLabel,
    // Đang ở nháp thì hàng chưa rời chờ xử lý: số trên phiếu nằm trong số chờ xử lý
    quarantine: l.quarantine,
    quantity: String(l.quantity),
  })),
});

const ACTION_CONFIRM: Partial<Record<SupplierReturnAction, { title: string; message: string }>> = {
  submit: { title: 'Gửi duyệt', message: 'Phiếu chờ CEO duyệt và gửi; trong lúc chờ không sửa được.' },
  approve_send: { title: 'Duyệt và gửi', message: 'Hàng rời kho: chờ xử lý giảm theo số trên phiếu. Người khác bạn sẽ ghi kết quả từ NCC.' },
  record_replaced: {
    title: 'NCC bù hàng',
    message: 'Phiếu kết thúc. Sau đó lập đề nghị bù hàng (điền sẵn từ phiếu này) để kho nhận hàng bù như một lần nhập.',
  },
  record_rejected: { title: 'NCC không nhận', message: 'Hàng quay về chờ xử lý; lập phiếu xuất huỷ hoặc trả lại lần khác.' },
};

/**
 * Phiếu trả NCC (sơ đồ B4). Hệ thống sinh nháp khi phiếu nhận có hàng lỗi giữ lại; Mua hàng cũng lập tay từ
 * hàng chờ xử lý. CEO duyệt và gửi (chờ xử lý giảm). Người khác người gửi ghi kết quả: hoàn tiền, bù hàng, không nhận.
 * Huỷ phải chọn nhập lại tồn hoặc xuất huỷ.
 */
export function SupplierReturnPage() {
  const navigate = useNavigate();
  const { returnId = '' } = useParams();
  const isNew = returnId === 'new';
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.supplierReturnManage);
  const canRequest = can(PERMISSIONS.purchaseRequestManage);
  const actor = useTransitionActor();

  const query = useSupplierReturn(isNew ? undefined : returnId);
  const ret = query.data;
  const suppliersQuery = useSuppliers({}, { enabled: canManage });
  const editable = canManage && (isNew || ret?.status === 'draft');

  const saveMut = useSaveSupplierReturn();
  const actionMut = useSupplierReturnAction();
  const busy = saveMut.isPending || actionMut.isPending;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ReturnFormInput, unknown, ReturnFormOutput>({
    resolver: zodResolver(returnFormSchema) as unknown as Resolver<ReturnFormInput, unknown, ReturnFormOutput>,
    defaultValues: { supplierId: '', note: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const supplierId = useWatch({ control, name: 'supplierId' });

  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<SupplierReturnAction | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const loaded = useRef<string | null>(null);
  const skipBlock = useRef(false);

  const load = (latest: SupplierReturn) => {
    loaded.current = latest.id;
    reset(toForm(latest));
    setVersion(latest.version);
  };

  useEffect(() => {
    if (ret && loaded.current !== ret.id) load(ret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ret]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !skipBlock.current && editable && isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => beforeUnloadGuard(editable && isDirty), [editable, isDirty]);

  const taken = useMemo(() => new Set(fields.map((f) => f.variantId)), [fields]);

  const record: SupplierReturnRecord = {
    createdBy: ret?.sentById ?? null,
    lineCount: lines.length,
    hasSupplier: Boolean(supplierId),
  };
  const actions = supplierReturnMachine.available(ret?.status ?? 'draft', actor, record);
  const recordBlocked = ret?.status === 'sent' && canManage && ret.sentById === actor.accountId;

  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<SupplierReturn>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({ severity: 'warning', msg: 'Phiếu vừa được người khác sửa hoặc xử lý. Form đã hiện bản mới nhất.' });
      return;
    }
    if (problem?.code === 'invalid_transition') {
      loaded.current = null;
      void query.refetch();
    }
    const fieldErrors = problem?.errors ?? {};
    let placed = 0;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)\.(variantId|quantity)$/.exec(path);
      if (m) {
        setError(`lines.${Number(m[1])}.${m[2] as 'quantity'}`, { message });
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

  const save = async (values: ReturnFormOutput): Promise<SupplierReturn | null> => {
    setNotice(null);
    const body = {
      supplierId: values.supplierId || null,
      note: values.note,
      lines: values.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    };
    try {
      if (isNew) {
        const created = await saveMut.mutateAsync(body);
        load(created);
        skipBlock.current = true;
        navigate(ROUTES.company.supplierReturn(companyId, created.id), { replace: true });
        skipBlock.current = false;
        return created;
      }
      if (!isDirty && ret) return { ...ret, version };
      const saved = await saveMut.mutateAsync({ id: returnId, ...body, version });
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
    target: SupplierReturn,
    action: SupplierReturnAction,
    extra: Omit<SupplierReturnActionInput, 'version'> = {},
    inDialog = false,
  ) => {
    try {
      const next = await actionMut.mutateAsync({ id: target.id, action, version: target.version, ...extra });
      load(next);
      toast.success(`${next.number}: ${RETURN_STATUS[next.status].label.toLowerCase()}`);
      return true;
    } catch (e) {
      if (inDialog) setDialogError(problemMessage(e));
      else handleError(e);
      return false;
    }
  };

  const onConfirmAction = (action: SupplierReturnAction) => {
    setConfirm(null);
    if (action === 'submit') {
      void handleSubmit(async (values) => {
        const saved = await save(values);
        if (saved) await runAction(saved, action);
      })();
      return;
    }
    if (ret) void runAction({ ...ret, version }, action);
  };

  const onActionClick = (action: SupplierReturnAction) => {
    setDialogError(null);
    if (action === 'send_back') setSendingBack(true);
    else if (action === 'cancel') setCancelling(true);
    else if (action === 'record_refund') setRefunding(true);
    else setConfirm(action);
  };

  const backToList = () => navigate(ROUTES.company.purchasing(companyId, 'returns'));

  if (isNew && !canManage) {
    return <PageError severity="warning" message="Bạn không có quyền lập phiếu trả NCC." onBack={backToList} />;
  }
  if (query.isError) return <PageError message={getErrorMessage(query.error)} onBack={backToList} />;
  if (!isNew && !ret) return <PageLoading />;

  const showCost = Boolean(ret?.lines.some((l) => l.unitCost !== null));
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;
  const confirmText = confirm ? ACTION_CONFIRM[confirm] : undefined;
  const colCount = 3 + (showCost ? 1 : 0) + (editable ? 1 : 0);
  const supplierOptions = (suppliersQuery.data ?? []).filter((s) => s.active || s.id === supplierId);
  const canReplace = ret?.status === 'replaced' && !ret.replacementRequest && canRequest;

  return (
    <div>
      <PageHeader
        title={ret ? `Phiếu trả NCC ${ret.number}` : 'Lập phiếu trả NCC'}
        subtitle="Trả hàng lỗi đang ở chờ xử lý cho nhà cung cấp. CEO duyệt và gửi; người khác người gửi ghi kết quả."
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
            {canReplace && ret && (
              <Button onClick={() => navigate(ROUTES.company.purchaseRequestNew(companyId, ret.id))}>
                <FilePlus2 />
                Lập đề nghị bù hàng
              </Button>
            )}
            {(isNew ? actions.filter((a) => a.action === 'submit') : actions).map((t) => {
              const danger = t.action === 'cancel' || t.action === 'record_rejected';
              return (
                <Button
                  key={t.action}
                  variant={danger || t.action === 'send_back' ? 'outline' : 'default'}
                  className={cn(danger && 'text-destructive hover:text-destructive')}
                  disabled={busy}
                  onClick={() => onActionClick(t.action)}
                >
                  {t.label}
                </Button>
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
      {recordBlocked && (
        <AlertMessage severity="info" className="mb-4">
          Bạn là người gửi phiếu này nên không tự ghi kết quả từ NCC. Cần người khác ghi.
        </AlertMessage>
      )}

      {ret && (
        <Card className="mb-4 py-4">
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info label="Trạng thái">
              <div data-testid="return-status">
                <StatusBadge status={ret.status} statuses={RETURN_STATUS} />
              </div>
            </Info>
            <Info label="Nguồn">{ret.source ? <DocLink companyId={companyId} docRef={ret.source} /> : 'Lập tay'}</Info>
            <Info label="Người lập">
              {ret.createdBy} · {formatDateTime(ret.createdAt)}
            </Info>
            <Info label="Gửi">{ret.sentAt ? `${ret.sentBy} · ${formatDateTime(ret.sentAt)}` : '—'}</Info>
            {ret.refundAmount !== null && <Info label="NCC hoàn">{formatCurrency(ret.refundAmount)}</Info>}
            {ret.replacementRequest && (
              <Info label="Đề nghị bù hàng">
                <DocLink companyId={companyId} docRef={ret.replacementRequest} />
              </Info>
            )}
            {ret.cancelDecision && <Info label="Xử lý khi huỷ">{CANCEL_DECISION_LABELS[ret.cancelDecision]}</Info>}
            {ret.followUps.length > 0 && (
              <Info label="Phiếu sinh tiếp">
                <div className="flex flex-wrap gap-x-3">
                  {ret.followUps.map((f) => (
                    <DocLink key={f.id} companyId={companyId} docRef={f} />
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
              <Label htmlFor="ret-supplier">Nhà cung cấp</Label>
              {editable ? (
                <Select value={supplierId} onValueChange={(v) => setValue('supplierId', v, { shouldDirty: true })}>
                  <SelectTrigger id="ret-supplier" className="w-full" aria-invalid={Boolean(errors.supplierId)}>
                    <SelectValue placeholder="Chọn nhà cung cấp (bắt buộc khi gửi duyệt)" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{ret?.supplier?.name ?? '—'}</p>
              )}
              {errors.supplierId && <p className="text-sm text-destructive">{errors.supplierId.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ret-note">Ghi chú</Label>
              {editable ? (
                <Textarea id="ret-note" rows={1} aria-invalid={Boolean(errors.note)} {...register('note')} />
              ) : (
                <p className="text-sm whitespace-pre-line">{ret?.note || '—'}</p>
              )}
              {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
            </div>
          </div>

          {editable && (
            <VariantPicker
              taken={taken}
              disabled={busy}
              onPick={(level) => {
                if (level.quarantine <= 0) {
                  toast.warning(`${level.sku} không có hàng chờ xử lý để trả`);
                  return;
                }
                append({
                  variantId: level.variantId,
                  sku: level.sku,
                  productName: level.productName,
                  attributesLabel: level.attributesLabel,
                  quarantine: level.quarantine,
                  quantity: String(level.quarantine),
                });
              }}
            />
          )}
          {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}

          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="return-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Biến thể</TableHead>
                  <TableHead className="w-28 text-right">Chờ xử lý</TableHead>
                  <TableHead className="w-32 text-right">Số trả</TableHead>
                  {showCost && <TableHead className="w-36 text-right">Giá vốn</TableHead>}
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!fields.length && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                      {editable ? 'Tìm biến thể có hàng chờ xử lý để thêm vào phiếu.' : 'Phiếu không có dòng nào.'}
                    </TableCell>
                  </TableRow>
                )}
                {fields.map((f, i) => {
                  const line = ret?.lines[i];
                  const err = errors.lines?.[i]?.quantity;
                  return (
                    <TableRow key={f.key} data-row-id={f.variantId} className="align-top">
                      <TableCell>
                        <p className="font-medium">{f.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.productName}
                          {f.attributesLabel ? ` · ${f.attributesLabel}` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatQty(f.quarantine)}</TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <div className="grid gap-1">
                            <Input
                              {...register(`lines.${i}.quantity`)}
                              aria-label={`Số trả ${f.sku}`}
                              inputMode="numeric"
                              aria-invalid={Boolean(err)}
                              className="h-8 text-right"
                            />
                            {err && <p className="text-start text-xs text-destructive">{err.message}</p>}
                          </div>
                        ) : (
                          formatQty(line?.quantity ?? 0)
                        )}
                      </TableCell>
                      {showCost && (
                        <TableCell className="text-right">
                          {line?.unitCost === null || line?.unitCost === undefined ? '—' : formatCurrency(line.unitCost)}
                        </TableCell>
                      )}
                      {editable && (
                        <TableCell>
                          <RowAction label="Bỏ dòng" destructive reason={busy ? 'Đang lưu' : null} onClick={() => remove(i)}>
                            <Trash2 />
                          </RowAction>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {ret && ret.statusHistory.length > 0 && (
        <Card className="mt-4 py-4">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline history={ret.statusHistory} statuses={RETURN_STATUS} />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(confirmText)}
        title={`${confirmText?.title ?? ''} ${ret?.number ?? 'phiếu'}?`}
        message={confirmText?.message ?? ''}
        confirmLabel={confirmText?.title}
        destructive={confirm === 'record_rejected'}
        loading={busy}
        onConfirm={() => confirm && onConfirmAction(confirm)}
        onClose={() => setConfirm(null)}
      />
      <ReasonDialog
        open={sendingBack}
        title={`Trả về ${ret?.number ?? ''}`}
        message="Phiếu quay về nháp để Mua hàng sửa."
        confirmLabel="Trả về"
        loading={busy}
        error={dialogError}
        onConfirm={async (reason) => {
          if (ret && (await runAction({ ...ret, version }, 'send_back', { reason }, true))) setSendingBack(false);
        }}
        onClose={() => setSendingBack(false)}
      />
      <RefundDialog
        open={refunding}
        number={ret?.number ?? ''}
        loading={busy}
        error={dialogError}
        onClose={() => setRefunding(false)}
        onConfirm={async (refundAmount) => {
          if (ret && (await runAction({ ...ret, version }, 'record_refund', { refundAmount }, true))) setRefunding(false);
        }}
      />
      <CancelReturnDialog
        open={cancelling}
        number={ret?.number ?? ''}
        loading={busy}
        error={dialogError}
        onClose={() => setCancelling(false)}
        onConfirm={async (reason, cancelDecision) => {
          if (ret && (await runAction({ ...ret, version }, 'cancel', { reason, cancelDecision }, true))) setCancelling(false);
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message="Thay đổi trên phiếu chưa được lưu sẽ bị bỏ."
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

function RefundDialog({
  open,
  number,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  number: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setText('');
      setFieldError(null);
    }
  }, [open]);

  const submit = () => {
    const parsed = refundSchema.safeParse(text);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Số tiền không hợp lệ');
      return;
    }
    setFieldError(null);
    onConfirm(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>NCC hoàn tiền cho {number}</DialogTitle>
        </DialogHeader>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <div className="grid gap-1.5">
          <Label htmlFor="refund-amount">Số tiền NCC hoàn (đồng)</Label>
          <Input
            id="refund-amount"
            inputMode="numeric"
            value={text}
            aria-invalid={Boolean(fieldError)}
            onChange={(e) => setText(e.target.value)}
          />
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button disabled={loading} onClick={submit}>
            {loading ? 'Đang ghi...' : 'Ghi hoàn tiền'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelReturnDialog({
  open,
  number,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  number: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string, decision: SupplierReturnCancelDecision) => void;
}) {
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<SupplierReturnCancelDecision | ''>('');
  const [errs, setErrs] = useState<{ reason?: string; decision?: string }>({});
  useEffect(() => {
    if (open) {
      setReason('');
      setDecision('');
      setErrs({});
    }
  }, [open]);

  const submit = () => {
    const r = reason.trim();
    const next = {
      reason: !r ? 'Nhập lý do' : r.length > 500 ? 'Lý do tối đa 500 ký tự' : undefined,
      decision: decision ? undefined : 'Chọn cách xử lý hàng',
    };
    setErrs(next);
    if (next.reason || next.decision || !decision) return;
    onConfirm(r, decision);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Huỷ phiếu {number}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Hàng trên phiếu đang ở chờ xử lý. Chọn cách xử lý số hàng này.</p>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <RadioGroup
          value={decision}
          onValueChange={(v) => setDecision(v as SupplierReturnCancelDecision)}
          className="grid gap-1"
          aria-invalid={Boolean(errs.decision)}
        >
          {(Object.keys(CANCEL_DECISION_LABELS) as SupplierReturnCancelDecision[]).map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={d} aria-label={CANCEL_DECISION_LABELS[d]} />
              {CANCEL_DECISION_LABELS[d]}
            </label>
          ))}
        </RadioGroup>
        {errs.decision && <p className="text-sm text-destructive">{errs.decision}</p>}
        <div className="grid gap-1.5">
          <Label htmlFor="cancel-reason">Lý do</Label>
          <Textarea
            id="cancel-reason"
            rows={2}
            value={reason}
            aria-invalid={Boolean(errs.reason)}
            onChange={(e) => setReason(e.target.value)}
          />
          {errs.reason && <p className="text-sm text-destructive">{errs.reason}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Giữ lại
          </Button>
          <Button variant="destructive" disabled={loading} onClick={submit}>
            {loading ? 'Đang huỷ...' : 'Huỷ phiếu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
