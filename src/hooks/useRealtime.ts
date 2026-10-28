import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { connectRealtime, type RealtimeMessage } from '@/api/realtime';
import { useAuthStore } from '@/stores/authStore';
import { useRealtimeStore } from '@/stores/realtimeStore';

/**
 * Loại sự kiện (theo tiền tố) → nhóm query cần làm mới, khoá dạng ['company', id, nhóm].
 * Đơn đổi chạm tới kiện, việc cần làm và ngược lại, nên làm mới cả cụm.
 */
const GROUPS: [prefix: string, groups: string[]][] = [
  ['sales.order_', ['sales', 'fulfillment', 'tasks']],
  ['fulfillment.', ['fulfillment', 'sales', 'tasks']],
  ['payment.', ['payment', 'sales', 'finance']],
  ['sales.return_', ['returns', 'sales']],
  ['channel.', ['shops']],
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
    const onMessage = (message: RealtimeMessage) => {
      invalidate(qc, companyId, groupsOf(message.type));
      if (message.type === 'sales.order_created') {
        const { orderId, code } = message.payload as { orderId?: string; code?: string };
        toast.info(`Có đơn mới ${code ?? ''}`.trim(), {
          action: orderId
            ? { label: 'Xem', onClick: () => navigate(`/c/${companyId}/sales/orders/${orderId}`) }
            : undefined,
        });
      }
    };
    return connectRealtime({
      onMessage,
      onStatus: setStatus,
      onReconnect: () => invalidate(qc, companyId, ALL_GROUPS),
    });
  }, [companyId, signedIn, qc, navigate, setStatus]);
}
