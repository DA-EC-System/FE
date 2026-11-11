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
} satisfies Record<string, PageGuide>;

export type GuideKey = keyof typeof GUIDES;

export const getGuide = (key: string): PageGuide | undefined => (GUIDES as Record<string, PageGuide>)[key];
