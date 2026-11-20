/**
 * Nội dung trang giới thiệu (FE#401, Documents/27 US-CT-14). Bản v4 (20/11/2026): bố cục theo trang mẫu Thành chọn
 * (hero nền tối, thẻ quạt phân hệ, lưới ảnh màn, footer đậm).
 * Định vị theo báo cáo (report/sections/gioi-thieu.tex mục 1.1, 1.3): Commerio là nền tảng cho nhiều doanh nghiệp bán
 * trên nhiều sàn dùng chung, mỗi công ty dữ liệu riêng; trục nội dung là bốn vấn đề ở mục 1.1. Sàn đang hỗ trợ chỉ ghi
 * ở footer, không làm tiêu đề. Chỉ nhắc chức năng đã có route BE trên main (đối chiếu 20/11/2026). Không nhắc: cổng
 * thanh toán, trợ lý AI, dự báo dòng tiền (BE#233), MISA (BE#232), nhiều kho (US-CT-14 tiêu chí 5). Không có lời chứng
 * thực hay số liệu khách hàng; con số duy nhất về thị trường lấy từ báo cáo, có ghi nguồn.
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

/** Hàng dưới hero: tính chất của nền tảng (report mục 1.3), không phải số liệu khách hàng */
export const LANDING_FACTS = [
  { value: 'Đa công ty', label: 'Dữ liệu mỗi công ty tách riêng' },
  { value: '4 vai trò', label: 'CEO, Admin, Sale, Kho' },
  { value: '1 số tồn', label: 'Cho mọi gian hàng' },
];

/** Số liệu thị trường duy nhất trên trang, trích báo cáo mục 1.1 */
export const LANDING_MARKET_NOTE = '55,4% nhà bán hàng kinh doanh trên từ hai kênh trở lên (khảo sát của Sapo, 2023).';

/** Bốn vấn đề ở report mục 1.1 và cách Commerio giải */
export const LANDING_PAINS = [
  // inventory /stock, đẩy tồn lên sàn; sales /orders giữ tồn
  {
    title: 'Bán quá số hàng có',
    pain: 'Sàn cập nhật tồn chậm nên vẫn nhận đơn khi kho đã hết.',
    fix: 'Một số tồn đẩy lên mọi gian hàng. Đơn về là tự giữ tồn.',
  },
  // sales /orders; fulfillment /packages
  {
    title: 'Mở nhiều trang để duyệt đơn',
    pain: 'Mỗi sàn một Seller Center, nhân viên duyệt đơn từng nơi.',
    fix: 'Một danh sách đơn và kiện cho mọi sàn, đóng gói theo hàng đợi.',
  },
  // inventory /stock (cần nhập thêm); purchasing /requests/:id/:action
  {
    title: 'Nhập hàng theo cảm tính',
    pain: 'Không thấy tồn tổng của mọi kênh.',
    fix: 'Tồn tổng theo SKU, báo hàng cần nhập. Đề nghị nhập có người duyệt.',
  },
  // finance /ledger, /orders/profits, /settlements
  {
    title: 'Không biết lãi thực',
    pain: 'Tiền sàn trả gộp nhiều đơn, đã trừ phí, phải khớp bằng tay.',
    fix: 'Sổ tiền theo đơn, lãi theo đơn và SKU, đối soát tiền sàn trả.',
  },
];

/** Bắt đầu dùng: Documents/24 mục 6 (đăng ký, mời nhân viên, kết nối gian hàng) */
export const LANDING_ONBOARDING = [
  { title: 'Đăng ký công ty', text: 'Người đăng ký là CEO. Xác minh email bằng mã gửi về hộp thư.' },
  { title: 'Mời nhân viên', text: 'Giao vai trò Admin, Sale, Nhân viên kho. Mỗi người chỉ thấy phần việc của mình.' },
  { title: 'Kết nối gian hàng', text: 'Cấp quyền cho Commerio trên sàn, ghép SKU trên sàn với sản phẩm của bạn.' },
  { title: 'Bán hàng', text: 'Đơn về một danh sách, tồn cập nhật lên mọi gian hàng.' },
];

/** Điểm khác biệt (report mục 1.1, 1.3; Documents/25 nguyên tắc người thứ hai) */
export const LANDING_DIFFS = [
  {
    icon: 'scale' as const,
    title: 'Đối soát có cả TikTok Shop',
    text: 'So tiền sàn trả với số phải thu theo từng đơn, kể cả TikTok Shop.',
  },
  {
    icon: 'shield' as const,
    title: 'Người duyệt khác người lập',
    text: 'Phiếu kho, đề nghị nhập, giá mới cần người thứ hai duyệt. Mọi thao tác đều ghi nhật ký.',
  },
  {
    icon: 'percent' as const,
    title: 'Phí và thuế theo công ty bạn',
    text: 'Lãi tính theo phí sàn và thuế do công ty tự khai, lưu theo từng phiên bản cấu hình.',
  },
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
    text: 'Kết nối gian hàng trên các sàn, ghép SKU, đẩy listing. Đơn về tự giữ tồn, kho đóng gói theo hàng đợi, quét nhận hàng hoàn.',
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
