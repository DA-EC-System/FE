import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getProblem } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { OrderRef } from '@/types/finance';
import type { BadgeVariant } from '@/features/sales/shared';
import { MAX_NOTE, payoutSchema, today, type PayoutForm } from './shared';

export function useCompanyId() {
  return useAuth().companyContext?.companyId ?? '';
}

/** Có quyền ghi tiền: xác nhận COD, hoàn tiền, lập, sửa, xoá, ghi sổ phiếu chi, gán và hoàn khoản thu */
export function useCanWrite() {
  return useCan()(PERMISSIONS.voucherCreate);
}

export function StatusBadge({ status }: { status: { label: string; variant: BadgeVariant } }) {
  return <Badge variant={status.variant}>{status.label}</Badge>;
}

/** Mã đơn là link sang chi tiết đơn khi có `sales.order.view`, không thì chữ thường (AC-C1) */
export function OrderCode({ order }: { order: Pick<OrderRef, 'id' | 'code'> | null }) {
  const companyId = useCompanyId();
  const canView = useCan()(PERMISSIONS.orderView);
  if (!order) return <>—</>;
  if (!canView) return <span className="font-medium">{order.code}</span>;
  return (
    <Link
      to={ROUTES.company.order(companyId, order.id)}
      className="font-medium text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {order.code}
    </Link>
  );
}

/** Link tới chứng từ, không kích hoạt bấm dòng */
export function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}

/** Số phiếu chi trong `detail` của 409 `already_processed`, vd "Đơn đã được hoàn bằng PC-000004" */
export const voucherNumberIn = (detail?: string) => detail?.match(/PC-\d+/)?.[0];

/**
 * Kết quả gửi biểu mẫu chi tiền: `undefined` là xong (nơi gọi tự đóng hộp thoại),
 * chuỗi là lỗi hiện trong hộp, object là lỗi dưới từng ô.
 */
export type PayoutResult = void | string | Partial<Record<keyof PayoutForm, string>>;

interface PayoutDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  /** Thông tin chỉ đọc phía trên biểu mẫu: chứng từ gốc, số tiền */
  summary: ReactNode;
  initial?: Partial<PayoutForm>;
  loading: boolean;
  onSubmit: (values: { paidOn: string; note: string }) => Promise<PayoutResult>;
  onClose: () => void;
}

/** Biểu mẫu Ngày chi + Ghi chú: hoàn tiền một bước (AC-R2), hoàn khoản thu (AC-U3), sửa phiếu nháp (AC-V2) */
export function PayoutDialog({ open, title, submitLabel, summary, initial, loading, onSubmit, onClose }: PayoutDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PayoutForm>({ resolver: zodResolver(payoutSchema), defaultValues: { paidOn: today(), note: '' } });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset({ paidOn: initial?.paidOn ?? today(), note: initial?.note ?? '' });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const submit = async (values: PayoutForm) => {
    setError(null);
    const result = await onSubmit({ paidOn: values.paidOn, note: values.note.trim() });
    if (typeof result === 'string') setError(result);
    else if (result) {
      for (const [key, message] of Object.entries(result)) {
        if (message) form.setError(key as keyof PayoutForm, { message });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {summary}
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
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
                    <Textarea rows={3} maxLength={MAX_NOTE} placeholder="Ví dụ: Chuyển khoản lại cho khách" {...field} />
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
                {loading ? 'Đang lưu...' : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Lỗi 422 dưới ô Ngày chi, Ghi chú; null nếu không phải lỗi ô */
export function payoutFieldErrors(e: unknown): Partial<Record<keyof PayoutForm, string>> | null {
  const errors = getProblem(e)?.errors;
  if (!errors?.paidOn && !errors?.note) return null;
  return { paidOn: errors.paidOn, note: errors.note };
}
