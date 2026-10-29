import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { AttachmentField, type AttachmentItem } from '@/components/common/AttachmentField';
import { ActionButton } from '@/components/common/ActionButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { SecondPersonDialog } from '@/components/common/SecondPersonDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useGoodsReceipt, useGoodsReceiptAction, useShortResolution, useUpdateGoodsReceipt } from '@/api/purchasing.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { codeMessage, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { goodsReceiptMachine, type GoodsReceiptRecord } from '@/lib/machines/purchasing';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import type { DeliveryMode, GoodsReceipt, GoodsReceiptAction, GoodsReceiptStatus, ShortResolutionKind } from '@/types/purchasing';
import {
  DELIVERY_LABELS,
  RECEIPT_STATUS,
  RESOLUTION_LABELS,
  formatQty,
  receiptFormSchema,
  shortOfDraft,
  type ReceiptFormInput,
  type ReceiptFormOutput,
} from './shared';
import { DocLink, Info, PageError, PageLoading, beforeUnloadGuard } from './parts';

type CountKey = 'announced' | 'accepted' | 'defectKept' | 'returnedOnSpot';

const toForm = (r: GoodsReceipt): ReceiptFormInput => ({
  deliveryMode: r.deliveryMode,
  note: r.note,
  lines: r.lines.map((l) => ({
    lineId: l.lineId,
    sku: l.sku,
    productName: l.productName,
    attributesLabel: l.attributesLabel,
    outstanding: l.outstanding,
    announced: String(l.announced),
    accepted: String(l.accepted),
    defectKept: String(l.defectKept),
    returnedOnSpot: String(l.returnedOnSpot),
    reason: l.reason,
  })),
});

/** Đường chính trên thanh tiến trình (PATHS.gr của Test_UI) */
const RECEIPT_PATH: GoodsReceiptStatus[] = ['counting', 'matched'];

const ACTION_CONFIRM: Partial<Record<GoodsReceiptAction, { title: string; message: string }>> = {
  post: {
    title: 'Ghi sổ',
    message: 'Hàng đạt vào tồn thực, hàng lỗi giữ lại vào chờ xử lý (kèm phiếu trả NCC nháp). Phiếu đã ghi sổ không sửa được.',
  },
  post_short: {
    title: 'Ghi sổ, báo giao thiếu',
    message: 'Ghi sổ như trên; đề nghị gắn cờ "NCC giao thiếu" đến khi Mua hàng ghi kết quả.',
  },
};

/**
 * Phiếu nhận (sơ đồ A2). Kho lập từ đề nghị đã đặt NCC, nhập báo giao, đạt, lỗi giữ, trả tại chỗ; thiếu tự tính.
 * Người ghi sổ khác người lập đề nghị. Có thiếu thì Mua hàng ghi kết quả: giao bù, đóng thiếu, NCC nhận sai.
 */
