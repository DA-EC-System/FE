import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Bảng lưu từng ô (FE#475): không có gì "chưa lưu" để hỏi, nhưng ô đang gửi dở thì giữ người dùng lại đến khi gửi xong rồi
 * tự chuyển trang. Đóng hoặc tải lại tab trình duyệt lúc đang gửi thì trình duyệt hỏi lại (`beforeunload`).
 *
 * Một router chỉ chạy được một `useBlocker`: trang đã có `useLeaveGuard` thì đưa cờ bận vào đó thay vì dùng hook này.
 * Trả `true` khi đang giữ một lần điều hướng chờ lưu xong.
 */
export function useSaveGuard(busy: boolean): boolean {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      busyRef.current &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state === 'blocked' && !busy) blocker.proceed();
  }, [blocker, busy]);
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);
  return blocker.state === 'blocked';
}
