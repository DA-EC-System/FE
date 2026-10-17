/**
 * Bộ màu nhận diện Commerio — lấy logo (src/assets/logo.png) làm chuẩn.
 *
 * Logo có đúng hai màu:
 *  - Navy  #0D2143 (viền)       → brand[900]
 *  - Thép  #486A8C (mặt trên)   → brand[500]
 * Các bậc còn lại pha tuyến tính: 50–400 là thép pha trắng, 600–800 là thép pha navy.
 *
 * Mọi màu trong UI lấy từ file này qua theme (vd `primary.main`, `brand.900`),
 * không viết mã hex trực tiếp trong component.
 * Tỉ lệ tương phản ghi trong ngoặc là so với nền trắng (WCAG AA: chữ thường ≥ 4.5).
 */

export const brand = {
  50: '#F4F6F8',
  100: '#E5EAEF',
  200: '#CCD5DF',
  300: '#ABBACA',
  400: '#7F97AE',
  500: '#486A8C', // màu thép của logo (5.65)
  600: '#375678', // (7.60)
  700: '#284264', // (10.2)
  800: '#193052',
  900: '#0D2143', // màu navy của logo (16.0)
} as const;

/** Xám ngả xanh navy để mặt nền, viền, chữ phụ cùng tông với logo. */
export const neutral = {
  50: '#FAFBFB',
  100: '#F4F4F5',
  200: '#E8EAEC',
  300: '#D6D9DD',
  400: '#B6BBC2',
  500: '#9299A3',
  600: '#727B89', // (4.28) chỉ dùng cho icon, chữ disabled
  700: '#545F70', // (6.47)
  800: '#3B485B',
  900: '#1B2A40',
} as const;

/** Màu trạng thái, giảm độ rực để hợp với tông navy. Bản light đều ≥ 4.5 với chữ trắng. */
export const semantic = {
  light: {
    success: '#2E7D5B', // (5.00)
    warning: '#A35F0C', // (5.0)
    error: '#C0392B', // (5.44)
    info: '#2B7BB9', // (4.53)
  },
  dark: {
    success: '#5FBF8F',
    warning: '#E0A04A',
    error: '#EF7A6E',
    info: '#6AAEE0',
  },
} as const;

/** Mặt nền và chữ theo chế độ sáng/tối. Nền tối pha từ navy của logo. */
export const surface = {
  light: {
    background: brand[50],
    paper: '#FFFFFF',
    border: neutral[200],
    textPrimary: brand[900],
    textSecondary: '#55657D', // (5.93)
  },
  dark: {
    background: '#081428',
    paper: '#0D1F3C',
    border: '#1E3354',
    textPrimary: '#E6EDF5', // (13.9 trên paper)
    textSecondary: '#9FB0C3',
  },
} as const;

/** Nền cho mảng thương hiệu lớn (panel trang đăng nhập, banner). */
export const brandGradient = `linear-gradient(135deg, ${brand[900]} 0%, ${brand[700]} 55%, ${brand[500]} 100%)`;
