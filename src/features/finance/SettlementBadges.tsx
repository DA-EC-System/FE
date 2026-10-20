import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useSettlementLines } from '@/api/settlement.api';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { useCompanyId } from './parts';

/** Nhãn đối soát trên chi tiết đơn sàn; không bật Kênh bán hoặc thiếu quyền thì không gọi API (AC-S5) */
export function SettlementBadges({ orderId }: { orderId: string }) {
  const companyId = useCompanyId();
  const can = useCan();
  const channelOn = useModuleEnabled('channel');
  const enabled = channelOn && can(PERMISSIONS.financeView);
  const query = useSettlementLines({ orderId, pageSize: 100 }, enabled);
  const lines = query.data?.items ?? [];
  const refunded = lines.find((l) => l.matchStatus === 'refund_tagged');
  const discrepancy = lines.some((l) => l.matchStatus === 'discrepancy');
  return (
    <>
      {refunded && (
        <Badge variant="info" asChild>
          <Link to={ROUTES.company.settlement(companyId, refunded.statementId)}>Sàn đã hoàn</Link>
        </Badge>
      )}
      {discrepancy && <Badge variant="warning">Chênh lệch đối soát</Badge>}
    </>
  );
}
