import { Link } from 'react-router-dom';
import { Panel } from '@/components/common/Panel';
import { useShops } from '@/api/shops.api';
import { ROUTES } from '@/router/routes';
import { shopDisplayName } from '../shopList';

/**
 * Khối "SKU sàn chưa liên kết" ở Tổng quan (FE#460, §18.12): gian hàng đang bán còn SKU sàn chưa liên kết, bấm mở thẳng tab
 * đó. Không gian hàng nào còn thì không hiện gì. Bên gọi kiểm quyền liên kết SKU
 */
export function UnlinkedSkuPanel({ companyId }: { companyId: string }) {
  const shops = useShops();
  const rows = (shops.data?.items ?? []).filter((s) => s.status === 'active' && (s.unlinkedSkuCount ?? 0) > 0);
  if (!rows.length) return null;
  const total = rows.reduce((n, s) => n + (s.unlinkedSkuCount ?? 0), 0);
  return (
    <Panel title="SKU sàn chưa liên kết" extra={<span className="text-muted-foreground">{total} SKU</span>} data-testid="unlinked-sku-panel">
      <p className="mb-3 text-sm text-muted-foreground">Liên kết để đơn trừ đúng tồn và nhận giá từ Commerio.</p>
      <ul className="grid gap-2 text-sm">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3">
            <span className="truncate">{shopDisplayName(s)}</span>
            <Link to={`${ROUTES.company.shop(companyId, s.id)}?tab=unmatched`} className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
              {s.unlinkedSkuCount} SKU chưa liên kết
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
