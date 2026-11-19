import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { fulfillmentKeys } from '@/api/fulfillment.api';
import { salesKeys } from '@/api/sales.api';
import { useMatchListing, useRemoteSkus, useShopListings } from '@/api/shops.api';
import { MatchDialog } from '@/features/channel/MatchDialog';
import { UNMANAGED, variantMatchOptions } from '@/features/channel/matchOptions';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import type { Order, OrderLine } from '@/types/sales';
import { PERMISSIONS } from '@/utils/permissions';
import { isUnmappedLine, lineMatchToast, pendingTargetLabel, remoteSkuOf } from './lineMatch';

/**
 * Ghép SKU từ dòng đơn (FE#283, commerio-backend#237): dòng Chưa ghép SKU có nút "Ghép SKU" cho người có
 * `channel.listing.match`. Không có route riêng: gọi `listings/match` của gian hàng; ghép có hiệu lực (200) thì BE áp lên
 * mọi đơn đã nhận của SKU đó trong gian hàng, nên tải lại đơn và kiện. "Không quản tồn", hay đổi ghép đã có đơn, cần CEO
 * duyệt (202): đơn giữ cờ, dòng hiện "Chờ CEO duyệt"; CEO làm thì áp ngay, ghi là tự duyệt.
 */
export function useOrderLineMatch(order: Order | undefined) {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const qc = useQueryClient();
  const shopId = order?.shop?.id ?? '';
  const canMatch = can(PERMISSIONS.listingMatch) && Boolean(shopId);
  const active = canMatch && Boolean(order?.lines.some(isUnmappedLine));
  const selfApprove = Boolean(companyContext?.canSelfApprove);

  // Chỉ tải khi đơn có dòng chưa ghép: SKU sàn cho `sku_id` và ghép chờ, listing cho danh sách biến thể
  const remoteQuery = useRemoteSkus(shopId, active);
  const listingsQuery = useShopListings(active ? shopId : '');
  const items = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const remoteItems = remoteQuery.data?.items;

  const [line, setLine] = useState<OrderLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matchMut = useMatchListing();

  const options = useMemo(
    () => (line ? variantMatchOptions(items, { sellerSku: line.externalSku, isCeo: selfApprove }) : []),
    [line, items, selfApprove],
  );

  const remoteOf = (l: OrderLine) => remoteSkuOf(remoteItems, l);
  /** Mã SKU sàn gửi BE: theo danh sách SKU sàn, thiếu thì `sku_id` của dòng */
  const externalSkuIdOf = (l: OrderLine) => remoteOf(l)?.externalSkuId ?? l.externalSkuId ?? null;
  const pendingOf = (l: OrderLine) => remoteOf(l)?.pendingMapping ?? null;
  const pendingTarget = (l: OrderLine) => {
    const p = pendingOf(l);
    return p ? pendingTargetLabel(p, (id) => items.find((r) => r.variantId === id)?.sku) : '';
  };

  const reload = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: salesKeys.all(companyId) }),
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all(companyId) }),
    ]);

  const save = async (id: string) => {
    if (!line) return;
    const externalSkuId = externalSkuIdOf(line);
    if (!externalSkuId) return;
    const variantId = id === UNMANAGED ? null : id;
    const label = line.externalSku ?? externalSkuId;
    try {
      const { pending } = await matchMut.mutateAsync({ shopId, externalSkuId, variantId });
      setLine(null);
      const variantSku = variantId ? (items.find((r) => r.variantId === variantId)?.sku ?? variantId) : null;
      const text = lineMatchToast(label, variantSku, pending);
      if (pending) toast.info(text);
      else toast.success(text);
      void reload();
    } catch (e) {
      const problem = getProblem(e);
      setError(problem?.errors?.variantId ?? problem?.errors?.externalSkuId ?? problemMessage(e));
      // Ghép vừa đổi ở nơi khác (đang chờ duyệt, biến thể đã ghép SKU khác): nạp lại để chọn lại
      void Promise.all([remoteQuery.refetch(), listingsQuery.refetch(), reload()]);
    }
  };

  const open = (l: OrderLine) => {
    setError(null);
    setLine(l);
  };

  const dialog = (
    <MatchDialog
      open={Boolean(line)}
      title="Ghép SKU sàn"
      description={
        line ? (
          <>
            SKU sàn <strong>{line.externalSku}</strong> · {line.productName}. Chọn biến thể trong app, hoặc không quản tồn.
            Ghép lưu vào bảng ghép của {order?.shop?.shopName ?? 'gian hàng'}: đơn đã nhận và đơn về sau của SKU này tự nhận
            ghép.
          </>
        ) : null
      }
      searchLabel="Tìm biến thể theo tên hoặc SKU..."
      options={options}
      empty={listingsQuery.isLoading ? 'Đang tải biến thể...' : 'Không còn biến thể chưa ghép'}
      saving={matchMut.isPending}
      error={error}
      onSave={(id) => void save(id)}
      onClose={() => setLine(null)}
    />
  );

  return {
    /** Dòng này hiện nút "Ghép SKU" */
    canMatchLine: (l: OrderLine) => canMatch && isUnmappedLine(l) && !pendingOf(l),
    /** Chưa có mã SKU sàn để gửi (danh sách SKU sàn chưa tải được, dòng không có `sku_id`) */
    missingSkuId: (l: OrderLine) => !externalSkuIdOf(l),
    pendingOf,
    pendingTarget,
    open,
    dialog,
  };
}
