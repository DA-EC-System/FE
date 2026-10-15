# Các điểm FE cần chốt với BE

Cập nhật: 15/10/2026. Phạm vi: các phần FE đã làm từ PR #24 đến #32. Hiện FE chạy bằng mock MSW (`src/mocks/handlers.ts`). Khi chưa chốt, hợp đồng trong mock là đề xuất của FE.

Cột **Trạng thái**: `Chờ BE` là chưa có trả lời; khi chốt xong, ghi kết luận và số PR/issue BE vào cột này.

---

## 1. Quy ước chung

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| C1 | Lỗi theo ô trong Problem Details | 422 có `errors: { [field]: string }`, field lồng viết dạng `ceo.email` | Chờ BE |
| C2 | Trường mở rộng trong Problem Details | `code` (mã lỗi máy đọc), `current` (bản mới nhất khi 409 `version_conflict`), `member` (khi 409 `already_member`) | Chờ BE |
| C3 | Khoá lạc quan | Mọi bản ghi sửa được có `version`; PUT gửi `version` trong body, DELETE gửi `?version=`; lệch thì 409 `version_conflict` kèm `current` | Chờ BE |
| C4 | Công ty đang làm việc | Lấy từ token sau `/auth/select-company`, không truyền `companyId` trong URL hay body; đụng dữ liệu công ty khác trả 403 | Chờ BE |
| C5 | Phân trang | Query `page` (từ 1), `pageSize`; response `{ items, total, page, pageSize }` | Chờ BE |
| C6 | Múi giờ của bộ lọc ngày | `from`/`to` dạng `yyyy-mm-dd`, tính trọn ngày theo giờ Việt Nam (UTC+7) | Chờ BE |

