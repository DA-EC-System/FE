/**
 * Token Commerio cho chỗ cần dùng trong JS (thẻ meta theme-color, gradient trang đăng nhập, biểu đồ Recharts).
 * Cùng giá trị với src/styles/theme.css, lấy từ bản mẫu Test_UI v4 (site/index.html, dáng Ant Design 5), FE#128.
 * Component viết bằng class Tailwind (bg-primary, text-success…), không viết mã hex trực tiếp.
 */

/** Thang xanh thương hiệu theo bảng blue của Ant; bậc 500 là --brand của Test_UI */
export const brand = {
  50: '#E6F4FF', // --accent-soft
  100: '#BAE0FF',
  200: '#91CAFF', // --brand-bd
  300: '#69B1FF',
  400: '#1677FF',
  500: '#0958D9', // --brand
  600: '#003EB3', // --brand-2 (hover)
  700: '#002C8C', // --brand-3 (active)
  800: '#001D66',
  900: '#000F33',
} as const;

/** Mặt nền theo chế độ sáng/tối; nav để lại cho thanh trên cũ tới khi khung FE#130 xong */
export const surface = {
  light: { background: '#F5F5F5', card: '#FFFFFF', nav: brand[500] },
  dark: { background: '#000000', card: '#141414', nav: '#1668DC' },
} as const;

/** Màu trạng thái ba lớp: solid cho nền đặc/chấm, text cho chữ (đạt 4.5:1), soft cho nền nhạt, border cho viền */
export const status = {
  light: {
    success: { solid: '#52C41A', text: '#237804', soft: '#F6FFED', border: '#B7EB8F' },
    warning: { solid: '#FAAD14', text: '#874D00', soft: '#FFFBE6', border: '#FFE58F' },
    destructive: { solid: '#D9363E', text: '#CF1322', soft: '#FFF2F0', border: '#FFCCC7' },
    info: { solid: '#0958D9', text: '#0958D9', soft: '#E6F4FF', border: '#91CAFF' },
    purple: { solid: '#722ED1', text: '#531DAB', soft: '#F9F0FF', border: '#D3ADF7' },
  },
  dark: {
    success: { solid: '#49AA19', text: '#6ABE39', soft: '#162312', border: '#274916' },
    warning: { solid: '#D89614', text: '#E8B339', soft: '#2B2111', border: '#594214' },
    destructive: { solid: '#C23B3D', text: '#E86E6B', soft: '#2C1618', border: '#58181C' },
    info: { solid: '#1668DC', text: '#4A90EA', soft: '#111A2C', border: '#15417E' },
    purple: { solid: '#642AB5', text: '#AB7AE0', soft: '#1A1325', border: '#3E2069' },
  },
} as const;

/** Màu biểu đồ, cùng --chart-1..5 */
export const chart = {
  light: ['#0958D9', '#52C41A', '#FAAD14', '#722ED1', '#13C2C2'],
  dark: ['#1668DC', '#49AA19', '#D89614', '#642AB5', '#13A8A8'],
} as const;

export const font = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
  sizeBase: 14,
} as const;

/** Bo góc (px): tag, nút/ô nhập, thẻ, hộp thoại */
export const radius = { tag: 4, control: 6, card: 8, dialog: 10 } as const;

/** Chuyển động: thời gian (giây) và đường cong, không vượt đích */
export const motion = {
  fast: 0.1,
  mid: 0.2,
  slow: 0.3,
  ease: 'cubic-bezier(.645,.045,.355,1)',
  out: 'cubic-bezier(.215,.61,.355,1)',
  circ: 'cubic-bezier(.08,.82,.17,1)',
} as const;

/** Nền cho mảng thương hiệu lớn (panel trang đăng nhập) */
export const brandGradient = `linear-gradient(135deg, ${brand[900]} 0%, ${brand[700]} 55%, ${brand[500]} 100%)`;
