import type { PageGuide } from './types';

/**
 * Nội dung hướng dẫn theo trang, mỗi trang một khoá. Trang gọi `usePageGuide('<khoá>')`, phần tử được trỏ
 * đánh dấu `data-guide="<target>"`. Nội dung từng phân hệ viết ở issue riêng; ở đây có mẫu cho Tổng quan.
 */
export const GUIDES = {
  'company-home': {
    key: 'company-home',
    version: 1,
    title: 'Chào mừng tới trang Tổng quan',
    intro: [
      'Việc cần làm gom từ mọi phân hệ bạn có quyền, xếp theo hạn.',
      'Bấm vào một việc để mở đúng chứng từ cần xử lý.',
      'Xem vai trò của bạn và các phân hệ công ty đang bật.',
    ],
    primaryAction: { label: 'Xem việc cần làm', target: 'home-tasks' },
    steps: [
      {
        target: 'home-tasks',
        title: 'Việc cần làm',
        body: 'Việc quá hạn đứng đầu, rồi tới việc sắp tới hạn. Bấm tên chứng từ để mở và xử lý.',
      },
      {
        target: 'home-roles',
        title: 'Vai trò của bạn',
        body: 'Vai trò quyết định menu và nút bạn thấy. Cần thêm quyền thì nhờ CEO hoặc người quản lý nhân sự.',
      },
      {
        target: 'home-modules',
        title: 'Phân hệ tuỳ chọn',
        body: 'Phân hệ CEO đã bật cho công ty. Phân hệ chưa bật thì không có trong menu.',
      },
      {
        target: 'guide-help',
        title: 'Xem lại hướng dẫn',
        body: 'Bấm nút "?" này bất cứ lúc nào để mở lại hướng dẫn của trang đang xem.',
      },
    ],
  },
} satisfies Record<string, PageGuide>;

export type GuideKey = keyof typeof GUIDES;

export const getGuide = (key: string): PageGuide | undefined => (GUIDES as Record<string, PageGuide>)[key];
