import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CircleCheckBig, Loader2, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateStockDoc,
  useStockDoc,
  useStockDocAction,
  useUpdateStockDoc,
} from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import type { StockDoc, StockDocLineInput, StockDocType } from '@/types/inventory';
import {
  DOC_KIND_LABELS,
  DOC_STATUS,
  DOC_TYPE_LABELS,
  docFormSchema,
  formatQty,
  type DocFormInput,
  type DocFormOutput,
} from './shared';
import { VariantPicker } from './VariantPicker';

const toForm = (doc: StockDoc): DocFormInput => ({
  note: doc.note,
  lines: doc.lines.map((l) => ({
    variantId: l.variantId,
    sku: l.sku,
    productName: l.productName,
    attributesLabel: l.attributesLabel,
    quantity: String(l.quantity),
    unitCost: l.unitCost === null ? '' : String(l.unitCost),
  })),
});

const toLines = (values: DocFormOutput): StockDocLineInput[] =>
  values.lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
    ...(l.unitCost === null ? {} : { unitCost: l.unitCost }),
  }));

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * Lập, sửa phiếu nhập/xuất lập tay rồi ghi sổ. Ghi sổ mới đổi tồn (QT-14, QT-15);
 * phiếu đã ghi sổ hoặc đã huỷ chỉ xem. `/inventory/documents/new?type=receipt|issue` là phiếu mới.
 */
