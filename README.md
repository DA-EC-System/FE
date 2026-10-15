# Commerio — Frontend

Frontend cho hệ thống **Commerio** (Hệ thống Thương mại Điện tử Doanh nghiệp) — đồ án chuyên ngành HK261.

## Tính năng đã có

- **Đăng nhập** (`/login`) bằng email/mật khẩu hoặc Google, **chọn công ty** (`/select-company`) khi tài khoản thuộc nhiều công ty. Chọn công ty xong BE cấp token gắn với công ty đó.
- **Đăng ký công ty** (`/register`, UC-PI-01): tên, mã số thuế, tài khoản CEO, chọn phân hệ tuỳ chọn (bật Trợ lý AI phải đồng ý gửi dữ liệu tới OpenAI). Đăng ký xong quay về trang đăng nhập, điền sẵn email.
- **Đổi mật khẩu** (`/change-password`, UC-PI-04) từ menu tài khoản. Tài khoản còn dùng mật khẩu trong thư mời bị đưa tới trang này và chặn mọi trang khác (UC-PI-03 bước 7).
- **Hai không gian tách biệt**:
  - `/platform/*` — Quản trị nền tảng (UC-PI-08): tổng quan, danh sách công ty (khoá có lý do / mở khoá), nhật ký nền tảng. Không có dữ liệu kinh doanh (QT-03), không tạo/sửa/xoá công ty (công ty tự đăng ký — UC-PI-01).
  - `/c/:companyId/*` — khu làm việc của công ty. Menu và trang lọc theo phân hệ đang bật và quyền của vai trò trong công ty đó.
