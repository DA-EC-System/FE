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
- **Kho** — `/c/:companyId/inventory` (UC-IN-01, 02, 03), ba tab:
  - *Tồn kho*: tồn thực, đang giữ cho đơn, khả dụng của từng biến thể; tìm theo tên hoặc SKU, lọc danh mục, lọc dưới ngưỡng (bấm thẻ "Dưới ngưỡng tồn" cũng lọc). Bấm biểu tượng lịch sử để xem biến động theo chứng từ. CEO và Admin đặt ngưỡng ngay trên dòng. Giá vốn bình quân và giá trị tồn chỉ hiện với CEO.
  - *Phiếu nhập/xuất*: lập phiếu nháp, thêm biến thể bằng ô tìm, sửa số lượng (và giá nhập với phiếu nhập), rồi ghi sổ; tồn chỉ đổi khi ghi sổ. Phiếu xuất tay bắt buộc ghi lý do và không vượt số khả dụng. Phiếu đã ghi sổ hoặc đã huỷ chỉ xem.
  - *Nhập hoàn* (Nhân viên kho, CEO): đơn giao không thành công; nhập số thực nhận, khác số đã xuất thì ghi lý do. Mỗi đơn nhập hoàn một lần.
- **Mock API bằng MSW** — 5 công ty (1 bị khoá), 6 gian hàng, 5 tài khoản; lỗi trả theo Problem Details (RFC 9457).

## Stack

