# Commerio Admin — Frontend

Frontend cho hệ thống **Commerio** (Hệ thống Thương mại Điện tử Doanh nghiệp) — đồ án chuyên ngành HK261.

## Tính năng đã có

- **Trang đăng nhập** (`/login`) với email + mật khẩu, có sẵn 3 tài khoản demo.
- **Phân quyền theo vai trò** (RBAC) — `Platform Admin`, `CEO`, `Admin`, `Sale`…
- **Admin Layout** với AppBar (top) + Drawer (sidebar) + Dark mode.
- **CRUD Công ty (Platform)** — `/admin/companies`
  - Tìm kiếm, lọc, xoá hàng loạt
  - Tạo / sửa / xoá công ty (validate mã số thuế, lý do khoá…)
  - Vào trang Kênh bán của từng công ty
- **CRUD Kênh bán (Channel / Shop)** — `/admin/companies/:companyId/shops`
  - Tạo / sửa / xoá / đồng bộ gian hàng kết nối sàn
  - Lọc theo nền tảng (Shopee, Lazada, TikTok Shop, mock)
- **Mock API bằng MSW** — dữ liệu mẫu sẵn 5 công ty, 7 gian hàng, 3 tài khoản.

## Stack

| Mục đích | Thư viện |
|---|---|
| Bundler | Vite 5 |
| Framework | React 18 + TypeScript |
| UI | MUI v6 + MUI X DataGrid + Inter font |
| Routing | react-router-dom v6 |
| State server | TanStack Query v5 |
| State client | Zustand (auth) |
| Form | react-hook-form + zod |
| HTTP | axios (interceptor JWT, 401 redirect) |
| Mock API | MSW v2 |

## Yêu cầu môi trường

- Node.js ≥ 20
- pnpm ≥ 9 (hoặc npm/yarn tương đương)

## Cài đặt & chạy

```bash
# cài dependencies
pnpm install

# (Một số máy cần) cấp quyền chạy build scripts cho esbuild + msw
# pnpm approve-builds   # → chọn esbuild và msw

# chạy dev server
pnpm dev
# → mở http://localhost:5173
```

> Nếu `pnpm install` báo `ERR_PNPM_IGNORED_BUILDS` cho esbuild/msw, tạo file
> `pnpm-workspace.yaml` ở thư mục gốc với nội dung:
>
> ```yaml
> onlyBuiltDependencies:
>   - esbuild
>   - msw
> ```
>
> Rồi chạy lại `pnpm install`.

### Tài khoản demo (mock)

| Vai trò | Email | Mật khẩu | Quyền |
|---|---|---|---|
| Platform Admin | `admin@commerio.vn` | `admin` | CRUD mọi công ty + mọi gian hàng |
| CEO | `ceo@commerio.vn` | `ceo` | Xem công ty, CRUD gian hàng, không tạo công ty |
| Sale | `sale@commerio.vn` | `sale` | Xem, không sửa/xoá (test phân quyền UI) |

Bấm vào từng thẻ tài khoản ở trang login để tự động điền.

## Scripts

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy dev server (mặc định `http://localhost:5173`) |
| `pnpm build` | Build production ra `dist/` |
| `pnpm preview` | Xem thử bản build |
| `pnpm typecheck` | Chỉ chạy TypeScript check, không build |

## Cấu trúc thư mục

```
src/
├─ api/         # axios client + react-query hooks (companies, shops, auth)
├─ components/
│  ├─ common/   # PageHeader, ConfirmDialog, PlaceholderPage, NotFoundPage
│  └─ layout/   # AdminLayout, TopBar, Sidebar
├─ features/
│  ├─ auth/     # LoginPage
│  ├─ platform/ # CompanyListPage, CompanyFormDialog, companySchemas
│  └─ channel/  # ShopListPage, ShopFormDialog, shopSchemas
├─ hooks/       # useAuth
├─ mocks/       # MSW handlers + in-memory db
├─ router/      # createBrowserRouter + ProtectedRoute
├─ stores/      # zustand (auth)
├─ theme/       # MUI light + dark, ColorModeContext
├─ types/       # auth, company, shop
└─ utils/       # format, permissions (RBAC)
```

## Tích hợp backend thật

Mặc định `VITE_USE_MOCKS=true` (xem `.env`). Khi backend sẵn sàng:

1. Sửa `.env`:
   ```
   VITE_API_BASE_URL=https://api.commerio.example.com
   VITE_USE_MOCKS=false
   ```
2. Backend cần expose các endpoint đúng shape mà MSW handlers đang mô phỏng
   (xem `src/mocks/handlers.ts` — toàn bộ request/response đã được khai báo
   chuẩn REST).
3. Backend trả về JWT thật ở `/api/auth/login`; axios interceptor sẽ tự gắn
   vào header `Authorization: Bearer <token>` cho các request sau.

## Lưu ý so với đề bài

Đề bài ghi FE dùng Next.js 16 + React 19 + TailwindCSS v4. Project này dùng
**Vite + React 18 + MUI** thay thế vì:
- Dashboard là SPA nội bộ, không cần SSR/SEO.
- MUI có sẵn DataGrid, DatePicker, Form components phù hợp CRUD nặng.
- React 18 ổn định hơn React 19 với hệ sinh thái MUI tại thời điểm hiện tại.
- Tailwind không cần thiết khi đã có MUI design tokens.

Có thể migrate sang Next.js + MUI sau nếu cần SSR.

## Lộ trình tiếp theo

- Module Catalog (sản phẩm, biến thể, danh mục, thuộc tính).
- Module Inventory (tồn kho, phiếu nhập/xuất, cảnh báo ngưỡng).
- Module Sales (đơn hàng, lịch sử trạng thái, hồ sơ khách).
- Module Fulfillment, Finance, Payment, Inbox, Assistant, Report.
- Kết nối backend thật, bỏ MSW.
- E2E test với Cypress.
