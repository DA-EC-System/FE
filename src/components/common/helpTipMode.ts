import type { ReactNode } from 'react';

export type HelpTipMode = 'tooltip' | 'popover';

/** Nội dung dài hơn mức này thì cho vào Popover dù chỉ có hai câu */
export const HELP_TOOLTIP_MAX_CHARS = 160;

/** Đếm câu theo dấu kết câu; phần cuối không có dấu chấm vẫn tính một câu */
export function countSentences(text: string): number {
  const parts = text
    .trim()
    .split(/[.!?…]+(?:\s+|$)/)
    .filter((s) => s.trim().length > 0);
  return parts.length;
}

/**
 * Chọn cách hiện gợi ý (FE#131):
 * - chuỗi ngắn (≤ 2 câu, ≤ 160 ký tự), không link: Tooltip, mở khi rê chuột hoặc focus bằng bàn phím;
 * - dài hơn, không phải chuỗi (có thể chứa link) hoặc có link xem hướng dẫn: Popover bấm mở;
 * - màn cảm ứng: luôn Popover vì Tooltip không mở khi chạm.
 */
export function helpTipMode(content: ReactNode, opts: { touch?: boolean; hasLink?: boolean } = {}): HelpTipMode {
  if (opts.touch || opts.hasLink) return 'popover';
  if (typeof content !== 'string') return 'popover';
  if (content.length > HELP_TOOLTIP_MAX_CHARS) return 'popover';
  return countSentences(content) <= 2 ? 'tooltip' : 'popover';
}

/** Nhãn đọc cho nút "?"; có chủ đề thì kèm vào để phân biệt nhiều nút trên một trang */
export function helpTipLabel(topic?: ReactNode): string {
  return typeof topic === 'string' && topic.trim() ? `Giải thích: ${topic.trim()}` : 'Giải thích';
}
