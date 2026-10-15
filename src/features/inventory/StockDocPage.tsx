import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import BlockIcon from '@mui/icons-material/Block';
import DeleteIcon from '@mui/icons-material/Delete';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
import type { StockDoc, StockDocLineInput, StockDocType } from '@/types/inventory';
import {
  DOC_KIND_LABELS,
  DOC_STATUS,
  DOC_TYPE_LABELS,
  docFormSchema,
  formatQty,
  type DocFormInput,
  type DocFormOutput,
  type Toast,
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

/**
 * Lập, sửa phiếu nhập/xuất lập tay rồi ghi sổ. Ghi sổ mới đổi tồn (QT-14, QT-15);
 * phiếu đã ghi sổ hoặc đã huỷ chỉ xem. `/inventory/documents/new?type=receipt|issue` là phiếu mới.
 */
export function StockDocPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
    // @hookform/resolvers v3 chưa suy ra kiểu đầu ra của schema có transform
    resolver: zodResolver(schema) as Resolver<DocFormInput, unknown, DocFormOutput>,
    defaultValues: { note: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'key' });

  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<'post' | 'cancel' | null>(null);
  const [toast, setToast] = useState<Toast | null>(
    () => (location.state as { toast?: Toast } | null)?.toast ?? null,
  );
  /** Id phiếu đang nạp trên form: chỉ nạp lại khi đổi phiếu hoặc khi cần lấy bản mới nhất */
  const loaded = useRef<string | null>(null);
  /** Chuyển từ /new sang /<id> sau khi lưu: không hỏi rời trang */
  const skipBlock = useRef(false);

  useEffect(() => {
    if (location.state) navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);

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

  /** Lỗi 409/422 từ BE: hiện tại ô, hoặc nạp bản mới nhất khi phiếu vừa bị người khác đổi */
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
    let placed = false;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)\.(variantId|quantity|unitCost)$/.exec(path);
      if (m) {
        setError(`lines.${Number(m[1])}.${m[2] as 'quantity'}`, { message });
        placed = true;
      } else if (path === 'note') {
        setError('note', { message });
        placed = true;
      }
    }
    setNotice({
      severity: problem?.code === 'insufficient_stock' ? 'warning' : 'error',
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
    if (saved) setToast({ severity: 'success', msg: `Đã lưu nháp ${saved.number}` });
  });

  /** Ghi sổ: lưu thay đổi trước (nếu có) rồi ghi sổ bằng version mới */
  const onPost = handleSubmit(async (values) => {
    const saved = await save(values);
    if (!saved) return;
    try {
      const posted = await postMut.mutateAsync({ id: saved.id, version: saved.version });
      load(posted);
      setToast({ severity: 'success', msg: `Đã ghi sổ ${posted.number}; tồn kho đã cập nhật` });
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
      setToast({ severity: 'success', msg: `Đã huỷ ${cancelled.number}` });
    } catch (e) {
      handleError(e);
    }
  };

  const backToList = () => navigate(ROUTES.company.inventoryTab(companyId, 'documents'));

  if (isNew && !canManage) {
    return (
      <Box>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Bạn không có quyền lập phiếu kho.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={backToList}>
          Về danh sách phiếu
        </Button>
      </Box>
    );
  }
  if (docQuery.isError) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(docQuery.error)}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={backToList}>
          Về danh sách phiếu
        </Button>
      </Box>
    );
  }
  if (!isNew && !doc) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }

  const showCost = isReceipt
    ? editable || Boolean(doc?.lines.some((l) => l.unitCost !== null))
    : Boolean(doc?.lines.some((l) => l.unitCost !== null));
  const title = doc ? `${DOC_TYPE_LABELS[doc.type]} ${doc.number}` : `Lập ${DOC_TYPE_LABELS[type].toLowerCase()}`;

  return (
    <Box>
      <PageHeader
        title={title}
        subtitle={
          isReceipt
            ? 'Ghi sổ phiếu nhập làm tăng tồn và tính lại giá vốn bình quân.'
            : 'Phiếu xuất tay (hàng hỏng, điều chỉnh) chỉ lấy phần khả dụng, không đụng hàng đang giữ cho đơn.'
        }
        action={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button startIcon={<ArrowBackIcon />} onClick={backToList}>
              Danh sách
            </Button>
            {editable && !isNew && (
              <Button color="error" startIcon={<BlockIcon />} disabled={busy} onClick={() => setConfirm('cancel')}>
                Huỷ phiếu
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outlined" startIcon={<SaveIcon />} disabled={busy || (!isNew && !isDirty)} onClick={onSave}>
                  Lưu nháp
                </Button>
                <Button variant="contained" startIcon={<TaskAltIcon />} disabled={busy} onClick={() => setConfirm('post')}>
                  {isNew || isDirty ? 'Lưu và ghi sổ' : 'Ghi sổ'}
                </Button>
              </>
            )}
          </Stack>
        }
      />

      {notice && (
        <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice.msg}
        </Alert>
      )}

      {doc && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                Trạng thái
              </Typography>
              <Box>
                <Chip size="small" label={DOC_STATUS[doc.status].label} color={DOC_STATUS[doc.status].color} />
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Loại
              </Typography>
              <Typography variant="body2">
                {DOC_KIND_LABELS[doc.kind]}
                {doc.reference && ` · đơn ${doc.reference}`}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Người lập
              </Typography>
              <Typography variant="body2">
                {doc.createdBy} · {formatDateTime(doc.createdAt)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Ghi sổ
              </Typography>
              <Typography variant="body2">
                {doc.postedAt ? `${doc.postedBy} · ${formatDateTime(doc.postedAt)}` : '—'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
        {editable ? (
          <TextField
            label={isReceipt ? 'Ghi chú' : 'Lý do xuất kho'}
            fullWidth
            multiline
            minRows={2}
            {...register('note')}
            error={Boolean(errors.note)}
            helperText={errors.note?.message ?? (isReceipt ? 'Vd nguồn hàng, số hoá đơn nhà cung cấp' : 'Vd hàng lỗi, mất, kiểm kê lệch')}
            sx={{ mb: 2 }}
          />
        ) : (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {isReceipt ? 'Ghi chú' : 'Lý do xuất kho'}
            </Typography>
            <Typography variant="body2">{doc?.note || '—'}</Typography>
          </Box>
        )}

        {editable && (
          <Box sx={{ mb: 2 }}>
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
          </Box>
        )}
        {errors.lines?.root?.message || errors.lines?.message ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.lines?.root?.message ?? errors.lines?.message}
          </Alert>
        ) : null}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Biến thể</TableCell>
              <TableCell align="right" sx={{ width: 160 }}>
                Số lượng
              </TableCell>
              {showCost && (
                <TableCell align="right" sx={{ width: 200 }}>
                  {isReceipt && doc?.kind !== 'delivery_return' ? 'Giá nhập' : 'Giá vốn'}
                </TableCell>
              )}
              {editable && <TableCell sx={{ width: 56 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {!fields.length && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {editable ? 'Tìm và thêm biến thể vào phiếu.' : 'Phiếu không có dòng nào.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {fields.map((f, i) => {
              const lineErrors = errors.lines?.[i];
              const docLine = doc?.lines[i];
              return (
                <TableRow key={f.key}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {f.sku}
                    </Typography>
                    <Typography variant="caption" color={lineErrors?.variantId ? 'error' : 'text.secondary'}>
                      {lineErrors?.variantId?.message ??
                        `${f.productName}${f.attributesLabel ? ` · ${f.attributesLabel}` : ''}`}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {editable ? (
                      <TextField
                        size="small"
                        {...register(`lines.${i}.quantity`)}
                        inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                        error={Boolean(lineErrors?.quantity)}
                        helperText={lineErrors?.quantity?.message}
                      />
                    ) : (
                      formatQty(docLine?.quantity ?? 0)
                    )}
                  </TableCell>
                  {showCost && (
                    <TableCell align="right">
                      {editable ? (
                        <TextField
                          size="small"
                          {...register(`lines.${i}.unitCost`)}
                          inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                          InputProps={{ endAdornment: <InputAdornment position="end">đ</InputAdornment> }}
                          error={Boolean(lineErrors?.unitCost)}
                          helperText={lineErrors?.unitCost?.message}
                        />
                      ) : docLine?.unitCost === null || docLine?.unitCost === undefined ? (
                        '—'
                      ) : (
                        formatCurrency(docLine.unitCost)
                      )}
                    </TableCell>
                  )}
                  {editable && (
                    <TableCell>
                      <Tooltip title="Bỏ dòng">
                        <IconButton size="small" onClick={() => remove(i)} disabled={busy}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

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

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
