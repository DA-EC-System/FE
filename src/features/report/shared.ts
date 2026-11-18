// Hàm dùng chung của số liệu kinh doanh trên trang chủ (trang /reports ngoài MVP, gỡ ở FE#249)

const percent = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Biên lãi `profit / revenue`, một chữ số thập phân; doanh thu 0 hoặc không có lãi thì "—" (AC-B4) */
export function margin(profit: number | null, revenue: number): string {
  if (profit === null || revenue === 0) return '—';
  return `${percent.format((profit / revenue) * 100)}%`;
}

/** Hôm nay theo giờ VN (C6), yyyy-mm-dd */
export const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
