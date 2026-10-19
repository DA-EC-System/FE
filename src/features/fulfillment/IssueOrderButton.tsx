import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PackageCheck } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useIssueOrder } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { FulfillmentOrder } from '@/types/fulfillment';

/** Trả trước mà chưa trả đủ thì chưa xuất (AC-X2); đơn sàn, COD không bị chặn */
export const waitingPayment = (o: Pick<FulfillmentOrder, 'paymentMethod' | 'paymentStatus'>) =>
  o.paymentMethod === 'prepaid' && o.paymentStatus !== 'paid';

/** UC-SF-08 — Xuất kho một đơn đang đóng gói (AC-X1, AC-X2, AC-X4) */
export function IssueOrderButton({ order }: { order: FulfillmentOrder }) {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const mutation = useIssueOrder();
  const [open, setOpen] = useState(false);
  // Bấm hai lần trước khi kịp render lại vẫn chỉ gửi một request
  const sending = useRef(false);
  const blocked = waitingPayment(order);

  const issue = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      const result = await mutation.mutateAsync({ id: order.id, version: order.version });
      toast.success(`Đã xuất kho đơn ${order.code}, phiếu ${result.issue.number}`, {
        action: {
          label: 'Xem phiếu',
          onClick: () => navigate(ROUTES.company.inventoryDoc(companyId, result.issue.id)),
        },
      });
    } catch (e) {
      const code = getProblem(e)?.code;
      if (code === 'invalid_transition' || code === 'version_conflict') {
        toast.error('Đơn vừa được người khác cập nhật. Đã tải lại danh sách.');
      } else {
        toast.error(problemMessage(e));
      }
    } finally {
      sending.current = false;
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" disabled={blocked || mutation.isPending} onClick={() => setOpen(true)}>
        <PackageCheck />
        Xuất kho
      </Button>
      {blocked && <span className="text-xs text-muted-foreground">Chờ khách thanh toán</span>}
      <ConfirmDialog
        open={open}
        title={`Xuất kho đơn ${order.code}`}
        message={`Lập phiếu xuất cho ${order.totalQty} sản phẩm của đơn ${order.code} và trừ tồn kho.`}
        confirmLabel="Xuất kho"
        loading={mutation.isPending}
        onConfirm={issue}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