export function StockDocPage() {
  const navigate = useNavigate();
  const { docId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = docId === 'new';
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.stockDocManage);

  const docQuery = useStockDoc(isNew ? undefined : docId);
  const doc = docQuery.data;
  const type: StockDocType = doc?.type ?? (searchParams.get('type') === 'issue' ? 'issue' : 'receipt');
  const isReceipt = type === 'receipt';
  // Phiếu đã ghi sổ, đã huỷ, hoặc sinh từ đơn hàng chỉ xem (AC-K11)
  const editable = canManage && (isNew || (doc?.status === 'draft' && doc.kind === 'manual'));

  const createMut = useCreateStockDoc();
  const updateMut = useUpdateStockDoc();
  const postMut = useStockDocAction('post');
  const cancelMut = useStockDocAction('cancel');
  const busy = createMut.isPending || updateMut.isPending || postMut.isPending || cancelMut.isPending;

  const schema = useMemo(() => docFormSchema(type), [type]);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<DocFormInput, unknown, DocFormOutput>({
    // Dòng trên form giữ thêm sku, tên để hiển thị; schema chỉ kiểm các ô nhập nên phải ép kiểu
    resolver: zodResolver(schema) as unknown as Resolver<DocFormInput, unknown, DocFormOutput>,
    defaultValues: { note: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'key' });

  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<'post' | 'cancel' | null>(null);
  /** Id phiếu đang nạp trên form: chỉ nạp lại khi đổi phiếu hoặc khi cần lấy bản mới nhất */
  const loaded = useRef<string | null>(null);
  /** Chuyển từ /new sang /<id> sau khi lưu: không hỏi rời trang */
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

  /** Lỗi 409/422 từ BE: hiện tại ô, hoặc nạp bản mới nhất khi phiếu vừa bị người khác đổi (AC-K9, AC-K10) */
  const handleError = (e: unknown) => {
    const problem = getProblem(e);
    const latest = conflictCurrent<StockDoc>(e);
    if (problem?.code === 'version_conflict' && latest) {
      load(latest);
      setNotice({
        severity: 'warning',
        msg: 'Phiếu vừa được người khác sửa hoặc ghi sổ. Form đã hiện bản mới nhất, chưa có gì thay đổi.',
      });
      return;
    }
    if (problem?.code === 'not_draft') {
      loaded.current = null;
      docQuery.refetch();
    }
    const fieldErrors = problem?.errors ?? {};
    let placed = 0;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)\.(variantId|quantity|unitCost)$/.exec(path);
      if (m) {
        setError(`lines.${Number(m[1])}.${m[2] as 'quantity'}`, { message });
        placed++;
      } else if (path === 'note') {
        setError('note', { message });
        placed++;
      }
    }
    if (problem?.code === 'insufficient_stock') {
      // Phiếu vẫn ở nháp; dòng thiếu hàng báo đỏ tại ô số lượng
      toast.warning(
        fieldErrors.lines ??
          `${placed || 'Có'} dòng vượt số khả dụng, phiếu vẫn ở nháp. Sửa số lượng rồi ghi sổ lại.`,
      );
      return;
    }
    setNotice({
      severity: 'error',
      msg:
        fieldErrors.lines ??
        (placed ? `${problem?.title ?? 'Dữ liệu không hợp lệ'}. Xem các ô báo đỏ.` : getErrorMessage(e)),
    });
  };

  /** Lưu nháp; trả về phiếu sau lưu (hoặc phiếu hiện tại nếu không có gì đổi) */
  const save = async (values: DocFormOutput): Promise<StockDoc | null> => {
    setNotice(null);
    try {
      if (isNew) {
        const created = await createMut.mutateAsync({ type, note: values.note, lines: toLines(values) });
        load(created);
        skipBlock.current = true;
        navigate(ROUTES.company.inventoryDoc(companyId, created.id), { replace: true });
        skipBlock.current = false;
        return created;
      }
      if (!isDirty && doc) return { ...doc, version };
      const saved = await updateMut.mutateAsync({ id: docId, note: values.note, lines: toLines(values), version });
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

  /** Ghi sổ: lưu thay đổi trước (nếu có) rồi ghi sổ bằng version mới */
  const onPost = handleSubmit(async (values) => {
    const saved = await save(values);
    if (!saved) return;
    try {
      const posted = await postMut.mutateAsync({ id: saved.id, version: saved.version });
      load(posted);
      toast.success(`Đã ghi sổ ${posted.number}; tồn kho đã cập nhật`);
    } catch (e) {
      handleError(e);
    }
  });

  const onCancelDoc = async () => {
    setConfirm(null);
    if (!doc) return;
    setNotice(null);
    try {
      const cancelled = await cancelMut.mutateAsync({ id: doc.id, version });
      load(cancelled);
      toast.success(`Đã huỷ ${cancelled.number}`);
    } catch (e) {
      handleError(e);
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

  const showCost = isReceipt
    ? editable || Boolean(doc?.lines.some((l) => l.unitCost !== null))
    : Boolean(doc?.lines.some((l) => l.unitCost !== null));
  const title = doc ? `${DOC_TYPE_LABELS[doc.type]} ${doc.number}` : `Lập ${DOC_TYPE_LABELS[type].toLowerCase()}`;
  const noteLabel = isReceipt ? 'Ghi chú' : 'Lý do xuất kho';
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={
          isReceipt
            ? 'Ghi sổ phiếu nhập làm tăng tồn và tính lại giá vốn bình quân.'
            : 'Phiếu xuất tay (hàng hỏng, điều chỉnh) chỉ lấy phần khả dụng, không đụng hàng đang giữ cho đơn.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={backToList}>
              <ArrowLeft />
              Danh sách
            </Button>
            {editable && !isNew && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setConfirm('cancel')}
              >
                <Ban />
                Huỷ phiếu
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outline" disabled={busy || (!isNew && !isDirty)} onClick={onSave}>
                  <Save />
                  Lưu nháp
                </Button>
                <Button disabled={busy} onClick={() => setConfirm('post')}>
                  <CircleCheckBig />
                  {isNew || isDirty ? 'Lưu và ghi sổ' : 'Ghi sổ'}
                </Button>
              </>
            )}
          </div>
        }
      />

      {notice && (
        <AlertMessage severity={notice.severity} className="mb-4" onClose={() => setNotice(null)}>
          {notice.msg}
        </AlertMessage>
      )}

      {doc && (
        <Card className="mb-4 py-4">
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info label="Trạng thái">
              <Badge variant={DOC_STATUS[doc.status].variant} data-testid="doc-status">
                {DOC_STATUS[doc.status].label}
              </Badge>
            </Info>
            <Info label="Loại">
              {DOC_KIND_LABELS[doc.kind]}
              {doc.reference && ` · đơn ${doc.reference}`}
            </Info>
            <Info label="Người lập">
              {doc.createdBy} · {formatDateTime(doc.createdAt)}
            </Info>
            <Info label="Ghi sổ">{doc.postedAt ? `${doc.postedBy} · ${formatDateTime(doc.postedAt)}` : '—'}</Info>
          </CardContent>
        </Card>
      )}

      <Card className="py-4">
        <CardContent className="grid gap-4">
          {editable ? (
            <div className="grid gap-1.5">
              <Label htmlFor="doc-note">{noteLabel}</Label>
              <Textarea id="doc-note" rows={2} aria-invalid={Boolean(errors.note)} {...register('note')} />
              <p className={errors.note ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {errors.note?.message ??
                  (isReceipt ? 'Vd nguồn hàng, số hoá đơn nhà cung cấp' : 'Vd hàng lỗi, mất, kiểm kê lệch')}
              </p>
            </div>
          ) : (
            <Info label={noteLabel}>{doc?.note || '—'}</Info>
          )}

          {editable && (
            <VariantPicker
              taken={taken}
              disabled={busy}
              onPick={(level) =>
                append({
                  variantId: level.variantId,
                  sku: level.sku,
                  productName: level.productName,
                  attributesLabel: level.attributesLabel,
                  quantity: '',
                  unitCost: isReceipt && level.avgCost !== null && level.avgCost > 0 ? String(level.avgCost) : '',
                })
              }
            />
          )}
          {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}

          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="doc-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Biến thể</TableHead>
                  <TableHead className="w-40 text-right">Số lượng</TableHead>
                  {showCost && (
                    <TableHead className="w-52 text-right">
                      {isReceipt && doc?.kind !== 'delivery_return' ? 'Giá nhập' : 'Giá vốn'}
                    </TableHead>
                  )}
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!fields.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      {editable ? 'Tìm và thêm biến thể vào phiếu.' : 'Phiếu không có dòng nào.'}
                    </TableCell>
                  </TableRow>
                )}
                {fields.map((f, i) => {
                  const lineErrors = errors.lines?.[i];
                  const docLine = doc?.lines[i];
                  return (
                    <TableRow key={f.key} data-row-id={f.variantId} className="align-top">
                      <TableCell>
                        <p className="font-medium">{f.sku}</p>
                        <p
                          className={cn(
                            'text-xs',
                            lineErrors?.variantId ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {lineErrors?.variantId?.message ??
                            `${f.productName}${f.attributesLabel ? ` · ${f.attributesLabel}` : ''}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <div className="grid gap-1">
                            <Input
                              {...register(`lines.${i}.quantity`)}
                              aria-label={`Số lượng ${f.sku}`}
                              inputMode="numeric"
                              aria-invalid={Boolean(lineErrors?.quantity)}
                              className="h-8 text-right"
                            />
                            {lineErrors?.quantity && (
                              <p className="text-xs text-destructive">{lineErrors.quantity.message}</p>
                            )}
                          </div>
                        ) : (
                          formatQty(docLine?.quantity ?? 0)
                        )}
                      </TableCell>
                      {showCost && (
                        <TableCell className="text-right">
                          {editable ? (
                            <div className="grid gap-1">
                              <div className="relative">
                                <Input
                                  {...register(`lines.${i}.unitCost`)}
                                  aria-label={`${isReceipt ? 'Giá nhập' : 'Giá vốn'} ${f.sku}`}
                                  inputMode="numeric"
                                  aria-invalid={Boolean(lineErrors?.unitCost)}
                                  className="h-8 pe-6 text-right"
                                />
                                <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  đ
                                </span>
                              </div>
                              {lineErrors?.unitCost && (
                                <p className="text-xs text-destructive">{lineErrors.unitCost.message}</p>
                              )}
                            </div>
                          ) : docLine?.unitCost === null || docLine?.unitCost === undefined ? (
                            '—'
                          ) : (
                            formatCurrency(docLine.unitCost)
                          )}
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

      <ConfirmDialog
        open={confirm === 'post'}
        title={`Ghi sổ ${doc?.number ?? 'phiếu'}?`}
        message={
          isReceipt
            ? 'Tồn kho tăng và giá vốn bình quân được tính lại. Phiếu đã ghi sổ không sửa, không huỷ được.'
            : 'Tồn kho giảm theo các dòng của phiếu. Phiếu đã ghi sổ không sửa, không huỷ được.'
        }
        confirmLabel="Ghi sổ"
        loading={busy}
        onConfirm={() => {
          // Đóng hộp thoại trước để thấy ô báo lỗi nếu form chưa hợp lệ
          setConfirm(null);
          onPost();
        }}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={`Huỷ ${doc?.number ?? 'phiếu'}?`}
        message="Phiếu nháp bị huỷ không ghi sổ được nữa; tồn kho không đổi."
        confirmLabel="Huỷ phiếu"
        cancelLabel="Giữ lại"
        destructive
        loading={busy}
        onConfirm={onCancelDoc}
        onClose={() => setConfirm(null)}
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
