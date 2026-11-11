import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequestsTab } from './RequestsTab';
import { ReceiptsTab } from './ReceiptsTab';
import { ReturnsTab } from './ReturnsTab';
import { SuppliersTab } from './SuppliersTab';
import { usePageGuide } from '@/guides/usePageGuide';

type PurchasingTab = 'requests' | 'receipts' | 'returns' | 'suppliers';

/** Phân hệ Mua hàng: đề nghị nhập (sơ đồ A1), phiếu nhận (A2), phiếu trả NCC (B4), nhà cung cấp */
export function PurchasingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { startTour } = usePageGuide('purchasing');
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
        subtitle="Đề nghị nhập, phiếu nhận và trả hàng cho nhà cung cấp."
        help="Đề nghị nhập được duyệt rồi đặt NCC. Hàng tới thì Kho lập phiếu nhận từ đề nghị và ghi sổ. Hàng lỗi trả lại NCC bằng phiếu trả; NCC bù hàng thì lập đề nghị bù."
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
