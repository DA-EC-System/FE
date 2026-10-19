import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { CopyButton } from '@/components/common/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTransaction } from '@/api/payment.api';
import { problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { Info } from '@/features/sales/Info';
import { GATEWAY_LABELS, TRANSACTION_SOURCE_LABELS, TRANSACTION_STATUS } from '@/features/finance/shared';
import { DocLink, OrderCode, useCompanyId } from '@/features/finance/parts';

/** UC-PF-03 — Khung bên chi tiết giao dịch cổng và payload gốc, chỉ xem (AC-G2) */
export function TransactionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const companyId = useCompanyId();
  const canFinance = useCan()(PERMISSIONS.financeView);
  const query = useTransaction(id ?? '');
  const txn = query.data;
  const [payloadOpen, setPayloadOpen] = useState(true);
  const payload = txn ? JSON.stringify(txn.rawPayload, null, 2) : '';

  return (
    <Sheet open={Boolean(id)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Giao dịch cổng</SheetTitle>
          <SheetDescription>{txn ? `${GATEWAY_LABELS[txn.gateway]} · ${txn.gatewayTxnId}` : ' '}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          {query.isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {query.isError && <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>}
          {txn && (
            <>
              <div className="grid grid-cols-2 gap-4" data-testid="txn-fields">
                <Info label="Thời điểm">{formatDateTime(txn.occurredAt)}</Info>
                <Info label="Trạng thái">
                  <Badge variant={TRANSACTION_STATUS[txn.status].variant}>{TRANSACTION_STATUS[txn.status].label}</Badge>
                </Info>
                <Info label="Cổng">{GATEWAY_LABELS[txn.gateway]}</Info>
                <Info label="Nguồn">{TRANSACTION_SOURCE_LABELS[txn.source]}</Info>
                <Info label="Mã giao dịch cổng">{txn.gatewayTxnId}</Info>
                <Info label="Mã thanh toán">{txn.paymentCode ?? '—'}</Info>
                <Info label="Đơn hàng">
                  <OrderCode order={txn.order} />
                </Info>
                <Info label="Số tiền">{formatCurrency(txn.amount)}</Info>
                <Info label="Phiếu thu">
                  {txn.receipt && canFinance ? (
                    <DocLink to={ROUTES.company.receipt(companyId, txn.receipt.id)}>{txn.receipt.number}</DocLink>
                  ) : (
                    (txn.receipt?.number ?? '—')
                  )}
                </Info>
                {txn.unmatchedReceiptId && canFinance && (
                  <Info label="Khoản thu chưa khớp">
                    <DocLink to={ROUTES.company.unmatched(companyId)}>Xem khoản thu chưa khớp</DocLink>
                  </Info>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ms-2"
                    aria-expanded={payloadOpen}
                    onClick={() => setPayloadOpen((v) => !v)}
                  >
                    {payloadOpen ? <ChevronDown /> : <ChevronRight />}
                    Payload gốc
                  </Button>
                  <CopyButton value={payload} label="Sao chép payload" text="Sao chép" />
                </div>
                {payloadOpen && (
                  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="txn-payload">
                    {payload}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
