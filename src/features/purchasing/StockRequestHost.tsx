import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useStockDetail } from '@/api/inventory.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useStockAlertStore } from '@/stores/stockAlertStore';
import { ROUTES } from '@/router/routes';
import type { StockLevel } from '@/types/inventory';
import { AddToRequestDialog } from './AddToRequestDialog';

/**
 * Hộp "Thêm vào đề nghị nhập" mở từ toast hay chuông khi SKU chạm ngưỡng (FE#318), ở trang nào cũng mở được:
 * tải tồn của SKU rồi điền sẵn số gợi ý như nút trên trang Tồn kho.
 */
export function StockRequestHost() {
  const variantId = useStockAlertStore((s) => s.requestVariantId);
  const close = useStockAlertStore((s) => s.closeRequest);
  const detail = useStockDetail(variantId);
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  // Chụp tồn lúc mở hộp: sự kiện kho làm mới chi tiết SKU không được xoá số người dùng đang nhập
  const [snapshot, setSnapshot] = useState<{ variantId: string; level: StockLevel } | null>(null);
  const level = detail.data?.level;
  if (!variantId && snapshot) setSnapshot(null);
  if (variantId && level && snapshot?.variantId !== variantId) setSnapshot({ variantId, level });
  const failed = Boolean(variantId) && detail.isError && !detail.data;
  useEffect(() => {
    if (!failed) return;
    toast.error(`Chưa mở được SKU: ${problemMessage(detail.error)}`);
    close();
  }, [failed, detail.error, close]);
  return (
    <AddToRequestDialog
      level={variantId && snapshot?.variantId === variantId ? snapshot.level : null}
      onClose={close}
      onDone={(request) => {
        close();
        toast.success(`Đã thêm vào ${request.number}`, {
          action: {
            label: 'Mở',
            onClick: () => navigate(ROUTES.company.purchaseRequest(companyContext?.companyId ?? '', request.id)),
          },
        });
      }}
    />
  );
}
