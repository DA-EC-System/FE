import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface LeaveGuardOptions {
  /** Câu trong hộp hỏi: phần nào sẽ mất */
  message: string;
  /** Đổi query (tab, bộ lọc) có tính là rời trang không; mặc định chỉ tính đổi đường dẫn */
  includeSearch?: boolean;
  /**
   * Bảng lưu từng ô đang gửi dở (FE#475): không hỏi, giữ người dùng lại tới khi gửi xong rồi tự chuyển trang, như
   * `useSaveGuard`. Một router chỉ chạy được một `useBlocker` nên trang đã có hook này đưa cờ bận vào đây
   */
  busy?: boolean;
}

/**
 * Hỏi lại khi rời trang mà còn thay đổi chưa lưu (cùng cách BulkEditPage, StockDocPage: FE#319; dùng lại cho FE#459):
 * chặn điều hướng trong app bằng `useBlocker`, đóng/tải lại tab trình duyệt bằng `beforeunload`.
 * `allowNext()` cho qua lần điều hướng kế tiếp do chính trang gọi sau khi lưu xong (state còn cũ trong lượt render đó).
 * `waiting`: đang giữ một lần điều hướng chờ bảng lưu xong.
 */
export function useLeaveGuard(dirty: boolean, { message, includeSearch = false, busy = false }: LeaveGuardOptions) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const bypass = useRef(false);
  // Đã bấm "Rời trang" trong hộp hỏi nhưng bảng còn đang lưu: chờ lưu xong rồi đi
  const [confirmed, setConfirmed] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const moved =
      currentLocation.pathname !== nextLocation.pathname || (includeSearch && currentLocation.search !== nextLocation.search);
    if (!moved) return false;
    if (bypass.current) {
      bypass.current = false;
      return false;
    }
    return dirtyRef.current || busyRef.current;
  });
  const blocked = blocker.state === 'blocked';
  useEffect(() => {
    if (blocker.state === 'blocked' && !busy && (confirmed || !dirty)) blocker.proceed();
  }, [blocker, busy, dirty, confirmed]);
  useEffect(() => {
    if (!blocked) setConfirmed(false);
  }, [blocked]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, busy]);
  const allowNext = useCallback(() => {
    bypass.current = true;
  }, []);

  const dialog = (
    <ConfirmDialog
      open={blocked && dirty && !confirmed}
      title="Rời trang khi chưa lưu?"
      message={message}
      confirmLabel="Rời trang"
      cancelLabel="Ở lại"
      destructive
      onConfirm={() => {
        if (busyRef.current) setConfirmed(true);
        else blocker.proceed?.();
      }}
      onClose={() => blocker.reset?.()}
    />
  );
  return { dialog, allowNext, waiting: blocked && busy && (confirmed || !dirty) };
}
