import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { StockLevel } from '@/types/inventory';
import { STOCK_STATE, formatQty } from './shared';

type Chip = {
  label: string;
  variant: 'warning' | 'destructive' | 'info' | 'secondary';
  /** Bấm để tới chỗ xử lý; không có quyền thì chỉ hiện nhãn */
  to?: string;
  hint?: string;
  testId?: string;
};

/**
 * Nhãn suy ra của một dòng tồn (sơ đồ B2): Tồn âm, Sắp hết, Hết hàng, Thiếu N, Đang về N, Chờ xử lý N, Lệch tồn.
 * Thiếu dẫn tới các kiện thiếu hàng; Lệch tồn dẫn tới danh sách gian hàng (dòng tồn không gắn gian hàng nào).
 */
export function StockChips({ level }: { level: StockLevel }) {
  const can = useCan();
  const fulfillmentOn = useModuleEnabled('fulfillment');
  const channelOn = useModuleEnabled('channel');
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';

  const chips: Chip[] = [];
  if (level.negative) chips.push({ label: 'Tồn âm', variant: 'destructive' });
  if (level.state !== 'in_stock') chips.push(STOCK_STATE[level.state] as Chip);
  if (level.shortage) {
    chips.push({
      label: `Thiếu ${formatQty(level.shortage)}`,
      variant: 'destructive',
      to:
        fulfillmentOn && can(PERMISSIONS.fulfillmentProcess)
          ? `${ROUTES.company.packages(companyId)}?tab=backordered`
          : undefined,
      hint: 'Các kiện thiếu hàng cần SKU này',
      testId: 'chip-shortage',
    });
  }
  if (level.incoming) {
    chips.push({ label: `Đang về ${formatQty(level.incoming)}`, variant: 'info', testId: 'chip-incoming' });
  }
  if (level.quarantine) chips.push({ label: `Chờ xử lý ${formatQty(level.quarantine)}`, variant: 'secondary' });
  if (level.drift) {
    chips.push({
      label: 'Lệch tồn',
      variant: 'warning',
      to: channelOn && can(PERMISSIONS.shopView) ? ROUTES.company.shops(companyId) : undefined,
      hint: `Số trên sàn khác khả dụng sau lần đẩy gần nhất. Mở gian hàng, tìm ${level.sku} để xem listing lệch.`,
      testId: 'chip-drift',
    });
  }
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1" data-testid="stock-chips">
      {chips.map((c) =>
        c.to ? (
          <Badge key={c.label} variant={c.variant} asChild>
            <Link to={c.to} title={c.hint} data-testid={c.testId} className="hover:underline">
              {c.label}
            </Link>
          </Badge>
        ) : (
          <Badge key={c.label} variant={c.variant} title={c.hint} data-testid={c.testId}>
            {c.label}
          </Badge>
        ),
      )}
    </div>
  );
}
