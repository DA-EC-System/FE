import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateVoucher, useRefunds, useUnmatchedReceipts } from '@/api/finance.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { SearchCombobox } from '@/features/sales/SearchCombobox';
import { CREATABLE_PURPOSES, MAX_NOTE, VOUCHER_PURPOSE_LABELS, today, voucherSchema, type VoucherForm } from './shared';
import { useCompanyId } from './parts';

/** Chứng từ gốc đã chọn: đơn chờ hoàn hoặc khoản thu chưa khớp, kèm số phải chi */
interface SourceOption {
  id: string;
  title: string;
  detail: string;
  amount: number;
}

const EMPTY: VoucherForm = { purpose: undefined as unknown as VoucherForm['purpose'], sourceId: '', paidOn: '', note: '' };

/** UC-PF-05 — Lập phiếu chi nháp hoàn tiền khách hoặc hoàn khoản thu chưa khớp (AC-V1) */
export function VoucherFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const mutation = useCreateVoucher();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SourceOption | null>(null);
  const [input, setInput] = useState('');
  const search = useDebounce(input.trim());
  const form = useForm<VoucherForm>({ resolver: zodResolver(voucherSchema), defaultValues: EMPTY });
  const { reset, watch, setValue } = form;
  const purpose = watch('purpose');

  const refunds = useRefunds(
    { status: 'pending_refund', search: search || undefined, pageSize: 20 },
    open && purpose === 'customer_refund',
  );
  const unmatched = useUnmatchedReceipts(
    { status: 'open', search: search || undefined, pageSize: 20 },
    open && purpose === 'unmatched_refund',
  );

  useEffect(() => {
    if (open) {
      reset({ ...EMPTY, paidOn: today() });
      setPicked(null);
      setInput('');
      setError(null);
    }
  }, [open, reset]);

  const options: SourceOption[] =
    purpose === 'customer_refund'
      ? (refunds.data?.items ?? []).flatMap((r) =>
          r.order
            ? [{ id: r.order.id, title: r.order.code, detail: r.order.customerName ?? '', amount: r.paidAmount }]
            : [],
        )
      : purpose === 'unmatched_refund'
        ? (unmatched.data?.items ?? []).map((u) => ({
            id: u.id,
            title: u.transferContent || '(Không có nội dung)',
            detail: formatDateTime(u.receivedAt),
            amount: u.amount,
          }))
        : [];
  const fetching = purpose === 'customer_refund' ? refunds.isFetching : unmatched.isFetching;

  const choose = (o: SourceOption | null) => {
    setPicked(o);
    setInput('');
    setValue('sourceId', o?.id ?? '', { shouldValidate: Boolean(o) });
  };

  const submit = async (values: VoucherForm) => {
    if (!picked) return;
    setError(null);
    const isOrder = values.purpose === 'customer_refund';
    try {
      const voucher = await mutation.mutateAsync({
        purpose: values.purpose,
        ...(isOrder ? { orderId: picked.id } : { unmatchedReceiptId: picked.id }),
        amount: picked.amount,
        paidOn: values.paidOn,
        note: values.note.trim(),
      });
      toast.success(`Đã lập phiếu chi nháp ${voucher.number}`);
      onClose();
      navigate(ROUTES.company.paymentVoucher(companyId, voucher.id));
    } catch (e) {
      const problem = getProblem(e);
      const errors = problem?.errors;
      const sourceError = errors?.orderId ?? errors?.unmatchedReceiptId ?? errors?.amount;
      if (errors && (sourceError || errors.paidOn || errors.note)) {
        if (sourceError) form.setError('sourceId', { message: sourceError });
        if (errors.paidOn) form.setError('paidOn', { message: errors.paidOn });
        if (errors.note) form.setError('note', { message: errors.note });
      } else if (problem?.code === 'already_processed' && problem.detail) {
        setError(problem.detail);
      } else {
        setError(problemMessage(e));
      }
    }
  };

  const loading = mutation.isPending;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lập phiếu chi</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mục đích</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => {
                      field.onChange(v);
                      choose(null);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn mục đích" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CREATABLE_PURPOSES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {VOUCHER_PURPOSE_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sourceId"
              render={({ fieldState }) => (
                <FormItem>
                  {picked ? (
                    <div className="grid gap-1.5">
                      <Label>Chứng từ gốc</Label>
                      <div className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm" data-testid="voucher-source">
                        <div>
                          <p className="font-medium">{picked.title}</p>
                          {picked.detail && <p className="text-muted-foreground">{picked.detail}</p>}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)}>
                          <X />
                          Đổi
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <SearchCombobox<SourceOption>
                      id="voucher-source"
                      label="Chứng từ gốc"
                      placeholder={
                        purpose === 'unmatched_refund'
                          ? 'Gõ nội dung chuyển khoản'
                          : purpose === 'customer_refund'
                            ? 'Gõ mã đơn, tên khách'
                            : 'Chọn mục đích trước'
                      }
                      input={input}
                      onInputChange={setInput}
                      options={options}
                      fetching={fetching}
                      emptyText={purpose === 'unmatched_refund' ? 'Không có khoản thu chưa xử lý' : 'Không có đơn chờ hoàn tiền'}
                      getKey={(o) => o.id}
                      renderOption={(o) => (
                        <>
                          <span className="grid">
                            <span className="font-medium">{o.title}</span>
                            {o.detail && <span className="text-xs text-muted-foreground">{o.detail}</span>}
                          </span>
                          <span className="whitespace-nowrap">{formatCurrency(o.amount)}</span>
                        </>
                      )}
                      onPick={choose}
                      disabled={!purpose}
                      invalid={Boolean(fieldState.error)}
                    />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="voucher-amount">Số tiền</Label>
              <Input
                id="voucher-amount"
                readOnly
                disabled
                value={picked ? formatCurrency(picked.amount) : ''}
                placeholder="Tự điền theo chứng từ gốc"
              />
              <p className="text-xs text-muted-foreground">Hoàn đủ số đã thu, không hoàn một phần.</p>
            </div>
            <FormField
              control={form.control}
              name="paidOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ngày chi</FormLabel>
                  <FormControl>
                    <Input type="date" className="w-44" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={MAX_NOTE} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Đang lưu...' : 'Lưu nháp'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
