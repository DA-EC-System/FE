import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { connectRealtime, type RealtimeMessage } from '@/api/realtime';
import { fulfillmentKeys } from '@/api/fulfillment.api';
import { useAuthStore } from '@/stores/authStore';
import { useRealtimeStore } from '@/stores/realtimeStore';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';

/**
 * Loại sự kiện (theo tiền tố) → nhóm query cần làm mới, khoá dạng ['company', id, nhóm].
 * Bộ sự kiện theo Documents/21 §13.2 (mô hình mới, commerio-backend#216) và §11.2 (kiện giao thất bại, thất lạc).
 * Đơn đổi chạm tới kiện, việc cần làm và ngược lại, nên làm mới cả cụm.
 */
const GROUPS: [prefix: string, groups: string[]][] = [
  // sales.order_created, sales.order_status_changed
  ['sales.order_', ['sales', 'fulfillment', 'tasks']],
  // fulfillment.package_status_changed, package_delivery_failed, package_lost
  ['fulfillment.', ['fulfillment', 'sales', 'tasks']],
  // sales.return_status_changed: danh sách, chi tiết yêu cầu trả và việc chờ duyệt trả
  ['sales.return_', ['returns', 'sales', 'tasks']],
  // channel.shop_status_changed: gian hàng cần kết nối lại cũng là việc cần làm
  ['channel.shop_', ['shops', 'tasks']],
  ['channel.listing_', ['shops']],
  ['inventory.', ['inventory', 'tasks']],
  ['purchasing.', ['purchasing', 'tasks']],
];

/** Mọi nhóm ở trên: nối lại sau khi mất kết nối thì làm mới một lần (T14) */
const ALL_GROUPS = [...new Set(GROUPS.flatMap(([, groups]) => groups))];

export function groupsOf(type: string): string[] {
  return GROUPS.find(([prefix]) => type.startsWith(prefix))?.[1] ?? [];
}

function invalidate(qc: QueryClient, companyId: string, groups: string[]) {
  for (const group of groups) void qc.invalidateQueries({ queryKey: ['company', companyId, group] });
}

export interface PackageNotice {
  text: string;
  packageId: string | null;
  orderId: string | null;
}

/**
 * Câu thông báo cho kiện giao thất bại, thất lạc (Documents/21 §11.2). Payload chỉ có id: mã kiện lấy từ cache
 * nếu đã mở kiện đó, không thì nói "Một kiện".
 */
export function packageNotice(message: RealtimeMessage, codeOf: (packageId: string) => string | undefined): PackageNotice | null {
  const { packageId, orderId, reason, claimCode } = message.payload as {
    packageId?: string;
    orderId?: string;
    reason?: string | null;
    claimCode?: string | null;
  };
  const code = packageId ? codeOf(packageId) : undefined;
  const label = code ? `Kiện ${code}` : 'Một kiện';
  const ids = { packageId: packageId ?? null, orderId: orderId ?? null };
  if (message.type === 'fulfillment.package_delivery_failed') {
    return { ...ids, text: `${label} giao không thành công: ${reason?.trim() || 'Sàn báo giao không thành công'}` };
  }
  if (message.type === 'fulfillment.package_lost') {
    return { ...ids, text: `${label} thất lạc${claimCode ? `, mã khiếu nại ${claimCode}` : ''}` };
  }
  return null;
}

/**
 * Nghe kênh realtime của công ty đang làm việc; gắn một lần ở CompanyLayout.
 * Đổi công ty hoặc đăng xuất thì đóng stream cũ.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const signedIn = useAuthStore((s) => Boolean(s.account));
  const setStatus = useRealtimeStore((s) => s.setStatus);

  useEffect(() => {
    if (!companyId || !signedIn) return;
    const base = `/c/${companyId}`;
    const onMessage = (message: RealtimeMessage) => {
      invalidate(qc, companyId, groupsOf(message.type));
      if (message.type === 'sales.order_created') {
        const { orderId, code } = message.payload as { orderId?: string; code?: string };
        toast.info(`Có đơn mới ${code ?? ''}`.trim(), {
          action: orderId ? { label: 'Xem', onClick: () => navigate(`${base}/sales/orders/${orderId}`) } : undefined,
        });
        return;
      }
      const notice = packageNotice(message, (id) =>
        qc.getQueryData<{ code?: string }>(fulfillmentKeys.package(companyId, id))?.code,
      );
      if (!notice) return;
      // Người xử lý kiện mở trang kiện; người chỉ xem đơn (Sale) mở đơn
      const canProcess = hasPermission(useAuthStore.getState().companyContext, PERMISSIONS.fulfillmentProcess);
      const to =
        canProcess && notice.packageId
          ? `${base}/fulfillment/packages/${notice.packageId}`
          : notice.orderId
            ? `${base}/sales/orders/${notice.orderId}`
            : null;
      toast.warning(notice.text, { action: to ? { label: 'Xem', onClick: () => navigate(to) } : undefined });
    };
    return connectRealtime({
      onMessage,
      onStatus: setStatus,
      onReconnect: () => invalidate(qc, companyId, ALL_GROUPS),
    });
  }, [companyId, signedIn, qc, navigate, setStatus]);
}