- **Kênh bán** — `/c/:companyId/channel/shops`: kết nối / sửa / ngắt / đồng bộ gian hàng (cần bật phân hệ Kênh bán).
- **Phân hệ** — `/c/:companyId/admin/modules` (UC-PI-02, chỉ CEO): bật/tắt 5 phân hệ tuỳ chọn, menu đổi ngay. Bật Trợ lý AI phải đồng ý gửi dữ liệu tới OpenAI; phân hệ đã có dữ liệu thì không tắt được.
- **Nhật ký thao tác** — `/c/:companyId/admin/audit-logs` (UC-PI-07, CEO và Admin): lọc theo người, đối tượng, thao tác, khoảng ngày; bấm một dòng để xem giá trị trước và sau. Chỉ đọc.
- **Sản phẩm** — `/c/:companyId/catalog` (UC-CP-02): tìm theo tên hoặc SKU, lọc danh mục và trạng thái. Tạo sản phẩm: chọn thuộc tính và giá trị để sinh tổ hợp biến thể, bỏ tổ hợp không bán, xem SKU dự kiến. Sửa: đổi tên, mô tả, ảnh; thêm biến thể hoặc ngừng bán biến thể. Danh mục không đổi được sau khi tạo vì SKU đã sinh theo danh mục. Xoá là lưu trữ: SKU giữ lại, không cấp cho sản phẩm khác.
- **Ảnh sản phẩm** — tối đa 9 ảnh JPG/PNG/WebP, mỗi ảnh tối đa 5 MB; ảnh đầu là ảnh đại diện, đổi thứ tự bằng nút ←/→. FE xin vé `POST /files/uploads` rồi PUT thẳng file lên `uploadUrl` (presigned, commerio-backend#14).
- **Danh mục & thuộc tính** — `/c/:companyId/catalog/setup` (UC-CP-01, CEO và Admin): danh mục kèm quy tắc SKU, xem trước SKU mẫu khi gõ; thuộc tính và danh sách giá trị. Danh mục, thuộc tính, giá trị đang có sản phẩm dùng thì không xoá được.
- **Bảng giá** — `/c/:companyId/pricing` (UC-CP-03): mỗi công ty có một bảng giá chuẩn (không xoá được) và tối đa một bảng giá riêng cho mỗi gian hàng (cần phân hệ Kênh bán). Lưới sửa giá từng biến thể: gõ thẳng vào ô, giá sai báo ngay tại ô; ô đã sửa được tô màu, bấm **Lưu** mới gửi lên. Chọn nhiều dòng để sửa hàng loạt: đặt cùng giá, tăng/giảm theo % hoặc số tiền (có làm tròn), chép giá chuẩn, bỏ giá. Bảng theo gian hàng hiện thêm cột giá chuẩn; ô trống nghĩa là lấy giá chuẩn. Người khác vừa lưu thì FE nạp giá mới nhưng giữ thay đổi của mình để kiểm lại. Rời trang khi còn thay đổi chưa lưu sẽ được hỏi lại. Sale chỉ xem.
- **Mock API bằng MSW** — 5 công ty (1 bị khoá), 6 gian hàng, 5 tài khoản; lỗi trả theo Problem Details (RFC 9457).

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

| Email | Mật khẩu | Trường hợp thử |
|---|---|---|
| `platform@commerio.vn` | `platform` | Quản trị nền tảng: chỉ vào `/platform`, mở `/c/...` sẽ nhận 403 |
| `ceo@commerio.vn` | `ceo` | CEO của Công ty ABC (bật/tắt phân hệ, xem nhật ký), Admin của Minh Phát (chưa bật Kênh bán) — thử đổi công ty |
| `admin@commerio.vn` | `admin` | Admin của Công ty ABC: quản lý nhân viên và vai trò, sản phẩm, danh mục và thuộc tính, xem nhật ký; không gán được vai trò kho/tài chính (quyền Admin không có), không bật/tắt phân hệ |
| `sale@commerio.vn` | `sale` | Sale của Công ty ABC: xem gian hàng, không kết nối/sửa/ngắt |
| `kho@commerio.vn` | `kho` | Nhân viên kho: một công ty dùng được, một công ty bị khoá, một nơi tài khoản bị khoá |
| `moi@commerio.vn` | `moi12345` | Mới được mời: đăng nhập xong bị bắt đổi mật khẩu |

Nút **Đăng nhập bằng Google** khi chạy mock mở hộp thoại giả lập: nhập email của một tài khoản ở trên để vào, nhập email khác để xem trường hợp "chưa có tài khoản". Với backend thật, nút tạm khoá đến khi chốt cách làm với BE#7.

Ở **Quản trị → Nhân viên**, thêm nhân viên bằng email mới thì mock in mật khẩu thư mời ra console của trình duyệt (`[mock] Thư mời gửi ...`) để thử đăng nhập lần đầu.

Ở **Quản trị → Phân hệ** của Công ty ABC, Kênh bán (đã có gian hàng) và Hộp thư chung được đánh dấu là đã có dữ liệu nên không tắt được; Báo cáo tắt được.

Ở **Hàng hoá → Sản phẩm** của Công ty ABC, "Áo thun basic cổ tròn" đang có đơn hàng chưa hoàn tất nên không xoá được; "Thắt lưng da bò" không có thuộc tính nên chỉ có một biến thể. Sale chỉ xem, không tạo hay sửa.

Ở **Hàng hoá → Bảng giá**, "Giá Shopee" gắn với gian hàng đang kết nối nên không xoá được; muốn xoá thì ngắt gian hàng trước. Bảng giá chuẩn còn 2 biến thể chưa có giá.

### Quy tắc SKU

Quy tắc của danh mục gồm chữ cố định (A-Z, 0-9, `-`, `_`) và hai token:

- `{SEQ}` hoặc `{SEQ:n}` (bắt buộc, đúng một lần): số thứ tự của danh mục, đệm 0 cho đủ n chữ số, mặc định 4.
- `{VAL}` (tuỳ chọn): mã giá trị thuộc tính của biến thể nối bằng `-`. Mã là giá trị bỏ dấu, viết hoa, chỉ giữ chữ và số, tối đa 6 ký tự (`Xanh navy` → `XANHNA`).

Ví dụ `AO-{SEQ:4}-{VAL}` sinh `AO-0012-DEN-XL`. FE chỉ xem trước bằng `src/utils/sku.ts`; SKU thật do BE sinh và giữ duy nhất trong công ty.

Dữ liệu mock nằm trong bộ nhớ: công ty đăng ký mới, mật khẩu đã đổi, nhân viên, vai trò, phân hệ, sản phẩm, ảnh và nhật ký vừa tạo sẽ mất khi tải lại trang.

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
├─ api/         # axios client (Problem Details) + react-query hooks (auth, platform, identity, companySettings, catalog, pricing, shops)
├─ components/
│  ├─ common/   # PageHeader, ConfirmDialog, ForbiddenPage, PlaceholderPage, NotFoundPage
│  └─ layout/   # AppLayout (Platform/Company), TopBar, Sidebar, navigation
├─ features/
│  ├─ auth/     # LoginPage, RegisterPage, ChangePasswordPage, SelectCompanyPage
│  ├─ identity/ # StaffListPage, RolesPage và các dialog mời, đổi vai trò, tạo/sửa vai trò
│  ├─ platform/ # PlatformOverviewPage, CompanyListPage, LockCompanyDialog, PlatformAuditLogPage
│  ├─ company/  # CompanyHomePage, ModuleSettingsPage, CompanyAuditLogPage
│  ├─ catalog/  # ProductListPage, ProductFormPage (ảnh, bộ dựng biến thể), CatalogSetupPage và các dialog
│  ├─ pricing/  # PricelistListPage, PricelistDetailPage (lưới sửa giá), BulkPriceDialog, PricelistFormDialog
│  └─ channel/  # ShopListPage, ShopFormDialog, shopSchemas
├─ hooks/       # useAuth, usePermission, useDebounce
├─ mocks/       # MSW handlers + in-memory db (catalogData: danh mục, thuộc tính, sản phẩm, file; pricingData: bảng giá)
├─ router/      # createBrowserRouter + guards
├─ stores/      # zustand (phiên + công ty đang chọn)
├─ theme/       # MUI light + dark, ColorModeContext
├─ types/       # auth, company, companySettings, audit, identity, catalog, pricing, shop
└─ utils/       # format, modules, permissions, sku
```

## Tích hợp backend thật

Khi chạy `pnpm dev`, mock (MSW) mặc định bật kể cả khi chưa có `.env`. Khi backend sẵn sàng:

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

- Module Inventory (tồn kho, phiếu nhập/xuất, cảnh báo ngưỡng).
- Module Sales (đơn hàng, lịch sử trạng thái, hồ sơ khách).
- Module Fulfillment, Finance, Payment, Inbox, Assistant, Report.
- Kết nối backend thật, bỏ MSW.
- E2E test với Cypress.

## Bộ màu thương hiệu

Lấy logo làm chuẩn: navy `#0D2143` (viền) và xanh thép `#486A8C` (mặt trên). Định nghĩa ở `src/theme/tokens.ts`, đưa vào theme MUI ở `src/theme/index.ts`.

| Vai trò | Light | Dark | Dùng cho |
|---|---|---|---|
| `primary` | `#486A8C` (brand 500) | `#ABBACA` (brand 300) | nút chính, link, mục đang chọn |
| `secondary` | `#0D2143` (brand 900) | `#E5EAEF` (brand 100) | điểm nhấn đậm |
| `brand.50–900` | thang pha từ hai màu logo | | nền nhạt, viền, banner (`bgcolor: 'brand.100'`) |
| `success / warning / error / info` | `#2E7D5B` / `#A35F0C` / `#C0392B` / `#2B7BB9` | bản sáng hơn | trạng thái |

Quy ước:
- Không viết mã hex trong component; dùng `primary.main`, `brand.700`, `text.secondary`... qua `sx` hoặc `theme.palette`.
- Logo dùng `<BrandLogo />`; trên nền tối truyền `onDark` để có nền trắng phía sau (viền navy không bị chìm).
- Các cặp chữ/nền trong bảng đều đạt WCAG AA (≥ 4.5) ở chế độ sáng.
