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
- **Gọi backend thật** — FE không còn mock (Thành chốt 20/11/2026); lỗi API theo Problem Details (RFC 9457).

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

## Yêu cầu môi trường

- Node.js ≥ 20
- pnpm ≥ 9 (hoặc npm/yarn tương đương)

## Cài đặt & chạy

```bash
# cài dependencies
pnpm install

# (Một số máy cần) cấp quyền chạy build scripts cho esbuild
# pnpm approve-builds   # → chọn esbuild

# chạy dev server (gọi BE ở cổng 3000 qua proxy /api, xem mục Tích hợp backend)
pnpm dev
# → mở http://localhost:5173
```

> Nếu `pnpm install` báo `ERR_PNPM_IGNORED_BUILDS` cho esbuild, tạo file
> `pnpm-workspace.yaml` ở thư mục gốc với nội dung:
>
> ```yaml
> onlyBuiltDependencies:
>   - esbuild
> ```
>
> Rồi chạy lại `pnpm install`.

### Quy tắc SKU

Quy tắc của danh mục gồm chữ cố định (A-Z, 0-9, `-`, `_`) và hai token:

- `{SEQ}` hoặc `{SEQ:n}` (bắt buộc, đúng một lần): số thứ tự của danh mục, đệm 0 cho đủ n chữ số, mặc định 4.
- `{VAL}` (tuỳ chọn): mã giá trị thuộc tính của biến thể nối bằng `-`. Mã là giá trị bỏ dấu, viết hoa, chỉ giữ chữ và số, tối đa 6 ký tự (`Xanh navy` → `XANHNA`).

Ví dụ `AO-{SEQ:4}-{VAL}` sinh `AO-0012-DEN-XL`. FE chỉ xem trước bằng `src/utils/sku.ts`; SKU thật do BE sinh và giữ duy nhất trong công ty.

## Scripts

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy dev server (mặc định `http://localhost:5173`) |
| `pnpm build` | Build production ra `dist/` |
| `pnpm preview` | Xem thử bản build |
| `pnpm typecheck` | Chỉ chạy TypeScript check, không build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit test (Vitest) |
| `pnpm e2e:be` | E2E với BE thật (project `be`), xem mục dưới |
| `pnpm e2e:ui` | Như trên, mở giao diện Playwright để chạy từng test, xem từng bước |
| `pnpm e2e:report` | Mở báo cáo HTML của lần chạy gần nhất |

## Kiểm thử E2E (Playwright, FE#69)

Spec nằm trong `e2e/be/` và chạy với BE thật; FE không còn mock nên không còn bộ chạy trên MSW. Hàm dùng chung (menu, toast,
chọn Select) ở `e2e/fixtures.ts`. Cấu hình ở `playwright.config.ts`.

Lần đầu tải trình duyệt: `pnpm exec playwright install chromium`.

- Playwright tự bật Vite ở `127.0.0.1:5173` và tắt khi xong; đang có server ở cổng 5173 thì dùng luôn server đó.
- Test hỏng thì xem trace: `pnpm exec playwright show-trace test-results/<tên test>/trace.zip`. Job `e2e-be` trên CI không
  ghi trace, không tải báo cáo lên (repo public, báo cáo chứa mã thử đăng ký của commerio-backend#459), xem lỗi trong log.

**Với BE thật** (chạy lần lượt một worker): mỗi file spec tự đăng ký công ty giả mới qua API công khai rồi đăng nhập
(`e2e/be/congTyGia.ts`), không ghi thẳng DB, không cần seed; cuối lượt xoá hết công ty thử (`e2e/be/soCongTyThu.ts`).
Chạy được trên cùng database nhiều lần. Cần `E2E_REGISTRATION_TEST_EMAIL_DOMAIN`, `E2E_REGISTRATION_TEST_CODE` (xem `.env.example`).

1. BE chạy ở cổng 3000 (đã `npm run db:migrate`).
2. `pnpm e2e:be`.

Chạy trên staging thì không bật Vite: `PW_BASE_URL=https://116-118-6-7.sslip.io pnpm e2e:be` (lọc thư mục thì ghi đường dẫn
ngay sau lệnh, vd `pnpm e2e:be e2e/be/p1`).
Test cần đơn bán, gian hàng, bảng kê hay tài khoản thứ hai để `test.fixme`, ghi lý do trong spec: công ty mới không tạo được
các thứ đó qua API (đơn chỉ vào từ sàn kết nối OAuth; route `dev/*` không gắn khi `NODE_ENV=production`).

Trên CI, job `e2e-be` của `.github/workflows/e2e.yml` chạy `pnpm e2e:be` trên staging lúc 02:00 mỗi đêm
và khi bấm "Run workflow" trên main; không chạy trên PR vì staging chỉ có code của main.
Đỏ thì comment, tag tác giả các PR đã merge từ lần `e2e-be` xanh gần nhất; lỗi xem trong log của job `e2e-be`.
Staging giới hạn 20 lần gọi `/identity/login` và `/identity/register` mỗi 15 phút mỗi IP; một lần chạy đang gọi `/login` 17 lần,
`/register` 8 lần (be/p1 14 và 5, mỗi file p4, p5/doi-soat, p5/finance-lifecycle một và một), thêm spec thì giữ dưới 18:
spec mới dùng `taoCongTyGia` một lần trong `beforeAll`, các test trong file dùng chung trang đã đăng nhập.

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
├─ router/      # createBrowserRouter + guards
├─ stores/      # zustand (phiên + công ty đang chọn)
├─ styles/      # index.css (Tailwind), theme.css (biến màu shadcn lấy từ tokens)
├─ theme/       # tokens màu, theme MUI light + dark, ColorModeContext
├─ types/       # auth, company, companySettings, audit, identity, catalog, pricing, inventory, shop
└─ utils/       # format, modules, permissions, sku
```

## Tích hợp backend thật

FE luôn gọi backend thật. Chạy BE ở cổng 3000; `pnpm dev` chuyển `/api` sang đó (`vite.config.ts`).

1. `.env`: để trống `VITE_API_BASE_URL` thì mặc định là `/api/v1`. FE và API chạy cùng domain
   (Caddy phục vụ FE ở `/`, API ở `/api`) để cookie refresh `SameSite=Strict` dùng được (docs/21 V38).
2. Endpoint và kiểu dữ liệu theo hợp đồng `Documents/21-hop-dong-api-fe-be.md`.
3. Đăng nhập theo docs/21 A1–A3:
   - `POST /identity/login` trả access token trong body (sống 15 phút) và đặt refresh token
     vào cookie HttpOnly. FE chỉ giữ access token trong bộ nhớ, không ghi localStorage.
   - Mở hoặc tải lại trang: FE gọi `POST /identity/refresh` (gửi kèm cookie), rồi `GET /identity/me`.
   - Gặp 401 giữa chừng: FE làm mới token một lần rồi gọi lại request; làm mới thất bại thì về `/login`.
   - Đăng xuất gọi `POST /identity/logout` để BE thu hồi refresh token và xoá cookie.

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
