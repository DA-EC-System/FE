## Issue

Closes #

## Thay đổi

-

## Cách kiểm

<!-- Lệnh đã chạy, spec Cypress đã chạy, mã ca trong Documents/kiem-thu/ca-theo-so-do.md. Đổi giao diện thì kèm ảnh chụp. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` xanh
- [ ] `pnpm e2e` (mock) xanh cho spec liên quan; có API thật thì chạy thêm `pnpm e2e:be`
- [ ] Kiểu dữ liệu và mock MSW khớp `Documents/21`; bảng chuyển trong `src/lib/machines` trùng sơ đồ
- [ ] Nút chỉ hiện khi vai trò có quyền (`available`), thử với ít nhất một vai trò không có quyền
- [ ] Không commit `.env`, token

<!--
PR develop → main (phát hành): dùng điều kiện ở Documents/26-ke-hoach-kiem-thu.md §6 thay checklist trên.
-->
