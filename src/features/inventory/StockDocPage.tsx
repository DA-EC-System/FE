import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, ListRestart, Loader2, Save, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ActionButton } from '@/components/common/ActionButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { RowAction } from '@/components/common/RowAction';
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
  useCreateStockDoc,
  useDecideStockDoc,
  useStockDoc,
  useStockDocAction,
  useUpdateStockDoc,
} from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { codeMessage, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { adjustmentMachine, isShipmentDoc, stockDocMachine, type StockDocRecord } from '@/lib/machines/stockDocument';
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
  StockDocStatus,
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
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { WelcomeReturnBar } from '@/features/company/WelcomeReturnBar';
import {
  countSourceOf,
  fillFromPlatform,
  nextEmpty,
  pageOf,
  SHEET_PAGE_SIZE,
  sheetCounts,
  visibleRows,
  type SheetFilter,
  type SheetRow,
} from './stocktakeSheet';

const SHEET_FILTERS: { key: SheetFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'empty', label: 'Chưa nhập' },
  { key: 'platform', label: 'Theo tồn sàn' },
  { key: 'diff', label: 'Có chênh lệch' },
];

const MANUAL_TYPES: ManualStockDocType[] = ['stocktake', 'write_off', 'to_quarantine'];
const str = (n: number | null | undefined) => (n === undefined || n === null ? '' : String(n));

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
      platformStock: l.platformStock ?? null,
      countSource: l.countSource ?? null,
      scanned: doc.type === 'return_inspection' ? String(l.quantity) : '',
      resell: str(l.resell),
      damaged: str(l.damaged),
      toSupplier: str(l.toSupplier),
    }),
  ),
});

/** Kiểm hàng về: phần thiếu của một dòng (dự kiến − số quét) */
const missingOf = (l: DocLineDraft) => Math.max(0, (l.expected ?? 0) - (draftNumber(l.scanned) ?? 0));

/** Đường chính của phiếu kho trên thanh tiến trình; từ chối, huỷ là nhánh rẽ */
const DOC_PATH: StockDocStatus[] = ['draft', 'pending', 'posted'];

