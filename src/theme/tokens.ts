/**
 * Màu Commerio cho chỗ cần dùng trong JS (thẻ meta theme-color, gradient trang đăng nhập).
 * Cùng giá trị với src/styles/theme.css, lấy từ bản mẫu Test_UI (site/commerio.css), FE#70.
 * Component viết bằng class Tailwind (bg-primary, text-success…), không viết mã hex trực tiếp.
 */

export const brand = {
  50: '#F3F8FE',
  100: '#E8F1FD',
  200: '#C6DCFA',
  300: '#93BCF4',
  400: '#4F8FE6',
  500: '#0B5FD1', // --brand của Test_UI
  600: '#0952B6',
  700: '#0849A3', // --brand-d
  800: '#073A80',
  900: '#062C61',
} as const;

/** Mặt nền theo chế độ sáng/tối */
export const surface = {
  light: { background: '#F3F5F8', nav: brand[500] },
  dark: { background: '#0B1220', nav: '#0A3F8F' },
} as const;

/** Nền cho mảng thương hiệu lớn (panel trang đăng nhập) */
export const brandGradient = `linear-gradient(135deg, ${brand[900]} 0%, ${brand[700]} 55%, ${brand[500]} 100%)`;
