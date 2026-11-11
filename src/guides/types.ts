import type { ModuleKey } from '@/utils/modules';

/** Một bước của tour: trỏ vào phần tử có `data-guide="<target>"` */
export interface GuideStep {
  target: string;
  title: string;
  body: string;
  /** Thiếu quyền thì bỏ bước (phần tử thường cũng không hiện) */
  permission?: string | readonly string[];
  /** Phân hệ tắt thì bỏ bước */
  module?: ModuleKey;
}

/** Hướng dẫn lần đầu của một trang (FE#132). Tăng `version` khi nội dung đổi nhiều để hiện lại cho người đã xem. */
export interface PageGuide {
  key: string;
  version: number;
  title: string;
  /** 2–4 ý ngắn */
  intro: string[];
  /** Nút làm nổi phần tử hành động chính của trang */
  primaryAction?: { label: string; target: string };
  steps: GuideStep[];
}
