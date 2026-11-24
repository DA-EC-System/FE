import type { CannotCreateReason, Shop, ShopSetupProgress } from '@/types/shop';

/** §18.7.7: đọc lại mỗi 3 giây khi còn bước đang chạy, tối đa 30 phút */
export const SETUP_POLL_MS = 3000;
export const SETUP_POLL_MAX_MS = 30 * 60 * 1000;

/** Câu dưới dòng không tạo được SKU kho (§18.7.5); sku_taken thì đã có gợi ý khớp SKU nên không ghi gì */
export const CANNOT_CREATE_TEXT: Record<CannotCreateReason, string | null> = {
  no_seller_sku: 'Sàn chưa có SKU người bán. Đặt SKU trên sàn rồi bấm Tải lại để tạo hoặc liên kết.',
  sku_too_long: 'SKU người bán dài quá 50 ký tự nên không tạo được SKU kho. Sửa SKU trên sàn, hoặc chọn SKU kho có sẵn.',
  sku_taken: null,
  no_permission: null,
  // Dòng đã liên kết hoặc đang chờ duyệt (§18.9 R2): cột trạng thái đã nói, không ghi thêm
  already_matched: null,
};

/** Còn bước nào đang chạy thì còn đọc lại */
export function setupRunning(shop: Shop | undefined): boolean {
  return Boolean(shop?.setup?.steps.some((s) => s.status === 'running'));
}

/** Bước 1 khi BE bỏ ghép theo tên vì gian hàng quá nhiều SKU (nameMatchSkipped, §18.7.5) */
export const NAME_MATCH_SKIPPED_NOTE =
  'Gian hàng có quá nhiều SKU nên Commerio chỉ gợi ý khi khớp SKU, không gợi ý theo tên. Hãy chọn SKU kho cho các dòng còn lại.';

/**
 * Câu cạnh bước open_orders khi môi trường đặt trần OPEN_ORDER_PULL_MAX và có đơn còn mở cũ không kéo về
 * (Shop.setup.openOrdersSkipped, §18.6.2). BE không trả số đơn đã kéo nên chỉ nêu phần bỏ qua; 0 hoặc vắng thì null
 */
export function openOrdersSkippedNote(setup: ShopSetupProgress | null | undefined): string | null {
  const skipped = setup?.openOrdersSkipped;
  if (!skipped || skipped <= 0) return null;
  return `Bỏ qua ${skipped} đơn đang xử lý cũ hơn; hàng của các đơn này chưa được tạm giữ`;
}