export function GoodsReceiptPage() {
  const navigate = useNavigate();
  const { receiptId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.goodsReceiptManage);
  const canResolve = can(PERMISSIONS.purchaseRequestManage);
  const canCloseShort = can(PERMISSIONS.purchaseRequestApprove);
  const actor = useTransitionActor();

  const query = useGoodsReceipt(receiptId);
  const receipt = query.data;
  const editable = canManage && receipt?.status === 'counting';

  const updateMut = useUpdateGoodsReceipt();
  const actionMut = useGoodsReceiptAction();
  const resolveMut = useShortResolution();
  const [uploading, setUploading] = useState(false);
  const busy = updateMut.isPending || actionMut.isPending || resolveMut.isPending || uploading;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ReceiptFormInput, unknown, ReceiptFormOutput>({
    resolver: zodResolver(receiptFormSchema) as unknown as Resolver<ReceiptFormInput, unknown, ReceiptFormOutput>,
    defaultValues: { deliveryMode: 'waiting', note: '', lines: [] },
  });
  const { fields } = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const deliveryMode = useWatch({ control, name: 'deliveryMode' });

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentsDirty, setAttachmentsDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<GoodsReceiptAction | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const loaded = useRef<string | null>(null);

  const load = (latest: GoodsReceipt) => {
    loaded.current = latest.id;
    reset(toForm(latest));
    setAttachments(latest.attachments);
    setAttachmentsDirty(false);
    setVersion(latest.version);
  };

  useEffect(() => {
    if (receipt && loaded.current !== receipt.id) load(receipt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt]);

  const dirty = isDirty || attachmentsDirty;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => Boolean(editable) && dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => beforeUnloadGuard(Boolean(editable) && dirty), [editable, dirty]);

  const short = editable ? lines.reduce((s, l) => s + shortOfDraft(l), 0) : (receipt?.shortQty ?? 0);
  const record: GoodsReceiptRecord = { createdBy: receipt?.requestCreatedById ?? '', short };
  const options = receipt ? goodsReceiptMachine.options(receipt.status, actor, record) : [];

  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<GoodsReceipt>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({
        severity: 'warning',
        msg: 'Phiếu vừa được người khác sửa hoặc ghi sổ. Form đã hiện bản mới nhất, chưa có gì thay đổi.',
      });
      return;
    }
    if (problem?.code === 'invalid_transition') {
      loaded.current = null;
      void query.refetch();
    }
    const fieldErrors = problem?.errors ?? {};
    let placed = 0;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)\.(announced|accepted|defectKept|returnedOnSpot|reason)$/.exec(path);
      if (m) {
        setError(`lines.${Number(m[1])}.${m[2] as CountKey}`, { message });
        placed++;
      } else if (path === 'note') {
        setError('note', { message });
        placed++;
      }
    }
    setNotice({
      severity: 'error',
      msg: fieldErrors.attachmentIds ?? (placed ? `${problem?.title ?? 'Dữ liệu không hợp lệ'}. Xem các ô báo đỏ.` : problemMessage(e)),
    });
  };

  const save = async (values: ReceiptFormOutput): Promise<GoodsReceipt | null> => {
    if (!receipt) return null;
    setNotice(null);
    if (!dirty) return { ...receipt, version };
    try {
      const saved = await updateMut.mutateAsync({
        id: receipt.id,
        deliveryMode: values.deliveryMode,
        note: values.note,
        attachmentIds: attachments.map((a) => a.fileId),
        lines: values.lines.map((l) => ({
          lineId: l.lineId,
          announced: l.announced,
          accepted: l.accepted,
          defectKept: l.defectKept,
          returnedOnSpot: l.returnedOnSpot,
          reason: l.reason,
        })),
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
    if (saved) toast.success(`Đã lưu ${saved.number}`);
  });

  const runAction = async (target: GoodsReceipt, action: GoodsReceiptAction, reason?: string) => {
    try {
      const next = await actionMut.mutateAsync({ id: target.id, action, version: target.version, reason });
      load(next);
      toast.success(`${next.number}: ${RECEIPT_STATUS[next.status].label.toLowerCase()}`);
      return true;
    } catch (e) {
      if (reason !== undefined) setReasonError(problemMessage(e));
      else handleError(e);
      return false;
    }
  };

  const onConfirmAction = (action: GoodsReceiptAction) => {
    setConfirm(null);
    void handleSubmit(async (values) => {
      const saved = await save(values);
      if (saved) await runAction(saved, action);
    })();
  };

  const onCancel = async (reason: string) => {
    if (!receipt) return;
    setReasonError(null);
    if (await runAction({ ...receipt, version }, 'cancel', reason)) setCancelling(false);
  };

  const backToList = () => navigate(ROUTES.company.purchasing(companyId, 'receipts'));

  if (query.isError) return <PageError message={getErrorMessage(query.error)} onBack={backToList} />;
  if (!receipt) return <PageLoading />;

  const confirmText = confirm ? ACTION_CONFIRM[confirm] : undefined;
  const countInput = (i: number, key: CountKey, label: string, sku: string) => {
    const err = errors.lines?.[i]?.[key];
    return (
      <div className="grid gap-1">
        <Input
          {...register(`lines.${i}.${key}`)}
          aria-label={`${label} ${sku}`}
          inputMode="numeric"
          aria-invalid={Boolean(err)}
          className="h-8 text-right"
        />
        {err && <p className="text-start text-xs text-destructive">{err.message}</p>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={`Phiếu nhận ${receipt.number}`}
        subtitle="Đếm hàng theo từng dòng; thiếu = báo giao − đạt − lỗi giữ − trả tại chỗ. Ghi sổ một lần."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={backToList}>
              <ArrowLeft />
              Danh sách
            </Button>
            {editable && (
              <Button variant="outline" disabled={busy || !dirty} onClick={onSave}>
                <Save />
                Lưu
              </Button>
            )}
            {options.map(({ transition: t, blocked }) => (
              <ActionButton
                key={t.action}
                variant={t.action === 'cancel' ? 'outline' : 'default'}
                className={cn(t.action === 'cancel' && 'text-destructive hover:text-destructive')}
                blockedReason={blocked && codeMessage(blocked)}
                disabled={busy}
                onClick={() => (t.action === 'cancel' ? setCancelling(true) : setConfirm(t.action))}
              >
                {t.label}
              </ActionButton>
            ))}
          </div>
        }
      />

      {notice && (
        <AlertMessage severity={notice.severity} className="mb-4" onClose={() => setNotice(null)}>
          {notice.msg}
        </AlertMessage>
      )}
      {receipt.status === 'counting' && receipt.deliveryMode === 'left' && (
        <AlertMessage severity="warning" className="mb-4">
          Người giao đã đi: kiểm và ghi sổ trong 24 giờ kể từ khi lập phiếu ({formatDateTime(receipt.createdAt)}).
        </AlertMessage>
      )}

      <Card className="mb-4 py-4">
        <CardContent className="mb-2 border-b pb-4">
          <LifecycleSteps
            path={RECEIPT_PATH}
            current={receipt.status}
            history={receipt.statusHistory}
            statuses={RECEIPT_STATUS}
            isFinal={goodsReceiptMachine.isFinal}
            blocked={options.flatMap(({ transition: t, blocked }) =>
              blocked === 'second_person_required' ? [{ label: t.label, reason: codeMessage(blocked) }] : [],
            )}
          />
        </CardContent>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Info label="Trạng thái">
            <div data-testid="receipt-status">
              <StatusBadge status={receipt.status} statuses={RECEIPT_STATUS} />
            </div>
          </Info>
          <Info label="Đề nghị nhập">
            <DocLink companyId={companyId} docRef={{ type: 'purchase_request', ...receipt.request }} />
            {' · '}
            {receipt.supplier.name}
          </Info>
          <Info label="Người lập">
            {receipt.createdBy} · {formatDateTime(receipt.createdAt)}
          </Info>
          <Info label="Ghi sổ">{receipt.postedAt ? `${receipt.postedBy} · ${formatDateTime(receipt.postedAt)}` : '—'}</Info>
          {receipt.followUps.length > 0 && (
            <Info label="Phiếu sinh tiếp">
              <div className="flex flex-wrap gap-x-3">
                {receipt.followUps.map((f) => (
                  <DocLink key={f.id} companyId={companyId} docRef={f} />
                ))}
              </div>
            </Info>
          )}
          {receipt.shortResolution && (
            <Info label="Kết quả giao thiếu">
              {RESOLUTION_LABELS[receipt.shortResolution.kind]}
              {receipt.shortResolution.followUp && (
                <>
                  {' · '}
                  <DocLink companyId={companyId} docRef={receipt.shortResolution.followUp} />
                </>
              )}
              {receipt.shortResolution.note && (
                <p className="text-xs text-muted-foreground">{receipt.shortResolution.note}</p>
              )}
            </Info>
          )}
        </CardContent>
      </Card>

      {receipt.status === 'short' && !receipt.shortResolution && canResolve && (
        <ShortResolutionCard
          receipt={receipt}
          canCloseShort={canCloseShort}
          loading={resolveMut.isPending}
          onSubmit={async (input, setFieldError) => {
            try {
              const next = await resolveMut.mutateAsync({ id: receipt.id, ...input, version });
              load(next);
              toast.success(`${next.number}: đã ghi kết quả giao thiếu`);
            } catch (e) {
              const problem = getProblem(e);
              const errs = problem?.errors ?? {};
              if (errs.followUpNumber || errs.note) setFieldError(errs.followUpNumber ?? null, errs.note ?? null);
              else handleError(e);
            }
          }}
        />
      )}

      <Card className="py-4">
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Cách giao</Label>
              {editable ? (
                <RadioGroup
                  value={deliveryMode}
                  onValueChange={(v) => setValue('deliveryMode', v as DeliveryMode, { shouldDirty: true })}
                  className="grid gap-1"
                >
                  {(Object.keys(DELIVERY_LABELS) as DeliveryMode[]).map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={m} aria-label={DELIVERY_LABELS[m]} />
                      {DELIVERY_LABELS[m]}
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                <p className="text-sm">{DELIVERY_LABELS[receipt.deliveryMode]}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="receipt-note">Ghi chú</Label>
              {editable ? (
                <Textarea id="receipt-note" rows={2} aria-invalid={Boolean(errors.note)} {...register('note')} />
              ) : (
                <p className="text-sm whitespace-pre-line">{receipt.note || '—'}</p>
              )}
              {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="receipt-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Biến thể</TableHead>
                  <TableHead className="w-20 text-right">Còn chờ</TableHead>
                  <TableHead className="w-24 text-right">Báo giao</TableHead>
                  <TableHead className="w-24 text-right">Đạt</TableHead>
                  <TableHead className="w-24 text-right">Lỗi giữ</TableHead>
                  <TableHead className="w-24 text-right">Trả tại chỗ</TableHead>
                  <TableHead className="w-20 text-right">Thiếu</TableHead>
                  <TableHead className="min-w-48">Lý do</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!fields.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      Phiếu không có dòng nào.
                    </TableCell>
                  </TableRow>
                )}
                {fields.map((f, i) => {
                  const line = receipt.lines[i];
                  const live = lines[i] ?? f;
                  const lineShort = editable ? shortOfDraft(live) : (line?.short ?? 0);
                  const reasonErr = errors.lines?.[i]?.reason;
                  return (
                    <TableRow key={f.key} data-row-id={f.lineId} className="align-top">
                      <TableCell>
                        <p className="font-medium">{f.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.productName}
                          {f.attributesLabel ? ` · ${f.attributesLabel}` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatQty(f.outstanding)}</TableCell>
                      {(['announced', 'accepted', 'defectKept', 'returnedOnSpot'] as CountKey[]).map((key) => (
                        <TableCell key={key} className="text-right">
                          {editable
                            ? countInput(i, key, { announced: 'Báo giao', accepted: 'Đạt', defectKept: 'Lỗi giữ', returnedOnSpot: 'Trả tại chỗ' }[key], f.sku)
                            : formatQty(line?.[key] ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell className={cn('text-right', lineShort > 0 && 'font-medium text-destructive')}>
                        {formatQty(lineShort)}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <div className="grid gap-1">
                            <Input
                              {...register(`lines.${i}.reason`)}
                              aria-label={`Lý do ${f.sku}`}
                              aria-invalid={Boolean(reasonErr)}
                              className="h-8"
                            />
                            {reasonErr && <p className="text-xs text-destructive">{reasonErr.message}</p>}
                          </div>
                        ) : (
                          <span className="text-sm">{line?.reason || '—'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {short > 0 && (
            <p className="text-end text-sm">
              Tổng thiếu <span className="font-medium text-destructive">{formatQty(short)}</span>
            </p>
          )}

          <div className="grid gap-1.5">
            <Label>Ảnh, biên bản giao nhận</Label>
            {editable ? (
              <AttachmentField
                value={attachments}
                onChange={(next) => {
                  setAttachments(next);
                  setAttachmentsDirty(true);
                }}
                onBusyChange={setUploading}
                disabled={busy && !uploading}
              />
            ) : attachments.length ? (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <a
                    key={a.fileId}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {a.name}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Không có đính kèm.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {receipt.statusHistory.length > 0 && (
        <Card className="mt-4 py-4">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline history={receipt.statusHistory} statuses={RECEIPT_STATUS} />
          </CardContent>
        </Card>
      )}

      <SecondPersonDialog
        open={Boolean(confirmText)}
        title={`${confirmText?.title ?? ''} ${receipt.number}?`}
        ownerLabel="Người lập đề nghị"
        createdByName={receipt.request.number}
        selfApproval={receipt.requestCreatedById === actor.accountId}
        confirmLabel={confirmText?.title}
        loading={busy}
        onConfirm={() => confirm && onConfirmAction(confirm)}
        onClose={() => setConfirm(null)}
      >
        {confirmText?.message}
      </SecondPersonDialog>
      <ReasonDialog
        open={cancelling}
        title={`Huỷ phiếu ${receipt.number}`}
        message="Phiếu chưa ghi sổ nên tồn kho không đổi; đề nghị vẫn còn chờ như cũ."
        confirmLabel="Huỷ phiếu"
        destructive
        loading={busy}
        error={reasonError}
        onConfirm={onCancel}
        onClose={() => {
          setCancelling(false);
          setReasonError(null);
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        message="Số đếm và đính kèm chưa lưu sẽ bị bỏ."
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

function ShortResolutionCard({
  receipt,
  canCloseShort,
  loading,
  onSubmit,
}: {
  receipt: GoodsReceipt;
  canCloseShort: boolean;
  loading: boolean;
  onSubmit: (
    input: { kind: ShortResolutionKind; followUpNumber?: string; note: string },
    setFieldError: (followUp: string | null, note: string | null) => void,
  ) => void;
}) {
  const kinds = (Object.keys(RESOLUTION_LABELS) as ShortResolutionKind[]).filter(
    (k) => k !== 'close_short' || canCloseShort,
  );
  const [kind, setKind] = useState<ShortResolutionKind>('follow_up');
  const [followUp, setFollowUp] = useState('');
  const [note, setNote] = useState('');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const submit = () => {
    const f = followUp.trim();
    const n = note.trim();
    const fe = kind === 'follow_up' && !f ? 'Nhập số phiếu nhận giao bù' : null;
    const ne = kind !== 'follow_up' && !n ? (kind === 'close_short' ? 'Nhập lý do đóng thiếu' : 'Ghi NCC nhận sai thế nào') : n.length > 500 ? 'Tối đa 500 ký tự' : null;
    setFollowUpError(fe);
    setNoteError(ne);
    if (fe || ne) return;
    onSubmit({ kind, followUpNumber: kind === 'follow_up' ? f : undefined, note: n }, (a, b) => {
      setFollowUpError(a);
      setNoteError(b);
    });
  };

  return (
    <Card className="mb-4 border-destructive/40 py-4" data-testid="short-resolution">
      <CardHeader>
        <CardTitle className="text-base">Ghi kết quả giao thiếu ({formatQty(receipt.shortQty)})</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <RadioGroup value={kind} onValueChange={(v) => setKind(v as ShortResolutionKind)} className="grid gap-1">
          {kinds.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={k} aria-label={RESOLUTION_LABELS[k]} />
              {RESOLUTION_LABELS[k]}
            </label>
          ))}
        </RadioGroup>
        {kind === 'follow_up' && (
          <div className="grid gap-1.5 md:max-w-xs">
            <Label htmlFor="follow-up-number">Số phiếu nhận giao bù</Label>
            <Input
              id="follow-up-number"
              placeholder="NH-000123"
              value={followUp}
              aria-invalid={Boolean(followUpError)}
              onChange={(e) => setFollowUp(e.target.value)}
            />
            {followUpError && <p className="text-sm text-destructive">{followUpError}</p>}
            <p className="text-xs text-muted-foreground">Lập phiếu nhận mới ở đề nghị khi hàng bù tới, rồi ghi số phiếu đó ở đây.</p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="resolution-note">{kind === 'follow_up' ? 'Ghi chú' : 'Lý do'}</Label>
          <Textarea
            id="resolution-note"
            rows={2}
            value={note}
            aria-invalid={Boolean(noteError)}
            onChange={(e) => setNote(e.target.value)}
          />
          {noteError && <p className="text-sm text-destructive">{noteError}</p>}
        </div>
        <div>
          <Button disabled={loading} onClick={submit}>
            {loading ? 'Đang ghi...' : 'Ghi kết quả'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
