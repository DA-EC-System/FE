import { create } from 'zustand';

export type GuideView = 'intro' | 'tour';

interface GuideStore {
  /** Trang đang xem có hướng dẫn: khoá và đã tải xong dữ liệu chưa */
  page: { key: string; ready: boolean } | null;
  /** Hướng dẫn đang mở; mỗi lần chỉ một */
  open: { key: string; view: GuideView } | null;
  /** Đã hiện trong phiên này (tự hiện, bấm "Để sau"): không tự hiện lại tới khi tải lại trang */
  dismissed: ReadonlySet<string>;
  register: (key: string) => void;
  unregister: (key: string) => void;
  setReady: (key: string, ready: boolean) => void;
  openIntro: (key: string) => void;
  startTour: (key: string) => void;
  close: () => void;
  resetDismissed: () => void;
}

const addKey = (set: ReadonlySet<string>, key: string) => (set.has(key) ? set : new Set(set).add(key));

export const useGuideStore = create<GuideStore>()((set) => ({
  page: null,
  open: null,
  dismissed: new Set(),
  register: (key) => set((s) => (s.page?.key === key ? s : { page: { key, ready: false } })),
  unregister: (key) =>
    set((s) => ({
      page: s.page?.key === key ? null : s.page,
      // Rời trang thì đóng hướng dẫn của trang đó
      open: s.open?.key === key ? null : s.open,
    })),
  setReady: (key, ready) =>
    set((s) => (s.page?.key === key && s.page.ready !== ready ? { page: { key, ready } } : s)),
  openIntro: (key) => set((s) => ({ open: { key, view: 'intro' }, dismissed: addKey(s.dismissed, key) })),
  startTour: (key) => set((s) => ({ open: { key, view: 'tour' }, dismissed: addKey(s.dismissed, key) })),
  close: () => set({ open: null }),
  resetDismissed: () => set({ dismissed: new Set() }),
}));
