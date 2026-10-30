# Kế hoạch khởi tạo FE Commerio

## Context

Project Commerio là Hệ thống Thương mại Điện tử Doanh nghiệp (Enterprise E-commerce Platform), đồ án chuyên ngành của nhóm 3 người. Hệ thống có 15 phân hệ nghiệp vụ (Platform, Identity, Catalog, Inventory, Sales, Channel, Inbox, Finance…), 10 dịch vụ backend. Tài liệu đầy đủ ở `commerio-core.dbml`, `commerio-mo-rong.dbml`, `DE_TAI.md`, `Documents/05-pham-vi-chuc-nang.md`.

Giai đoạn này nhóm xây **khung Admin Dashboard + trang Login có phân quyền**, sử dụng **Vite + React 18 + MUI** (lệch so với đề bài Next.js/Tailwind, đã thống nhất với người dùng). Ưu tiên dùng các template có sẵn của MUI, đặc biệt **MUI X DataGrid** cho các bảng CRUD và AppBar + Drawer cho layout admin.

**Phạm vi trong lần này** (đã chốt với người dùng):
- Trang Login: email + mật khẩu, lưu JWT, có phân quyền theo vai trò.
- Trang Admin Dashboard với layout AppBar + Drawer (sidebar) + content.
- Module **Platform (Company)** — CRUD các công ty (tương ứng bảng `platform.companies`).
- Module **Channel (Shop)** — bên trong một công ty, CRUD các gian hàng kết nối sàn (tương ứng bảng `channel.shops`).
- Routing bảo vệ theo quyền: chưa đăng nhập → redirect `/login`; có role Admin → vào `/admin/*`.

Các phân hệ khác (Catalog, Inventory, Sales…) **chưa làm** trong lần này; chỉ chuẩn bị chỗ (placeholder route + sidebar item) để lần sau ghép nhanh.

---

## Stack & thư viện

| Mục đích | Thư viện | Ghi chú |
|---|---|---|
| Bundler | **Vite 5** + React 18 | Tạo bằng `pnpm create vite@latest` |
| UI framework | **MUI v5** (`@mui/material`, `@mui/icons-material`, `@mui/x-data-grid`, `@mui/x-date-pickers`) | DataGrid cho mọi bảng CRUD |
| Routing | **react-router-dom v6** | Tách riêng, dễ hiểu; cần vì không dùng Next.js |
| HTTP client | **axios** | Interceptor gắn JWT, xử lý 401 |
| Form | **react-hook-form** + **zod** | Validate schema, khớp với backend Zod (nếu sau này có) |
| State server | **@tanstack/react-query v5** | Cache, refetch, optimistic update cho CRUD |
| State client | **zustand** | Nhẹ, dùng cho auth state, sidebar state |
| Theme | MUI `createTheme` | Light + Dark, primary theo brand Commerio (xanh indigo/tím) |
| Đa ngôn ngữ | Bỏ qua lần này | UI tiếng Việt cứng trong code, không cần i18n |

Không dùng: Redux, Tailwind, styled-components (dùng MUI `sx` cho tiện), Next.js.

---

## Cấu trúc thư mục

