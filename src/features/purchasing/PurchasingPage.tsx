import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequestsTab } from './RequestsTab';
import { ReceiptsTab } from './ReceiptsTab';
import { ReturnsTab } from './ReturnsTab';
import { SuppliersTab } from './SuppliersTab';
import { usePageGuide } from '@/guides/usePageGuide';

type PurchasingTab = 'requests' | 'receipts' | 'returns' | 'suppliers';

/** Trang Nhập hàng: đơn đặt hàng nhập (sơ đồ A1), phiếu nhận (A2), phiếu trả nhà cung cấp (B4), nhà cung cấp */
export function PurchasingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { startTour } = usePageGuide('purchasing');
  const tabs: { value: PurchasingTab; label: string }[] = [
    { value: 'requests', label: 'Đặt hàng nhập' },
    { value: 'receipts', label: 'Phiếu nhập kho' },
    { value: 'returns', label: 'Trả hàng NCC' },
    { value: 'suppliers', label: 'Nhà cung cấp' },
  ];
  const requested = searchParams.get('tab');
  const tab = tabs.find((t) => t.value === requested)?.value ?? 'requests';

  return (
    <div>
      <PageHeader
        title="Nhập hàng"
        subtitle="Đặt hàng nhập, nhập kho và trả hàng cho nhà cung cấp."
        help="Đề nghị nhập hàng phải được duyệt rồi mới gửi NCC. Hàng về thì Kho tạo phiếu nhập kho từ đề nghị, kiểm đếm rồi bấm Nhập kho. Hàng lỗi thì tạo phiếu trả hàng NCC; NCC đổi hàng thì tạo đề nghị nhập hàng đổi."
        onTour={startTour}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === 'requests' ? {} : { tab: value }, { replace: true })}
      >
        <TabsList className="mb-2" data-guide="purchasing-tabs">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              data-guide={t.value === 'suppliers' ? 'purchasing-suppliers' : undefined}
            >
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
