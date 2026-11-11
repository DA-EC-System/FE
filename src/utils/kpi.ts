/** Số cho dải chỉ số (FE#134) */

const fmt = (n: number, digits: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(n);

/** Tiền rút gọn: 48,2 tr₫, 1,25 tỷ₫; dưới một triệu thì ghi đủ */
export function compactMoney(value: number): { value: string; unit: string } {
  const abs = Math.abs(value);
  if (abs >= 1e9) return { value: fmt(value / 1e9, 2), unit: 'tỷ₫' };
  if (abs >= 1e6) return { value: fmt(value / 1e6, abs >= 1e8 ? 0 : 1), unit: 'tr₫' };
  return { value: fmt(value, 0), unit: '₫' };
}

/** Phần trăm đổi so với kỳ trước, làm tròn số nguyên; kỳ trước 0 thì không so được (`null`) */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/** "+12%", "-3%", "0%" */
export const signedPercent = (p: number) => `${p > 0 ? '+' : ''}${p}%`;
