import dayjs from 'dayjs';

const DEFAULT_DATE = 'DD/MM/YYYY';
const DEFAULT_DATETIME = 'DD/MM/YYYY HH:mm';

export function formatDate(value?: string | null, pattern: string = DEFAULT_DATE): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(pattern) : '—';
}

export function formatDateTime(value?: string | null): string {
  return formatDate(value, DEFAULT_DATETIME);
}

export function formatCurrency(value: number, currency: string = 'VND'): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
