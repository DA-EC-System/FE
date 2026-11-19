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

/** Nút "Đối soát ngay" (FE#13 AC-S4): BE chưa có `POST /finance/settlements/run` nên chỉ hiện với mock, hoặc khi bật cờ */
export const SETTLEMENT_RUN: boolean = USE_MOCKS || import.meta.env.VITE_SETTLEMENT_RUN === 'true';

/**
 * Dòng sản phẩm mới của đề nghị nhập thuộc một sản phẩm cha (cha có sẵn, gộp dòng cùng cha mới): BE `main` chưa nhận
 * `parentId/parentName/optionValues` (commerio-backend#243) nên chỉ bật với mock, hoặc khi bật cờ. Tắt thì mỗi dòng là
 * một sản phẩm riêng một SKU, tên ghép tên sản phẩm và giá trị phân loại.
 */
export const NEW_PRODUCT_PARENT: boolean = USE_MOCKS || import.meta.env.VITE_NEW_PRODUCT_PARENT === 'true';
