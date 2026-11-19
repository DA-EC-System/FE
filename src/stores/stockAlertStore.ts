import { create } from 'zustand';

/** Một lần SKU chạm ngưỡng nhận qua realtime (FE#318); chỉ giữ trong bộ nhớ của tab, tải lại là mất */
export interface StockNotice {
  id: string;
  variantId: string;
  text: string;
  at: string;
}

/** Số thông báo giữ trong chuông */
const KEEP = 20;

interface StockAlertStore {
  companyId: string | null;
  notices: StockNotice[];
  /** SKU đang mở hộp "Thêm vào đề nghị nhập" từ toast hay chuông */
  requestVariantId: string | null;
  push: (companyId: string, notice: StockNotice) => void;
  openRequest: (variantId: string) => void;
  closeRequest: () => void;
}

export const useStockAlertStore = create<StockAlertStore>((set) => ({
  companyId: null,
  notices: [],
  requestVariantId: null,
  // Đổi công ty thì bỏ thông báo của công ty cũ
  push: (companyId, notice) =>
    set((s) => ({
      companyId,
      notices: [notice, ...(s.companyId === companyId ? s.notices : [])].slice(0, KEEP),
    })),
  openRequest: (requestVariantId) => set({ requestVariantId }),
  closeRequest: () => set({ requestVariantId: null }),
}));

/** Thông báo của công ty đang làm việc */
export const selectNotices = (companyId: string) => (s: StockAlertStore) =>
  s.companyId === companyId ? s.notices : EMPTY;
const EMPTY: StockNotice[] = [];
