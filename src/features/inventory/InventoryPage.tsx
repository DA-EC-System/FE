import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageGuide } from '@/guides/usePageGuide';
import { StockTab } from './StockTab';
import { DocumentsTab } from './DocumentsTab';

export type InventoryTab = 'stock' | 'documents';

/** Phân hệ Kho: tồn theo biến thể (sơ đồ B2), phiếu kho (B3); hàng quay về thành phiếu kiểm hàng về */
export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs: { value: InventoryTab; label: string }[] = [
    { value: 'stock', label: 'Tồn kho' },
    { value: 'documents', label: 'Phiếu kho' },
  ];
  const requested = searchParams.get('tab');
  const tab = tabs.find((t) => t.value === requested)?.value ?? 'stock';
  const { startTour } = usePageGuide('inventory');

  return (
    <div>
      <PageHeader
        title="Kho hàng"
        subtitle="Khả dụng là số bán được và được đẩy lên các sàn."
        help="Mỗi biến thể có bảy con số tồn. Tồn thực, đang giữ, tạm khoá, khả dụng nằm ở cột; đang về, chờ xử lý, thiếu là nhãn dưới mã SKU. Rê chuột vào dấu ? ở đầu cột để xem từng số."
        onTour={startTour}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === 'stock' ? {} : { tab: value }, { replace: true })}
      >
        <TabsList className="mb-2" data-guide="inventory-tabs">
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
      </Tabs>
    </div>
  );
}
