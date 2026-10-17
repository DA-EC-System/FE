import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { USE_MOCKS } from '@/utils/env';
import { StockTab } from './StockTab';
import { DocumentsTab } from './DocumentsTab';
import { ReturnsTab } from './ReturnsTab';

export type InventoryTab = 'stock' | 'documents' | 'returns';

/** Phân hệ Kho: tồn theo biến thể (UC-IN-01, UC-IN-02), phiếu nhập/xuất, nhập hoàn (UC-IN-03) */
export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = useCan()(PERMISSIONS.stockDocManage);
  // Nhập hoàn cần API đơn hoàn của phân hệ Đơn hàng, backend chưa có nên chỉ hiện khi chạy mock (AC-K13)
  const showReturns = canManage && USE_MOCKS;
  const tabs: { value: InventoryTab; label: string }[] = [
    { value: 'stock', label: 'Tồn kho' },
    { value: 'documents', label: 'Phiếu nhập/xuất' },
    ...(showReturns ? [{ value: 'returns' as const, label: 'Nhập hoàn' }] : []),
  ];
  const requested = searchParams.get('tab');
  const tab = tabs.find((t) => t.value === requested)?.value ?? 'stock';

  return (
    <div>
      <PageHeader title="Kho hàng" subtitle="Tồn thực có, đang giữ cho đơn và khả dụng của từng biến thể." />
      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === 'stock' ? {} : { tab: value }, { replace: true })}
      >
        <TabsList className="mb-2">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="stock">
          <StockTab />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab />
        </TabsContent>
        {showReturns && (
          <TabsContent value="returns">
            <ReturnsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