```
FE/
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ index.html
├─ .env.example                    # VITE_API_BASE_URL
├─ .gitignore
├─ README.md                       # cách chạy dev, build
└─ src/
   ├─ main.tsx                     # mount App, ThemeProvider, RouterProvider, QueryClientProvider
   ├─ App.tsx                      # router root + AuthProvider
   ├─ theme/
   │  └─ index.ts                  # createTheme, light + dark
   ├─ router/
   │  ├─ index.tsx                 # createBrowserRouter
   │  ├─ ProtectedRoute.tsx        # check auth + role
   │  └─ routes.ts                 # path constants
   ├─ api/
   │  ├─ client.ts                 # axios instance + interceptors
   │  ├─ auth.api.ts               # login, logout, me
   │  ├─ companies.api.ts          # CRUD /admin/companies
   │  └─ shops.api.ts              # CRUD /admin/companies/:id/shops
   ├─ hooks/
   │  ├─ useAuth.ts                # zustand store + helper hooks
   │  └─ useDebounce.ts
   ├─ stores/
   │  └─ authStore.ts              # zustand: token, user, role
   ├─ types/
   │  ├─ auth.ts                   # LoginRequest, User, Role
   │  ├─ company.ts                # Company, CompanyStatus
   │  └─ shop.ts                   # Shop, Marketplace, ShopStatus
   ├─ components/
   │  ├─ layout/
   │  │  ├─ AdminLayout.tsx        # AppBar + Drawer + Outlet
   │  │  ├─ TopBar.tsx             # user menu, dark mode toggle
   │  │  └─ Sidebar.tsx            # menu items theo role
   │  ├─ common/
   │  │  ├─ PageHeader.tsx         # tiêu đề + nút thêm mới
   │  │  ├─ DataGridToolbar.tsx    # ô tìm kiếm + nút xoá + export
   │  │  ├─ ConfirmDialog.tsx
   │  │  └─ FormDialog.tsx         # generic dialog cho create/edit
   │  └─ feedback/
   │     └─ ErrorBoundary.tsx
   ├─ features/
   │  ├─ auth/
   │  │  └─ LoginPage.tsx
   │  ├─ platform/                 # CRUD Company
   │  │  ├─ CompanyListPage.tsx
   │  │  ├─ CompanyFormDialog.tsx
   │  │  └─ companySchemas.ts      # zod
   │  └─ channel/                  # CRUD Shop trong Company
   │     ├─ ShopListPage.tsx       # nested route /admin/companies/:companyId/shops
   │     ├─ ShopFormDialog.tsx
   │     └─ shopSchemas.ts
   └─ utils/
      ├─ format.ts                 # formatDate, formatCurrency
      └─ permissions.ts            # can(user, action, resource)
```

---

## Thiết kế chi tiết

### 1. Routing

```ts
// router/index.tsx
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: <ProtectedRoute roles={['admin', 'platform_admin']}><AdminLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="companies" replace /> },
      { path: 'companies', element: <CompanyListPage /> },
      { path: 'companies/:companyId/shops', element: <ShopListPage /> },
      // placeholder, sẽ bổ sung dần
      { path: 'catalog', element: <PlaceholderPage title="Catalog" /> },
      { path: 'inventory', element: <PlaceholderPage title="Inventory" /> },
      { path: 'orders', element: <PlaceholderPage title="Sales / Orders" /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
```

### 2. Auth + Phân quyền

- **Login flow** (`features/auth/LoginPage.tsx`): dùng MUI `TextField` email + password + `Button` submit, validate bằng zod. Gọi `POST /api/auth/login` → lưu `accessToken` vào `localStorage` + `authStore` (zustand) → lưu `user` (gồm `id`, `email`, `fullName`, `roles[]`, `isPlatformAdmin`) → redirect `/admin/companies`.
- **JWT axios interceptor** (`api/client.ts`): gắn `Authorization: Bearer <token>`; nếu response 401 thì clear store + redirect `/login`.
- **`ProtectedRoute`**: nếu `!isAuthenticated` → redirect `/login` với state; nếu `user.roles` không chứa role cho phép → trang 403.
- **Sidebar menu** lọc item theo role (`utils/permissions.ts`).
- **Mock mode**: vì chưa có backend, các API sẽ dùng MSW (Mock Service Worker) — khai báo trong `src/mocks/` với handlers cho auth, companies, shops. Khi backend sẵn sàng chỉ cần tắt MSW. Đây là lý do cần `react-query` ngay từ đầu.

### 3. Admin Layout

- **AppBar** (top): logo "Commerio" + tên công ty đang chọn (sau này) + spacer + nút dark mode + user menu (avatar, tên, đăng xuất).
- **Drawer** (sidebar trái, `variant="permanent"` trên desktop, `temporary` trên mobile): các mục **Công ty**, **Kênh bán** (sẽ là context-aware: chọn công ty thì mới thấy "Kênh bán"), và placeholder cho Catalog/Inventory/Orders (disabled với tooltip "Sắp ra mắt").
- **Content area**: `<Outlet />` của react-router, padding 24px, background `grey.50` (light) / `grey.900` (dark).

### 4. Module Company (Platform)

Trang `/admin/companies`:

