import { create } from 'zustand';
import type { RealtimeStatus } from '@/api/realtime';

/** Trạng thái kênh realtime cho chấm trên Header (FE#81). `off`: không ở trong công ty, hoặc đã dừng. */
interface RealtimeStore {
  status: RealtimeStatus;
  setStatus: (status: RealtimeStatus) => void;
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  status: 'off',
  setStatus: (status) => set({ status }),
}));
