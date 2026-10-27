import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { RowAction } from '@/components/common/RowAction';
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
  useCreateStockDoc,
  useDecideStockDoc,
  useStockDoc,
  useStockDocAction,
  useUpdateStockDoc,
} from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { stockDocMachine, type StockDocRecord } from '@/lib/machines/stockDocument';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import type {
  DocRef,
  ManualStockDocType,
  RejectDecision,
  StockDoc,
  StockDocAction,
  StockDocType,
} from '@/types/inventory';
import {
  AREA_LABELS,
  DECISION_LABELS,
  DOC_KIND_LABELS,
  DOC_STATUS,
  DOC_TYPE_HELP,
  DOC_TYPE_LABELS,
  docFormSchema,
  draftNumber,
  emptyLine,
  formatDelta,
  formatQty,
  toLineInputs,
  type DocFormInput,
  type DocFormOutput,
  type DocLineDraft,
} from './shared';
import { VariantPicker } from './VariantPicker';

const MANUAL_TYPES: ManualStockDocType[] = ['stocktake', 'write_off', 'to_quarantine'];
const str = (n: number | undefined) => (n === undefined ? '' : String(n));

const toForm = (doc: StockDoc): DocFormInput => ({
  area: doc.area ?? 'stock',
  note: doc.note,
  lines: doc.lines.map((l) =>
    emptyLine({
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      attributesLabel: l.attributesLabel,
      // Tồn sổ chụp lúc lưu gần nhất; lưu lại thì BE chụp theo khu vực đang chọn
      bookStock: l.bookQty,
      bookQuarantine: l.bookQty,
      expected: l.expected,
      quantity: doc.type === 'write_off' || doc.type === 'to_quarantine' ? String(l.quantity) : '',
      counted: str(l.counted),
      scanned: doc.type === 'return_inspection' ? String(l.quantity) : '',
      resell: str(l.resell),
      damaged: str(l.damaged),
      toSupplier: str(l.toSupplier),
    }),
  ),
});

/** Kiểm hàng về: phần thiếu của một dòng (dự kiến − số quét) */
const missingOf = (l: DocLineDraft) => Math.max(0, (l.expected ?? 0) - (draftNumber(l.scanned) ?? 0));

const ACTION_CONFIRM: Partial<Record<StockDocAction, { title: string; message: string }>> = {
  submit: {
    title: 'Gửi duyệt',
    message: 'Hàng trên phiếu bị tạm khoá (không bán được) đến khi duyệt hoặc từ chối. Phiếu chờ duyệt không sửa được.',
  },
  approve: {
    title: 'Duyệt và ghi sổ',
    message: 'Tồn kho thay đổi theo các dòng của phiếu. Phiếu đã ghi sổ không sửa, không huỷ được.',
  },
  post: {
    title: 'Ghi sổ',
    message: 'Hàng bán lại vào tồn thực; hỏng và trả NCC vào chờ xử lý. Phiếu đã ghi sổ không sửa được.',
  },
  cancel: { title: 'Huỷ phiếu', message: 'Phiếu nháp bị huỷ không ghi sổ được nữa; tồn kho không đổi.' },
};

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function RefLink({ companyId, docRef }: { companyId: string; docRef: DocRef }) {
  if (docRef.type === 'stock_document') {
    return (
      <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.inventoryDoc(companyId, docRef.id)}>
        {docRef.number}
      </Link>
    );
  }
  if (docRef.type === 'order') {
    return (
      <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.order(companyId, docRef.id)}>
        Đơn {docRef.number}
      </Link>
    );
  }
  return <span>{docRef.number}</span>;
}

/**
 * Phiếu kho theo sơ đồ B3. Kiểm kê, xuất huỷ, chuyển chờ xử lý: kho lập nháp, gửi duyệt (hàng bị tạm khoá),
 * CEO duyệt mới ghi sổ. Kiểm hàng về: hệ thống sinh khi kiện quay về; kho quét và chia bán lại, hỏng,
 * trả NCC; không thiếu thì ghi sổ thẳng, có thiếu thì người thứ hai duyệt. Phiếu nhập, xuất chỉ xem.
 * `/inventory/documents/new?type=stocktake|write_off|to_quarantine` là phiếu mới.
 */
