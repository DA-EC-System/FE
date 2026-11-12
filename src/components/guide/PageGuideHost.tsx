import { useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useGuideStore } from '@/guides/guideStore';
import { getGuide } from '@/guides/registry';
import { findGuideTarget } from '@/guides/steps';
import { guidesAutoOff, hasSeen, markSeen } from '@/guides/storage';
import { GuideTour } from './GuideTour';
import { PageGuideDialog } from './PageGuideDialog';

/** Chờ thêm chút sau khi dữ liệu tải xong để trang dựng xong, tránh pop-up nháy lên trước nội dung */
const SHOW_DELAY_MS = 400;
/** Đang có hộp thoại, menu hay popover khác mở thì chưa hiện */
const BUSY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Làm nổi phần tử hành động chính: cuộn tới, focus, viền nhấp nháy vài giây */
function highlight(target: string) {
  const el = findGuideTarget(target);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  const focusable = el.matches('a, button, input, select, textarea, [tabindex]')
    ? el
    : el.querySelector<HTMLElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  focusable?.focus({ preventScroll: true });
  el.setAttribute('data-guide-pulse', '');
  window.setTimeout(() => el.removeAttribute('data-guide-pulse'), 2400);
}

/**
 * Hiện hướng dẫn của trang đang xem (đặt một lần trong AppLayout). Tự mở pop-up khi trang báo đã tải xong,
 * người dùng chưa xem bản này và không có hộp thoại khác đang mở. Màn hình < 768px chỉ hiện pop-up tóm tắt.
 */
export function PageGuideHost() {
  const { account } = useAuth();
  const userId = account?.id ?? '';
  const isMobile = useIsMobile();
  const page = useGuideStore((s) => s.page);
  const open = useGuideStore((s) => s.open);
  const dismissed = useGuideStore((s) => s.dismissed);
  const openIntro = useGuideStore((s) => s.openIntro);
  const startTour = useGuideStore((s) => s.startTour);
  const close = useGuideStore((s) => s.close);

  const pageKey = page?.ready ? page.key : null;
  const guide = open ? getGuide(open.key) : undefined;

  useEffect(() => {
    if (!pageKey || open || !userId || dismissed.has(pageKey)) return;
    const g = getGuide(pageKey);
    if (!g || guidesAutoOff() || hasSeen(userId, g.key, g.version)) return;
    // Hỏi lại tới khi không còn hộp thoại khác che
    const timer = window.setInterval(() => {
      if (document.querySelector(BUSY_SELECTOR)) return;
      window.clearInterval(timer);
      openIntro(pageKey);
    }, SHOW_DELAY_MS);
    return () => window.clearInterval(timer);
  }, [pageKey, open, userId, dismissed, openIntro]);

  const finish = useCallback(
    (seen: boolean) => {
      if (seen && guide && userId) markSeen(userId, guide.key, guide.version);
      close();
    },
    [guide, userId, close],
  );

  if (!open || !guide) return null;

  if (open.view === 'tour' && !isMobile) {
    // Đi hết hoặc bỏ qua tour đều coi là đã xem
    return <GuideTour guide={guide} onClose={() => finish(true)} />;
  }

  return (
    <PageGuideDialog
      key={guide.key}
      guide={guide}
      compact={isMobile}
      onClose={finish}
      onTour={(dontShow) => {
        if (dontShow && userId) markSeen(userId, guide.key, guide.version);
        startTour(guide.key);
      }}
      onPrimary={(dontShow) => {
        finish(dontShow);
        // Đợi hộp thoại đóng và trả focus xong rồi mới focus phần tử chính
        if (guide.primaryAction) window.setTimeout(() => highlight(guide.primaryAction!.target), 250);
      }}
    />
  );
}
