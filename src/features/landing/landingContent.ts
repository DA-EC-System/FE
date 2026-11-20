/**
 * Nội dung trang giới thiệu (FE#401, Documents/27 US-CT-14). Bản v3 (20/11/2026): phong cách tham khảo odoo.com
 * (hero căn giữa, lưới phân hệ, khối chữ và ảnh xen kẽ), không dùng chữ, ảnh, icon, màu của Odoo.
 * Nội dung theo phương án A: luồng 7 bước. Chỉ nhắc chức năng đã có route BE trên main (đối chiếu 20/11/2026),
 * nguồn ghi ở comment từng mục. Không nhắc: cổng thanh toán, trợ lý AI, dự báo dòng tiền (BE#233), MISA (BE#232),
 * nhiều kho (US-CT-14 tiêu chí 5). Không có lời chứng thực hay số liệu khách hàng.
 * Chức năng ra hay vào MVP thì sửa file này trong cùng PR đổi chức năng đó.
 */
import catalogShot from '@/assets/landing/mod-catalog.jpg';
import inventoryShot from '@/assets/landing/mod-inventory.jpg';

import packagesShot from '@/assets/landing/mod-packages.jpg';
import returnsShot from '@/assets/landing/mod-returns.jpg';
import settlementsShot from '@/assets/landing/mod-settlements.jpg';
import shopsShot from '@/assets/landing/mod-shops.jpg';

export type LandingTint = 'primary' | 'success' | 'warning' | 'purple' | 'destructive' | 'info';
export type LandingModuleIcon = 'catalog' | 'inventory' | 'shops' | 'packages' | 'returns' | 'money';

export interface LandingModule {
  id: string;
  icon: LandingModuleIcon;
  tint: LandingTint;
  /** Tên trên ô lưới phân hệ */
  name: string;
  title: string;
  text: string;
  points: string[];
  /** Ảnh màn thật chụp trên staging, dữ liệu thử; tên và ID gian hàng đã làm mờ */
  shot: { src: string; width: number; height: number; alt: string };
}

export const LANDING_MODULES: LandingModule[] = [
  // catalog /products, /products/:id/variants, /variants/bulk (25 mục 5)
  {
    id: 'san-pham',
    icon: 'catalog',
    tint: 'primary',
    name: 'Sản phẩm',
    title: 'Một sản phẩm, nhiều biến thể',
    text: 'Mỗi màu, mỗi size là một SKU riêng, có ảnh và thuộc tính theo danh mục của sàn.',
    points: ['Nhóm hàng và thuộc tính dùng chung', 'Sửa giá, thông tin nhiều biến thể một lần'],
    shot: {
      src: catalogShot,
      width: 1640,
      height: 550,
      alt: 'Màn Sản phẩm: danh sách sản phẩm kèm nhóm hàng, số variant, trạng thái đăng bán',
    },
  },
  // inventory /stock, /documents, /documents/:id/decide; purchasing /requests, /goods-receipts (25 mục 3, 4, 7)
  {
    id: 'kho',
    icon: 'inventory',
    tint: 'warning',
    name: 'Kho',
    title: 'Tồn kho chỉ đổi qua phiếu',
    text: 'Đề nghị nhập, phiếu nhận, kiểm kê, xuất huỷ đều có người lập và người duyệt khác nhau.',
    points: ['Số có thể bán được đẩy lên các sàn', 'Báo SKU cần nhập thêm, tách hàng lỗi chờ kiểm'],
    shot: {
      src: inventoryShot,
      width: 1640,
      height: 679,
      alt: 'Màn Kho hàng: tồn kho, tạm giữ, khoá chờ duyệt theo từng SKU',
    },
  },
  // channel /shops, /remote-skus, /listings/push, /listings/match, /listings/pending-prices (25 mục 6)
  {
    id: 'gian-hang',
    icon: 'shops',
    tint: 'purple',
    name: 'Gian hàng',
    title: 'Lazada và TikTok Shop trong một màn',
    text: 'Kết nối gian hàng, ghép SKU trên sàn với biến thể, đẩy listing lên sàn.',
    points: ['Giá mới chờ duyệt trước khi đăng', 'Theo dõi SKU đã liên kết và đơn bảy ngày'],
    shot: {
      src: shopsShot,
      width: 1640,
      height: 670,
      alt: 'Màn Gian hàng: gian hàng Lazada đã kết nối, số SKU liên kết, số đơn bảy ngày',
    },
  },
  // sales /orders; fulfillment /pick-list, /packages/:id/split, /packages/documents, /packages/hand-over (25 mục 8)
  {
    id: 'don-kien',
    icon: 'packages',
    tint: 'success',
    name: 'Đơn & kiện',
    title: 'Đơn hai sàn, một hàng đợi đóng gói',
    text: 'Đơn về tự giữ tồn. Kho lấy hàng theo danh sách, tách kiện, in chứng từ, bàn giao vận chuyển.',
    points: ['Kiện sắp quá hạn bàn giao hiện chữ đỏ', 'Báo mất hàng ngay trên kiện'],
    shot: {
      src: packagesShot,
      width: 2096,
      height: 1060,
      alt: 'Màn Kiện hàng: các tab theo bước đóng gói và bảng kiện kèm hạn bàn giao',
    },
  },
  // returns /requests, /receive (25 mục 9)
  {
    id: 'hang-tra',
    icon: 'returns',
    tint: 'destructive',
    name: 'Hàng trả',
    title: 'Hàng hoàn về có chỗ của nó',
    text: 'Yêu cầu trả từ sàn về một danh sách theo trạng thái. Kho quét nhận hàng hoàn tại đây.',
    points: ['Theo dõi chờ hàng về, đã nhận, chỉ hoàn tiền', 'Hàng lỗi không quay lại số có thể bán'],
    shot: {
      src: returnsShot,
      width: 1640,
      height: 830,
      alt: 'Màn Trả hàng/Hoàn tiền: các tab theo trạng thái và yêu cầu trả kèm số tiền hoàn',
    },
  },
  // finance /ledger, /orders/profits, /skus/profits, /settlements, /configs (25 mục 10.1 đến 10.4)
  {
    id: 'tien',
    icon: 'money',
    tint: 'info',
    name: 'Tiền',
    title: 'Biết lãi từng đơn, khớp tiền sàn trả',
    text: 'Sổ giao dịch ghi doanh thu, phí, thuế theo đơn và gian hàng. Đối soát số sàn trả với số phải thu.',
    points: ['Lợi nhuận theo đơn và theo SKU', 'Phí sàn và thuế cấu hình theo phiên bản'],
    shot: {
      src: settlementsShot,
      width: 1640,
      height: 572,
      alt: 'Màn Đối soát công nợ sàn: số đơn chờ sàn thanh toán và bảng phải thu theo từng đơn',
    },
  },
];

export interface LandingStep {
  title: string;
  who: string;
}

/** Bảy bước theo Documents/24 mục 1, người làm theo mục 6.6 */
export const LANDING_STEPS: LandingStep[] = [
  { title: 'Đề nghị nhập', who: 'Kho lập, CEO duyệt' },
  { title: 'Nhận hàng', who: 'Kho' },
  { title: 'Hoàn thiện sản phẩm', who: 'Admin' },
  { title: 'Lên sàn', who: 'Admin' },
  { title: 'Nhận đơn', who: 'Tự động' },
  { title: 'Đóng gói, bàn giao', who: 'Kho' },
  { title: 'Hàng hoàn và tiền', who: 'Kho, CEO' },
];
