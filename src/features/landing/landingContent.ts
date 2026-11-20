/**
 * Nội dung trang giới thiệu (FE#401, Documents/27 US-CT-14). Bố cục theo bản Thành duyệt 27/10/2026
 * (Test_UI `site/onboarding.html`, nhánh feature/vong-doi-ui-that); nội dung theo phương án A: luồng 7 bước.
 * Chỉ nhắc chức năng đã có route BE trên main (đối chiếu 20/11/2026); nguồn ghi ở comment từng mục.
 * Không nhắc: cổng thanh toán, trợ lý AI, dự báo dòng tiền (BE#233), MISA (BE#232), nhiều kho (US-CT-14 tiêu chí 5).
 * Chức năng ra hay vào MVP thì sửa file này trong cùng PR đổi chức năng đó.
 */

export type LandingTint = 'primary' | 'success' | 'warning' | 'purple' | 'destructive';

export interface LandingStep {
  title: string;
  text: string;
  who: string;
}

/** Bảy bước theo Documents/24 mục 1, người làm theo mục 6.6 */
export const LANDING_STEPS: LandingStep[] = [
  // purchasing /requests, /requests/:id/:action (25 mục 3)
  {
    title: 'Đề nghị nhập',
    text: 'Kho lập đề nghị, CEO duyệt rồi mới đặt hàng.',
    who: 'Kho lập, CEO duyệt',
  },
  // /goods-receipts, /supplier-returns (25 mục 4.1, 4.3)
  {
    title: 'Nhận hàng',
    text: 'Phiếu nhận ghi số đạt, số lỗi. Hàng lỗi trả lại nhà cung cấp.',
    who: 'Kho',
  },
  // catalog /products, /products/:id/variants, /variants/bulk (25 mục 5)
  {
    title: 'Hoàn thiện sản phẩm',
    text: 'Biến thể, SKU, ảnh, thuộc tính theo danh mục sàn.',
    who: 'Admin',
  },
  // channel /shops/:platform/token, /listings/push, /listings/match, /listings/pending-prices (25 mục 6)
  {
    title: 'Lên sàn',
    text: 'Kết nối gian hàng, ghép SKU, đẩy listing, kiểm giá trước khi đăng.',
    who: 'Admin',
  },
  // /shops/:id/orders/pull, sales /orders (25 mục 8.1, 7.4)
  {
    title: 'Nhận đơn',
    text: 'Đơn từ Lazada và TikTok Shop về một danh sách, tự giữ tồn.',
    who: 'Tự động',
  },
  // fulfillment /pick-list, /packages/documents, /packages/:id/ready, /packages/hand-over (25 mục 8.3)
  {
    title: 'Đóng gói, bàn giao',
    text: 'Danh sách lấy hàng, in chứng từ, bàn giao đơn vị vận chuyển.',
    who: 'Kho',
  },
  // returns /receive; finance /settlements, /orders/profits (25 mục 9, 10.2, 10.3)
  {
    title: 'Hàng hoàn và tiền',
    text: 'Nhận hàng hoàn, đối soát tiền sàn trả, xem lãi từng đơn.',
    who: 'Kho, CEO',
  },
];

export type LandingFeatureIcon = 'variants' | 'warehouse' | 'store' | 'package' | 'money' | 'shield';

export interface LandingFeature {
  icon: LandingFeatureIcon;
  tint: LandingTint;
  title: string;
  text: string;
}

export const LANDING_FEATURES: LandingFeature[] = [
  // catalog /products/:id/variants, /variants/bulk (25 mục 5)
  {
    icon: 'variants',
    tint: 'primary',
    title: 'Sản phẩm có biến thể',
    text: 'Một sản phẩm nhiều màu, nhiều size. Mỗi biến thể một SKU, có ảnh và thuộc tính theo danh mục sàn.',
  },
  // inventory /stock, /documents, /documents/:id/decide (25 mục 7.1, 7.3)
  {
    icon: 'warehouse',
    tint: 'warning',
    title: 'Kho đi theo phiếu',
    text: 'Tồn theo từng SKU. Kiểm kê, xuất huỷ, chuyển hàng chờ xử lý đều lập phiếu và cần người duyệt.',
  },
  // channel /shops, /remote-skus, /listings/match, /listings/pending-prices (25 mục 6)
  {
    icon: 'store',
    tint: 'purple',
    title: 'Gian hàng Lazada, TikTok Shop',
    text: 'Ghép SKU sàn với biến thể, đẩy listing, duyệt giá mới trước khi đăng. Tồn đổi thì cập nhật lên sàn.',
  },
  // fulfillment /packages/:id/split, /report-lost, /packages/documents (25 mục 8)
  {
    icon: 'package',
    tint: 'success',
    title: 'Đơn và kiện một chỗ',
    text: 'Đơn hai sàn chung một danh sách. Tách kiện, đóng gói, in chứng từ, báo mất hàng.',
  },
  // finance /ledger, /orders/profits, /skus/profits, /settlements, /configs (25 mục 10.1 đến 10.4)
  {
    icon: 'money',
    tint: 'primary',
    title: 'Tiền và lãi theo đơn',
    text: 'Sổ thu chi, lãi theo đơn và theo SKU, đối soát quyết toán sàn. Phí và thuế cấu hình theo phiên bản.',
  },
  // access /roles, audit (US-CT-10); 25 mục 0 nguyên tắc người thứ hai
  {
    icon: 'shield',
    tint: 'destructive',
    title: 'Người duyệt khác người lập',
    text: 'Tồn chỉ đổi qua phiếu. Việc quan trọng cần người thứ hai duyệt, mọi thao tác ghi nhật ký.',
  },
];

export type LandingRoleIcon = 'ceo' | 'admin' | 'sale' | 'warehouse';

export interface LandingRole {
  icon: LandingRoleIcon;
  tint: LandingTint;
  title: string;
  text: string;
}

/** Bốn vai trò có sẵn: BE src/modules/core/access/domain/catalog.ts BUILTIN_ROLES */
export const LANDING_ROLES: LandingRole[] = [
  {
    icon: 'ceo',
    tint: 'purple',
    title: 'CEO',
    text: 'Toàn quyền, duyệt đề nghị nhập, xem tiền và lãi.',
  },
  {
    icon: 'admin',
    tint: 'primary',
    title: 'Admin',
    text: 'Sản phẩm, giá, gian hàng, tài khoản nhân viên.',
  },
  {
    icon: 'sale',
    tint: 'success',
    title: 'Sale',
    text: 'Theo dõi đơn, xử lý trả hàng, ghép SKU sàn.',
  },
  {
    icon: 'warehouse',
    tint: 'warning',
    title: 'Nhân viên kho',
    text: 'Đề nghị nhập, phiếu nhận, phiếu kho, đóng gói.',
  },
];
