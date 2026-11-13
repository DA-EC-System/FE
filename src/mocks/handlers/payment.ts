import * as payment from '../paymentData';
import type * as sales from '../salesData';
import type { PaymentStatus } from '@/types/payment';

// Handler cổng, mã thanh toán, giao dịch cổng đã gỡ theo commerio-backend#324 (FE#150).

/** Trạng thái tiền của đơn tay; đơn chưa có dòng order_payments thì suy từ cách thu (A8) */
export function paymentStatusOf(o: sales.MockOrder): PaymentStatus {
  const row = payment.orderPayments.find((p) => p.orderId === o.id);
  if (row) return row.status;
  return o.paymentMethod === 'cod' ? 'cod_pending' : 'unpaid';
}