| Mục đích | Thư viện |
|---|---|
| Bundler | Vite 5 |
| Framework | React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) + lucide, theo bộ [shadcn-admin](https://github.com/satnaing/shadcn-admin); font Inter. Các trang chưa chuyển vẫn dùng MUI v6 + MUI X DataGrid |
| Routing | react-router-dom v6 |
| State server | TanStack Query v5 |
| State client | Zustand (auth) |
| Form | react-hook-form + zod 4 |
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
| `admin@commerio.vn` | `admin` | Admin của Công ty ABC: quản lý nhân viên và vai trò, sản phẩm, danh mục và thuộc tính, xem tồn và đặt ngưỡng, xem nhật ký; không gán được vai trò kho/tài chính (quyền Admin không có), không bật/tắt phân hệ |
| `sale@commerio.vn` | `sale` | Sale của Công ty ABC: xem gian hàng, không kết nối/sửa/ngắt |
| `kho@commerio.vn` | `kho` | Nhân viên kho: một công ty dùng được, một công ty bị khoá, một nơi tài khoản bị khoá |
| `moi@commerio.vn` | `moi12345` | Mới được mời: đăng nhập xong bị bắt đổi mật khẩu |

Nút **Đăng nhập bằng Google** khi chạy mock mở hộp thoại giả lập: nhập email của một tài khoản ở trên để vào, nhập email khác để xem trường hợp "chưa có tài khoản". Với backend thật, nút tạm khoá đến khi chốt cách làm với BE#7.

Ở **Quản trị → Nhân viên**, thêm nhân viên bằng email mới thì mock in mật khẩu thư mời ra console của trình duyệt (`[mock] Thư mời gửi ...`) để thử đăng nhập lần đầu.

Ở **Quản trị → Phân hệ** của Công ty ABC, Kênh bán (đã có gian hàng) và Hộp thư chung được đánh dấu là đã có dữ liệu nên không tắt được; Báo cáo tắt được.

Ở **Hàng hoá → Sản phẩm** của Công ty ABC, "Áo thun basic cổ tròn" đang có đơn hàng chưa hoàn tất nên không xoá được; "Thắt lưng da bò" không có thuộc tính nên chỉ có một biến thể. Sale chỉ xem, không tạo hay sửa.

Ở **Hàng hoá → Bảng giá**, "Giá Shopee" gắn với gian hàng đang kết nối nên không xoá được; muốn xoá thì ngắt gian hàng trước. Bảng giá chuẩn còn 2 biến thể chưa có giá.

Ở **Hàng hoá → Kho** của Công ty ABC, có 2 biến thể dưới ngưỡng, một phiếu nhập nháp `PN-000003` để thử sửa và ghi sổ, và 2 đơn giao không thành công chờ nhập hoàn. Đăng nhập `kho@commerio.vn` để lập phiếu (không thấy giá vốn), `admin@commerio.vn` để đặt ngưỡng (không lập phiếu), `ceo@commerio.vn` để xem giá vốn.

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
| `pnpm lint` | ESLint |
| `pnpm test` | Unit test (Vitest) |
| `pnpm e2e` | E2E Playwright trên mock (project `mock`) |
| `pnpm e2e:ui` | Như trên, mở giao diện Playwright để chạy từng test, xem từng bước |
| `pnpm e2e:be` | E2E với BE thật (project `be`), xem mục dưới |
| `pnpm e2e:report` | Mở báo cáo HTML của lần chạy gần nhất |

## Kiểm thử E2E (Playwright, FE#69)

Spec nằm trong `e2e/`: `mock/p1` … `mock/p5` chạy trên MSW, `be/p1`, `be/p4`, `be/p5` chạy với BE thật;
hàm dùng chung (đăng nhập, menu, toast, chọn Select, giả lập phản hồi BE) ở `e2e/fixtures.ts`.
Cấu hình ở `playwright.config.ts`.

Lần đầu tải trình duyệt: `pnpm exec playwright install chromium`. Sau đó:

```bash
pnpm e2e                                   # mọi spec mock, song song
pnpm e2e e2e/mock/p4/tai-chinh.spec.ts     # một file
pnpm e2e -g "tạo đơn"                      # theo tên test
pnpm e2e --repeat-each=3                   # bắt test chập chờn trước khi mở PR
```

- Playwright tự bật Vite ở `127.0.0.1:5173` với `VITE_USE_MOCKS=true` (thắng `.env.local`) và tắt khi xong.
  Đang có server ở cổng 5173 thì dùng luôn server đó, nên server đó phải bật mock.
- Khi chạy E2E, mock không trễ (trình duyệt tự động hoá có `navigator.webdriver`). Test cần thấy trạng thái loading
  thì đặt `window.__commerioMock = { latencyMs: 350 }` bằng `page.addInitScript` trước khi tải trang.
- Test hỏng thì xem trace: `pnpm exec playwright show-trace test-results/<tên test>/trace.zip`.
  Trên CI, job `e2e` tải lên `playwright-report/` và `test-results/` khi hỏng (giữ 7 ngày).

**Với BE thật** (chạy lần lượt một worker, test sau dùng dữ liệu test trước để lại):

1. BE chạy ở cổng 3000 với database riêng cho E2E (vd `commerio_e2e`, đã `npm run db:migrate`).
2. Dựng dữ liệu cho `be/p4`, `be/p5` từ thư mục BE (lệnh đầy đủ ở đầu `e2e/be/seed/tai-chinh.mts`, `doi-soat.mts`);
   kết quả ghi ra `e2e/be/seed/*.json`. Mỗi lần chạy spec dựng lại một lần.
3. `VITE_USE_MOCKS=false pnpm e2e:be` (PowerShell: `$env:VITE_USE_MOCKS='false'; pnpm e2e:be`).

## Cấu trúc thư mục

```
src/
├─ api/         # axios client (Problem Details) + react-query hooks (auth, platform, identity, companySettings, catalog, pricing, inventory, shops)
├─ components/
│  ├─ ui/       # component shadcn/ui chép từ shadcn-admin (button, dialog, sidebar, form...)
│  ├─ common/   # PageHeader, FormTextField, PasswordInput, AlertMessage, ConfirmDialog, ForbiddenPage, PlaceholderPage, NotFoundPage
│  └─ layout/   # AppLayout (Platform/Company), AppSidebar, CompanySwitcher, NavUser, Header, navigation
├─ features/
│  ├─ auth/     # LoginPage, RegisterPage, ChangePasswordPage, SelectCompanyPage
│  ├─ identity/ # StaffListPage, RolesPage và các dialog mời, đổi vai trò, tạo/sửa vai trò
│  ├─ platform/ # PlatformOverviewPage, CompanyListPage, LockCompanyDialog, PlatformAuditLogPage
│  ├─ company/  # CompanyHomePage, ModuleSettingsPage, CompanyAuditLogPage
│  ├─ catalog/  # ProductListPage, ProductFormPage (ảnh, bộ dựng biến thể), CatalogSetupPage và các dialog
│  ├─ pricing/  # PricelistListPage, PricelistDetailPage (lưới sửa giá), BulkPriceDialog, PricelistFormDialog
│  ├─ inventory/ # InventoryPage (tab tồn, phiếu, nhập hoàn), StockDocPage (lập, ghi sổ phiếu), ReorderDialog, StockDetailDrawer, ReturnReceiptDialog
│  └─ channel/  # ShopListPage, ShopFormDialog, shopSchemas
├─ hooks/       # useAuth, usePermission, useDebounce, useIsMobile
├─ lib/         # cn() gộp class Tailwind
├─ mocks/       # MSW handlers + in-memory db (catalogData: danh mục, thuộc tính, sản phẩm, file; pricingData: bảng giá; inventoryData: phiếu kho, tồn, đơn hoàn)
├─ router/      # createBrowserRouter + guards
├─ stores/      # zustand (phiên + công ty đang chọn)
├─ styles/      # index.css (Tailwind), theme.css (biến màu shadcn lấy từ tokens)
├─ theme/       # tokens màu, theme MUI light + dark, ColorModeContext
├─ types/       # auth, company, companySettings, audit, identity, catalog, pricing, inventory, shop
└─ utils/       # format, modules, permissions, sku
```

## Tích hợp backend thật

Khi chạy `pnpm dev`, mock (MSW) mặc định bật kể cả khi chưa có `.env`. Khi backend sẵn sàng:

1. Sửa `.env`:
   ```
   VITE_API_BASE_URL=/api/v1
   VITE_USE_MOCKS=false
   ```
   Để trống `VITE_API_BASE_URL` thì mặc định là `/api/v1`. FE và API chạy cùng domain
   (Caddy phục vụ FE ở `/`, API ở `/api`) để cookie refresh `SameSite=Strict` dùng được (docs/21 V38).
2. Backend cần expose các endpoint đúng shape mà MSW handlers đang mô phỏng
   (xem `src/mocks/handlers.ts`), theo hợp đồng `Documents/21-hop-dong-api-fe-be.md`.
3. Đăng nhập theo docs/21 A1–A3:
   - `POST /identity/login` trả access token trong body (sống 15 phút) và đặt refresh token
     vào cookie HttpOnly. FE chỉ giữ access token trong bộ nhớ, không ghi localStorage.
   - Mở hoặc tải lại trang: FE gọi `POST /identity/refresh` (gửi kèm cookie), rồi `GET /identity/me`.
   - Gặp 401 giữa chừng: FE làm mới token một lần rồi gọi lại request; làm mới thất bại thì về `/login`.
   - Đăng xuất gọi `POST /identity/logout` để BE thu hồi refresh token và xoá cookie.

   Khi chạy mock, có thể rút ngắn thời hạn token để thử tự làm mới, bằng cách chạy trong console
   trước khi đăng nhập: `__commerioMock.accessTtlMs = 5000`.

## Lưu ý so với đề bài

Đề bài ghi FE dùng Next.js 16 + React 19 + TailwindCSS v4. Project này dùng
**Vite + React 19 + Tailwind v4 + shadcn/ui**, không dùng Next.js vì dashboard là SPA nội bộ,
không cần SSR/SEO.

Giao diện đang chuyển từ MUI sang shadcn-admin theo từng nhóm trang. Phần nền (Tailwind, biến màu,
component, sidebar, trang đăng nhập/đăng ký) đã chuyển; các trang nghiệp vụ còn lại vẫn dùng MUI
tới khi chuyển xong, sau đó gỡ MUI. Component mới viết bằng shadcn/Tailwind, không thêm code MUI.

## Lộ trình tiếp theo

- Module Sales (đơn hàng, lịch sử trạng thái, hồ sơ khách).
- Module Fulfillment, Finance, Payment, Inbox, Assistant, Report.
- Kết nối backend thật, bỏ MSW.

## Bộ màu thương hiệu

Lấy logo làm chuẩn: navy `#0D2143` (viền) và xanh thép `#486A8C` (mặt trên). Định nghĩa ở `src/theme/tokens.ts`, đưa vào theme MUI ở `src/theme/index.ts` và vào biến CSS của shadcn ở `src/styles/theme.css` (hai nơi phải khớp nhau).

| Vai trò | Light | Dark | Dùng cho |
|---|---|---|---|
| `primary` | `#486A8C` (brand 500) | `#ABBACA` (brand 300) | nút chính, link, mục đang chọn |
| `secondary` | `#0D2143` (brand 900) | `#E5EAEF` (brand 100) | điểm nhấn đậm |
| `brand.50–900` | thang pha từ hai màu logo | | nền nhạt, viền, banner (`bgcolor: 'brand.100'`) |
| `success / warning / error / info` | `#2E7D5B` / `#A35F0C` / `#C0392B` / `#2B7BB9` | bản sáng hơn | trạng thái |

Quy ước:
- Không viết mã hex trong component. Trang shadcn dùng class Tailwind theo biến: `bg-primary`, `text-muted-foreground`, `bg-brand-100`, `text-success`...; trang MUI dùng `primary.main`, `brand.700`, `text.secondary` qua `sx`.
- Chế độ tối bật bằng class `dark` trên `<html>` (`ColorModeContext` gắn, `index.html` gắn sớm để không nháy).
- Logo dùng `<BrandLogo />`; trên nền tối truyền `onDark` để có nền trắng phía sau (viền navy không bị chìm).
- Các cặp chữ/nền trong bảng đều đạt WCAG AA (≥ 4.5) ở chế độ sáng.