## 2. Xác thực — UC-PI-01, 03, 04 (FE PR #24, #26)

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| A1 | Lưu token | UC-PI-03 yêu cầu cookie HttpOnly. FE hiện giữ access token trong localStorage, chờ BE có refresh token | Chờ BE |
| A2 | Refresh token | `POST /auth/refresh` bằng cookie HttpOnly; access token trả trong body, thời hạn ngắn | Chờ BE |
| A3 | Hợp đồng `/auth/*` | `login`, `select-company`, `register`, `google`, `change-password` (xem `src/types/auth.ts`) | Chờ BE |
| A4 | Mã lỗi | `email_taken`, `password_change_required` (403), `google_account_not_found`, `company_locked` (403) | Chờ BE |
| A5 | Quy tắc mật khẩu | 8–72 ký tự, có chữ và số | Chờ BE |
| A6 | Google (commerio-backend#7) | FE lấy ID token bằng Google Identity Services rồi gửi `POST /auth/google`, hay BE làm luồng chuyển hướng OAuth2? Nút Google đang tạm khoá khi chạy với BE thật | Chờ BE |
| A7 | Quên mật khẩu | Không làm (D26 bỏ `password_reset_tokens`) | Đã thống nhất theo D26 |

## 3. Nhân viên và vai trò — UC-PI-05, 06 (FE PR #27, commerio-backend#8, #9)

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| I1 | Hợp đồng `/identity/*` | `permissions`, `roles` (CRUD), `staff` (danh sách, thêm, đổi vai trò, `lock`/`unlock`); bảng chi tiết ở mô tả PR #27 | Chờ BE |
| I2 | Thêm nhân viên | 201 `{ outcome: 'invited' \| 'added', member }`. Email đã có trong công ty: 409 `already_member` kèm `member`. Email có tài khoản ở công ty khác: thêm vào, không lộ công ty kia | Chờ BE |
| I3 | Mã lỗi | `role_name_taken`, `permission_not_held`, `builtin_role`, `role_in_use`, `protected_account` | Chờ BE |
| I4 | Danh mục mã quyền | `identity.account.view\|manage`, `identity.role.view\|manage`; docs/19 mới có hai ví dụ, cần danh mục đầy đủ | Chờ BE |
| I5 | Giới hạn gán quyền | Không gán vai trò CEO qua màn này; không thêm hay gỡ vai trò có quyền mình không có | Chờ BE |

## 4. Phân hệ và nhật ký — UC-PI-02, 07 (FE PR #29, commerio-backend#10, #11)

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| M1 | Hợp đồng | `GET /company/modules`, `PUT /company/modules/:code`, `GET /audit/logs`, `GET /audit/logs/:id` | Chờ BE |
| M2 | Mã lỗi | `module_state_changed` (409 kèm `current`), `module_has_data`, `ai_consent_required` | Chờ BE |
| M3 | Quyền `platform.module.manage` (CEO), `platform.audit.view` (CEO, Admin) | Không nằm trong danh mục quyền nên không cấp được cho vai trò tuỳ biến; BE vẫn tự kiểm | Chờ BE |
| M4 | Phân hệ vừa tắt ở phiên nhân viên khác | Menu của nhân viên đang đăng nhập chỉ cập nhật khi tải lại trang hoặc chọn lại công ty. BE phải chặn API của phân hệ đã tắt. Mock đang trả 403 `module_disabled` | Chờ BE |
| M5 | Dạng bản ghi nhật ký | Theo ERD `audit.audit_logs`: `action` create/update/delete, `entity_type`, `entity_id`, `before`, `after` | Chờ BE |

## 5. Sản phẩm, danh mục, thuộc tính — UC-CP-01, 02 (FE PR #30, commerio-backend#13, #14)

### 5.1 Quy tắc SKU (QT-11, D14, D25)

FE tự sinh SKU để xem trước (`src/utils/sku.ts`). **BE phải sinh SKU giống hệt** thì bản xem trước mới khớp với SKU thật.

- Ký tự cho phép ở phần chữ cố định: A-Z, 0-9, `-`, `_`. Tổng độ dài quy tắc tối đa 40.
- `{SEQ}` hoặc `{SEQ:n}`: bắt buộc, đúng một lần. Là số thứ tự của danh mục, đệm 0 đủ n chữ số (n từ 1 đến 9, mặc định 4).
- `{VAL}`: tuỳ chọn, tối đa một lần. Là mã các giá trị thuộc tính của biến thể, nối bằng `-` theo thứ tự thuộc tính.
- Mã giá trị: bỏ dấu (`đ` → `D`), viết hoa, chỉ giữ A-Z0-9, cắt còn tối đa 6 ký tự. Ví dụ `Xanh navy` → `XANHNA`.
- Biến thể không có thuộc tính: `{VAL}` rỗng và bỏ luôn dấu nối thừa (`AO-{SEQ}-{VAL}` → `AO-0003`).
- Mỗi biến thể dùng một số thứ tự, sinh lần lượt theo thứ tự biến thể trong request.

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| P1 | Cú pháp quy tắc và cách sinh mã giá trị | Như trên | Chờ BE |
| P2 | Mã giá trị trùng nhau sau khi cắt 6 ký tự (vd `Xanh navy` và `Xanh nhạt`) | Chưa xử lý. Đề xuất: cho mỗi giá trị trường `code` sửa được, mặc định sinh như trên | Chờ BE |
| P3 | Đổi quy tắc SKU của danh mục | Chỉ áp dụng cho SKU sinh sau, SKU đã cấp giữ nguyên | Chờ BE |
| P4 | Danh mục có `skuNextSeq` | Trả trong `GET /catalog/categories` để FE xem trước | Chờ BE |

### 5.2 Hợp đồng API

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/catalog/categories` | Kèm `skuPattern`, `skuNextSeq`, `productCount`, `version` |
| POST, PUT, DELETE | `/catalog/categories[/:id]` | Quyền `catalog.category.manage` |
| GET | `/catalog/attributes` | Mỗi giá trị có `inUse`; thuộc tính có `productCount` |
| POST, PUT, DELETE | `/catalog/attributes[/:id]` | PUT gửi `values: [{ id?, value }]`; giá trị cũ không có trong danh sách là bị xoá |
| GET | `/catalog/products?search&categoryId&status&page&pageSize` | `search` khớp tên hoặc SKU; `status` = `active` (mặc định) hoặc `archived`; dòng có `category`, `variantCount`, `thumbnailUrl` |
| GET | `/catalog/products/:id` | Kèm `images[]` theo thứ tự, `variants[]` (kể cả đã ngừng bán, có `archivedAt`) |
| POST | `/catalog/products` | `{ name, categoryId, description, imageFileIds, variants: [{ attributeValueIds }] }` |
| PUT | `/catalog/products/:id` | `{ name, description, imageFileIds, version }`, không gửi danh mục và biến thể |
| DELETE | `/catalog/products/:id?version=` | Lưu trữ |
| POST | `/catalog/products/:id/variants` | `{ attributeValueIds }`. 201 nếu tạo mới; 200 nếu tổ hợp từng ngừng bán, bán lại với SKU cũ |
| DELETE | `/catalog/products/:id/variants/:variantId` | Ngừng bán |
| POST | `/files/uploads` | `{ fileName, contentType, sizeBytes, purpose: 'product_image' }` → `{ fileId, uploadUrl, headers }` |
| PUT | `uploadUrl` | FE gửi thẳng file kèm `headers`, không gắn token Commerio |

### 5.3 Mã lỗi

| Mã | HTTP | Khi nào |
|---|---|---|
| `in_use` | 409 | Xoá danh mục, thuộc tính hoặc giá trị thuộc tính đang có sản phẩm dùng |
| `variant_exists` | 409 | Thêm biến thể có tổ hợp đã có và đang bán |
| `last_variant` | 409 | Ngừng bán biến thể cuối cùng còn bán |
| `product_has_active_orders` | 409 | Xoá sản phẩm còn đơn hàng đang xử lý |
| `product_archived` | 409 | Sửa sản phẩm đã xoá |
| `version_conflict` | 409 | Như C3 |
| `file_type_not_allowed` | 422 | Ảnh không phải JPG, PNG, WebP |
| `file_too_large` | 422 | Ảnh lớn hơn 5 MB |
| (lỗi theo ô) | 422 | `errors.name`, `errors.categoryId`, `errors.images`, `errors.variants`, `errors.skuPattern`, `errors.values` |

### 5.4 Ngữ nghĩa

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| P5 | Xoá sản phẩm, biến thể | Là lưu trữ (`archived_at`); SKU không bao giờ cấp lại | Chờ BE |
| P6 | Đổi danh mục sau khi tạo | Không cho, vì SKU đã sinh theo danh mục | Chờ BE |
| P7 | Thêm hoặc ngừng bán biến thể | Không tăng `version` của sản phẩm, để người đang mở form sửa không bị 409 oan. Tạo sản phẩm cũng không tăng `version` của danh mục | Chờ BE |
| P8 | Giới hạn | Tối đa 100 biến thể mỗi lần tạo, 9 ảnh mỗi sản phẩm; mọi biến thể của một sản phẩm cùng bộ thuộc tính | Chờ BE |
| P9 | Ảnh đã tải nhưng không gắn vào sản phẩm | BE tự dọn sau một thời gian (đề xuất 24 giờ) | Chờ BE |
| P10 | Ảnh chưa PUT xong mà đã gửi `fileId` | 422 `errors.images` | Chờ BE |
| P11 | Quyền mới | `catalog.product.view`, `catalog.product.manage`, `catalog.category.manage`; CEO và Admin có cả ba, Sale chỉ có view | Chờ BE |

## 6. Bảng giá — UC-CP-03 (FE PR #31, commerio-backend#15)

### 6.1 Hợp đồng API

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/pricing/pricelists` | Mảng `Pricelist`, bảng chuẩn đứng đầu. Mỗi dòng có `type`, `shop {id, shopName, platform} \| null`, `pricedCount`, `variantCount`, `version`, `updatedAt` |
| GET | `/pricing/pricelists/:id` | Một `Pricelist` |
| GET | `/pricing/pricelists/:id/items` | Mọi biến thể đang bán: `variantId, productId, productName, sku, attributesLabel, categoryId, thumbnailUrl, price, standardPrice`. Không phân trang, FE lọc và phân trang tại chỗ |
| POST | `/pricing/pricelists` | `{ name, shopId, copyFromStandard }` → 201. Chỉ tạo bảng theo gian hàng |
| PUT | `/pricing/pricelists/:id` | `{ name, version }`: đổi tên |
| DELETE | `/pricing/pricelists/:id?version=` | 204 |
| PUT | `/pricing/pricelists/:id/items` | `{ version, items: [{ variantId, price \| null }] }`: chỉ gửi dòng đã đổi; `null` là bỏ giá. Trả `Pricelist` mới |

### 6.2 Mã lỗi

| Mã | HTTP | Khi nào |
|---|---|---|
| `in_use` | 409 | Xoá bảng giá chuẩn; xoá bảng của gian hàng chưa ngắt kết nối |
| `version_conflict` | 409 | Như C3, kèm `current` là `Pricelist` mới nhất |
| (lỗi theo ô) | 422 | `errors.name`, `errors.shopId` khi tạo hoặc đổi tên |
| (lỗi theo dòng) | 422 | `errors["items.<variantId>"]`: giá âm, không nguyên, quá 10 tỷ, biến thể không còn bán, gửi trùng. `errors.items` khi danh sách rỗng hoặc quá 2000 dòng |

### 6.3 Ngữ nghĩa

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| G1 | Kiểu giá | Số nguyên đồng (JSON number), 0 ≤ giá ≤ 10 tỷ. ERD để `numeric(18,2)`; FE không cho nhập lẻ | Chờ BE |
| G2 | Bảng giá chuẩn | Mỗi công ty đúng một bảng, BE tạo sẵn khi tạo công ty, không xoá được; đổi tên được | Chờ BE |
| G3 | Bảng theo gian hàng | Tối đa một bảng mỗi gian hàng (`unique(shop_id)`); không tạo cho gian hàng đã ngắt | Chờ BE |
| G4 | "Đang được sử dụng" (UC-CP-03 ngoại lệ xoá) | Bảng chuẩn luôn đang dùng; bảng gian hàng đang dùng khi gian hàng chưa ở trạng thái `disconnected`. Khi có phân hệ Đơn hàng, cần thêm điều kiện "còn đơn đang xử lý lấy giá từ bảng này"? | Chờ BE |
| G5 | Biến thể chưa có giá trong bảng gian hàng | Lấy giá chuẩn; trong bảng chuẩn cũng chưa có thì đơn không lấy được giá (Đơn hàng xử lý sau) | Chờ BE |
| G6 | Lưu giá | Một lần `PUT items` là một giao dịch: lỗi một dòng thì không lưu dòng nào. Chỉ tăng `version` và ghi nhật ký khi có giá thật sự đổi; nhật ký chỉ ghi các dòng đổi | Chờ BE |
| G7 | `copyFromStandard` | Chép giá tại lúc tạo; sau đó hai bảng độc lập | Chờ BE |
| G8 | Biến thể hoặc sản phẩm bị ngừng bán | Giá vẫn giữ trong DB nhưng không hiện trên lưới và không tính vào `pricedCount`; bán lại thì giá cũ hiện lại | Chờ BE |
| G9 | Số dòng | `GET items` trả toàn bộ, ổn tới vài nghìn biến thể. Nếu công ty lớn hơn, cần phân trang phía BE và FE đổi lưới sang chế độ server | Chờ BE |
| G10 | Quyền mới | `pricing.pricelist.view` (CEO, Admin, Sale), `pricing.pricelist.manage` (CEO, Admin). Tạo bảng gian hàng cần thêm phân hệ Kênh bán bật và quyền xem gian hàng | Chờ BE |

## 7. Kho — UC-IN-01, 02, 03 (FE PR #32, commerio-backend#16)

### 7.1 Hợp đồng API

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/inventory/stock?page=&pageSize=&search=&categoryId=&belowMin=` | `{ items: StockLevel[], total, page, pageSize, summary: { variantCount, belowMinCount, totalValue \| null } }`. `StockLevel`: `variantId, productId, productName, sku, attributesLabel, category {id, name}, onHand, reserved, available, minQty \| null, belowMin, reorderVersion, avgCost \| null, stockValue \| null` |
| GET | `/inventory/stock/:variantId` | `{ level, moves }`; `moves` tối đa 100 dòng mới nhất: `qtyChange, onHandAfter, document {id, number, type, kind}, unitCost \| null, doneAt, doneBy` |
| PUT | `/inventory/stock/:variantId/reorder-rule` | `{ minQty: number \| null, version }`; `null` là bỏ ngưỡng. Trả `StockLevel` mới |
| GET | `/inventory/documents?page=&pageSize=&type=&status=&search=` | Danh sách `StockDocSummary`: `number, type, kind, status, note, reference, lineCount, totalQty, createdBy, createdAt, postedBy, postedAt, version` |
| GET | `/inventory/documents/:id` | `StockDoc` = summary + `lines [{variantId, sku, productName, attributesLabel, quantity, unitCost \| null}]` |
| POST | `/inventory/documents` | `{ type: 'receipt' \| 'issue', note, lines: [{variantId, quantity, unitCost?}] }` → 201, phiếu nháp lập tay |
| PUT | `/inventory/documents/:id` | `{ note, lines, version }`: chỉ sửa phiếu nháp lập tay |
| POST | `/inventory/documents/:id/post` | `{ version }`: ghi sổ, tồn đổi ngay |
| POST | `/inventory/documents/:id/cancel` | `{ version }`: chỉ huỷ được phiếu nháp |
| GET | `/inventory/returns` | Đơn giao không thành công: `orderId, orderCode, customerName, customerPhone, shipmentCode, failedReason, failedAt, lines [{variantId, sku, productName, attributesLabel, quantity}], receipt {id, number} \| null`. Đơn chưa xử lý đứng đầu |
| POST | `/inventory/returns` | `{ orderId, lines: [{variantId, quantity}], note }` → 201, phiếu nhập hoàn đã ghi sổ |

Số phiếu FE đề xuất: `PN-000001` (nhập), `PX-000001` (xuất), đánh số riêng theo công ty.

### 7.2 Mã lỗi

| Mã | HTTP | Khi nào |
|---|---|---|
| `version_conflict` | 409 | Đặt ngưỡng, sửa, ghi sổ, huỷ phiếu khi `version` cũ; kèm `current` mới nhất (`StockLevel` hoặc `StockDoc`) |
| `not_draft` | 409 | Sửa, ghi sổ, huỷ phiếu không còn ở trạng thái nháp, hoặc sửa phiếu không phải lập tay |
| `already_processed` | 409 | Nhập hoàn đơn đã có phiếu; `detail` nêu số phiếu đã lập |
| `insufficient_stock` | 422 | Ghi sổ phiếu xuất vượt khả dụng; kèm `errors["lines.<i>.quantity"]` = "Chỉ còn X khả dụng" |
| (lỗi theo ô) | 422 | `errors.minQty`; `errors.note`; `errors["lines.<i>.variantId \| quantity \| unitCost"]` theo chỉ số dòng; `errors.lines` khi phiếu rỗng hoặc nhập hoàn toàn số 0 |

### 7.3 Ngữ nghĩa

| # | Điểm cần chốt | Đề xuất của FE | Trạng thái |
|---|---|---|---|
| K1 | Số tồn | `available = onHand − reserved`; `reserved` là tổng giữ chỗ `active` của đơn. Phiếu xuất tay chỉ lấy phần khả dụng | Chờ BE |
| K2 | Giá vốn | Bình quân gia quyền, tính lại khi ghi sổ phiếu nhập mua/lập tay. Nhập hoàn lấy giá vốn hiện tại, không đổi bình quân. Phiếu xuất ghi nhận giá vốn lúc xuất | Chờ BE |
| K3 | Ai thấy giá | Giá vốn, giá trị tồn chỉ trả về cho người có `inventory.cost.view` (CEO), người khác nhận `null`. FE đề xuất thêm: người lập phiếu (`inventory.receipt.create`) thấy và nhập được giá nhập trên phiếu nhập lập tay, nhưng không thấy giá vốn bình quân | Chờ BE |
| K4 | Phiếu xuất tay | ERD chỉ có `receipt_kind`; FE thêm phiếu xuất lập tay (`kind: 'manual'`, bắt buộc ghi lý do) cho hàng hỏng, mất, kiểm kê lệch. Phiếu xuất theo đơn (`kind: 'order'`) do phân hệ Đơn hàng sinh, kho chỉ xem | Chờ BE |
| K5 | Quyền Admin | UC-IN-01, 02 cho Admin xem tồn và đặt ngưỡng, nên mock gán Admin `inventory.stock.view` và `inventory.reorder.manage` (trái với ghi chú cũ "Admin không có quyền kho"). Admin không lập phiếu, không thấy giá vốn | Chờ BE |
| K6 | Quyền mới | `inventory.receipt.create` (lập, ghi sổ, huỷ phiếu và nhập hoàn), `inventory.reorder.manage`, `inventory.cost.view`; `inventory.stock.view` đã có | Chờ BE |
| K7 | Ngưỡng tồn | Số nguyên ≥ 0 so với số khả dụng; `belowMin = available < minQty`. Thông báo dưới ngưỡng (QT-16) và sinh đơn mua nháp do BE làm, FE chỉ hiện cảnh báo trên lưới | Chờ BE |
| K8 | Nhập hoàn | Mỗi đơn nhập hoàn một lần; số thực nhận từ 0 tới số đã xuất, khác số đã xuất thì bắt buộc ghi chú. Phiếu ghi sổ ngay, dòng số 0 bị bỏ. Danh sách đơn hiện là dữ liệu mock thay cho phân hệ Đơn hàng/Giao vận | Chờ BE |
| K9 | Đẩy tồn lên sàn (QT-46) | Sau mỗi lần ghi sổ BE đẩy số khả dụng lên các gian hàng; FE chưa hiện trạng thái đồng bộ | Chờ BE |
| K10 | Ghi sổ | Một lần ghi sổ là một giao dịch, khoá dòng tồn để tránh hai phiếu xuất cùng lấy một số khả dụng. Phiếu đã ghi sổ không sửa, không huỷ; sai thì lập phiếu ngược | Chờ BE |
