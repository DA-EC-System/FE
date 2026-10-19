import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInvoice } from '@/api/finance.api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { Info } from '@/features/sales/Info';
import { DOC_STATUS } from './shared';
import { OrderCode, StatusBadge } from './parts';
import { DocDetail } from './DocDetail';

/** UC-PF-04 — Chi tiết hoá đơn, in bằng CSS in (AC-D2) */
export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const query = useInvoice(id);

  return (
    <DocDetail query={query} tab="invoices" noun="hoá đơn">
      {(inv) => {
        const goods = inv.lines.reduce((sum, l) => sum + l.lineTotal, 0);
        return (
          <>
            <PageHeader
              title={`Hoá đơn ${inv.number}`}
              action={
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer />
                  In hoá đơn
                </Button>
              }
            />
            <Card className="print-area">
              <CardHeader>
                <CardTitle>Hoá đơn {inv.number}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-4 sm:grid-cols-4">
                  <Info label="Đơn hàng">
                    <OrderCode order={inv.order} />
                  </Info>
                  <Info label="Khách">{inv.order?.customerName ?? '—'}</Info>
                  <Info label="Ngày lập">{formatDateTime(inv.issuedAt)}</Info>
                  <Info label="Trạng thái">
                    <span data-testid="doc-status">
                      <StatusBadge status={DOC_STATUS[inv.status]} />
                    </span>
                  </Info>
                </div>
                <Table data-testid="invoice-lines">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">SKU</TableHead>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Thuộc tính</TableHead>
                      <TableHead className="w-16 text-right">SL</TableHead>
                      <TableHead className="w-32 text-right">Đơn giá</TableHead>
                      <TableHead className="w-32 text-right">Thành tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.lines.map((l) => (
                      <TableRow key={l.variantId}>
                        <TableCell>{l.sku}</TableCell>
                        <TableCell>{l.productName}</TableCell>
                        <TableCell>{l.attributesLabel || '—'}</TableCell>
                        <TableCell className="text-right">{l.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(l.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(l.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter data-testid="invoice-totals">
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">
                        Tiền hàng
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(goods)}</TableCell>
                    </TableRow>
                    {inv.shippingFee > 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-right">
                          Phí vận chuyển
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(inv.shippingFee)}</TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-semibold">
                        Tổng cộng
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(inv.total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </>
        );
      }}
    </DocDetail>
  );
}
