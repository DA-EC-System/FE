import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Snackbar, Tab, Tabs } from '@mui/material';
import { PageHeader } from '@/components/common/PageHeader';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { StockTab } from './StockTab';
import { DocumentsTab } from './DocumentsTab';
import { ReturnsTab } from './ReturnsTab';
import type { Toast } from './shared';

export type InventoryTab = 'stock' | 'documents' | 'returns';

/** Phân hệ Kho: tồn theo biến thể (UC-IN-01, UC-IN-02), phiếu nhập/xuất, nhập hoàn (UC-IN-03) */
export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = useCan()(PERMISSIONS.stockDocManage);
  const tabs: { value: InventoryTab; label: string }[] = [
    { value: 'stock', label: 'Tồn kho' },
    { value: 'documents', label: 'Phiếu nhập/xuất' },
    ...(canManage ? [{ value: 'returns' as const, label: 'Nhập hoàn' }] : []),
  ];
  const requested = searchParams.get('tab');
  const tab = tabs.find((t) => t.value === requested)?.value ?? 'stock';
  const [toast, setToast] = useState<Toast | null>(null);

  return (
    <Box>
      <PageHeader title="Kho hàng" subtitle="Tồn thực có, đang giữ cho đơn và khả dụng của từng biến thể." />
      <Tabs
        value={tab}
        onChange={(_, value: InventoryTab) => setSearchParams(value === 'stock' ? {} : { tab: value }, { replace: true })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {tab === 'stock' && <StockTab onToast={setToast} />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'returns' && <ReturnsTab onToast={setToast} />}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
