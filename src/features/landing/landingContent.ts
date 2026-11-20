/**
 * Nội dung trang giới thiệu (FE#401, Documents/27 US-CT-14). Bản v4 (20/11/2026): bố cục theo trang mẫu Thành chọn
 * (hero nền tối, thẻ quạt phân hệ, lưới ảnh màn, footer đậm). Chỉ nhắc chức năng đã có route BE trên main (đối chiếu
 * 20/11/2026), nguồn ghi ở comment từng mục. Không nhắc: cổng thanh toán, trợ lý AI, dự báo dòng tiền (BE#233),
 * MISA (BE#232), nhiều kho (US-CT-14 tiêu chí 5). Không có lời chứng thực hay số liệu khách hàng: ba con số ở hero là
 * sự thật về sản phẩm (số sàn, số phân hệ, số bước).
 * Chức năng ra hay vào MVP thì sửa file này trong cùng PR đổi chức năng đó.
 */
import catalogShot from '@/assets/landing/mod-catalog.jpg';
import inventoryShot from '@/assets/landing/mod-inventory.jpg';
import packagesShot from '@/assets/landing/mod-packages.jpg';
import returnsShot from '@/assets/landing/mod-returns.jpg';
import settlementsShot from '@/assets/landing/mod-settlements.jpg';
import shopsShot from '@/assets/landing/mod-shops.jpg';

export interface LandingShot {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/** Hàng số dưới hero: sự thật về sản phẩm, không phải số liệu khách hàng */
export const LANDING_FACTS = [
  { value: '2 sàn', label: 'Lazada và TikTok Shop' },
  { value: '6 phân hệ', label: 'Từ sản phẩm tới tiền' },
  { value: '7 bước', label: 'Một vòng đời món hàng' },
];

export interface LandingGroup {
  id: string;
  title: string;
  text: string;
  /** Màu nền thẻ: token của Commerio */
  bg: string;
  textColor: string;
  subtitleColor: string;
  rotation: number;
  shot: LandingShot;
}

/** Ba thẻ quạt, mỗi thẻ gom hai phân hệ */
export const LANDING_GROUPS: LandingGroup[] = [
  // catalog /products, /variants/bulk; inventory /stock, /documents/:id/decide; purchasing /requests, /goods-receipts
  {
    id: 'hang-kho',
    title: 'Hàng & kho',
    text: 'Sản phẩm nhiều biến thể, mỗi biến thể một SKU. Tồn chỉ đổi qua phiếu nhập, kiểm kê, xuất huỷ, có người lập và người duyệt khác nhau.',
    bg: 'var(--warning)',
    textColor: '#1f1600',
    subtitleColor: 'rgba(31,22,0,0.72)',
    rotation: -10,
    shot: {
      src: inventoryShot,
      width: 1640,
      height: 679,
      alt: 'Màn Kho hàng: tồn kho, tạm giữ, khoá chờ duyệt theo từng SKU',
    },
  },
  // channel /shops, /listings/push, /listings/match; sales /orders; fulfillment /pick-list, /packages/hand-over; returns /receive
  {
    id: 'san-don',
    title: 'Sàn & đơn',
    text: 'Kết nối gian hàng Lazada, TikTok Shop, ghép SKU, đẩy listing. Đơn về tự giữ tồn, kho đóng gói theo hàng đợi, quét nhận hàng hoàn.',
    bg: 'color-mix(in oklab, var(--primary) 22%, #070b14)',
    textColor: '#ffffff',
    subtitleColor: 'rgba(255,255,255,0.75)',
    rotation: 3,
    shot: {
      src: packagesShot,
      width: 2096,
      height: 1060,
      alt: 'Màn Kiện hàng: các tab theo bước đóng gói và bảng kiện kèm hạn bàn giao',
    },
  },
  // finance /ledger, /orders/profits, /skus/profits, /settlements, /configs
  {
    id: 'tien',
    title: 'Tiền & đối soát',
    text: 'Sổ giao dịch ghi doanh thu, phí, thuế theo đơn. Đối soát số sàn trả với số phải thu, xem lãi theo đơn và theo SKU.',
    bg: 'var(--primary)',
    textColor: '#ffffff',
    subtitleColor: 'rgba(255,255,255,0.82)',
    rotation: 7,
    shot: {
      src: settlementsShot,
      width: 1640,
      height: 572,
      alt: 'Màn Đối soát công nợ sàn: số đơn chờ sàn thanh toán và bảng phải thu theo từng đơn',
    },
  },
];

/** Lưới ảnh màn thật, chụp trên staging bằng dữ liệu thử; tên và ID gian hàng đã làm mờ */
export const LANDING_SCREENS: (LandingShot & { name: string })[] = [
  {
    name: 'Sản phẩm',
    src: catalogShot,
    width: 1640,
    height: 550,
    alt: 'Màn Sản phẩm: danh sách sản phẩm kèm nhóm hàng, số variant, trạng thái đăng bán',
  },
  {
    name: 'Gian hàng',
    src: shopsShot,
    width: 1640,
    height: 670,
    alt: 'Màn Gian hàng: gian hàng Lazada đã kết nối, số SKU liên kết, số đơn bảy ngày',
  },
  {
    name: 'Trả hàng',
    src: returnsShot,
    width: 1640,
    height: 830,
    alt: 'Màn Trả hàng/Hoàn tiền: các tab theo trạng thái và yêu cầu trả kèm số tiền hoàn',
  },
];
