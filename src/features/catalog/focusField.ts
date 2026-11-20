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