- **Header**: tiêu đề "Quản lý Công ty" + nút **+ Thêm công ty** (chỉ `platform_admin` thấy).
- **DataGrid** (MUI X):
  - Cột: Mã, Tên, Mã số thuế, Trạng thái (Chip màu theo `active`/`locked`), Ngày tạo, Hành động.
  - Toolbar: ô tìm kiếm theo tên/mã số thuế (server-side filter), nút Xoá hàng loạt (chọn nhiều dòng), nút Export CSV.
  - Mỗi dòng có nút **Sửa**, **Xoá**, **Kênh bán →** (mở trang ShopList).
- **Form Dialog** (`CompanyFormDialog.tsx`): dùng `react-hook-form` + `zod`. Fields:
  - Tên công ty (required, max 200).
  - Mã số thuế (regex `/^[0-9\-]{10,14}$/`).
  - Trạng thái: Select `active` / `locked`.
  - Lý do khoá (chỉ hiện khi locked).
  - Mô tả (TextField multiline).
- **Optimistic update**: dùng `useMutation` của react-query, `onMutake` cache cũ, `onError` rollback, `onSettled` invalidate.

### 5. Module Shop (Channel)

Trang `/admin/companies/:companyId/shops`:

- **Breadcrumb** trên cùng: "Công ty / Tên công ty / Kênh bán".
- **DataGrid** tương tự nhưng filter thêm theo `platform` (Shopee, Lazada, TikTok Shop, mock) qua Select ngoài grid.
- **Form Dialog**: Tên gian hàng, Nền tảng (Select), External shop ID, Vùng (text), Trạng thái (connected / expiring / deauthorized / disconnected).
- Cột **Hành động** thêm nút **Đồng bộ** (icon refresh) — gọi `POST /shops/:id/sync` (mock).

### 6. Theme

```ts
// theme/index.ts
import { createTheme } from '@mui/material/styles';

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#4F46E5' },   // indigo
    secondary: { main: '#7C3AED' }, // violet
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 600 },
  },
});
export const darkTheme = createTheme({ ... palette mode: 'dark' ... });
```

Toggle dark mode lưu vào `localStorage` qua zustand.

### 7. Mock API (MSW)

Vì backend chưa sẵn sàng, khai báo:

```
src/mocks/
├─ browser.ts
├─ handlers.ts
└─ db.ts                          # in-memory db khởi tạo 5 công ty, 10 shop
```

- `POST /api/auth/login` → kiểm tra email `admin@commerio.vn` / password `admin` → trả `{ accessToken, user }`. Token giả dạng JWT, backend sẽ thay sau.
- `GET/POST/PATCH/DELETE /api/admin/companies` — full CRUD.
- `GET/POST/PATCH/DELETE /api/admin/companies/:id/shops` — full CRUD.
- Tất cả có delay 200–500ms để thấy được loading state.

Cờ `VITE_USE_MOCKS=true` (mặc định trong `.env.example`) bật MSW.

### 8. Phân quyền (RBAC) cho UI

```ts
// utils/permissions.ts
type Action = 'view' | 'create' | 'update' | 'delete' | 'sync';

export function can(
  user: User | null,
  action: Action,
  resource: 'company' | 'shop',
): boolean {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;            // quản trị nền tảng
  if (resource === 'company') return false;          // chỉ platform_admin
  if (user.roles.includes('admin')) return true;     // admin công ty
  return user.permissions?.includes(`${resource}:${action}`) ?? false;
}
```

Mỗi nút trong UI sẽ kiểm `can(...)` trước khi render.

---

## Các file quan trọng sẽ tạo

