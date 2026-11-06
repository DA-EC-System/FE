# Hướng dẫn viết chữ trên giao diện

Cập nhật: 05/11/2026 (FE#131). Áp cho mọi trang trong `src/features`. Dáng theo Test_UI v4 (Ant Design 5).

## 1. Gợi ý: tooltip thay cho đoạn hướng dẫn dài

Trang chỉ giữ **một câu mô tả** luôn hiện. Phần giải thích đặt sau nút "?" (`HelpTip`), người mới mở khi cần, người quen không phải đọc lại.

| Chỗ | Cách viết | Component |
|---|---|---|
| Tiêu đề trang | `subtitle` một câu; giải thích thêm đưa vào `help` | `<PageHeader subtitle="…" help="…" />` |
| Nhãn ô nhập | Gợi ý cách điền đưa vào `hint`, không viết đoạn mô tả dưới ô | `<FormTextField hint="…" />`, `<FormLabel hint="…">` |
| Đầu cột bảng | Giải thích con số, thuật ngữ của cột | `meta: { help: '…' }` của cột trong `DataTable` |
| Nhãn trạng thái | Một câu giải thích trạng thái | `hint` trong bảng `Record<Status, StatusMeta>` của `StatusBadge` |
| Nút bị khoá | Một câu lý do: vì sao chưa bấm được | `blockedReason` của `ActionButton`, `reason` của `RowAction`, còn lại bọc `BlockedReason` |

`HelpTip` tự chọn cách hiện:

- Chuỗi ngắn (≤ 2 câu, ≤ 160 ký tự): Tooltip, mở khi rê chuột hoặc Tab tới, Esc để đóng.
- Dài hơn, có link, hoặc có `onTour` (link "Xem hướng dẫn từng bước"): Popover, bấm để mở.
- Màn cảm ứng: luôn Popover, vì Tooltip không mở khi chạm.

Lỗi kiểm dữ liệu của ô nhập **vẫn hiện dưới ô**, không đưa vào tooltip.

## 2. Khi nào giữ Alert

Chỉ dùng `AlertMessage` cho **cảnh báo hoặc lỗi theo trạng thái dữ liệu**, tức là chỉ hiện khi dữ liệu đang ở tình trạng cần chú ý. Ví dụ: lỗi tải dữ liệu, doanh thu năm sắp chạm mốc thuế, đơn đang chờ người thứ hai duyệt.

Không dùng Alert để giải thích cố định về cách trang hoạt động; phần đó thuộc về `help` của `PageHeader` hoặc `meta.help` của cột.

## 3. Cách viết câu

- Câu ngắn, mỗi gợi ý tối đa hai câu. Dài hơn thì xem lại có thật cần không, hoặc tách sang hướng dẫn từng bước.
- Gợi ý chỉ giải thích, **không chứa bước bắt buộc**: người dùng không mở tooltip vẫn phải làm xong việc. Bước bắt buộc nằm ngay trên giao diện (nhãn, nút, thông báo lỗi).
- Lý do nút bị khoá viết theo điều kiện cần đạt, vd "Người duyệt phải khác người soạn", "Bạn không có quyền này", "Chạy thử ở bước 2 trước".
- Dùng đúng tên trên giao diện (tên cột, tên nút, tên trạng thái) để người đọc nối được gợi ý với chỗ đang xem.
- Không lặp lại nhãn: gợi ý của cột "Khả dụng" giải thích số đó tính thế nào, không viết "Đây là số khả dụng".

## 4. Ví dụ đã áp

- Sổ tiền (`LedgerPage`): `subtitle` một câu, `help` giải thích dòng ước tính và dòng thực tế; cột Loại, Phiên bản, Thực nhận, Giá vốn, Lãi gộp có `meta.help`.
- Kho (`InventoryPage`, `StockTab`): `help` nêu bảy con số tồn; cột Tồn thực, Đang giữ, Tạm khoá, Khả dụng có `meta.help`; cột Biến thể giải thích ba nhãn Đang về, Chờ xử lý, Thiếu (đủ dài nên hiện thành Popover).
