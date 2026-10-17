/**
 * Bật mock API (MSW). Khi chạy dev, mock mặc định bật nếu chưa tạo `.env`;
 * muốn gọi backend thật thì đặt VITE_USE_MOCKS=false. Bản build chỉ bật khi ghi rõ `true`.
 */
export const USE_MOCKS = import.meta.env.DEV
  ? import.meta.env.VITE_USE_MOCKS !== 'false'
  : import.meta.env.VITE_USE_MOCKS === 'true';

/** Client ID OAuth của Google Identity Services (docs/21 A6). Trống thì khoá nút Google khi gọi BE thật. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
