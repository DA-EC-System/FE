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
} satisfies Record<string, PageGuide>;

export type GuideKey = keyof typeof GUIDES;

export const getGuide = (key: string): PageGuide | undefined => (GUIDES as Record<string, PageGuide>)[key];
