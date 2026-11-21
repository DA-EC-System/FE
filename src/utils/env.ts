/**
 * Đường dẫn gốc của app (Vite `base`, đặt bằng BASE_PATH lúc build). Đường dẫn tự ghép (chuyển trang ngoài router)
 * phải đi qua `appPath`.
 */
export const BASE_PATH: string = import.meta.env.BASE_URL;
export const appPath = (path: string): string => BASE_PATH + path.replace(/^\//, '');

/** Client ID OAuth của Google Identity Services (docs/21 A6). Trống thì khoá nút Google. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Nút "Đối soát ngay" (FE#13 AC-S4): BE chưa có `POST /finance/settlements/run` nên chỉ hiện khi bật cờ */
export const SETTLEMENT_RUN: boolean = import.meta.env.VITE_SETTLEMENT_RUN === 'true';