const ACTION_CONFIRM: Partial<Record<StockDocAction, { title: string; message: string }>> = {
  submit: {
    title: 'Gửi duyệt',
    message: 'Hàng trên phiếu bị tạm khoá (không bán được) đến khi duyệt hoặc từ chối. Phiếu chờ duyệt không sửa được.',
  },
  approve: {
    title: 'Duyệt',
    message: 'Tồn kho thay đổi theo các dòng của phiếu. Phiếu đã duyệt không sửa, không huỷ được.',
  },
  post: {
    title: 'Hoàn thành kiểm hàng',
    message: 'Hàng bán lại vào tồn kho; hàng hỏng và trả hàng NCC vào khu hàng lỗi/chờ kiểm. Phiếu đã hoàn thành không sửa được.',
  },
  cancel: { title: 'Huỷ phiếu', message: 'Phiếu bị huỷ sẽ không dùng lại được; tồn kho không đổi.' },
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
 * trả nhà cung cấp; không thiếu thì ghi sổ thẳng, có thiếu thì người thứ hai duyệt. Phiếu xuất theo kiện, huỷ bàn giao chỉ xem.
 * `/inventory/documents/new?type=stocktake|write_off|to_quarantine` là phiếu mới.
 */
interface StockDocPageProps {
  /**
   * Nhúng vào wizard thiết lập (bước 7 Tồn đầu kỳ, FE#468): đọc phiếu theo `docId` thay vì URL, không có nút quay lại,
   * lịch sử và thanh quay về wizard. `intro` hiện trên bảng dòng (ai đếm, ai duyệt; nút mời Nhân viên kho).
   */
  embedded?: { docId: string; intro?: ReactNode };
}

export function StockDocPage({ embedded }: StockDocPageProps = {}) {
  const navigate = useNavigate();
  const params = useParams();
  const docId = embedded?.docId ?? params.docId ?? '';
  const [searchParams] = useSearchParams();
  const isNew = docId === 'new';
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canManage = useCan()(PERMISSIONS.stockDocManage);
  const actor = useTransitionActor();

  const docQuery = useStockDoc(isNew ? undefined : docId);
  const doc = docQuery.data;
  useBreadcrumb(embedded ? null : isNew ? 'Tạo phiếu' : doc?.number);
  const requested = searchParams.get('type') as ManualStockDocType | null;
  const type: StockDocType = doc?.type ?? (requested && MANUAL_TYPES.includes(requested) ? requested : 'stocktake');
  const isStocktake = type === 'stocktake';
  const isInspection = type === 'return_inspection';
  const hasQuantity = type === 'write_off' || type === 'to_quarantine';
  const editable = canManage && (isNew || (doc?.status === 'draft' && !isShipmentDoc(type)));

  const createMut = useCreateStockDoc();
  const updateMut = useUpdateStockDoc();
  const actionMut = useStockDocAction();
  const decideMut = useDecideStockDoc();
  const busy = createMut.isPending || updateMut.isPending || actionMut.isPending || decideMut.isPending;

  // Tối đa 200 dòng chỉ khi tạo phiếu tay; phiếu đầu kỳ có thể nhiều dòng hơn, BE kiểm khi sửa
  const schema = useMemo(() => docFormSchema(type, isNew), [type, isNew]);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
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
  // Bảng kiểm kê: lọc, tìm, trang, dòng cần đưa con trỏ tới (FE#468)
  const [sheetFilter, setSheetFilter] = useState<SheetFilter>('all');
  const [sheetSearch, setSheetSearch] = useState('');
  const [sheetPage, setSheetPage] = useState(1);
  const [focusRow, setFocusRow] = useState<number | null>(null);

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

  // ---- Bảng kiểm kê (FE#468 bước 7): đếm, lọc, tìm, trang, dòng trống kế, điền theo tồn sàn ----
  const toSheetRow = (l: DocLineDraft): SheetRow => ({
    sku: l.sku,
    productName: l.productName,
    attributesLabel: l.attributesLabel,
    counted: l.counted ?? '',
    book: area === 'quarantine' ? l.bookQuarantine : l.bookStock,
    platformStock: l.platformStock ?? null,
    countSource: l.countSource ?? null,
  });
  const sheetRows = isStocktake ? lines.map(toSheetRow) : [];
  // Thứ tự dòng chụp lúc đổi bộ lọc hay tìm, không theo từng phím gõ: gõ số vào dòng "Chưa nhập" không làm dòng biến mất
  const sheetOrder = useMemo(
    () => (isStocktake ? visibleRows((getValues('lines') ?? []).map(toSheetRow), sheetFilter, sheetSearch) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStocktake, fields, sheetFilter, sheetSearch, area, getValues],
  );
  const sheet = pageOf(sheetOrder, sheetPage);
  const counts = sheetCounts(sheetRows);
  const hasPlatform = sheetRows.some((r) => r.platformStock !== null);
  const fills = editable ? fillFromPlatform(sheetRows) : [];

  useEffect(() => {
    if (focusRow === null) return;
    const input = document.querySelector<HTMLInputElement>(`[data-line-index="${focusRow}"] input`);
    if (!input) {
      // Dòng không nằm trên trang (đã bị bỏ): thôi chờ
      if (!sheet.items.includes(focusRow)) setFocusRow(null);
      return;
    }
    input.scrollIntoView({ block: 'center' });
    input.focus();
    setFocusRow(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow, sheet.page, sheetOrder]);

  /** "Tới dòng trống kế": sau dòng đang gõ; bộ lọc đang xem không còn dòng trống thì chuyển sang "Chưa nhập" */
  const goNextEmpty = () => {
    const active = (document.activeElement as HTMLElement | null)?.closest('[data-line-index]')?.getAttribute('data-line-index');
    const now = (getValues('lines') ?? []).map(toSheetRow);
    let order = sheetOrder;
    let target = nextEmpty(now, order, active ? Number(active) : null);
    if (target === null) {
      order = visibleRows(now, 'empty', '');
      target = order[0] ?? null;
      if (target === null) return;
      setSheetFilter('empty');
      setSheetSearch('');
    }
    setSheetPage(Math.floor(order.indexOf(target) / SHEET_PAGE_SIZE) + 1);
    setFocusRow(target);
  };

  const fillPlatform = () => {
    for (const { index, value } of fills) {
      setValue(`lines.${index}.counted`, String(value), { shouldDirty: true });
      setValue(`lines.${index}.countSource`, 'platform');
    }
    toast.success(`Đã điền ${fills.length} dòng theo tồn sàn. Lưu nháp để giữ lại.`);
  };

  // Nút lấy từ bảng chuyển trạng thái: cùng bảng mock dùng để từ chối chuyển sai
  const record: StockDocRecord = {
    createdBy: doc?.createdById ?? actor.accountId,
    lineCount: lines.length,
    missing,
  };
  const machine = stockDocMachine(type);
  const options = machine.options(doc?.status ?? 'draft', actor, record);
  const blockedSteps = options.flatMap(({ transition: t, blocked }) =>
    blocked ? [{ label: t.label, reason: codeMessage(blocked) }] : [],
  );
  // Duyệt phiếu kiểm hàng về cần người thứ hai: hộp duyệt nói rõ ai lập
  const confirmSecondPerson = options.some((o) => o.transition.action === confirm && o.transition.needsSecondPerson);

  /** Lỗi 409/422 từ BE: hiện tại ô, hoặc nạp bản mới nhất khi phiếu vừa bị người khác đổi */
  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<StockDoc>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({
        severity: 'warning',
        msg: 'Phiếu vừa được người khác sửa, duyệt hoặc hoàn thành. Form đã hiện bản mới nhất, chưa có gì thay đổi.',
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

  /**
   * Ô sai nằm ở trang khác của bảng kiểm kê (chỉ vẽ 50 dòng): mở trang có dòng sai đầu tiên, đưa con trỏ tới, báo số
   * dòng sai. Không có dòng sai thì để form tự báo như cũ.
   */
  const onInvalid = (errs: FieldErrors<DocFormInput>) => {
    if (!isStocktake || !Array.isArray(errs.lines)) return;
    const bad = errs.lines.flatMap((e, i) => (e ? [i] : []));
    if (!bad.length) return;
    const order = visibleRows((getValues('lines') ?? []).map(toSheetRow), 'all', '');
    setSheetFilter('all');
    setSheetSearch('');
    setSheetPage(Math.floor(order.indexOf(bad[0]) / SHEET_PAGE_SIZE) + 1);
    setFocusRow(bad[0]);
    setNotice({ severity: 'error', msg: `${bad.length} dòng nhập chưa đúng. Đã đưa tới dòng đầu tiên, xem ô báo đỏ.` });
  };

  const onSave = handleSubmit(async (values) => {
    const saved = await save(values);
    if (saved) toast.success(`Đã lưu nháp ${saved.number}`);
  }, onInvalid);

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
      }, onInvalid)();
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
        <AlertMessage severity="warning">Bạn không có quyền tạo phiếu kho.</AlertMessage>
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
  const title = doc ? `${DOC_TYPE_LABELS[doc.type]} ${doc.number}` : `Tạo phiếu ${DOC_TYPE_LABELS[type].toLowerCase()}`;
  const noteLabel = hasQuantity ? 'Lý do' : 'Ghi chú';
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;
  const areaEditable = editable && (isStocktake || (type === 'write_off' && (isNew || doc?.kind === 'manual')));
  const confirmText = confirm ? ACTION_CONFIRM[confirm] : undefined;
  const colCount =
    1 + (isStocktake ? 3 + (hasPlatform ? 1 : 0) : isInspection ? 6 : 1) + (showCost ? 1 : 0) + (editable ? 1 : 0);

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
      {/* Mở từ hướng dẫn thiết lập: thanh quay lại, ghi sổ xong thì tự về wizard (FE#419) */}
      {isStocktake && !embedded && (
        <WelcomeReturnBar stepKey="opening_stock" finished={doc?.status === 'posted'} className="mb-4" />
      )}
      <PageHeader
        title={title}
        subtitle={embedded ? undefined : DOC_TYPE_HELP[type]}
        action={
          <div className="flex flex-wrap gap-2">
            {!embedded && (
              <Button variant="outline" onClick={backToList}>
                <ArrowLeft />
                Quay lại
              </Button>
            )}
            {editable && (
              <Button variant="outline" disabled={busy || (!isNew && !isDirty)} onClick={onSave}>
                <Save />
                Lưu nháp
              </Button>
            )}
            {(isNew ? options.filter((o) => o.transition.action === 'submit') : options).map(({ transition: t, blocked }) => (
              <ActionButton
                key={t.action}
                variant={t.action === 'cancel' || t.action === 'reject' ? 'outline' : 'default'}
                className={cn((t.action === 'cancel' || t.action === 'reject') && 'text-destructive hover:text-destructive')}
                blockedReason={
                  (blocked && codeMessage(blocked)) ||
                  // Kiểm kê còn ô trống: BE cũng chặn 422 (commerio-backend#575), báo trước tại nút
                  (isStocktake && editable && counts.empty > 0 && (t.action === 'submit' || t.action === 'post')
                    ? `Còn ${counts.empty} dòng chưa nhập số đếm. Đếm không thấy thì ghi 0.`
                    : undefined)
                }
                disabled={busy}
                onClick={() => (t.action === 'reject' ? setRejecting(true) : setConfirm(t.action))}
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

      {doc?.needsDecision && (
        <AlertMessage severity="warning" className="mb-4">
          <div className="grid gap-2">
            <p>Phiếu xuất huỷ hàng lỗi/chờ kiểm bị từ chối. Chọn cách xử lý số hàng này.</p>
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
          <CardContent className="mb-2 border-b pb-4">
            <LifecycleSteps
              path={DOC_PATH}
              current={doc.status}
              history={doc.statusHistory}
              statuses={DOC_STATUS}
              isFinal={machine.isFinal}
              blocked={blockedSteps}
            />
          </CardContent>
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
            <Info label={machine === adjustmentMachine ? 'Người duyệt' : 'Hoàn thành bởi'}>{doc.postedAt ? `${doc.postedBy} · ${formatDateTime(doc.postedAt)}` : '—'}</Info>
            {doc.rejectDecision && <Info label="Cách xử lý">{DECISION_LABELS[doc.rejectDecision]}</Info>}
            {doc.followUps.length > 0 && (
              <Info label="Phiếu liên quan">
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
              Thiếu {formatQty(missing)} so với dự kiến: phiếu được đánh dấu để khiếu nại ĐVVC hoặc sàn, cần người khác duyệt.
            </AlertMessage>
          )}

          {editable && (
            <div className="grid gap-1">
              {isInspection && <p className="text-sm text-muted-foreground">Nhận SKU khác dự kiến (sai SKU): thêm dòng SKU thực nhận.</p>}
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

          {embedded?.intro}
          {isStocktake && fields.length > 0 && (
            <div className="grid gap-3" data-testid="stocktake-toolbar">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <p className="min-w-0 flex-1">
                  <b className="font-semibold tabular-nums">
                    Đã nhập {formatQty(counts.all - counts.empty)}/{formatQty(counts.all)} dòng.
                  </b>{' '}
                  Chênh lệch = thực tế − tồn hệ thống.{hasPlatform && ' Tồn trên sàn chỉ để tham khảo khi đếm.'}{' '}
                  {editable && counts.empty > 0 && (
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      // Giữ con trỏ ở ô đang gõ để tìm dòng trống sau dòng đó
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={goNextEmpty}
                    >
                      Tới dòng trống kế
                    </button>
                  )}
                </p>
                {fills.length > 0 && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={fillPlatform}>
                    <ListRestart />
                    Điền theo tồn sàn cho {formatQty(fills.length)} dòng trống
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex min-w-56 flex-1 items-center sm:max-w-xs">
                  <Search className="pointer-events-none absolute start-2.5 size-4 text-muted-foreground" aria-hidden />
                  <Input
                    type="search"
                    value={sheetSearch}
                    onChange={(e) => {
                      setSheetSearch(e.target.value);
                      setSheetPage(1);
                    }}
                    placeholder="Tìm theo SKU, tên"
                    aria-label="Tìm dòng phiếu"
                    className="h-8 ps-8"
                  />
                </label>
                {SHEET_FILTERS.filter((f) => f.key !== 'platform' || counts.platform > 0).map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={sheetFilter === f.key ? 'default' : 'outline'}
                    aria-pressed={sheetFilter === f.key}
                    onClick={() => {
                      setSheetFilter(f.key);
                      setSheetPage(1);
                    }}
                  >
                    {f.label} <span className="tabular-nums opacity-80">{formatQty(counts[f.key])}</span>
                  </Button>
                ))}
              </div>
              {counts.platform > 0 && (
                <AlertMessage severity="warning">
                  <b className="font-semibold">Dòng "Theo tồn sàn" chưa phải số đếm thật.</b> Hợp khi shop nhỏ tin số trên sàn. Sau khi bán
                  ổn định, nên kiểm kê lại các dòng này ở Kho.
                </AlertMessage>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="doc-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  {isStocktake && (
                    <>
                      {hasPlatform && <TableHead className="w-28 text-right">Tồn trên sàn</TableHead>}
                      <TableHead className="w-28 text-right">Tồn hệ thống</TableHead>
                      <TableHead className="w-32 text-right">Thực tế</TableHead>
                      <TableHead className="w-28 text-right">Chênh lệch</TableHead>
                    </>
                  )}
                  {isInspection && (
                    <>
                      <TableHead className="w-24 text-right">Dự kiến</TableHead>
                      <TableHead className="w-28 text-right">Đã quét</TableHead>
                      <TableHead className="w-28 text-right">Bán lại</TableHead>
                      <TableHead className="w-28 text-right">Hỏng</TableHead>
                      <TableHead className="w-28 text-right">Trả hàng NCC</TableHead>
                      <TableHead className="w-20 text-right">Thiếu</TableHead>
                    </>
                  )}
                  {!isStocktake && !isInspection && <TableHead className="w-40 text-right">Số lượng</TableHead>}
                  {showCost && <TableHead className="w-40 text-right">Giá vốn</TableHead>}
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!fields.length && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                      {editable ? 'Tìm và thêm SKU vào phiếu.' : 'Phiếu không có dòng nào.'}
                    </TableCell>
                  </TableRow>
                )}
                {isStocktake && fields.length > 0 && !sheet.items.length && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                      Không có dòng nào khớp bộ lọc.
                    </TableCell>
                  </TableRow>
                )}
                {(isStocktake ? sheet.items : fields.map((_, i) => i)).map((i, pos, shown) => {
                  const f = fields[i];
                  const lineErrors = errors.lines?.[i];
                  const docLine = doc?.lines[i];
                  const live = lines[i] ?? f;
                  const book = area === 'quarantine' ? f.bookQuarantine : f.bookStock;
                  const counted = draftNumber(live.counted);
                  const delta = editable
                    ? book !== undefined && counted !== null
                      ? counted - book
                      : null
                    : docLine?.counted == null
                      ? null
                      : (docLine.quantity ?? null);
                  const wrongSku = isInspection && !f.expected;
                  // Kiểm kê: gom theo sản phẩm, một dòng tiêu đề khi đổi sản phẩm
                  const groupStart = isStocktake && (pos === 0 || fields[shown[pos - 1]].productName !== f.productName);
                  return (
                    <Fragment key={f.key}>
                    {groupStart && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={colCount} className="py-1.5 text-xs font-semibold">
                          {f.productName}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow data-row-id={f.variantId} data-line-index={i} className="align-top">
                      <TableCell>
                        <p className="font-medium">
                          {f.sku}
                          {wrongSku && (
                            <Badge variant="warning" className="ms-2">
                              Sai SKU
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
                          {hasPlatform && (
                            <TableCell className="text-right">{f.platformStock == null ? '—' : formatQty(f.platformStock)}</TableCell>
                          )}
                          <TableCell className="text-right">{book === undefined ? '—' : formatQty(book)}</TableCell>
                          <TableCell className="text-right">
                            {editable
                              ? qtyInput(i, 'counted', 'Thực tế', f.sku)
                              : docLine?.counted == null
                                ? '—'
                                : formatQty(docLine.counted)}
                            {countSourceOf({ counted: live.counted ?? '', platformStock: f.platformStock ?? null, countSource: live.countSource ?? null }) ===
                              'platform' && (
                              <Badge variant="outline" className="mt-1 font-normal">
                                Theo tồn sàn
                              </Badge>
                            )}
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
                            {editable ? qtyInput(i, 'scanned', 'Đã quét', f.sku) : formatQty(docLine?.quantity ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'resell', 'Bán lại', f.sku) : formatQty(docLine?.resell ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'damaged', 'Hỏng', f.sku) : formatQty(docLine?.damaged ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? qtyInput(i, 'toSupplier', 'Trả hàng NCC', f.sku) : formatQty(docLine?.toSupplier ?? 0)}
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
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {isStocktake && sheet.pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="stocktake-pager">
              <span className="tabular-nums text-muted-foreground">
                {formatQty(sheet.from)}–{formatQty(sheet.to)} trên {formatQty(sheetOrder.length)} dòng
              </span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="outline" aria-label="Trang trước" disabled={sheet.page <= 1} onClick={() => setSheetPage(sheet.page - 1)}>
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums">
                  {sheet.page} / {sheet.pages}
                </span>
                <Button size="sm" variant="outline" aria-label="Trang sau" disabled={sheet.page >= sheet.pages} onClick={() => setSheetPage(sheet.page + 1)}>
                  <ChevronRight />
                </Button>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {doc && !embedded && doc.statusHistory.length > 0 && (
        <Card className="mt-4 py-4">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline history={doc.statusHistory} statuses={DOC_STATUS} />
          </CardContent>
        </Card>
      )}

      <SecondPersonDialog
        open={Boolean(confirmText) && confirmSecondPerson}
        title={`${confirmText?.title ?? ''} ${doc?.number ?? 'phiếu'}?`}
        createdByName={doc?.createdBy ?? ''}
        selfApproval={doc?.createdById === actor.accountId}
        confirmLabel={confirmText?.title}
        loading={busy}
        onConfirm={() => confirm && onConfirmAction(confirm)}
        onClose={() => setConfirm(null)}
      >
        {confirmText?.message}
      </SecondPersonDialog>
      <ConfirmDialog
        open={Boolean(confirmText) && !confirmSecondPerson}
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
            : 'Hàng đang tạm khoá được mở lại. Nếu là xuất huỷ hàng lỗi/chờ kiểm, kho sẽ phải chọn đưa về kho bán hoặc trả hàng NCC.'
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
            ? 'Hàng chuyển từ khu hàng lỗi/chờ kiểm về tồn kho và bán được tiếp.'
            : 'Hàng ở lại khu hàng lỗi/chờ kiểm để tạo phiếu trả hàng NCC.'
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