export function StockDocPage() {
  const navigate = useNavigate();
  const { docId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = docId === 'new';
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canManage = useCan()(PERMISSIONS.stockDocManage);
  const actor = useTransitionActor();

  const docQuery = useStockDoc(isNew ? undefined : docId);
  const doc = docQuery.data;
  const requested = searchParams.get('type') as ManualStockDocType | null;
  const type: StockDocType = doc?.type ?? (requested && MANUAL_TYPES.includes(requested) ? requested : 'stocktake');
  const isStocktake = type === 'stocktake';
  const isInspection = type === 'return_inspection';
  const hasQuantity = type === 'write_off' || type === 'to_quarantine';
  const editable = canManage && (isNew || (doc?.status === 'draft' && type !== 'receipt' && type !== 'issue'));

  const createMut = useCreateStockDoc();
  const updateMut = useUpdateStockDoc();
  const actionMut = useStockDocAction();
  const decideMut = useDecideStockDoc();
  const busy = createMut.isPending || updateMut.isPending || actionMut.isPending || decideMut.isPending;

  const schema = useMemo(() => docFormSchema(type), [type]);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<DocFormInput, unknown, DocFormOutput>({
    // Dòng trên form giữ thêm sku, tồn sổ để hiển thị; schema chỉ kiểm các ô nhập nên phải ép kiểu
    resolver: zodResolver(schema) as unknown as Resolver<DocFormInput, unknown, DocFormOutput>,
    defaultValues: { area: 'stock', note: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const area = useWatch({ control, name: 'area' });

  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<StockDocAction | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [decision, setDecision] = useState<RejectDecision | null>(null);
  const loaded = useRef<string | null>(null);
  const skipBlock = useRef(false);

  useEffect(() => {
    if (doc && loaded.current !== doc.id) {
      loaded.current = doc.id;
      reset(toForm(doc));
      setVersion(doc.version);
    }
  }, [doc, reset]);

  const load = (latest: StockDoc) => {
    loaded.current = latest.id;
    reset(toForm(latest));
    setVersion(latest.version);
  };

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !skipBlock.current && editable && isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!(editable && isDirty)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editable, isDirty]);

  const taken = useMemo(() => new Set(fields.map((f) => f.variantId)), [fields]);
  const missing = lines.reduce((s, l) => s + missingOf(l), 0);

  // Nút lấy từ bảng chuyển trạng thái: cùng bảng mock dùng để từ chối chuyển sai
  const record: StockDocRecord = {
    createdBy: doc?.createdById ?? actor.accountId,
    lineCount: lines.length,
    missing,
  };
  const actions = stockDocMachine(type).available(doc?.status ?? 'draft', actor, record);

  /** Lỗi 409/422 từ BE: hiện tại ô, hoặc nạp bản mới nhất khi phiếu vừa bị người khác đổi */
  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<StockDoc>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({
        severity: 'warning',
        msg: 'Phiếu vừa được người khác sửa, duyệt hoặc ghi sổ. Form đã hiện bản mới nhất, chưa có gì thay đổi.',
      });
      return;
    }
    if (problem?.code === 'not_draft' || problem?.code === 'invalid_transition') {
      loaded.current = null;
      docQuery.refetch();
    }
    const fieldErrors = problem?.errors ?? {};
    let placed = 0;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)\.(variantId|quantity|counted|scanned|resell)$/.exec(path);
      if (m) {
        setError(`lines.${Number(m[1])}.${m[2] as 'quantity'}`, { message });
        placed++;
      } else if (path === 'note') {
        setError('note', { message });
        placed++;
      }
    }
    if (problem?.code === 'stock_insufficient') {
      toast.warning(`${placed || 'Có'} dòng vượt số hàng hiện có, phiếu chưa đổi trạng thái. Sửa số lượng rồi thử lại.`);
      return;
    }
    setNotice({
      severity: 'error',
      msg:
        fieldErrors.lines ??
        (placed ? `${problem?.title ?? 'Dữ liệu không hợp lệ'}. Xem các ô báo đỏ.` : problemMessage(e)),
    });
  };

  /** Lưu nháp; trả về phiếu sau lưu (hoặc phiếu hiện tại nếu không có gì đổi) */
  const save = async (values: DocFormOutput): Promise<StockDoc | null> => {
    setNotice(null);
    try {
      if (isNew) {
        const created = await createMut.mutateAsync({
          type: type as ManualStockDocType,
          area: values.area,
          note: values.note,
          lines: toLineInputs(values),
        });
        load(created);
        skipBlock.current = true;
        navigate(ROUTES.company.inventoryDoc(companyId, created.id), { replace: true });
        skipBlock.current = false;
        return created;
      }
      if (!isDirty && doc) return { ...doc, version };
      const saved = await updateMut.mutateAsync({
        id: docId,
        area: values.area,
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

  const runAction = async (target: StockDoc, action: StockDocAction, reason?: string) => {
    try {
      const next = await actionMut.mutateAsync({ id: target.id, action, version: target.version, reason });
      load(next);
      toast.success(`${next.number}: ${DOC_STATUS[next.status].label.toLowerCase()}`);
      return true;
    } catch (e) {
      if (action === 'reject') setRejectError(problemMessage(e));
      else handleError(e);
      return false;
    }
  };

  /** Thao tác trên phiếu nháp: lưu thay đổi trước (nếu có) rồi chuyển bằng version mới */
  const onConfirmAction = (action: StockDocAction) => {
    setConfirm(null);
    if (doc?.status === 'draft' || isNew) {
      if (action === 'cancel' && doc) {
        void runAction({ ...doc, version }, action);
        return;
      }
      void handleSubmit(async (values) => {
        const saved = await save(values);
        if (saved) await runAction(saved, action);
      })();
      return;
    }
    if (doc) void runAction({ ...doc, version }, action);
  };

  const onReject = async (reason: string) => {
    if (!doc) return;
    setRejectError(null);
    if (await runAction({ ...doc, version }, 'reject', reason)) setRejecting(false);
  };

  const onDecide = async () => {
    if (!doc || !decision) return;
    try {
      const next = await decideMut.mutateAsync({ id: doc.id, decision, version });
      load(next);
      toast.success(`${next.number}: đã chọn ${DECISION_LABELS[decision].toLowerCase()}`);
    } catch (e) {
      handleError(e);
    } finally {
      setDecision(null);
    }
  };

  const backToList = () => navigate(ROUTES.company.inventoryTab(companyId, 'documents'));

  if (isNew && !canManage) {
    return (
      <div className="grid justify-items-start gap-4">
        <AlertMessage severity="warning">Bạn không có quyền lập phiếu kho.</AlertMessage>
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft />
          Về danh sách phiếu
        </Button>
      </div>
    );
  }
  if (docQuery.isError) {
    return (
      <div className="grid justify-items-start gap-4">
        <AlertMessage severity="error">{getErrorMessage(docQuery.error)}</AlertMessage>
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft />
          Về danh sách phiếu
        </Button>
      </div>
    );
  }
  if (!isNew && !doc) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showCost = Boolean(doc?.lines.some((l) => l.unitCost !== null));
  const title = doc ? `${DOC_TYPE_LABELS[doc.type]} ${doc.number}` : `Lập phiếu ${DOC_TYPE_LABELS[type].toLowerCase()}`;
  const noteLabel = hasQuantity ? 'Lý do' : 'Ghi chú';
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;
  const areaEditable = editable && (isStocktake || (type === 'write_off' && (isNew || doc?.kind === 'manual')));
  const confirmText = confirm ? ACTION_CONFIRM[confirm] : undefined;
  const colCount =
    1 + (isStocktake ? 3 : isInspection ? 6 : 1) + (showCost ? 1 : 0) + (editable ? 1 : 0);

  const qtyInput = (i: number, key: 'quantity' | 'counted' | 'scanned' | 'resell' | 'damaged' | 'toSupplier', label: string, sku: string) => {
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
        title={title}
        subtitle={DOC_TYPE_HELP[type]}
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
            {(isNew ? actions.filter((a) => a.action === 'submit') : actions).map((t) => (
              <Button
                key={t.action}
                variant={t.action === 'cancel' || t.action === 'reject' ? 'outline' : 'default'}
                className={cn((t.action === 'cancel' || t.action === 'reject') && 'text-destructive hover:text-destructive')}
                disabled={busy}
                onClick={() => (t.action === 'reject' ? setRejecting(true) : setConfirm(t.action))}
              >
                {t.label}
              </Button>
            ))}
          </div>
        }
      />

      {notice && (
        <AlertMessage severity={notice.severity} className="mb-4" onClose={() => setNotice(null)}>
          {notice.msg}
        </AlertMessage>
      )}

      {doc?.needsDecision && (
        <AlertMessage severity="warning" className="mb-4">
          <div className="grid gap-2">
            <p>Phiếu xuất huỷ hàng chờ xử lý bị từ chối. Chọn cách xử lý số hàng này.</p>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {(['restock', 'supplier_return'] as RejectDecision[]).map((d) => (
                  <Button key={d} size="sm" variant="outline" disabled={busy} onClick={() => setDecision(d)}>
                    {DECISION_LABELS[d]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </AlertMessage>
      )}

      {doc && (
        <Card className="mb-4 py-4">
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info label="Trạng thái">
              <div className="flex flex-wrap items-center gap-1" data-testid="doc-status">
                <StatusBadge status={doc.status} statuses={DOC_STATUS} />
                {doc.claimFlag && <Badge variant="destructive">Khiếu nại thiếu hàng</Badge>}
              </div>
            </Info>
            <Info label="Nguồn">
              {DOC_KIND_LABELS[doc.kind]}
              {doc.source && (
                <>
                  {' · '}
                  <RefLink companyId={companyId} docRef={doc.source} />
                </>
              )}
            </Info>
            <Info label="Người lập">
              {doc.createdBy} · {formatDateTime(doc.createdAt)}
            </Info>
            <Info label="Ghi sổ">{doc.postedAt ? `${doc.postedBy} · ${formatDateTime(doc.postedAt)}` : '—'}</Info>
            {doc.rejectDecision && <Info label="Cách xử lý">{DECISION_LABELS[doc.rejectDecision]}</Info>}
            {doc.followUps.length > 0 && (
              <Info label="Phiếu sinh tiếp">
                <div className="flex flex-wrap gap-x-3">
                  {doc.followUps.map((f) => (
                    <RefLink key={f.id} companyId={companyId} docRef={f} />
                  ))}
                </div>
              </Info>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="py-4">
        <CardContent className="grid gap-4">
          {(isStocktake || type === 'write_off') &&
            (areaEditable ? (
              <div className="grid gap-1.5">
                <Label>Khu vực</Label>
                <RadioGroup
                  className="flex gap-4"
                  value={area}
                  onValueChange={(v) => setValue('area', v as DocFormInput['area'], { shouldDirty: true })}
                >
                  {(['stock', 'quarantine'] as const).map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={a} aria-label={AREA_LABELS[a]} />
                      {AREA_LABELS[a]}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <Info label="Khu vực">{AREA_LABELS[doc?.area ?? 'stock']}</Info>
            ))}

          {editable ? (
            <div className="grid gap-1.5">
              <Label htmlFor="doc-note">{noteLabel}</Label>
              <Textarea id="doc-note" rows={2} aria-invalid={Boolean(errors.note)} {...register('note')} />
              {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
            </div>
          ) : (
            <Info label={noteLabel}>{doc?.note || '—'}</Info>
          )}

          {isInspection && missing > 0 && (
            <AlertMessage severity="warning">
              Thiếu {formatQty(missing)} so với dự kiến: phiếu bật cờ khiếu nại ĐVVC hoặc sàn, cần người thứ hai duyệt.
            </AlertMessage>
          )}

          {editable && (
            <div className="grid gap-1">
              {isInspection && <p className="text-sm text-muted-foreground">Nhận SKU khác dự kiến (sai mẫu): thêm dòng SKU thực nhận.</p>}
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
                      bookStock: level.onHand,
                      bookQuarantine: level.quarantine,
                      expected: isInspection ? 0 : undefined,
                    }),
                  )
                }
              />
            </div>
          )}
          {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}

          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="doc-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Biến thể</TableHead>
                  {isStocktake && (
                    <>
                      <TableHead className="w-28 text-right">Tồn sổ</TableHead>
                      <TableHead className="w-32 text-right">Số đếm</TableHead>
                      <TableHead className="w-24 text-right">Δ</TableHead>
                    </>
                  )}
                  {isInspection && (
                    <>
                      <TableHead className="w-24 text-right">Dự kiến</TableHead>
                      <TableHead className="w-28 text-right">Số quét</TableHead>
                      <TableHead className="w-28 text-right">Bán lại</TableHead>
                      <TableHead className="w-28 text-right">Hỏng</TableHead>
                      <TableHead className="w-28 text-right">Trả NCC</TableHead>
                      <TableHead className="w-20 text-right">Thiếu</TableHead>
                    </>
                  )}
                  {!isStocktake && !isInspection && <TableHead className="w-40 text-right">Số lượng</TableHead>}
                  {showCost && <TableHead className="w-40 text-right">{type === 'receipt' ? 'Giá nhập' : 'Giá vốn'}</TableHead>}
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!fields.length && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                      {editable ? 'Tìm và thêm biến thể vào phiếu.' : 'Phiếu không có dòng nào.'}
                    </TableCell>
                  </TableRow>
                )}
                {fields.map((f, i) => {
                  const lineErrors = errors.lines?.[i];
                  const docLine = doc?.lines[i];
                  const live = lines[i] ?? f;
                  const book = area === 'quarantine' ? f.bookQuarantine : f.bookStock;
                  const counted = draftNumber(live.counted);
                  const delta = editable
                    ? book !== undefined && counted !== null
                      ? counted - book
                      : null
                    : (docLine?.quantity ?? null);
                  const wrongSku = isInspection && !f.expected;
                  return (
                    <TableRow key={f.key} data-row-id={f.variantId} className="align-top">
                      <TableCell>
                        <p className="font-medium">
                          {f.sku}
                          {wrongSku && (
                            <Badge variant="warning" className="ms-2">
                              Sai mẫu
                            </Badge>
                          )}
                        </p>
                        <p className={cn('text-xs', lineErrors?.variantId ? 'text-destructive' : 'text-muted-foreground')}>
                          {lineErrors?.variantId?.message ??
                            `${f.productName}${f.attributesLabel ? ` · ${f.attributesLabel}` : ''}`}
                        </p>
                      </TableCell>
                      {isStocktake && (
                        <>
                          <TableCell className="text-right">{book === undefined ? '—' : formatQty(book)}</TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'counted', 'Số đếm', f.sku) : formatQty(docLine?.counted ?? 0)}
                          </TableCell>
                          <TableCell
                            className={cn('text-right font-medium', delta !== null && delta < 0 && 'text-destructive')}
                          >
                            {delta === null ? '—' : formatDelta(delta)}
                          </TableCell>
                        </>
                      )}
                      {isInspection && (
                        <>
                          <TableCell className="text-right">{formatQty(f.expected ?? 0)}</TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'scanned', 'Số quét', f.sku) : formatQty(docLine?.quantity ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'resell', 'Bán lại', f.sku) : formatQty(docLine?.resell ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'damaged', 'Hỏng', f.sku) : formatQty(docLine?.damaged ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'toSupplier', 'Trả NCC', f.sku) : formatQty(docLine?.toSupplier ?? 0)}
                          </TableCell>
                          <TableCell className={cn('text-right', missingOf(live) > 0 && 'font-medium text-destructive')}>
                            {formatQty(missingOf(live))}
                          </TableCell>
                        </>
                      )}
                      {!isStocktake && !isInspection && (
                        <TableCell className="text-right">
                          {editable && hasQuantity ? (
                            qtyInput(i, 'quantity', 'Số lượng', f.sku)
                          ) : (
                            <div>
                              <p>{formatQty(docLine?.quantity ?? 0)}</p>
                              {Boolean(docLine?.locked) && (
                                <p className="text-xs text-muted-foreground">tạm khoá {formatQty(docLine?.locked ?? 0)}</p>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                      {showCost && (
                        <TableCell className="text-right">
                          {docLine?.unitCost === null || docLine?.unitCost === undefined
                            ? '—'
                            : formatCurrency(docLine.unitCost)}
                        </TableCell>
                      )}
                      {editable && (
                        <TableCell>
                          {(!isInspection || wrongSku) && (
                            <RowAction label="Bỏ dòng" destructive reason={busy ? 'Đang lưu' : null} onClick={() => remove(i)}>
                              <Trash2 />
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
        </CardContent>
      </Card>

      {doc && doc.statusHistory.length > 0 && (
        <Card className="mt-4 py-4">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline history={doc.statusHistory} statuses={DOC_STATUS} />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(confirmText)}
        title={`${confirmText?.title ?? ''} ${doc?.number ?? 'phiếu'}?`}
        message={confirmText?.message ?? ''}
        confirmLabel={confirmText?.title}
        cancelLabel={confirm === 'cancel' ? 'Giữ lại' : undefined}
        destructive={confirm === 'cancel'}
        loading={busy}
        onConfirm={() => confirm && onConfirmAction(confirm)}
        onClose={() => setConfirm(null)}
      />
      <ReasonDialog
        open={rejecting}
        title={`${isInspection ? 'Yêu cầu kiểm lại' : 'Từ chối'} ${doc?.number ?? ''}`}
        message={
          isInspection
            ? 'Phiếu quay về nháp để kho kiểm lại.'
            : 'Hàng tạm khoá được trả lại. Xuất huỷ hàng chờ xử lý bị từ chối thì kho phải chọn nhập lại tồn hoặc trả NCC.'
        }
        confirmLabel={isInspection ? 'Yêu cầu kiểm lại' : 'Từ chối'}
        destructive
        loading={busy}
        error={rejectError}
        onConfirm={onReject}
        onClose={() => {
          setRejecting(false);
          setRejectError(null);
        }}
      />
      <ConfirmDialog
        open={decision !== null}
        title={`${decision ? DECISION_LABELS[decision] : ''}?`}
        message={
          decision === 'restock'
            ? 'Hàng chuyển từ chờ xử lý về tồn thực và bán được tiếp.'
            : 'Hàng ở lại chờ xử lý để lập phiếu trả nhà cung cấp.'
        }
        confirmLabel={decision ? DECISION_LABELS[decision] : undefined}
        loading={busy}
        onConfirm={onDecide}
        onClose={() => setDecision(null)}
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
