import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequestsTab } from './RequestsTab';
import { ReceiptsTab } from './ReceiptsTab';
import { ReturnsTab } from './ReturnsTab';
import { SuppliersTab } from './SuppliersTab';

type PurchasingTab = 'requests' | 'receipts' | 'returns' | 'suppliers';

/** Phân hệ Mua hàng: đề nghị nhập (sơ đồ A1), phiếu nhận (A2), phiếu trả NCC (B4), nhà cung cấp */
export function PurchasingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs: { value: PurchasingTab; label: string }[] = [
    { value: 'requests', label: 'Đề nghị nhập' },
    { value: 'receipts', label: 'Phiếu nhận' },
    { value: 'returns', label: 'Trả NCC' },
    { value: 'suppliers', label: 'Nhà cung cấp' },
  ];
  const requested = searchParams.get('tab');
  const tab = tabs.find((t) => t.value === requested)?.value ?? 'requests';

  return (
    <div>
      <PageHeader
        title="Mua hàng"
        subtitle="Đề nghị nhập theo nhà cung cấp, phiếu nhận khi hàng tới, trả hàng lỗi cho nhà cung cấp."
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === 'requests' ? {} : { tab: value }, { replace: true })}
      >
        <TabsList className="mb-2">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="requests">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="receipts">
          <ReceiptsTab />
        </TabsContent>
        <TabsContent value="returns">
          <ReturnsTab />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
