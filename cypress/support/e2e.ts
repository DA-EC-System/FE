import '@testing-library/cypress/add-commands';
import './commands';

// Trình duyệt báo khi layout đổi kích thước liên tục (popover, bảng); không phải lỗi của ứng dụng
Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'));
