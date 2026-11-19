import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useReceiveReturn, useReturn, useReturns } from '@/api/returns.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ScannedLines } from '@/features/fulfillment/ScannedLines';
import { checkScanRows, scanErrorsOf, scanRowsFrom, type ScanRow } from '@/features/fulfillment/scanLines';
import type { ReceiveResult, ReturnRequestSummary } from '@/types/returns';
import { MAX_REASON, receiveSchema, type ReceiveForm } from './shared';

/** Yêu cầu chờ hàng hoàn về khớp mã quét: mã yêu cầu, hoặc mã đơn khi đơn chỉ có một yêu cầu chờ (như BE) */
function matchRequest(items: ReturnRequestSummary[], raw: string) {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  const direct = items.find((r) => r.code.toUpperCase() === code);
  if (direct) return direct;
  const byOrder = items.filter((r) => r.order.code.toUpperCase() === code);
  return byOrder.length === 1 ? byOrder[0] : null;
}

/**
 * Kho quét mã trên kiện hàng hoàn (mã yêu cầu, mã vận đơn hoàn hoặc mã đơn), nhập số quét thật từng món (FE#212).
 * Chưa tìm được yêu cầu thì kiện sang tab Hàng hoàn chưa rõ đơn, gắn cờ cho người xử lý sau.
 */
export function ReceiveReturnDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (result: ReceiveResult) => void;
}) {
  const receive = useReceiveReturn();
  const form = useForm<ReceiveForm>({ resolver: zodResolver(receiveSchema), defaultValues: { code: '', note: '' } });
  const { reset, setError } = form;
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scanErrors, setScanErrors] = useState<Record<string, string> | null>(null);
  const awaiting = useReturns({ status: 'awaiting_return', page: 1, pageSize: 100 }, { enabled: open });
  const code = form.watch('code');
  const match = useMemo(() => matchRequest(awaiting.data?.items ?? [], code), [awaiting.data, code]);
  const detail = useReturn(match?.id ?? '');
  const matchedLines = match && detail.data?.id === match.id ? detail.data.lines : null;

  useEffect(() => {
    if (open) {
      reset({ code: '', note: '' });
      receive.reset();
      setRows([]);
      setScanErrors(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  // Đổi yêu cầu khớp thì bảng lấy lại dòng của yêu cầu đó, mặc định quét đủ
  useEffect(() => {
    setRows(matchedLines ? scanRowsFrom(matchedLines) : []);
    setScanErrors(null);
  }, [matchedLines]);

  const submit = async (v: ReceiveForm) => {
    const checked = checkScanRows(rows);
    if (Object.keys(checked.errors).length) return setScanErrors(checked.errors);
    setScanErrors(null);
    try {
      // Không khớp yêu cầu nào trên máy và kho không thêm món: để BE tự khớp (vd mã vận đơn hoàn), coi như quét đủ
      const lines = matchedLines || rows.length ? checked.lines : undefined;
      const r = await receive.mutateAsync({ code: v.code, note: v.note || undefined, lines });
      if (r.kind === 'matched') toast.success(`Đã nhận hàng hoàn ${r.request.code}, đã tạo phiếu kiểm hàng hoàn`);
      else toast.warning(`Mã ${r.parcel.code} chưa tìm được yêu cầu trả hàng. Kiện đã chuyển sang tab Hàng hoàn chưa rõ đơn.`);
      onDone(r);
    } catch (e) {
      const errors = getProblem(e)?.errors;
      if (errors?.code) setError('code', { message: errors.code });
      if (errors?.note) setError('note', { message: errors.note });
      setScanErrors(scanErrorsOf(errors));
    }
  };

  const problem = getProblem(receive.error);
  const formError = receive.error && !problem?.errors ? problemMessage(receive.error) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !receive.isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quét nhận hàng hoàn</DialogTitle>
          <DialogDescription>Nhập số lượng thực nhận của từng món. Số này được cộng vào khu Hàng lỗi/chờ kiểm, chưa vào tồn kho.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {formError && <AlertMessage severity="error">{formError}</AlertMessage>}
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mã yêu cầu, mã vận đơn hoàn hoặc mã đơn</FormLabel>
                  <FormControl>
                    <Input autoFocus maxLength={100} data-testid="receive-code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-sm text-muted-foreground" data-testid="receive-match">
              {match
                ? `Khớp yêu cầu ${match.code} (đơn ${match.order.code}). Sửa số quét nếu thiếu hoặc thừa.`
                : code.trim()
                  ? 'Chưa có yêu cầu chờ hàng hoàn về khớp mã này. Tìm SKU để thêm các món có trong kiện.'
                  : 'Quét mã để hiện các món của yêu cầu.'}
            </p>
            <ScannedLines id="receive-lines" rows={rows} onChange={setRows} errors={scanErrors} disabled={receive.isPending} />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tình trạng kiện (móp, rách, thiếu tem...)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={MAX_REASON} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={receive.isPending}>
                Đóng
              </Button>
              <Button type="submit" disabled={receive.isPending}>
                Nhận hàng
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
