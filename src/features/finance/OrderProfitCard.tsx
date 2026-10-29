import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Money } from '@/components/common/Money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrderProfit } from '@/api/ledger.api';
import { problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency } from '@/utils/format';
import { ProfitStateBadge, TaxMismatchBadge } from './ledgerShared';

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={strong ? 'font-semibold' : undefined}>{children}</span>
    </div>
  );
}

/** Tiền của đơn trên chi tiết đơn: chỉ tính phần đã giao (sơ đồ D4.1) */
export function OrderProfitCard({ orderId, companyId }: { orderId: string; companyId: string }) {
  const can = useCan();
  const canView = can(PERMISSIONS.ledgerView);
  const query = useOrderProfit(orderId, canView);
  if (!canView) return null;
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>;
  const p = query.data;
  if (!p || p.lines.length === 0) return null;
  const contribution = p.gross === null ? null : p.gross + p.ads;

  return (
    <Card className="py-4" data-testid="order-profit">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Tiền của đơn</CardTitle>
        <div className="flex flex-wrap gap-1">
          <ProfitStateBadge estimated={p.estimated} />
          <TaxMismatchBadge value={p.taxMismatch} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        <Row label="Thực nhận">
          <Money value={p.net} />
        </Row>
        {p.cogs === null ? (
          <p className="py-1 text-xs text-muted-foreground">Cần quyền xem giá vốn để thấy lãi.</p>
        ) : (
          <>
            <Row label="Giá vốn">
              <Money value={p.cogs} />
            </Row>
            <Row label="Lãi gộp" strong>
              <Money value={p.gross ?? 0} />
            </Row>
            <Row label="Quảng cáo">
              <Money value={p.ads} />
            </Row>
            <Row label="Lãi đóng góp" strong>
              <Money value={contribution ?? 0} />
            </Row>
          </>
        )}
        {p.taxMismatch !== null && (
          <p className="text-xs text-destructive">
            Thuế sàn khấu trừ lệch {formatCurrency(p.taxMismatch)} so với ước tính, kế toán cần kiểm.
          </p>
        )}
        <Link
          to={`${ROUTES.company.ledger(companyId)}?filter=all&orderId=${orderId}`}
          className="pt-1 text-xs text-primary underline-offset-4 hover:underline"
        >
          Xem {p.lines.length} dòng sổ của đơn
        </Link>
      </CardContent>
    </Card>
  );
}
