import { Link } from 'react-router-dom';
import { Panel } from '@/components/common/Panel';
import { HelpTip } from '@/components/common/HelpTip';
import { useFinanceConfigs } from '@/api/financeLifecycle.api';
import { ROUTES } from '@/router/routes';
import { formatDate } from '@/utils/format';
import type { ConfigKind, FinanceConfigSummary } from '@/types/finance';
import { CONFIG_KINDS, payloadSummary } from './lifecycleShared';

const ORDER: ConfigKind[] = ['tax_regime', 'tax_rules', 'fee', 'mismatch_threshold', 'min_margin'];

/**
 * Phần "Quy tắc" của view `v-cau-hinh-phi` (Test_UI): mỗi ô (loại, gian hàng) bản đang áp dụng hôm nay và bản chờ hiệu lực
 * kế tiếp, để thấy lịch hiệu lực mà không phải lọc bảng. Contract §21.4 không có quy tắc theo SKU nên chỉ chia theo gian hàng.
 */
export function ActiveConfigsPanel({ companyId, shopName }: { companyId: string; shopName: (id: string) => string }) {
  const active = useFinanceConfigs({ status: 'active', page: 1, pageSize: 100 });
  const scheduled = useFinanceConfigs({ status: 'scheduled', page: 1, pageSize: 100 });
  const cell = (c: FinanceConfigSummary) => `${c.kind}:${c.shopId ?? ''}`;
  const cells = new Map<string, { kind: ConfigKind; shopId: string | null; now?: FinanceConfigSummary; next?: FinanceConfigSummary }>();
  for (const c of active.data?.items ?? []) cells.set(cell(c), { kind: c.kind, shopId: c.shopId, ...cells.get(cell(c)), now: c });
  for (const c of [...(scheduled.data?.items ?? [])].sort((a, b) => (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? ''))) {
    const prev = cells.get(cell(c));
    if (!prev?.next) cells.set(cell(c), { kind: c.kind, shopId: c.shopId, ...prev, next: c });
  }
  const rows = [...cells.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.shopId ?? '').localeCompare(b.shopId ?? ''));
  const loading = active.isLoading || scheduled.isLoading;
  return (
    <Panel className="mb-4" data-testid="active-configs"
      title={<span className="inline-flex items-center gap-1">Đang áp dụng hôm nay<HelpTip topic="Đang áp dụng" content="Mỗi loại cấu hình và gian hàng chỉ có một bản áp dụng mỗi ngày. Tới ngày hiệu lực, bản chờ tự thay bản cũ." /></span>}
      extra={<span className="text-muted-foreground">{active.data?.total ?? 0} bản đang áp dụng</span>} flush>
      {loading ? <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        : rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Chưa có bản nào được duyệt. Soạn phiên bản, chạy thử rồi gửi duyệt.</p>
        : <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">{rows.map((r) => (
          <li key={`${r.kind}:${r.shopId}`} className="grid gap-1 border-b p-4 text-sm sm:border-e" data-testid="active-config">
            <span className="text-xs text-muted-foreground">{CONFIG_KINDS[r.kind]}{r.shopId ? ` · ${shopName(r.shopId)}` : ''}</span>
            {r.now ? <>
              <Link className="font-medium hover:underline" to={ROUTES.company.financeConfig(companyId, r.now.id)}>{payloadSummary(r.kind, r.now.payload)}</Link>
              <span className="text-xs text-muted-foreground">Từ {formatDate(r.now.effectiveFrom)}{r.now.effectiveTo ? ` đến ${formatDate(r.now.effectiveTo)}` : ''}</span>
            </> : <span className="text-muted-foreground">Chưa có bản đang áp dụng</span>}
            {r.next && <Link className="text-xs text-info-text hover:underline" to={ROUTES.company.financeConfig(companyId, r.next.id)}>Bản mới áp dụng từ {formatDate(r.next.effectiveFrom)}</Link>}
          </li>))}</ul>}
    </Panel>
  );
}
