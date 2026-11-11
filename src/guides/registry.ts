import type { PageGuide } from './types';

/**
 * Nội dung hướng dẫn theo trang, mỗi trang một khoá. Trang gọi `usePageGuide('<khoá>')`, phần tử được trỏ
 * đánh dấu `data-guide="<target>"`. Nội dung từng phân hệ viết ở issue riêng (FE#134–#141).
 */
export const GUIDES = {
  'company-home': {
    key: 'company-home',
    version: 2,
    title: 'Chào mừng tới Commerio',
    intro: [
      'Trang Tổng quan cho biết hôm nay cần làm gì và kinh doanh đang ra sao.',
      'Mới bắt đầu thì đi theo thứ tự: kết nối gian hàng, thêm sản phẩm, rồi nhập hàng.',
      'Việc cần làm gom từ mọi phân hệ bạn có quyền, bấm "Mở" để tới đúng chứng từ.',
    ],
    primaryAction: { label: 'Xem việc cần làm', target: 'home-tasks' },
    steps: [
      {
        target: 'home-kpis',
        title: 'Chỉ số chính',
        body: 'Doanh thu, lãi 7 ngày và số việc trễ hạn. Di chuột vào dấu "?" cạnh tên để xem cách tính.',
      },
      {
        target: 'home-tasks',
        title: 'Việc cần làm',
        body: 'Việc quá hạn đứng đầu, rồi tới việc sắp tới hạn. Bấm "Mở" để tới chứng từ và xử lý.',
      },
      {
        target: 'task-bell',
        title: 'Chuông việc cần làm',
        body: 'Ở trang nào cũng xem được việc cần làm qua chuông này. Số đỏ nghĩa là có việc quá hạn.',
      },
      {
        target: 'sidebar-nav',
        title: 'Menu theo nhóm',
        body: 'Menu chia theo nhóm việc, bấm tên nhóm để thu gọn. Bạn chỉ thấy mục mà vai trò của bạn được dùng.',
      },
      {
        target: 'guide-help',
        title: 'Xem lại hướng dẫn',
        body: 'Bấm nút "?" này bất cứ lúc nào để mở lại hướng dẫn của trang đang xem.',
      },
    ],
  },
  reports: {
    key: 'reports',
    version: 1,
    title: 'Báo cáo kinh doanh',
    intro: [
      'Doanh thu, phí và lãi của công ty trong khoảng ngày bạn chọn.',
      'Xem theo ngày, theo nguồn bán hay từng gian hàng.',
      'Tải số liệu về để làm việc tiếp trên bảng tính.',
    ],
    primaryAction: { label: 'Chọn khoảng ngày', target: 'report-range' },
    steps: [
      {
        target: 'report-range',
        title: 'Chọn khoảng ngày',
        body: 'Bấm nút nhanh như 7 ngày, tháng này, hoặc chọn từ ngày tới ngày. Mọi số trên trang đổi theo.',
      },
      {
        target: 'report-kpis',
        title: 'Số liệu chính',
        body: 'Mỗi chỉ số có dấu "?" giải thích cách tính và phần nào chưa được thu thập.',
      },
      {
        target: 'report-filters',
        title: 'Đổi nguồn, gian hàng',
        body: 'Lọc biểu đồ theo ngày theo nguồn bán hoặc một gian hàng.',
      },
      {
        target: 'report-export',
        title: 'Tải số liệu',
        body: 'Tải tổng hợp, theo ngày hoặc theo gian hàng ra tệp CSV.',
      },
    ],
  },
  'catalog-setup': {
    key: 'catalog-setup',
    version: 1,
    title: 'Danh mục và thuộc tính',
    intro: [
      'Làm trang này trước khi thêm sản phẩm.',
      'Danh mục quyết định quy tắc sinh mã SKU cho sản phẩm trong đó.',
      'Thuộc tính như màu, cỡ dùng để tạo các biến thể.',
    ],
    primaryAction: { label: 'Thêm danh mục', target: 'catalog-add' },
    steps: [
      {
        target: 'catalog-categories',
        title: 'Tạo danh mục trước',
        body: 'Mỗi danh mục có tiền tố và quy tắc SKU. Sản phẩm thuộc danh mục nào thì mã SKU sinh theo danh mục đó.',
      },
      {
        target: 'catalog-attributes',
        title: 'Rồi tới thuộc tính',
        body: 'Khai báo thuộc tính và giá trị, ví dụ Màu: Trắng, Đen. Khi thêm sản phẩm, bạn chọn thuộc tính để tạo biến thể.',
      },
      {
        target: 'catalog-add',
        title: 'Thêm mới',
        body: 'Nút này thêm danh mục hoặc thuộc tính, theo tab đang mở.',
        permission: 'catalog.category.manage',
      },
    ],
  },
  products: {
    key: 'products',
    version: 1,
    title: 'Sản phẩm',
    intro: [
      'Mỗi sản phẩm có các biến thể, mỗi biến thể là một SKU.',
      'Tồn và giá chuẩn nằm ở biến thể, không ở sản phẩm.',
      'Bấm vào một dòng để xem hoặc sửa sản phẩm.',
    ],
    primaryAction: { label: 'Thêm sản phẩm', target: 'products-add' },
    steps: [
      {
        target: 'products-add',
        title: 'Thêm sản phẩm',
        body: 'Chọn danh mục, nhập tên rồi chọn thuộc tính để sinh các biến thể. Mã SKU tự sinh theo danh mục.',
        permission: 'catalog.product.manage',
      },
      {
        target: 'products-business',
        title: 'Lọc theo trạng thái kinh doanh',
        body: 'Tìm sản phẩm có SKU đang bán, tạm ngừng hoặc ngừng bán.',
      },
      {
        target: 'products-table',
        title: 'Mở chi tiết',
        body: 'Bấm vào dòng để mở sản phẩm: ảnh, mô tả và bảng biến thể.',
      },
    ],
  },
  inventory: {
    key: 'inventory',
    version: 1,
    title: 'Kho hàng',
    intro: [
      'Tồn của từng biến thể, cập nhật theo phiếu kho và kiện hàng.',
      'Khả dụng là số bán được, cũng là số đẩy lên các sàn.',
      'Muốn đổi số tồn thì lập phiếu kho, không sửa tay.',
    ],
    primaryAction: { label: 'Xem cột khả dụng', target: 'inventory-available' },
    steps: [
      {
        target: 'inventory-tabs',
        title: 'Tồn kho và phiếu kho',
        body: 'Tab Tồn kho xem số hiện có. Tab Phiếu kho xem và lập phiếu kiểm kê, xuất huỷ, chuyển hàng chờ xử lý.',
      },
      {
        target: 'inventory-views',
        title: 'Nhóm tồn',
        body: 'Lọc nhanh biến thể nên nhập lại hoặc đang có hàng chờ xử lý. Số cạnh tên là số biến thể trong nhóm.',
      },
      {
        target: 'inventory-available',
        title: 'Cột khả dụng',
        body: 'Khả dụng bằng tồn thực trừ đang giữ và tạm khoá. Rê chuột vào dấu ? ở đầu mỗi cột để xem số đó tính thế nào.',
      },
      {
        target: 'inventory-sku',
        title: 'Mở thẻ kho',
        body: 'Bấm mã SKU để xem bảy con số và thẻ kho: mọi lần nhập, xuất kèm chứng từ gốc.',
      },
      {
        target: 'inventory-stocktake',
        title: 'Tạo phiếu kiểm kê',
        body: 'Đếm thực tế lệch với sổ thì lập phiếu kiểm kê. Phiếu cần người khác duyệt rồi mới ghi sổ.',
        permission: 'inventory.receipt.create',
      },
    ],
  },
  purchasing: {
    key: 'purchasing',
    version: 1,
    title: 'Nhập hàng',
    intro: [
      'Đề nghị nhập gửi nhà cung cấp, phiếu nhận khi hàng tới, phiếu trả hàng lỗi.',
      'Mỗi đề nghị một nhà cung cấp, cần người khác người soạn duyệt rồi mới đặt.',
      'Hàng nhận vào tồn kho khi phiếu nhận được ghi sổ.',
    ],
    primaryAction: { label: 'Tạo đề nghị nhập', target: 'purchasing-new' },
    steps: [
      {
        target: 'purchasing-tabs',
        title: 'Ba loại chứng từ',
        body: 'Tab Đề nghị nhập, Phiếu nhận và Trả NCC. Mỗi tab lọc được theo trạng thái và nhà cung cấp.',
      },
      {
        target: 'purchasing-new',
        title: 'Tạo đề nghị nhập',
        body: 'Chọn nhà cung cấp, thêm biến thể cần nhập rồi lưu nháp. Gửi duyệt khi đã đủ dòng.',
        permission: 'purchasing.request.manage',
      },
      {
        target: 'purchasing-suppliers',
        title: 'Nhà cung cấp',
        body: 'Danh sách nhà cung cấp. Thêm nhà cung cấp ở đây trước khi lập đề nghị.',
      },
    ],
  },
  'purchase-request': {
    key: 'purchase-request',
    version: 1,
    title: 'Đề nghị nhập',
    intro: [
      'Thêm dòng, gửi duyệt, người khác duyệt rồi mới đặt NCC.',
      'Đã đặt thì Kho lập phiếu nhận từ đề nghị khi hàng tới.',
      'Nút mờ là thao tác chưa làm được, rê chuột để xem lý do.',
    ],
    primaryAction: { label: 'Xem các dòng', target: 'pr-lines' },
    steps: [
      {
        target: 'pr-steps',
        title: 'Đang ở bước nào',
        body: 'Thanh bước cho biết đề nghị đang nháp, chờ duyệt, đã duyệt hay đã đặt.',
      },
      {
        target: 'pr-lines',
        title: 'Thêm dòng',
        body: 'Chọn biến thể và số lượng cần nhập. Chưa có sản phẩm thì bấm Sản phẩm mới.',
      },
      {
        target: 'pr-actions',
        title: 'Gửi rồi duyệt',
        body: 'Gửi duyệt khi đủ dòng. Người duyệt phải khác người soạn; đã duyệt thì đặt NCC rồi lập phiếu nhận.',
      },
      {
        target: 'detail-history',
        title: 'Lịch sử',
        body: 'Ai đổi trạng thái, lúc nào và ghi chú kèm theo.',
      },
    ],
  },
  'goods-receipt': {
    key: 'goods-receipt',
    version: 1,
    title: 'Phiếu nhận hàng',
    intro: [
      'Nhập số thực nhận cho từng dòng, ghi chênh lệch rồi ghi sổ một lần.',
      'Dòng có số chênh có vạch vàng ở mép trái và nhãn Chênh.',
    ],
    primaryAction: { label: 'Xem các dòng', target: 'gr-lines' },
    steps: [
      {
        target: 'gr-lines',
        title: 'Số thực nhận',
        body: 'Ghi số NCC báo giao, số đạt, lỗi giữ và trả tại chỗ. Thiếu được tính tự động.',
      },
      {
        target: 'gr-reason',
        title: 'Ghi chênh lệch',
        body: 'Có lỗi, trả tại chỗ hoặc thiếu thì ghi lý do cho dòng đó. Rê chuột vào nhãn Chênh để xem chênh gì.',
      },
      {
        target: 'gr-actions',
        title: 'Hoàn tất',
        body: 'Ghi sổ để cộng hàng đạt vào tồn. Có thiếu thì phiếu chuyển sang chờ Mua hàng ghi kết quả.',
      },
    ],
  },
  'supplier-return': {
    key: 'supplier-return',
    version: 1,
    title: 'Trả hàng nhà cung cấp',
    intro: [
      'Chọn dòng hàng lỗi cần trả, ghi lý do rồi gửi duyệt.',
      'NCC bù hàng thì lập đề nghị bù hàng ngay từ phiếu.',
    ],
    primaryAction: { label: 'Xem các dòng', target: 'sr-lines' },
    steps: [
      {
        target: 'sr-lines',
        title: 'Chọn dòng trả',
        body: 'Các dòng lấy từ hàng đang chờ xử lý của nhà cung cấp. Ghi số lượng trả cho từng dòng.',
      },
      {
        target: 'sr-note',
        title: 'Lý do',
        body: 'Ghi lý do trả để NCC và người duyệt biết hàng lỗi thế nào.',
      },
      {
        target: 'sr-actions',
        title: 'Gửi và ghi kết quả',
        body: 'CEO duyệt và gửi. Người khác người gửi ghi kết quả: hoàn tiền, bù hàng hoặc không nhận.',
      },
      {
        target: 'sr-replace',
        title: 'Đề nghị bù hàng',
        body: 'NCC bù hàng thì bấm đây để lập đề nghị nhập mới cho phần được bù.',
        permission: 'purchasing.request.manage',
      },
    ],
  },
} satisfies Record<string, PageGuide>;

export type GuideKey = keyof typeof GUIDES;

export const getGuide = (key: string): PageGuide | undefined => (GUIDES as Record<string, PageGuide>)[key];
