import * as React from 'react';

/** Thiết bị không rê chuột được (màn cảm ứng): Tooltip của Radix không mở khi chạm */
const TOUCH_QUERY = '(hover: none)';

export function useIsTouch() {
  return React.useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia?.(TOUCH_QUERY);
      mql?.addEventListener('change', callback);
      return () => mql?.removeEventListener('change', callback);
    },
    () => window.matchMedia?.(TOUCH_QUERY).matches ?? false,
    () => false,
  );
}
