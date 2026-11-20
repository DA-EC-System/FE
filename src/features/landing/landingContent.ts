/**
 * Nội dung trang giới thiệu (FE#401, Documents/27 US-CT-14). Thành chốt 20/11/2026 phương án B của bản thiết kế HTML
 * (.claude/issues/landing/design/index.html): hero sáng bất đối xứng, bốn vấn đề dạng bento, thẻ quạt phân hệ, khối
 * dành cho doanh nghiệp, hỏi đáp.
 * Định vị theo báo cáo (report/sections/gioi-thieu.tex mục 1.1, 1.3): Commerio là nền tảng cho nhiều doanh nghiệp bán
 * trên nhiều sàn dùng chung, mỗi công ty dữ liệu riêng; trục nội dung là bốn vấn đề ở mục 1.1. Sàn đang hỗ trợ chỉ ghi
 * ở hỏi đáp và footer, không làm tiêu đề. Chỉ nhắc chức năng đã có route BE trên main (đối chiếu 20/11/2026). Không
 * nhắc: cổng thanh toán, trợ lý AI, dự báo dòng tiền (BE#233), MISA (BE#232), nhiều kho (US-CT-14 tiêu chí 5). Không
 * có lời chứng thực hay số liệu khách hàng; con số duy nhất về thị trường lấy từ báo cáo, có ghi nguồn.
 * Chức năng ra hay vào MVP thì sửa file này trong cùng PR đổi chức năng đó.
 */
import inventoryShot from '@/assets/landing/mod-inventory.jpg';
import packagesShot from '@/assets/landing/mod-packages.jpg';
import settlementsShot from '@/assets/landing/mod-settlements.jpg';

export interface LandingShot {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/** Ba ý dưới nút ở hero: tính chất của nền tảng (report mục 1.3) */
export const LANDING_HIGHLIGHTS = [
  'Dữ liệu mỗi công ty tách riêng',
  '4 vai trò có sẵn',
  'Một số tồn cho mọi gian hàng',
];

/** Số liệu thị trường duy nhất trên trang, trích báo cáo mục 1.1 */
export const LANDING_MARKET_NOTE = '55,4% nhà bán hàng kinh doanh trên từ hai kênh trở lên (khảo sát của Sapo, 2023).';

const INVENTORY_SHOT: LandingShot = {
  src: inventoryShot,
  width: 1640,
  height: 679,
  alt: 'Màn Kho hàng: tồn kho, tạm giữ, khoá chờ duyệt theo từng SKU',
};
const PACKAGES_SHOT: LandingShot = {
  src: packagesShot,
  width: 2096,
  height: 1060,
  alt: 'Màn Kiện hàng: các tab theo bước đóng gói và bảng kiện kèm hạn bàn giao',
};

/** Bốn vấn đề ở report mục 1.1 và cách Commerio giải; hai thẻ đầu kèm ảnh màn thật */
export const LANDING_PAINS: { title: string; pain: string; fix: string; shot?: LandingShot }[] = [
  // inventory /stock, đẩy tồn lên sàn; sales /orders giữ tồn
  {
    title: 'Bán quá số hàng có',
    pain: 'Sàn cập nhật tồn chậm nên vẫn nhận đơn khi kho đã hết.',
    fix: 'Một số tồn đẩy lên mọi gian hàng. Đơn về là tự giữ tồn.',
    shot: INVENTORY_SHOT,
  },
  // sales /orders; fulfillment /packages
  {
    title: 'Mở nhiều trang để duyệt đơn',
    pain: 'Mỗi sàn một Seller Center, nhân viên duyệt đơn từng nơi.',
    fix: 'Một danh sách đơn và kiện cho mọi sàn, đóng gói theo hàng đợi.',
    shot: PACKAGES_SHOT,
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
    shot: INVENTORY_SHOT,
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
    shot: PACKAGES_SHOT,
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

/** Hỏi đáp: report/sections/gioi-thieu.tex mục 1.3; Documents/24 mục 6.6; Documents/25 N6, N9 và mục 11 */
export const LANDING_FAQ = [
  {
    q: 'Dữ liệu của công ty tôi có tách riêng với công ty khác không?',
    a: 'Có. Mỗi công ty tự đăng ký và có sản phẩm, kho, đơn, tiền, tài khoản nhân viên riêng. Người làm cho nhiều công ty chọn công ty khi đăng nhập và chỉ thấy dữ liệu của công ty đã chọn. Người vận hành nền tảng không xem được dữ liệu kinh doanh của công ty.',
  },
  {
    q: 'Kết nối gian hàng trên sàn thế nào?',
    a: 'Ở màn Gian hàng, bấm Thêm gian hàng rồi đăng nhập tài khoản người bán trên sàn để cấp quyền cho Commerio. Sau đó ghép SKU trên sàn với sản phẩm của bạn.',
  },
  { q: 'Commerio đang hỗ trợ sàn nào?', a: 'Lazada và TikTok Shop.' },
  {
    q: 'Ai duyệt đề nghị nhập và phiếu kho?',
    a: 'CEO duyệt đề nghị nhập. Phiếu kho cần duyệt, như kiểm kê hay xuất huỷ, phải do người khác người lập duyệt. Mọi thao tác duyệt đều ghi nhật ký.',
  },
  {
    q: 'Khi nào tồn được đẩy lên sàn?',
    a: 'Khi số có thể bán thay đổi, ví dụ nhận hàng, có đơn mới hoặc phiếu kiểm kê được duyệt, Commerio đẩy số mới lên các gian hàng đã ghép SKU. Tồn và giá theo Commerio; trạng thái giao hàng theo sàn.',
  },
  {
    q: 'Có cần cài đặt phần mềm không?',
    a: 'Không. Commerio chạy trên trình duyệt. Đăng ký công ty bằng email và mã số thuế, nhập mã xác minh gửi về email là vào làm việc.',
  },
];
