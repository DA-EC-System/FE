import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useGoodsReceipt,
  useGoodsReceiptAction,
  usePurchaseRequest,
  useShortResolution,
  useUpdateGoodsReceipt,
} from '@/api/purchasing.api';
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
  newProductConfirmText,
  newProductPlan,
  prefillFullDelivery,
  receiptFormSchema,
  shortOfDraft,
  type ReceiptFormInput,
  type ReceiptFormOutput,
} from './shared';
import { DetailGrid, DiffTag, DocLink, Info, PageError, PageLoading, beforeUnloadGuard, receiptDiff } from './parts';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageGuide } from '@/guides/usePageGuide';

type CountKey = 'announced' | 'accepted' | 'defectKept' | 'returnedOnSpot';

const toForm = (r: GoodsReceipt): ReceiptFormInput => ({
  deliveryMode: r.deliveryMode,
  note: r.note,
  lines: r.lines.map((l) => ({
    lineId: l.lineId,
    sku: l.sku,
    isNew: l.isNew,
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

/** Thân hộp xác nhận; tiêu đề và nút lấy đúng nhãn của bước trong `goodsReceiptMachine` để khớp nút ở đầu trang */
const ACTION_CONFIRM: Partial<Record<GoodsReceiptAction, string>> = {
  post: 'Hàng đạt cộng vào tồn kho. Hàng lỗi giữ lại chuyển vào khu Hàng lỗi/chờ kiểm, kèm sẵn phiếu trả hàng NCC nháp. Sau khi nhập kho, phiếu không sửa được.',
  post_short: 'Nhập kho như trên. Đề nghị nhập hàng được đánh dấu "Nhà cung cấp giao thiếu" đến khi có cách xử lý phần thiếu.',
};

/**
 * Phiếu nhập kho (sơ đồ A2). Kho lập từ đề nghị đã đặt nhà cung cấp, nhập báo giao, đạt, lỗi giữ, trả tại chỗ; thiếu tự tính.
 * Người ghi sổ khác người lập đề nghị. Có thiếu thì Mua hàng ghi kết quả: giao bù, đóng thiếu, nhà cung cấp nhận sai.
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
  useBreadcrumb(receipt?.number);
  const { startTour } = usePageGuide('goods-receipt', { ready: Boolean(receipt) });
  const editable = canManage && receipt?.status === 'counting';
  // Dòng sản phẩm mới: đọc đề nghị để biết cha mới hay cha có sẵn, dòng đã có SKU chưa (câu trong hộp Nhập kho)
  const requestQuery = usePurchaseRequest(editable ? receipt?.request.id : undefined);

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
  /** Lỗi cả dòng BE trả lúc nhập kho (`errors["lines.<i>"]`, vd 409 `new_product_name_taken`), theo chỉ số dòng phiếu */
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const loaded = useRef<string | null>(null);

  const [prefilled, setPrefilled] = useState(false);

  const load = (latest: GoodsReceipt) => {
    loaded.current = latest.id;
    const values = toForm(latest);
    reset(values);
    // Phiếu vừa lập, chưa đếm dòng nào: điền sẵn như hàng về đủ, người dùng chỉ sửa dòng lệch (KB3 3.7). Đánh dấu đã sửa
    // để Lưu, Nhập kho gửi số này lên
    const fill = canManage && latest.status === 'counting' ? prefillFullDelivery(values.lines) : null;
    fill?.forEach((f, i) => {
      setValue(`lines.${i}.announced`, f.announced, { shouldDirty: true });
      setValue(`lines.${i}.accepted`, f.accepted, { shouldDirty: true });
    });
    setPrefilled(Boolean(fill));
    setAttachments(latest.attachments);
    setAttachmentsDirty(false);
    setVersion(latest.version);
    setRowErrors({});
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
        msg: 'Phiếu vừa được người khác sửa hoặc nhập kho. Trang đã hiện bản mới nhất, thay đổi của bạn chưa được lưu.',
      });
      return;
    }
    if (problem?.code === 'invalid_transition') {
      loaded.current = null;
      void query.refetch();
    }
    const fieldErrors = problem?.errors ?? {};
    let placed = 0;
    const rowErrs: Record<number, string> = {};
    for (const [path, message] of Object.entries(fieldErrors)) {
      const row = /^lines\.(\d+)$/.exec(path);
      if (row) {
        rowErrs[Number(row[1])] = message;
        continue;
      }
      const m = /^lines\.(\d+)\.(announced|accepted|defectKept|returnedOnSpot|reason)$/.exec(path);
      if (m) {
        setError(`lines.${Number(m[1])}.${m[2] as CountKey}`, { message });
        placed++;
      } else if (path === 'note') {
        setError('note', { message });
        placed++;
      }
    }
    setRowErrors(rowErrs);
    const rowMsgs = Object.entries(rowErrs).map(([i, m]) => `Dòng ${Number(i) + 1}: ${m}`);
    if (rowMsgs.length) {
      setNotice({ severity: 'error', msg: `${rowMsgs.join(' ')} Phiếu vẫn Đang kiểm.` });
      return;
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
  const plan = newProductPlan(editable ? lines : [], requestQuery.data?.lines);
  const planText = confirm === 'post' || confirm === 'post_short' ? newProductConfirmText(plan) : null;
  const pendingNew = editable ? lines.filter((l) => l.isNew && l.sku === null).length : 0;
  // Sau nhập kho: dòng sản phẩm mới đã có SKU, gộp theo tên sản phẩm để mở trang hoàn thiện (Documents/29 bước 3)
  const madeNames =
    receipt.status === 'counting' || receipt.status === 'cancelled'
      ? []
      : [...new Set(receipt.lines.filter((l) => l.isNew && l.sku).map((l) => l.productName))];
  const confirmLabel = options.find((o) => o.transition.action === confirm)?.transition.label ?? '';
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
        title={`Phiếu nhập kho ${receipt.number}`}
        subtitle="Đếm hàng từng dòng rồi bấm Nhập kho."
        help="Thiếu = SL NCC giao − SL đạt − lỗi, giữ lại − trả lại ngay. Dòng có số chênh được đánh dấu ở mép trái; rê chuột vào nhãn ở cạnh SKU để xem chi tiết. Có thiếu thì chọn cách xử lý hàng thiếu: NCC giao bù, đóng phần thiếu hoặc kho đếm sai."
        onTour={startTour}
        action={
          <div className="flex flex-wrap gap-2" data-guide="gr-actions">
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
      {prefilled && editable && (
        <AlertMessage severity="info" className="mb-4" onClose={() => setPrefilled(false)}>
          Đã điền sẵn SL NCC giao và SL đạt bằng số còn phải nhận. Chỉ sửa dòng giao thiếu, có hàng lỗi hoặc trả lại, rồi bấm
          Nhập kho.
        </AlertMessage>
      )}
      {pendingNew > 0 && (
        <AlertMessage severity="info" className="mb-4">
          Phiếu có {pendingNew} dòng là sản phẩm mới. Bấm Nhập kho thì dòng có SL đạt hoặc Lỗi, giữ lại tạo biến thể; dòng chưa
          về hàng để lần nhập sau.
        </AlertMessage>
      )}
      {madeNames.length > 0 && (
        <AlertMessage severity="success" className="mb-4">
          Sản phẩm mới đã vào danh sách sản phẩm, còn thiếu thông tin thì ở bộ lọc Chờ hoàn thiện:{' '}
          {madeNames.map((name, k) => (
            <span key={name}>
              {k > 0 && ', '}
              <Link
                to={`${ROUTES.company.catalog(companyId)}?${new URLSearchParams({ readiness: 'incomplete', search: name })}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Hoàn thiện {name}
              </Link>
            </span>
          ))}
        </AlertMessage>
      )}
      {receipt.status === 'counting' && receipt.deliveryMode === 'left' && (
        <AlertMessage severity="warning" className="mb-4">
          Người giao đã đi: kiểm và nhập kho trong 24 giờ kể từ khi lập phiếu ({formatDateTime(receipt.createdAt)}).
        </AlertMessage>
      )}

      <Card className="mb-4 py-4">
        <CardContent>
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
      </Card>

      <DetailGrid
        history={
          receipt.statusHistory.length > 0 ? (
            <StatusTimeline history={receipt.statusHistory} statuses={RECEIPT_STATUS} />
            ) : undefined
          }
        >
        <Card className="py-4">
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info label="Trạng thái">
              <div data-testid="receipt-status">
                <StatusBadge status={receipt.status} statuses={RECEIPT_STATUS} />
              </div>
            </Info>
            <Info label="Đề nghị nhập hàng">
              <DocLink companyId={companyId} docRef={{ type: 'purchase_request', ...receipt.request }} />
              {' · '}
              {receipt.supplier.name}
            </Info>
            <Info label="Người lập">
              {receipt.createdBy} · {formatDateTime(receipt.createdAt)}
            </Info>
            <Info label="Người nhập kho">{receipt.postedAt ? `${receipt.postedBy} · ${formatDateTime(receipt.postedAt)}` : '—'}</Info>
            {receipt.followsUp && (
              <Info label="Giao bù cho phiếu">
                <DocLink companyId={companyId} docRef={receipt.followsUp} />
              </Info>
            )}
            {receipt.followUps.length > 0 && (
              <Info label="Phiếu giao bù">
                <div className="flex flex-wrap gap-x-3">
                  {receipt.followUps.map((f) => (
                    <DocLink key={f.id} companyId={companyId} docRef={f} />
                  ))}
                </div>
              </Info>
            )}
            {receipt.shortResolution && (
              <Info label="Xử lý hàng thiếu">
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
                toast.success(`${next.number}: đã lưu cách xử lý hàng thiếu`);
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
                <Label>Cách kiểm hàng</Label>
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

            <div className="overflow-x-auto rounded-md border" data-guide="gr-lines">
              <Table data-testid="receipt-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="w-20 text-right">Còn phải nhận</TableHead>
                    <TableHead className="w-24 text-right">SL NCC giao</TableHead>
                    <TableHead className="w-24 text-right">SL đạt</TableHead>
                    <TableHead className="w-24 text-right">Lỗi, giữ lại</TableHead>
                    <TableHead className="w-24 text-right">Trả lại ngay</TableHead>
                    <TableHead className="w-20 text-right">Thiếu</TableHead>
                    <TableHead className="min-w-48" data-guide="gr-reason">Lý do</TableHead>
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
                    // Dòng sản phẩm mới chưa có SKU: gọi theo tên sản phẩm và giá trị phân loại
                    const name = f.sku ?? [f.productName, f.attributesLabel].filter(Boolean).join(' ');
                    const rowErr = rowErrors[i];
                    const num = (key: CountKey) => {
                      if (!editable) return line?.[key] ?? 0;
                      const v = Number(String(live[key]).trim().replace(/[\s.,]/g, ''));
                      return Number.isInteger(v) && v >= 0 ? v : 0;
                    };
                    const diff = receiptDiff({
                      outstanding: editable ? f.outstanding : null,
                      announced: num('announced'),
                      accepted: num('accepted'),
                      defectKept: num('defectKept'),
                      returnedOnSpot: num('returnedOnSpot'),
                      short: lineShort,
                    });
                    return (
                      <TableRow
                        key={f.key}
                        data-row-id={f.lineId}
                        className={cn('align-top', diff && 'chg', rowErr && 'border-b-2 border-b-destructive')}
                      >
                        <TableCell>
                          {f.sku === null ? (
                            <>
                              <p className="font-medium">
                                {f.productName}
                                <Badge variant="info" className="ms-2">
                                  Sản phẩm mới
                                </Badge>
                                {diff && <DiffTag sku={name} note={diff} />}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {[f.attributesLabel, receipt.status === 'counting' ? 'SKU tạo khi nhập kho' : 'Chưa về hàng']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium">
                                {f.sku}
                                {f.isNew && (
                                  <Badge variant="info" className="ms-2">
                                    Sản phẩm mới
                                  </Badge>
                                )}
                                {diff && <DiffTag sku={f.sku} note={diff} />}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {f.productName}
                                {f.attributesLabel ? ` · ${f.attributesLabel}` : ''}
                              </p>
                            </>
                          )}
                          {rowErr && (
                            <p className="mt-1 text-xs text-destructive" role="alert">
                              {rowErr}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatQty(f.outstanding)}</TableCell>
                        {(['announced', 'accepted', 'defectKept', 'returnedOnSpot'] as CountKey[]).map((key) => (
                          <TableCell key={key} className="text-right">
                            {editable
                              ? countInput(i, key, { announced: 'SL NCC giao', accepted: 'SL đạt', defectKept: 'Lỗi, giữ lại', returnedOnSpot: 'Trả lại ngay' }[key], name)
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
                                aria-label={`Lý do ${name}`}
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
      </DetailGrid>

      <SecondPersonDialog
        open={Boolean(confirmText)}
        title={`${confirmLabel} ${receipt.number}?`}
        // API chưa trả tên người lập đơn đặt hàng (chỉ có requestCreatedById); hiện số đơn với nhãn đúng thay vì gắn số vào nhãn "Người lập"
        ownerLabel="Đề nghị nhập hàng"
        createdByName={receipt.request.number}
        selfApproval={receipt.requestCreatedById === actor.accountId}
        confirmLabel={confirmLabel}
        loading={busy}
        onConfirm={() => confirm && onConfirmAction(confirm)}
        onClose={() => setConfirm(null)}
      >
        {confirmText}
        {planText && <p className="mt-2">{planText}</p>}
      </SecondPersonDialog>
      <ReasonDialog
        open={cancelling}
        title={`Huỷ phiếu ${receipt.number}`}
        message="Phiếu chưa nhập kho nên tồn không đổi; đề nghị nhập hàng vẫn còn chờ nhận như cũ."
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
    const fe = kind === 'follow_up' && !f ? 'Nhập số phiếu nhập kho giao bù' : null;
    const ne = kind !== 'follow_up' && !n ? (kind === 'close_short' ? 'Nhập lý do đóng thiếu' : 'Ghi rõ kho đếm sai thế nào') : n.length > 500 ? 'Tối đa 500 ký tự' : null;
    setFollowUpError(fe);
    setNoteError(ne);
    if (fe || ne) return;
    onSubmit({ kind, followUpNumber: kind === 'follow_up' ? f : undefined, note: n }, (a, b) => {
      setFollowUpError(a);
      setNoteError(b);
    });
  };

  return (
    <Card className="border-destructive/40 py-4" data-testid="short-resolution">
      <CardHeader>
        <CardTitle className="text-base">Xử lý hàng thiếu ({formatQty(receipt.shortQty)})</CardTitle>
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
            <Label htmlFor="follow-up-number">Số phiếu nhập kho giao bù</Label>
            <Input
              id="follow-up-number"
              placeholder="NH-000123"
              value={followUp}
              aria-invalid={Boolean(followUpError)}
              onChange={(e) => setFollowUp(e.target.value)}
            />
            {followUpError && <p className="text-sm text-destructive">{followUpError}</p>}
            <p className="text-xs text-muted-foreground">Khi hàng bù tới, lập phiếu nhập kho mới từ đề nghị nhập hàng rồi ghi số phiếu đó ở đây.</p>
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
            {loading ? 'Đang lưu...' : 'Lưu cách xử lý'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
