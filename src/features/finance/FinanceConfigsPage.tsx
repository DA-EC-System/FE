import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFinanceConfigs } from '@/api/financeLifecycle.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatDate } from '@/utils/format';
import { CONFIG_KINDS, CONFIG_STATES } from './lifecycleShared';
import { FinanceConfigForm } from './FinanceConfigForm';

export function FinanceConfigsPage() {
  const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? ''; const can = useCan();
  const f = useUrlFilters([25, 50, 100]); const navigate = useNavigate(); const [creating, setCreating] = useState(false);
  const kind = f.params.get('kind') ?? ''; const status = f.params.get('status') ?? ''; const shopId = f.params.get('shopId') ?? '';
  const query = useFinanceConfigs({ page: f.page, pageSize: f.pageSize, kind: kind || undefined, status: status || undefined, shopId: shopId || undefined });
  const shops = useShops({ enabled: can(P.shopView) });
  return <div><PageHeader title="Cấu hình phí và thuế" subtitle="Phiên bản theo ngày hiệu lực. Chạy thử không ghi sổ; mọi thay đổi áp dụng sau khi được duyệt."
    action={can(P.configManage) ? <Button onClick={() => setCreating(true)}>Soạn phiên bản</Button> : undefined} />
    {query.isError && <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>}
    <Card className="gap-0 py-0"><FilterBar><FilterSelect label="Loại cấu hình" value={kind} onChange={f.setFilter('kind')} options={Object.entries(CONFIG_KINDS).map(([value, label]) => ({ value, label }))} />
      <FilterSelect label="Trạng thái" value={status} onChange={f.setFilter('status')} options={Object.entries(CONFIG_STATES).map(([value, meta]) => ({ value, label: meta.label }))} />
      <FilterSelect label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }))} /></FilterBar>
      <DataTable data={query.data?.items ?? []} loading={query.isLoading} getRowId={(c) => c.id} empty="Chưa có phiên bản cấu hình" onRowClick={(c) => navigate(ROUTES.company.financeConfig(companyId, c.id))}
        pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: [25, 50, 100], onChange: f.onPageChange }} columns={[
          { header: 'Loại', cell: ({ row }) => CONFIG_KINDS[row.original.kind] },
          { header: 'Gian hàng', cell: ({ row }) => row.original.shopId ? shops.data?.items.find((s) => s.id === row.original.shopId)?.shopName ?? row.original.shopId : 'Toàn công ty' },
          { header: 'Hiệu lực', cell: ({ row }) => `${formatDate(row.original.effectiveFrom)} → ${row.original.effectiveTo ? formatDate(row.original.effectiveTo) : 'Chưa kết thúc'}` },
          { header: 'Trạng thái', cell: ({ row }) => <StatusBadge status={row.original.status} statuses={CONFIG_STATES} /> },
          { header: 'Người soạn', cell: ({ row }) => row.original.createdBy?.name ?? '—' },
          { header: 'Sửa lỗi', cell: ({ row }) => row.original.isCorrection ? `Hồi tố từ ${formatDate(row.original.retroactiveFrom)}` : '—' },
        ]} /></Card>
    {creating && <FinanceConfigForm onClose={() => setCreating(false)} onSaved={(c) => navigate(ROUTES.company.financeConfig(companyId, c.id))} />}
  </div>;
}
