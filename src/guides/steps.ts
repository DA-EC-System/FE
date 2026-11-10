import type { CompanyContext } from '@/types/auth';
import { hasAllPermissions, isModuleEnabled } from '@/utils/permissions';
import type { GuideStep } from './types';

export const guideSelector = (target: string) => `[data-guide="${CSS.escape(target)}"]`;

/** Phần tử đang hiện trên trang (có kích thước), không tính phần tử bị ẩn */
export function findGuideTarget(target: string, root: ParentNode = document): HTMLElement | null {
  const els = root.querySelectorAll<HTMLElement>(guideSelector(target));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return el;
  }
  return null;
}

/**
 * Bước chạy được: đủ quyền, phân hệ đang bật và tìm thấy phần tử trên trang.
 * Thiếu phần tử (danh sách rỗng, nút bị ẩn) thì bỏ bước thay vì trỏ vào chỗ trống.
 */
export function visibleSteps(
  steps: readonly GuideStep[],
  context: CompanyContext | null,
  find: (target: string) => Element | null = findGuideTarget,
): GuideStep[] {
  return steps.filter(
    (s) =>
      (!s.permission || hasAllPermissions(context, s.permission)) &&
      (!s.module || isModuleEnabled(context, s.module)) &&
      find(s.target) !== null,
  );
}
