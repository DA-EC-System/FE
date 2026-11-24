/** Cuộn tới ô, focus phần nhập được đầu tiên và nháy viền (tắt nháy khi người dùng giảm chuyển động) */
export function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  const target = el.matches('input,textarea,button,[tabindex]')
    ? el
    : el.querySelector<HTMLElement>('input,textarea,button,[role=combobox],[tabindex]');
  (target ?? el).focus({ preventScroll: true });
  el.classList.remove('field-flash');
  void el.offsetWidth;
  el.classList.add('field-flash');
  window.setTimeout(() => el.classList.remove('field-flash'), 1300);
}

/**
 * Chờ ô xuất hiện (tab sàn còn đang tải) rồi `focusField`; quá `timeoutMs` thì thôi. Trả hàm huỷ để effect dọn khi đổi
 * trang. Dùng cho `?focus=` của trang sản phẩm (FE#462: nút sửa của lỗi đẩy mở đúng ô)
 */
export function focusWhenReady(id: string, onDone?: (found: boolean) => void, timeoutMs = 8000): () => void {
  let stopped = false;
  const started = Date.now();
  let timer = 0;
  const tick = () => {
    if (stopped) return;
    if (document.getElementById(id)) {
      focusField(id);
      onDone?.(true);
      return;
    }
    if (Date.now() - started >= timeoutMs) {
      onDone?.(false);
      return;
    }
    timer = window.setTimeout(tick, 150);
  };
  timer = window.setTimeout(tick, 0);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
