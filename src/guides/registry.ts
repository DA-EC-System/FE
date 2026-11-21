import type { PageGuide } from './types';

/**
 * Nội dung hướng dẫn theo trang, mỗi trang một khoá. Trang gọi `usePageGuide('<khoá>')`, phần tử được trỏ
 * đánh dấu `data-guide="<target>"`. Nội dung từng tính năng viết ở issue riêng (FE#134–#141).
 */
export const GUIDES = {
  'company-home': {
    key: 'company-home',
    version: 2,
    title: 'Chào mừng tới Commerio',
    intro: [
      'Trang Tổng quan cho biết hôm nay cần làm gì và kinh doanh đang ra sao.',
      'Mới bắt đầu thì đi theo thứ tự: kết nối gian hàng, thêm sản phẩm, rồi nhập hàng.',
      'Việc cần làm gom từ mọi tính năng bạn có quyền, bấm "Mở" để tới đúng chứng từ.',
    ],
    primaryAction: { label: 'Xem việc cần làm', target: 'home-tasks' },
    steps: [
      {
        target: 'home-kpis',
        title: 'Chỉ số chính',
        body: 'Doanh thu, lợi nhuận 7 ngày và số việc quá hạn. Di chuột vào dấu "?" cạnh tên để xem cách tính.',
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
  staff: {
    key: 'staff',
    version: 3,
    title: 'Nhân viên',
    intro: [
      'Mỗi nhân viên mang một hoặc nhiều vai trò; vai trò quyết định họ thấy và làm được gì.',
      'Không thao tác được trên tài khoản CEO và tài khoản của chính bạn.',
    ],
    primaryAction: { label: 'Mời nhân viên', target: 'staff-invite' },
    steps: [
      {
        target: 'staff-invite',
        title: 'Mời nhân viên',
        body: 'Chọn vai trò rồi tạo link mời, gửi link cho nhân viên. Link chỉ hiện một lần, hạn 72 giờ.',
        permission: 'identity.account.manage',
      },
      {
        target: 'staff-pending',
        title: 'Yêu cầu tham gia',
        body: 'Nhân viên mở link, xác minh email và đặt mật khẩu thì yêu cầu hiện ở tab này. Duyệt xong họ mới vào được công ty.',
      },
      {
        target: 'staff-links',
        title: 'Link mời chưa dùng',
        body: 'Link chưa có ai nộp yêu cầu nằm ở tab này. Lỡ gửi nhầm người thì huỷ link; người cầm link sẽ không dùng được nữa.',
      },
      {
        target: 'staff-roles',
        title: 'Đổi vai trò',
        body: 'Quyền mới có hiệu lực ở lần thao tác kế tiếp của người đó. Vai trò có quyền bạn không có thì không gán hay gỡ được.',
        permission: 'identity.account.manage',
      },
      {
        target: 'staff-lock',
        title: 'Tạm khoá tài khoản',
        body: 'Người bị khoá không làm việc được ở công ty này tới khi mở khoá; tài khoản ở công ty khác không bị ảnh hưởng.',
        permission: 'identity.account.manage',
      },
    ],
  },
  roles: {
    key: 'roles',
    version: 1,
    title: 'Vai trò',
    intro: [
      'Mỗi vai trò là một nhóm quyền. Vai trò mặc định không sửa được.',
      'Tạo vai trò tự tạo khi cần nhóm quyền riêng, ví dụ Trưởng ca đóng gói.',
    ],
    primaryAction: { label: 'Tạo vai trò', target: 'roles-create' },
    steps: [
      {
        target: 'roles-create',
        title: 'Tạo vai trò tự tạo',
        body: 'Đặt tên rồi tích quyền theo từng tính năng. Quyền bạn không có bị khoá; rê chuột hoặc Tab tới để xem lý do.',
        permission: 'identity.role.manage',
      },
      {
        target: 'roles-actions',
        title: 'Xem, sửa quyền',
        body: 'Vai trò mặc định chỉ xem được. Vai trò tự tạo sửa được; xoá được khi không còn nhân viên nào được gán.',
      },
    ],
  },
  modules: {
    key: 'modules',
    version: 1,
    title: 'Tính năng',
    intro: [
      'Bật, tắt năm tính năng tuỳ chọn: Nhập hàng, Kênh bán, Chat khách hàng, Trợ lý AI, Báo cáo.',
      'Thay đổi có hiệu lực ngay với mọi nhân viên của công ty.',
      'Tính năng đã có dữ liệu thì không tắt được.',
    ],
    primaryAction: { label: 'Xem tính năng tuỳ chọn', target: 'modules-optional' },
    steps: [
      {
        target: 'modules-optional',
        title: 'Bật, tắt tính năng',
        body: 'Gạt công tắc ở mỗi dòng. Tắt thì nhân viên không còn thấy màn hình của tính năng đó. Bật Trợ lý AI cần đồng ý gửi dữ liệu tới OpenAI.',
        permission: 'platform.module.manage',
      },
      {
        target: 'modules-core',
        title: 'Tính năng cơ bản',
        body: 'Sản phẩm, kho, đơn hàng, tài chính... luôn bật, không tắt được.',
      },
    ],
  },
  'platform-companies': {
    key: 'platform-companies',
    version: 1,
    title: 'Công ty',
    intro: [
      'Công ty tự đăng ký dùng Commerio.',
      'Quản trị nền tảng chỉ khoá hoặc mở khoá công ty, không xem dữ liệu kinh doanh.',
    ],
    primaryAction: { label: 'Tìm công ty', target: 'platform-filters' },
    steps: [
      {
        target: 'platform-filters',
        title: 'Tìm công ty',
        body: 'Tìm theo tên, mã số thuế hoặc email CEO; lọc theo trạng thái.',
      },
      {
        target: 'platform-lock',
        title: 'Khoá, mở khoá',
        body: 'Khoá phải ghi lý do; nhân viên của công ty bị khoá không đăng nhập được. Mở khoá chỉ cần xác nhận.',
      },
    ],
  },
  'catalog-setup': {
    key: 'catalog-setup',
    version: 2,
    title: 'Danh mục sản phẩm',
    intro: [
      'Danh mục quyết định thuộc tính sản phẩm cần điền và biến thể gợi ý khi tạo sản phẩm.',
      'Hệ thống có sẵn danh mục mặc định; công ty ẩn danh mục không bán, thêm thuộc tính riêng, hoặc tự tạo danh mục.',
      'Thuộc tính biến thể như màu, cỡ liệt kê ở cuối trang; giá trị mới thêm ngay khi tạo sản phẩm.',
    ],
    primaryAction: { label: 'Thêm danh mục', target: 'catalog-add' },
    steps: [
      {
        target: 'catalog-categories',
        title: 'Danh mục mặc định',
        body: 'Bấm tên một danh mục để xem thuộc tính sản phẩm, biến thể theo và ánh xạ sang sàn. Danh mục không bán thì ẩn đi.',
      },
      {
        target: 'catalog-attributes',
        title: 'Thuộc tính biến thể',
        body: 'Màu sắc, kích cỡ… và các giá trị. Giá trị mới thêm ngay trong form sản phẩm, không phải vào đây.',
      },
      {
        target: 'catalog-add',
        title: 'Thêm mới',
        body: 'Tạo danh mục riêng, có thể dựa trên một danh mục mặc định để chép sẵn thuộc tính.',
        permission: 'catalog.group.manage',
      },
    ],
  },
  products: {
    key: 'products',
    version: 1,
    title: 'Sản phẩm',
    intro: [
      'Mỗi sản phẩm có một hoặc nhiều variant, mỗi variant là một SKU.',
      'Tồn và giá bán lẻ nằm ở variant, không ở sản phẩm.',
      'Bấm vào một dòng để xem hoặc sửa sản phẩm.',
    ],
    primaryAction: { label: 'Thêm sản phẩm', target: 'products-add' },
    steps: [
      {
        target: 'products-add',
        title: 'Thêm sản phẩm',
        body: 'Chọn nhóm hàng, nhập tên rồi chọn thuộc tính phân loại để tạo các variant. Mã SKU tự tạo theo mẫu ở Cài đặt sản phẩm.',
        permission: 'catalog.product.manage',
      },
      {
        target: 'products-business',
        title: 'Lọc theo trạng thái kinh doanh',
        body: 'Tìm sản phẩm có SKU đang kinh doanh, tạm ngừng bán hoặc ngừng nhập.',
      },
      {
        target: 'products-table',
        title: 'Mở chi tiết',
        body: 'Bấm vào dòng để mở sản phẩm: ảnh, mô tả và bảng SKU.',
      },
    ],
  },
  inventory: {
    key: 'inventory',
    version: 1,
    title: 'Kho hàng',
    intro: [
      'Tồn của từng SKU, cập nhật theo phiếu kho và kiện hàng.',
      'Có thể bán là số đồng bộ lên các sàn.',
      'Muốn đổi số tồn thì lập phiếu kho, không sửa tay.',
    ],
    primaryAction: { label: 'Xem cột Có thể bán', target: 'inventory-available' },
    steps: [
      {
        target: 'inventory-tabs',
        title: 'Tồn kho và phiếu kho',
        body: 'Tab Tồn kho xem số hiện có. Tab Phiếu kho xem và tạo phiếu kiểm kho, xuất huỷ, chuyển hàng lỗi/chờ kiểm.',
      },
      {
        target: 'inventory-views',
        title: 'Nhóm tồn',
        body: 'Lọc nhanh SKU cần nhập thêm hoặc có hàng lỗi/chờ kiểm. Số cạnh tên là số SKU trong nhóm.',
      },
      {
        target: 'inventory-available',
        title: 'Cột Có thể bán',
        body: 'Có thể bán = tồn kho − tạm giữ − khoá chờ duyệt. Rê chuột vào dấu ? ở đầu mỗi cột để xem số đó tính thế nào.',
      },
      {
        target: 'inventory-sku',
        title: 'Mở thẻ kho',
        body: 'Bấm mã SKU để xem bảy con số và thẻ kho: mọi lần nhập, xuất kèm chứng từ gốc.',
      },
      {
        target: 'inventory-stocktake',
        title: 'Tạo phiếu kiểm kho',
        body: 'Đếm thực tế lệch với sổ thì tạo phiếu kiểm kho. Phiếu cần người khác duyệt rồi mới hoàn thành.',
        permission: 'inventory.receipt.create',
      },
    ],
  },
  purchasing: {
    key: 'purchasing',
    version: 1,
    title: 'Nhập hàng',
    intro: [
      'Đơn đặt hàng gửi NCC, phiếu nhập kho khi hàng về, phiếu trả hàng lỗi cho NCC.',
      'Mỗi đơn một NCC; người duyệt phải khác người lập.',
      'Hàng chỉ cộng vào tồn khi bấm Nhập kho.',
    ],
    primaryAction: { label: 'Tạo đơn đặt hàng nhập', target: 'purchasing-new' },
    steps: [
      {
        target: 'purchasing-tabs',
        title: 'Bốn tab',
        body: 'Đặt hàng nhập, Phiếu nhập kho, Trả hàng NCC và Nhà cung cấp. Mỗi tab lọc được theo trạng thái; tab Đặt hàng nhập lọc thêm theo NCC.',
      },
      {
        target: 'purchasing-new',
        title: 'Tạo đơn đặt hàng nhập',
        body: 'Chọn NCC, thêm SKU cần nhập rồi lưu nháp. Gửi duyệt khi đã đủ dòng.',
        permission: 'purchasing.request.manage',
      },
      {
        target: 'purchasing-suppliers',
        title: 'Nhà cung cấp',
        body: 'Danh sách NCC. Thêm NCC ở đây trước khi tạo đơn đặt hàng nhập.',
      },
    ],
  },
  'purchase-request': {
    key: 'purchase-request',
    version: 1,
    title: 'Đơn đặt hàng nhập',
    intro: [
      'Thêm dòng, gửi duyệt, người khác duyệt rồi mới đặt hàng với NCC.',
      'Đã đặt thì Kho tạo phiếu nhập kho từ đơn khi hàng về.',
      'Nút mờ là thao tác chưa làm được, rê chuột để xem lý do.',
    ],
    primaryAction: { label: 'Xem các dòng', target: 'pr-lines' },
    steps: [
      {
        target: 'pr-steps',
        title: 'Đang ở bước nào',
        body: 'Thanh bước cho biết đơn đang nháp, chờ duyệt, đã duyệt hay đã đặt.',
      },
      {
        target: 'pr-lines',
        title: 'Thêm dòng',
        body: 'Chọn SKU và số lượng cần nhập. Chưa có sản phẩm thì bấm Sản phẩm mới.',
      },
      {
        target: 'pr-actions',
        title: 'Gửi rồi duyệt',
        body: 'Gửi duyệt khi đủ dòng. Người duyệt phải khác người lập; duyệt xong thì đặt hàng với NCC rồi tạo phiếu nhập kho.',
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
    title: 'Phiếu nhập kho',
    intro: [
      'Nhập số thực nhận cho từng dòng, ghi lý do lệch rồi nhập kho một lần.',
      'Dòng có số lệch có vạch vàng ở mép trái và nhãn Lệch.',
    ],
    primaryAction: { label: 'Xem các dòng', target: 'gr-lines' },
    steps: [
      {
        target: 'gr-lines',
        title: 'Số thực nhận',
        body: 'Ghi số NCC báo giao, số đạt, lỗi, giữ lại và trả tại chỗ. Thiếu được tính tự động.',
      },
      {
        target: 'gr-reason',
        title: 'Ghi lý do lệch',
        body: 'Có lỗi, trả tại chỗ hoặc thiếu thì ghi lý do cho dòng đó. Rê chuột vào nhãn Lệch để xem lệch gì.',
      },
      {
        target: 'gr-actions',
        title: 'Nhập kho',
        body: 'Bấm Nhập kho để cộng hàng đạt vào tồn. Có thiếu thì phiếu chuyển sang Thiếu hàng, chờ xử lý.',
      },
    ],
  },
  'supplier-return': {
    key: 'supplier-return',
    version: 1,
    title: 'Trả hàng NCC',
    intro: [
      'Chọn hàng lỗi cần trả, ghi lý do rồi gửi duyệt.',
      'NCC đổi hàng thì tạo đơn đặt hàng đổi ngay từ phiếu.',
    ],
    primaryAction: { label: 'Xem các dòng', target: 'sr-lines' },
    steps: [
      {
        target: 'sr-lines',
        title: 'Chọn hàng trả',
        body: 'Chọn SKU trong khu hàng lỗi/chờ kiểm của NCC rồi nhập SL trả cho từng dòng.',
      },
      {
        target: 'sr-note',
        title: 'Lý do',
        body: 'Ghi lý do trả để NCC và người duyệt biết hàng lỗi thế nào.',
      },
      {
        target: 'sr-actions',
        title: 'Gửi và ghi kết quả',
        body: 'CEO duyệt và gửi. Người khác người gửi ghi kết quả: hoàn tiền, đổi hàng hoặc không nhận.',
      },
      {
        target: 'sr-replace',
        title: 'Đơn đặt hàng đổi',
        body: 'NCC đổi hàng thì bấm đây để tạo đơn đặt hàng nhập cho phần hàng đổi.',
        permission: 'purchasing.request.manage',
      },
    ],
  },
  packages: {
    key: 'packages',
    version: 1,
    title: 'Kiện hàng',
    intro: [
      'Mỗi đơn chia thành một hoặc nhiều kiện; kho làm việc theo từng kiện.',
      'Tab theo bước: chờ đóng gói, đã đóng gói, chờ lấy hàng, đang vận chuyển. Hạn bàn giao chữ đỏ là kiện gấp.',
    ],
    primaryAction: { label: 'Xem các bước', target: 'package-tabs' },
    steps: [
      {
        target: 'package-tabs',
        title: 'Lọc theo trạng thái',
        body: 'Số trên tab là số kiện ở bước đó. Cần mở lại kiện gom các kiện đã đóng nhưng phải mở hộp (đơn huỷ, sửa, chia lại).',
      },
      {
        target: 'package-actions',
        title: 'In phiếu lấy hàng',
        body: 'Chọn kiện rồi bấm Danh sách lấy hàng để gộp hàng cần lấy theo SKU và in. Ở Đã đóng gói, Chờ lấy hàng thì in phiếu giao hàng, bàn giao hàng loạt.',
      },
      {
        target: 'package-list',
        title: 'Vào đóng gói',
        body: 'Bấm một kiện để mở chi tiết; kiện Chờ đóng gói có nút Đóng gói dẫn sang màn quét.',
      },
    ],
  },
  'pack-scan': {
    key: 'pack-scan',
    version: 1,
    title: 'Đóng gói',
    intro: [
      'Quét mã vạch từng món cho tới khi đủ số lượng của kiện.',
      'Quét sai mã hoặc thừa sẽ báo ngay; đủ thì bấm Đóng gói.',
    ],
    primaryAction: { label: 'Bắt đầu quét', target: 'scan-input' },
    steps: [
      {
        target: 'scan-input',
        title: 'Quét mã',
        body: 'Ô quét luôn sẵn con trỏ. Quét mã vạch hoặc gõ SKU rồi Enter; Quét lại để làm từ đầu.',
      },
      {
        target: 'pack-lines',
        title: 'Kiểm số lượng',
        body: 'Thanh tiến độ đếm số món đã quét; dòng đủ số chuyển nền xanh.',
      },
      {
        target: 'pack-submit',
        title: 'Hoàn tất đóng gói',
        body: 'Đủ mọi dòng thì nút Đóng gói sáng. Kiện hàng của đơn sàn phải chọn đơn vị vận chuyển trước khi đóng gói.',
      },
    ],
  },
  returns: {
    key: 'returns',
    version: 1,
    title: 'Trả hàng/Hoàn tiền',
    intro: [
      'Yêu cầu trả hàng từ sàn và yêu cầu tạo tay cho đơn tạo tay nằm chung một danh sách.',
      'Kho quét nhận hàng hoàn; kiện chưa gắn được vào yêu cầu nào nằm riêng ở tab Hàng hoàn chưa rõ đơn.',
    ],
    primaryAction: { label: 'Xem các tab', target: 'return-tabs' },
    steps: [
      {
        target: 'return-tabs',
        title: 'Yêu cầu và hàng hoàn chưa rõ đơn',
        body: 'Tab theo trạng thái yêu cầu. Tab Hàng hoàn chưa rõ đơn chứa kiện hàng hoàn quét ở kho mà chưa gắn được vào yêu cầu nào.',
      },
      {
        target: 'return-receive',
        title: 'Nhận hàng hoàn',
        body: 'Hàng hoàn về thì quét mã yêu cầu hoặc mã vận đơn hoàn. Khớp thì mở yêu cầu, không khớp thì kiện vào tab Hàng hoàn chưa rõ đơn.',
        permission: 'fulfillment.order.process',
      },
      {
        target: 'return-list',
        title: 'Ghi tình trạng',
        body: 'Mở yêu cầu để chấp nhận, chỉ hoàn tiền hoặc từ chối. Hàng đã nhận thì ghi tình trạng (bán lại, hỏng) trên phiếu kiểm hàng hoàn.',
      },
    ],
  },
  orders: {
    key: 'orders',
    version: 1,
    title: 'Đơn hàng',
    intro: [
      'Đơn từ mọi gian hàng trên các sàn nằm chung một danh sách.',
      'Tab lọc theo trạng thái, số trên tab đếm theo bộ lọc đang chọn.',
    ],
    primaryAction: { label: 'Xem danh sách', target: 'order-list' },
    steps: [
      { target: 'order-tabs', title: 'Lọc theo trạng thái', body: 'Mỗi tab là một trạng thái đơn, kèm số đơn đang có.' },
      {
        target: 'order-filters',
        title: 'Tìm và lọc',
        body: 'Tìm theo mã đơn hoặc mã đơn sàn; lọc theo kênh bán, gian hàng, thanh toán, ngày, trạng thái chi tiết và cảnh báo.',
      },
      {
        target: 'order-list',
        title: 'Mở đơn',
        body: 'Cột Trạng thái cho biết đơn đang ở bước nào, rê chuột vào nhãn để xem giải thích. Bấm một dòng để mở đơn.',
      },
    ],
  },
  'order-detail': {
    key: 'order-detail',
    version: 1,
    title: 'Chi tiết đơn',
    intro: [
      'Thanh trên cùng cho biết đơn đang ở bước nào; nhãn bên cạnh lấy theo kiện hàng.',
      'Cột phải là lịch sử của đơn.',
    ],
    primaryAction: { label: 'Xem kiện', target: 'order-packages' },
    steps: [
      { target: 'order-steps', title: 'Đơn đang ở đâu', body: 'Bước xanh là đã qua, bước viền vàng là hiện tại.' },
      { target: 'order-lines', title: 'Hàng và tiền', body: 'Từng sản phẩm, phí vận chuyển và tổng tiền của đơn.' },
      {
        target: 'order-packages',
        title: 'Kiện hàng của đơn',
        body: 'Mỗi kiện đi riêng: bấm mã kiện để mở trang kiện; shop tự giao thì cập nhật giao ở cột cuối.',
      },
      { target: 'detail-history', title: 'Lịch sử', body: 'Ai đổi trạng thái đơn, lúc nào, lý do gì.' },
    ],
  },
  settlements: {
    key: 'settlements',
    version: 1,
    title: 'Đối soát công nợ sàn',
    intro: [
      'Mỗi đơn có trạng thái thanh toán riêng: đối chiếu số sàn thanh toán với số phải thu.',
      'Đơn chênh lệch quá ngưỡng nằm ở khung Đơn chênh lệch cần xử lý, xử lý ngay trên dòng kèm lý do.',
      'Chênh lệch vượt hạn mức tự xử lý thì CEO duyệt trước.',
    ],
    primaryAction: { label: 'Xem đơn chênh lệch', target: 'settlement-mismatch' },
    steps: [
      {
        target: 'settlement-kpis',
        title: 'Tổng quan đối soát theo đơn',
        body: 'Số đơn chờ sàn thanh toán, chênh lệch, đã đối soát khớp và đã xử lý chênh lệch. Bấm "?" để xem nghĩa từng trạng thái.',
      },
      {
        target: 'settlement-mismatch',
        title: 'Xử lý chênh lệch',
        body: 'Mỗi đơn chênh lệch một dòng: sàn thanh toán, phải thu và chênh lệch. Xử lý xong dòng chuyển xanh rồi ẩn.',
        permission: 'finance.settlement.resolve',
      },
      {
        target: 'settlement-tabs',
        title: 'Sao kê sàn và đối chiếu ngân hàng',
        body: 'Sao kê sàn để lấy sao kê sàn theo gian hàng; Đối chiếu ngân hàng để gắn mã giao dịch ngân hàng cho tiền rút về.',
      },
    ],
  },
  'shop-listings': {
    key: 'shop-listings',
    version: 1,
    title: 'Liên kết SKU',
    intro: [
      'Mỗi variant trong Commerio liên kết với một SKU trên sàn.',
      'Đã liên kết thì đơn sàn trừ đúng tồn, Commerio đồng bộ tồn và giá lên đúng SKU.',
      'Nhãn ở cột Trạng thái báo SKU lệch tồn, đăng lỗi hay giá chưa đồng bộ; rê chuột vào nhãn để xem lý do.',
    ],
    primaryAction: { label: 'Xem SKU chưa liên kết', target: 'listings-tabs' },
    steps: [
      {
        target: 'listings-tabs',
        title: 'Lọc chưa liên kết',
        body: 'Tab Chưa liên kết liệt kê SKU trên sàn chưa nối với variant nào. Các tab khác lọc variant chưa đăng bán, chờ đồng bộ giá hoặc đăng lỗi.',
      },
      {
        target: 'listings-match',
        title: 'Liên kết SKU',
        body: 'Bấm Liên kết ở dòng variant để chọn SKU sàn. Đổi liên kết SKU đã có đơn hoặc đặt "không quản lý tồn" thì cần CEO duyệt.',
        permission: 'channel.listing.match',
      },
      {
        target: 'listings-push',
        title: 'Đăng bán',
        body: 'Tích các variant rồi bấm nút này để tạo sản phẩm mới trên sàn hoặc đồng bộ giá mới. Sàn trả kết quả sau, trang tự đọc lại.',
        permission: 'channel.listing.manage',
      },
    ],
  },
} satisfies Record<string, PageGuide>;

export type GuideKey = keyof typeof GUIDES;

export const getGuide = (key: string): PageGuide | undefined => (GUIDES as Record<string, PageGuide>)[key];
