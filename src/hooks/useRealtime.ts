import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { connectRealtime, type RealtimeMessage } from '@/api/realtime';
import { fulfillmentKeys } from '@/api/fulfillment.api';
import { stockDetailQuery } from '@/api/inventory.api';
import { useAuthStore } from '@/stores/authStore';
import { useRealtimeStore } from '@/stores/realtimeStore';
import { useStockAlertStore } from '@/stores/stockAlertStore';
import type { CompanyContext } from '@/types/auth';
import { hasPermission, isModuleEnabled, PERMISSIONS } from '@/utils/permissions';
import { formatQty } from '@/features/inventory/shared';

/**
 * Loại sự kiện (theo tiền tố) → nhóm query cần làm mới, khoá dạng ['company', id, nhóm].
 * Bộ sự kiện theo Documents/21 §13.2 (mô hình mới, commerio-backend#216) và §11.2 (kiện giao thất bại, thất lạc).
 * Đơn đổi chạm tới kiện, việc cần làm và ngược lại, nên làm mới cả cụm.
 */
const GROUPS: [prefix: string, groups: string[]][] = [
  // sales.order_created, sales.order_status_changed
  ['sales.order_', ['sales', 'fulfillment', 'tasks', 'onboarding']],
  // fulfillment.package_status_changed, package_delivery_failed, package_lost
  ['fulfillment.', ['fulfillment', 'sales', 'tasks', 'onboarding']],
  // sales.return_status_changed: danh sách, chi tiết yêu cầu trả và việc chờ duyệt trả
  ['sales.return_', ['returns', 'sales', 'tasks', 'onboarding']],
  // channel.shop_status_changed: gian hàng cần kết nối lại cũng là việc cần làm
  ['channel.shop_', ['shops', 'tasks', 'onboarding']],
  ['channel.listing_', ['shops']],
  ['inventory.', ['inventory', 'tasks', 'onboarding']],
  ['purchasing.', ['purchasing', 'tasks', 'onboarding']],
];

/** Mọi nhóm ở trên: nối lại sau khi mất kết nối thì làm mới một lần (T14) */
const ALL_GROUPS = [...new Set(GROUPS.flatMap(([, groups]) => groups))];

/**
 * Trang thật sự tự đổi theo sự kiện BE đang phát qua SSE (core/notification rules: đơn mới, đơn đổi trạng thái, thanh
 * toán, tồn dưới ngưỡng, ghi sổ phiếu nhận, gửi đề nghị nhập): Tổng quan (việc cần làm), danh sách và chi tiết đơn,
 * tab Tồn kho, tab Đề nghị nhập và chi tiết đề nghị. Trang tạo mới không có gì để tự đổi. Trang khác (kiện, phiếu kho,
 * trả hàng…) chưa có sự kiện tới khi commerio-backend#216 xong (FE#318).
 * `tab`: tab mặc định của trang (không có ?tab) mới là tab tự đổi.
 */
const LIVE_PATHS: { re: RegExp; tab?: string }[] = [
  { re: /^\/c\/[^/]+\/?$/ },
  { re: /^\/c\/[^/]+\/sales\/orders(\/(?!new\/?$)[^/]+)?\/?$/ },
  { re: /^\/c\/[^/]+\/inventory\/?$/, tab: 'stock' },
  { re: /^\/c\/[^/]+\/purchasing\/?$/, tab: 'requests' },
  { re: /^\/c\/[^/]+\/purchasing\/requests\/(?!new\/?$)[^/]+\/?$/ },
];

export const isLivePath = (pathname: string, search = '') => {
  const tab = new URLSearchParams(search).get('tab');
  return LIVE_PATHS.some((p) => p.re.test(pathname) && (!p.tab || !tab || tab === p.tab));
};

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

/** Câu báo SKU chạm ngưỡng (FE#318): "GD-0007 còn 30, đã chạm ngưỡng 30"; chưa biết mã SKU thì "Một SKU" */
export function belowThresholdText(sku: string | undefined, available: number, minQty: number): string {
  return `${sku ?? 'Một SKU'} còn ${formatQty(available)}, đã chạm ngưỡng ${formatQty(minQty)}`;
}

/** Thêm được vào đề nghị nhập: bật Mua hàng và có quyền lập đề nghị, như nút trên trang Tồn kho */
export const canAddToRequest = (ctx: CompanyContext | null) =>
  isModuleEnabled(ctx, 'purchasing') && hasPermission(ctx, PERMISSIONS.purchaseRequestManage);

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
    // Đổi công ty, đăng xuất: bỏ thông báo tồn và đóng hộp của công ty cũ
    useStockAlertStore.getState().reset(signedIn ? companyId || null : null);
    if (!companyId || !signedIn) return;
    const base = `/c/${companyId}`;
    // Đổi công ty trong lúc đang lấy mã SKU thì bỏ thông báo của công ty cũ
    let active = true;
    /**
     * Payload chỉ có `variantId`: lấy mã SKU qua chi tiết tồn (có sẵn trong cache thì dùng luôn). Báo một lần bằng toast
     * và ghi vào chuông; nút mở hộp thêm vào đề nghị nhập, không có quyền thì mở trang Tồn kho.
     */
    const notifyBelowThreshold = async (message: RealtimeMessage) => {
      const { variantId, available, minQty } = message.payload as { variantId: string; available: number; minQty: number };
      const sku = await qc
        .fetchQuery({ ...stockDetailQuery(companyId, variantId), staleTime: 30_000 })
        .then((d) => d.level.sku)
        .catch(() => undefined);
      if (!active) return;
      const text = belowThresholdText(sku, available, minQty);
      const alerts = useStockAlertStore.getState();
      alerts.push(companyId, { id: message.eventId, variantId, text, at: message.occurredAt });
      const action = canAddToRequest(useAuthStore.getState().companyContext)
        ? { label: 'Thêm vào đề nghị nhập', onClick: () => alerts.openRequest(variantId) }
        : { label: 'Xem tồn', onClick: () => navigate(`${base}/inventory`) };
      toast.warning(text, { action, duration: 10_000 });
    };
    const onMessage = (message: RealtimeMessage) => {
      invalidate(qc, companyId, groupsOf(message.type));
      if (message.type === 'inventory.below_threshold') {
        void notifyBelowThreshold(message);
        return;
      }
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
    const disconnect = connectRealtime({
      onMessage,
      onStatus: setStatus,
      onReconnect: () => invalidate(qc, companyId, ALL_GROUPS),
    });
    return () => {
      active = false;
      disconnect();
    };
  }, [companyId, signedIn, qc, navigate, setStatus]);
}
