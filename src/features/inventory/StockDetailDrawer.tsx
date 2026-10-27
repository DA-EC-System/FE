import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStockDetail } from '@/api/inventory.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import { AREA_LABELS, DOC_TYPE_LABELS, formatQty } from './shared';
import { StockChips } from './StockChips';

interface StockDetailDrawerProps {
  variantId: string | null;
  canCost: boolean;
  onClose: () => void;
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'error' }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold', tone === 'error' && 'text-destructive')}>{value}</p>
    </div>
  );
}

/** Bảy con số tồn của một biến thể và thẻ kho (sổ biến động theo khu vực, gắn chứng từ gốc) */
export function StockDetailDrawer({ variantId, canCost, onClose }: StockDetailDrawerProps) {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const query = useStockDetail(variantId);
  const level = query.data?.level;
  const moves = query.data?.moves ?? [];

  return (
    <Sheet open={Boolean(variantId)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{level?.sku ?? 'Tồn kho'}</SheetTitle>
          <SheetDescription>
            {level ? `${level.productName}${level.attributesLabel ? ` · ${level.attributesLabel}` : ''}` : ' '}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-4 pb-6">
          {query.isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {query.isError && <AlertMessage severity="error">{getErrorMessage(query.error)}</AlertMessage>}

          {level && (
            <>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" data-testid="stock-figures">
                <Figure label="Tồn thực" value={formatQty(level.onHand)} tone={level.negative ? 'error' : undefined} />
                <Figure label="Đang giữ cho kiện" value={formatQty(level.reserved)} />
                <Figure label="Tạm khoá" value={formatQty(level.locked)} />
                <Figure
                  label="Khả dụng"
                  value={formatQty(level.available)}
                  tone={level.state === 'in_stock' ? undefined : 'error'}
                />
                <Figure label="Đang về" value={formatQty(level.incoming)} />
                <Figure label="Chờ xử lý" value={formatQty(level.quarantine)} />
                <Figure label="Đang thiếu" value={formatQty(level.shortage)} tone={level.shortage ? 'error' : undefined} />
              </div>
              <p className="text-xs text-muted-foreground">
                Tồn thực = khả dụng + đang giữ + tạm khoá. Chờ xử lý không bán được và không thuộc tồn thực.
              </p>
              <StockChips level={level} />
              <div className="flex flex-wrap gap-2">
                <Badge variant={level.belowMin ? 'destructive' : 'secondary'}>
                  {level.minQty === null
                    ? 'Chưa đặt ngưỡng'
                    : `Ngưỡng ${formatQty(level.minQty)}${level.belowMin ? ' · nên nhập lại' : ''}`}
                </Badge>
                {canCost && level.avgCost !== null && (
                  <Badge variant="outline">Giá vốn BQ {formatCurrency(level.avgCost)}</Badge>
                )}
                {canCost && level.stockValue !== null && (
                  <Badge variant="outline">Giá trị tồn {formatCurrency(level.stockValue)}</Badge>
                )}
              </div>

              <Separator />
              <h3 className="font-semibold">Thẻ kho</h3>
              {!moves.length ? (
                <p className="text-sm text-muted-foreground">Chưa có biến động nào.</p>
              ) : (
                <Table data-testid="stock-moves">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Chứng từ</TableHead>
                      <TableHead>Khu vực</TableHead>
                      <TableHead className="text-right">Biến động</TableHead>
                      <TableHead className="text-right">Tồn sau</TableHead>
                      {canCost && <TableHead className="text-right">Đơn giá vốn</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moves.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(m.doneAt)}
                          <span className="block text-xs text-muted-foreground">{m.doneBy}</span>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={ROUTES.company.inventoryDoc(companyId, m.document.id)}
                            className="font-medium text-primary hover:underline"
                          >
                            {m.document.number}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {DOC_TYPE_LABELS[m.document.type]}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{AREA_LABELS[m.area]}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-semibold',
                            m.qtyChange > 0 ? 'text-success' : 'text-destructive',
                          )}
                        >
                          {m.qtyChange > 0 ? '+' : '−'}
                          {formatQty(Math.abs(m.qtyChange))}
                        </TableCell>
                        <TableCell className="text-right">{formatQty(m.onHandAfter)}</TableCell>
                        {canCost && (
                          <TableCell className="text-right">
                            {m.unitCost === null ? '—' : formatCurrency(m.unitCost)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
