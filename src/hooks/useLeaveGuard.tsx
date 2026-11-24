import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface LeaveGuardOptions {
  /** Câu trong hộp hỏi: phần nào sẽ mất */
  message: string;
  /** Đổi query (tab, bộ lọc) có tính là rời trang không; mặc định chỉ tính đổi đường dẫn */
  includeSearch?: boolean;
}

/**
 * Hỏi lại khi rời trang mà còn thay đổi chưa lưu (cùng cách BulkEditPage, StockDocPage: FE#319; dùng lại cho FE#459):
 * chặn điều hướng trong app bằng `useBlocker`, đóng/tải lại tab trình duyệt bằng `beforeunload`.
 * `allowNext()` cho qua lần điều hướng kế tiếp do chính trang gọi sau khi lưu xong (state còn cũ trong lượt render đó).
 */
export function useLeaveGuard(dirty: boolean, { message, includeSearch = false }: LeaveGuardOptions) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const moved =
      currentLocation.pathname !== nextLocation.pathname || (includeSearch && currentLocation.search !== nextLocation.search);
    if (!moved) return false;
    if (bypass.current) {
      bypass.current = false;
      return false;
    }
    return dirtyRef.current;
  });
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const allowNext = useCallback(() => {
    bypass.current = true;
  }, []);

  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Rời trang khi chưa lưu?"
      message={message}
      confirmLabel="Rời trang"
      cancelLabel="Ở lại"
      destructive
      onConfirm={() => blocker.proceed?.()}
      onClose={() => blocker.reset?.()}
    />
  );
  return { dialog, allowNext };
}
