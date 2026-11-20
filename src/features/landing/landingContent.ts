/**
 * Nội dung trang giới thiệu (FE#401, Documents/27 US-CT-14, phương án A: luồng 7 bước làm trục).
 * Chỉ nhắc chức năng đã có route BE trên main (đối chiếu 20/11/2026); nguồn ghi ở comment từng mục.
 * Không nhắc: cổng thanh toán, trợ lý AI, dự báo dòng tiền (BE#233), MISA (BE#232), nhiều kho (US-CT-14 tiêu chí 5).
 * Chức năng ra hay vào MVP thì sửa file này trong cùng PR đổi chức năng đó.
 */

export interface LandingStep {
  title: string;
  text: string;
  who: string;
}

/** Bảy bước theo Documents/24 mục 1, người làm theo mục 6.6 */
export const LANDING_STEPS: LandingStep[] = [
  // purchasing /requests, /requests/:id/:action (25 mục 3)
  { title: 'Đề nghị nhập', text: 'Kho lập đề nghị, CEO duyệt rồi mới đặt hàng.', who: 'Kho lập · CEO duyệt' },
  // /goods-receipts, /supplier-returns (25 mục 4.1, 4.3)
  { title: 'Nhận hàng', text: 'Phiếu nhận ghi số đạt, số lỗi; hàng lỗi trả lại nhà cung cấp.', who: 'Kho' },
  // catalog /products, /products/:id/variants, /variants/bulk (25 mục 5)
  { title: 'Hoàn thiện sản phẩm', text: 'Biến thể, SKU, ảnh, thuộc tính theo danh mục sàn.', who: 'Admin' },
  // channel /shops/:platform/token, /shops/:id/setup, /listings/push, /listings/match, /listings/pending-prices (25 mục 6)
  { title: 'Lên sàn', text: 'Kết nối gian hàng, ghép SKU, đẩy listing, kiểm giá trước khi đăng.', who: 'Admin' },
  // /shops/:id/orders/pull, sales /orders (25 mục 8.1, 7.4)
  { title: 'Nhận đơn', text: 'Đơn từ Lazada, TikTok Shop về một danh sách, tự giữ tồn.', who: 'Hệ thống' },
  // fulfillment /pick-list, /packages/documents, /packages/:id/ready, /packages/hand-over (25 mục 8.3)
  { title: 'Đóng gói, giao', text: 'Danh sách lấy hàng, in chứng từ, sẵn sàng giao, bàn giao vận chuyển.', who: 'Kho' },
  // returns /receive; finance /settlements, /orders/profits (25 mục 9, 10.2, 10.3)
  { title: 'Trả hàng, tiền', text: 'Nhận hàng hoàn, đối soát tiền sàn trả, xem lãi từng đơn.', who: 'Kho, CEO' },
];

export type LandingFeatureIcon = 'warehouse' | 'store' | 'package' | 'money';

export interface LandingFeature {
  icon: LandingFeatureIcon;
  title: string;
  text: string;
}

export const LANDING_FEATURES: LandingFeature[] = [
  // inventory /stock, /documents, /documents/:id/decide (25 mục 7.1, 7.3)
  {
    icon: 'warehouse',
    title: 'Kho',
    text: 'Tồn theo từng SKU, phiếu kiểm kê, xuất huỷ, chuyển chờ xử lý, phiếu nào cũng cần người duyệt.',
  },
  // channel /shops, /remote-skus, /listings/match, /listings/sync (25 mục 6)
  { icon: 'store', title: 'Gian hàng', text: 'Kết nối gian hàng, ghép SKU sàn với biến thể, đẩy và đồng bộ listing.' },
  // fulfillment /packages/:id/split, /report-lost, /packages/documents (25 mục 8)
  { icon: 'package', title: 'Đơn và kiện', text: 'Đơn hai sàn một chỗ, tách kiện, đóng gói, in chứng từ, báo mất hàng.' },
  // finance /ledger, /orders/profits, /skus/profits, /settlements, /configs (25 mục 10.1–10.4)
  {
    icon: 'money',
    title: 'Tiền',
    text: 'Sổ thu chi, lãi theo đơn và theo SKU, đối soát quyết toán sàn, cấu hình phí và thuế có phiên bản.',
  },
];

export interface LandingRule {
  title: string;
  text: string;
}

/** Nguyên tắc ở 25 mục 0, 11; route inventory /documents/:id/decide, report /self-approvals, audit (US-CT-10) */
export const LANDING_RULES: LandingRule[] = [
  {
    title: 'Người duyệt khác người lập.',
    text: 'Đề nghị nhập, phiếu kho, ghép SKU cần người thứ hai bấm duyệt.',
  },
  {
    title: 'Tồn đi theo thẻ kho.',
    text: 'Nhận hàng, giữ cho đơn, xuất cho kiện, nhận hàng hoàn đều để lại dấu vết.',
  },
  { title: 'Nhật ký thao tác.', text: 'Ai đổi gì, lúc nào, trước và sau, CEO và Admin xem lại được.' },
];
