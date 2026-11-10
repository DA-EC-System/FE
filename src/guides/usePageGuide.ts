import { useCallback, useEffect } from 'react';
import { useGuideStore } from './guideStore';
import type { GuideKey } from './registry';

/**
 * Gắn hướng dẫn lần đầu cho trang (FE#132). Truyền `ready: false` khi dữ liệu trang chưa tải xong để pop-up
 * không hiện trên khung xương. Trả về hàm mở pop-up và chạy tour, dùng cho HelpTip (`onTour`).
 */
export function usePageGuide(key: GuideKey, { ready = true }: { ready?: boolean } = {}) {
  const register = useGuideStore((s) => s.register);
  const unregister = useGuideStore((s) => s.unregister);
  const setReady = useGuideStore((s) => s.setReady);
  const openIntro = useGuideStore((s) => s.openIntro);
  const startTour = useGuideStore((s) => s.startTour);

  useEffect(() => {
    register(key);
    return () => unregister(key);
  }, [key, register, unregister]);

  useEffect(() => {
    setReady(key, ready);
  }, [key, ready, setReady]);

  return {
    openGuide: useCallback(() => openIntro(key), [key, openIntro]),
    startTour: useCallback(() => startTour(key), [key, startTour]),
  };
}
