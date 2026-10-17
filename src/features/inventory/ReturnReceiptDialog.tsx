import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCreateReturnReceipt } from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { formatDateTime } from '@/utils/format';
import type { ReturnOrder, StockDoc } from '@/types/inventory';
import { formatQty, returnFormSchema, type ReturnFormInput, type ReturnFormOutput } from './shared';

interface ReturnReceiptDialogProps {
  order: ReturnOrder | null;
  onClose: () => void;
  onDone: (doc: StockDoc) => void;
}

const toForm = (order: ReturnOrder): ReturnFormInput => ({
  note: '',
  lines: order.lines.map((l) => ({ variantId: l.variantId, shipped: l.quantity, quantity: String(l.quantity) })),
});

/**
 * UC-IN-03: kiểm hàng hoàn của đơn giao không thành công rồi nhập lại kho.
 * Mặc định số thực nhận bằng số đã xuất; số khác thì phải ghi lý do.
 */
export function ReturnReceiptDialog({ order, onClose, onDone }: ReturnReceiptDialogProps) {
  const mutation = useCreateReturnReceipt();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<ReturnFormInput, unknown, ReturnFormOutput>({
    resolver: zodResolver(returnFormSchema),
    defaultValues: { note: '', lines: [] },
  });
  const { fields } = useFieldArray({ control, name: 'lines', keyName: 'key' });

  useEffect(() => {
    if (order) {
      reset(toForm(order));
      setError(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!order) return;
    setError(null);
    try {
      const doc = await mutation.mutateAsync({
        orderId: order.orderId,
        note: values.note,
        lines: values.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      onDone(doc);
    } catch (e) {
      const problem = getProblem(e);
      const fieldErrors = problem?.errors ?? {};
      for (const [path, message] of Object.entries(fieldErrors)) {
        const m = /^lines\.(\d+)\.quantity$/.exec(path);
        if (m) setFieldError(`lines.${Number(m[1])}.quantity`, { message });
        else if (path === 'note') setFieldError('note', { message });
      }
      setError(
        problem?.code === 'already_processed'
          ? (problem.detail ?? 'Đơn đã được xử lý') + ' Đóng hộp thoại để xem danh sách mới.'
          : (fieldErrors.lines ?? getErrorMessage(e)),
      );
    }
  });

  const linesError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Dialog open={Boolean(order)} onClose={mutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Nhập hoàn đơn {order?.orderCode}</DialogTitle>
      <DialogContent>
        {order && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {order.customerName} · vận đơn {order.shipmentCode} · giao không thành công lúc{' '}
            {formatDateTime(order.failedAt)} ({order.failedReason})
          </Typography>
        )}
        {error && (
          <Alert severity={getProblem(mutation.error)?.code === 'already_processed' ? 'warning' : 'error'} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {linesError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {linesError}
          </Alert>
        )}
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Biến thể</TableCell>
              <TableCell align="right">Đã xuất</TableCell>
              <TableCell align="right" sx={{ width: 150 }}>
                Thực nhận
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((f, i) => {
              const line = order?.lines[i];
              return (
                <TableRow key={f.key}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {line?.sku}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {line?.productName}
                      {line?.attributesLabel && ` · ${line.attributesLabel}`}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatQty(f.shipped)}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      {...register(`lines.${i}.quantity`)}
                      inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                      error={Boolean(errors.lines?.[i]?.quantity)}
                      helperText={errors.lines?.[i]?.quantity?.message}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TextField
          label="Ghi chú"
          fullWidth
          multiline
          minRows={2}
          {...register('note')}
          error={Boolean(errors.note)}
          helperText={errors.note?.message ?? 'Bắt buộc khi số thực nhận khác số đã xuất (thiếu, hỏng, thất lạc)'}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Đóng
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={mutation.isPending}>
          Lập phiếu nhập hoàn
        </Button>
      </DialogActions>
    </Dialog>
  );
}
