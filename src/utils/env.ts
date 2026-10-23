/**
 * Bật mock API (MSW). Khi chạy dev, mock mặc định bật nếu chưa tạo `.env`;
 * muốn gọi backend thật thì đặt VITE_USE_MOCKS=false. Bản build chỉ bật khi ghi rõ `true`.
 */
export const USE_MOCKS = import.meta.env.DEV
  ? import.meta.env.VITE_USE_MOCKS !== 'false'
  : import.meta.env.VITE_USE_MOCKS === 'true';

/**
 * Đường dẫn gốc của app (Vite `base`, đặt bằng BASE_PATH lúc build). Staging có hai bản: `/` gọi backend thật,
 * `/mock/` chạy MSW. Đường dẫn tự ghép (chuyển trang ngoài router, URL trong mock) phải đi qua `appPath`.
 */
export const BASE_PATH: string = import.meta.env.BASE_URL;
export const appPath = (path: string): string => BASE_PATH + path.replace(/^\//, '');

/** Client ID OAuth của Google Identity Services (docs/21 A6). Trống thì khoá nút Google khi gọi BE thật. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
