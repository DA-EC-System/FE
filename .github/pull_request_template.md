## Issue

Closes #

## Thay đổi

-

## Cách kiểm

<!-- Lệnh đã chạy, spec Cypress đã chạy, mã ca trong Documents/kiem-thu/ca-theo-so-do.md. Đổi giao diện thì kèm ảnh chụp. -->

## Checklist

- [ ] `pnpm ci:local` xanh (lint, typecheck, unit, E2E mock; ít nhất `--spec` các spec liên quan), dán dòng tóm tắt vào "Cách kiểm". GitHub chỉ chạy lint, typecheck, unit
- [ ] Có API thật thì chạy thêm `pnpm e2e:be`
- [ ] Kiểu dữ liệu và mock MSW khớp `Documents/21`; bảng chuyển trong `src/lib/machines` trùng sơ đồ
- [ ] Nút chỉ hiện khi vai trò có quyền (`available`), thử với ít nhất một vai trò không có quyền
- [ ] Không commit `.env`, token

<!--
PR develop → main (phát hành): dùng điều kiện ở Documents/26-ke-hoach-kiem-thu.md §6 thay checklist trên.
-->
