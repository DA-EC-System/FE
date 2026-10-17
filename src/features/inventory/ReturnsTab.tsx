import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useReturnOrders } from '@/api/inventory.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { ReturnOrder } from '@/types/inventory';
import { ReturnReceiptDialog } from './ReturnReceiptDialog';
import { formatQty } from './shared';

/** UC-IN-03: đơn giao không thành công chờ nhập hoàn; mỗi đơn chỉ nhập hoàn một lần */
export function ReturnsTab() {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const query = useReturnOrders();
  const [processing, setProcessing] = useState<ReturnOrder | null>(null);
  const orders = query.data ?? [];

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Đơn giao không thành công, hàng đã quay về kho. Kiểm số thực nhận rồi lập phiếu nhập hoàn; phiếu được ghi sổ
        ngay và cộng lại tồn theo giá vốn hiện tại.
      </p>
      {query.isError && <AlertMessage severity="error">{getErrorMessage(query.error)}</AlertMessage>}
      <Card className="gap-0 overflow-x-auto py-0">
        {query.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4">Đơn</TableHead>
                <TableHead>Khách hàng</TableHead>
                <TableHead>Giao không thành công</TableHead>
                <TableHead className="text-right">Số lượng</TableHead>
                <TableHead className="w-52 pe-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orders.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Không có đơn nào chờ nhập hoàn.
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => (
                <TableRow key={o.orderId} data-row-id={o.orderId}>
                  <TableCell className="ps-4">
                    <p className="font-medium">{o.orderCode}</p>
                    <p className="text-xs text-muted-foreground">Vận đơn {o.shipmentCode}</p>
                  </TableCell>
                  <TableCell>
                    <p>{o.customerName}</p>
                    <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                  </TableCell>
                  <TableCell>
                    <p>{formatDateTime(o.failedAt)}</p>
                    <p className="text-xs text-muted-foreground">{o.failedReason}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQty(o.lines.reduce((s, l) => s + l.quantity, 0))}
                    <p className="text-xs text-muted-foreground">{o.lines.length} biến thể</p>
                  </TableCell>
                  <TableCell className="pe-4 text-right">
                    {o.receipt ? (
                      <Badge variant="success" asChild>
                        <Link to={ROUTES.company.inventoryDoc(companyId, o.receipt.id)}>
                          Đã xử lý · {o.receipt.number}
                        </Link>
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={() => setProcessing(o)}>
                        Nhập hoàn
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ReturnReceiptDialog
        order={processing}
        onClose={() => {
          setProcessing(null);
          query.refetch();
        }}
        onDone={(doc) => {
          setProcessing(null);
          toast.success(`Đã lập và ghi sổ ${doc.number}; tồn kho đã cộng lại`);
        }}
      />
    </div>
  );
}
