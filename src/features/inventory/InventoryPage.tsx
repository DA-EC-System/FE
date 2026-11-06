import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  return (
    <div>
      <PageHeader
        title="Kho hàng"
        subtitle="Tồn và phiếu kho của từng biến thể."
        help="Bảy con số tồn: tồn thực, đang giữ, tạm khoá, khả dụng nằm ở cột; đang về, chờ xử lý, thiếu là nhãn dưới tên biến thể."
      />
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
      </Tabs>
    </div>
  );
}