- `FE/package.json` — khai báo deps, scripts (`dev`, `build`, `preview`, `lint`).
- `FE/vite.config.ts` — alias `@/` → `src/`, port 5173, proxy `/api` nếu có backend.
- `FE/tsconfig.json` + `FE/tsconfig.node.json` — strict mode.
- `FE/src/main.tsx` + `FE/src/App.tsx` — entry, providers (Theme, QueryClient, Router, Auth).
- `FE/src/router/index.tsx` + `FE/src/router/ProtectedRoute.tsx`.
- `FE/src/api/{client,auth,companies,shops}.api.ts` — axios + react-query hooks (`useCompanies`, `useCreateCompany`, …).
- `FE/src/stores/authStore.ts` — zustand.
- `FE/src/theme/index.ts`.
- `FE/src/components/layout/{AdminLayout,TopBar,Sidebar}.tsx`.
- `FE/src/components/common/{PageHeader,ConfirmDialog,FormDialog}.tsx`.
- `FE/src/features/auth/LoginPage.tsx`.
- `FE/src/features/platform/{CompanyListPage,CompanyFormDialog,companySchemas}.{tsx,ts}`.
- `FE/src/features/channel/{ShopListPage,ShopFormDialog,shopSchemas}.{tsx,ts}`.
- `FE/src/mocks/{browser,handlers,db}.ts` — MSW.
- `FE/src/types/{auth,company,shop}.ts`.
- `FE/src/utils/{format,permissions}.ts`.
- `FE/.env.example` — `VITE_API_BASE_URL=`, `VITE_USE_MOCKS=true`.
- `FE/.gitignore` — `node_modules`, `dist`, `.env`.
- `FE/README.md` — hướng dẫn `pnpm install && pnpm dev`.

---

## Verification (cách kiểm tra end-to-end)

1. **Cài và chạy**:
   ```bash
   cd FE
   pnpm install
   pnpm dev
   ```
   Mở `http://localhost:5173`.

2. **Flow kiểm tra**:
   - Truy cập `/admin/companies` khi chưa login → tự redirect `/login`.
   - Login với `admin@commerio.vn` / `admin` → vào `/admin/companies`, thấy 5 công ty mẫu.
   - Bấm **+ Thêm công ty**, điền form, lưu → dòng mới xuất hiện ở đầu danh sách.
   - Bấm **Sửa** một dòng → dialog mở với dữ liệu sẵn, sửa tên → lưu → dòng cập nhật.
   - Chọn 2 dòng + bấm **Xoá** → confirm dialog → 2 dòng biến mất.
   - Bấm **Kênh bán →** trên một công ty → sang trang ShopList, breadcrumb đúng.
   - Thêm / sửa / xoá shop tương tự.
   - Đổi dark mode ở AppBar → theme đổi, lưu qua refresh.
   - Đăng xuất ở user menu → về `/login`.
   - Login với `sale@commerio.vn` / `sale` (mock user không phải admin) → vào được `/admin` nhưng nút **+ Thêm công ty** bị ẩn, **Sửa/Xoá** trên từng dòng cũng ẩn (test phân quyền UI).

3. **Build**:
   ```bash
   pnpm build
   pnpm preview
   ```
   Vẫn chạy đúng, không có lỗi TS, không có warning của MUI.

4. **Kiểm tra chất lượng**:
   - `pnpm tsc --noEmit` → 0 lỗi.
   - Mở DevTools Console → không lỗi đỏ, không warning React.
   - Lighthouse score Performance > 90, Accessibility > 90 (vì MUI mặc định đã khá tốt).

---

## Out of scope (làm sau)

- Catalog (sản phẩm, biến thể, danh mục), Inventory (tồn kho, phiếu nhập/xuất), Sales (đơn hàng), Fulfillment, Finance, Payment, Inbox, Assistant, Report.
- Kết nối backend thật (sau khi BE sẵn sàng, tắt MSW, đổi `VITE_USE_MOCKS=false`).
- Đa ngôn ngữ, đa công ty chuyển đổi trong cùng phiên.

---

## Lưu ý cho người dùng

- Stack lệch so với đề bài (Next.js 16 + Tailwind). Khi viết báo cáo Phần 3 sẽ cần giải thích: *Vite + React 18 + MUI* dùng vì dashboard SPA nặng tương tác nhiều, MUI có DataGrid/DatePicker sẵn cho CRUD nặng, đẩy nhanh tiến độ; có thể migrate sang Next.js + MUI sau nếu cần SSR/SEO (nhưng dashboard nội bộ không cần SEO).
- Phase này chưa cần `dist/` — không commit; sẽ setup `.gitignore` đúng.
- Khi có backend, chỉ cần thay base URL và tắt MSW, không phải sửa logic component.
