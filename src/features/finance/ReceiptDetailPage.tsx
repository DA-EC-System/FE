import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useReceipt } from '@/api/finance.api';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { Info } from '@/features/sales/Info';
import { TransactionSheet } from '@/features/payment/TransactionSheet';
import { DOC_STATUS, GATEWAY_LABELS, RECEIPT_SOURCE_LABELS } from './shared';
import { DocLink, OrderCode, StatusBadge, useCompanyId } from './parts';
import { DocDetail } from './DocDetail';

/** UC-PF-04 — Chi tiết phiếu thu và nguồn gốc: giao dịch cổng, khoản thu chưa khớp, dòng đối soát (AC-D3) */
export function ReceiptDetailPage() {
  const { id = '' } = useParams();
  const companyId = useCompanyId();
  const canTxn = useCan()(PERMISSIONS.transactionView);
  const query = useReceipt(id);
  const [txnId, setTxnId] = useState<string | null>(null);

  return (
    <DocDetail query={query} tab="receipts" noun="phiếu thu">
      {(r) => (
        <>
          <PageHeader title={`Phiếu thu ${r.number}`} />
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              <Info label="Nguồn">{RECEIPT_SOURCE_LABELS[r.source]}</Info>
              <Info label="Đơn hàng">
                <OrderCode order={r.order} />
              </Info>
              <Info label="Khách">{r.order?.customerName ?? '—'}</Info>
              <Info label="Trạng thái">
                <span data-testid="doc-status">
                  <StatusBadge status={DOC_STATUS[r.status]} />
                </span>
              </Info>
              <Info label="Số tiền">{formatCurrency(r.amount)}</Info>
              <Info label="Cổng">{r.gateway ? GATEWAY_LABELS[r.gateway] : '—'}</Info>
              <Info label="Ngày ghi sổ">{formatDateTime(r.postedAt)}</Info>
              <Info label="Nguồn gốc">
                <span data-testid="receipt-origin">
                  {r.paymentTransactionId &&
                    (canTxn ? (
                      <Button variant="link" className="h-auto p-0" onClick={() => setTxnId(r.paymentTransactionId)}>
                        Xem giao dịch cổng
                      </Button>
                    ) : (
                      <span className="block">Giao dịch cổng</span>
                    ))}
                  {r.unmatchedReceiptId && (
                    <span className="block">
                      <DocLink to={ROUTES.company.unmatched(companyId, 'assigned')}>Khoản thu chưa khớp đã gán</DocLink>
                    </span>
                  )}
                  {r.settlementLineId && <span className="block">Dòng đối soát {r.settlementLineId}</span>}
                  {!r.paymentTransactionId && !r.unmatchedReceiptId && !r.settlementLineId && '—'}
                </span>
              </Info>
            </CardContent>
          </Card>
          <TransactionSheet id={txnId} onClose={() => setTxnId(null)} />
        </>
      )}
    </DocDetail>
  );
}
