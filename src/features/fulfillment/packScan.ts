import type { PackageLine } from '@/types/fulfillment';

/**
 * Quét đóng gói (21 §19.2 `pack`): dòng đã ghép đếm chung theo biến thể (`variant:<id>`), dòng "không quản tồn" đếm
 * từng dòng (`line:<id>`), dòng chưa ghép SKU không quét. Số đã quét lưu theo khoá này.
 */
export type ScanCounts = Readonly<Record<string, number>>;

type Line = Pick<PackageLine, 'id' | 'variantId' | 'untracked' | 'sku' | 'externalSku' | 'quantity'>;

/** Khoá đếm của dòng; null khi dòng chưa ghép SKU (không quét) */
export function scanKey(line: Pick<Line, 'id' | 'variantId' | 'untracked'>): string | null {
  if (line.variantId) return `variant:${line.variantId}`;
  return line.untracked ? `line:${line.id}` : null;
}

/** Số phải quét theo khoá, theo thứ tự dòng */
export function expectedScans(lines: readonly Line[]): Map<string, number> {
  const expected = new Map<string, number>();
  for (const line of lines) {
    const key = scanKey(line);
    if (key) expected.set(key, (expected.get(key) ?? 0) + line.quantity);
  }
  return expected;
}

export type ScanMatch<L extends Line = Line> =
  | { kind: 'ok'; key: string; line: L }
  | { kind: 'not_found' }
  | { kind: 'unmapped'; line: L }
  | { kind: 'full'; line: L; quantity: number };

/**
 * Tìm dòng của mã vừa quét: khớp SKU (SKU biến thể app với dòng đã ghép) trước, không có thì khớp SKU sàn. Nhiều dòng
 * "không quản tồn" cùng SKU sàn thì lấy dòng đầu chưa đủ. Không phân biệt hoa thường, bỏ khoảng trắng hai đầu.
 */
export function matchScan<L extends Line>(lines: readonly L[], counts: ScanCounts, code: string): ScanMatch<L> {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return { kind: 'not_found' };
  const bySku = lines.filter((l) => l.sku.toUpperCase() === wanted);
  const candidates = bySku.length ? bySku : lines.filter((l) => l.externalSku?.toUpperCase() === wanted);
  if (!candidates.length) return { kind: 'not_found' };
  const expected = expectedScans(lines);
  let full: { line: L; quantity: number } | null = null;
  for (const line of candidates) {
    const key = scanKey(line);
    if (!key) continue;
    const quantity = expected.get(key)!;
    if ((counts[key] ?? 0) < quantity) return { kind: 'ok', key, line };
    full ??= { line, quantity };
  }
  return full ? { kind: 'full', ...full } : { kind: 'unmapped', line: candidates[0]! };
}

/** Số đã quét hiện trên từng dòng: số của biến thể chia lần lượt cho các dòng cùng biến thể; dòng chưa ghép là null */
export function scannedOfLine(lines: readonly Line[], counts: ScanCounts, index: number): number | null {
  const line = lines[index]!;
  const key = scanKey(line);
  if (!key) return null;
  const previous = lines.slice(0, index).filter((l) => scanKey(l) === key).reduce((sum, l) => sum + l.quantity, 0);
  return Math.min(line.quantity, Math.max(0, (counts[key] ?? 0) - previous));
}

export function scanProgress(lines: readonly Line[], counts: ScanCounts) {
  const expected = expectedScans(lines);
  const total = [...expected.values()].reduce((sum, q) => sum + q, 0);
  const scanned = [...expected.keys()].reduce((sum, key) => sum + Math.min(counts[key] ?? 0, expected.get(key)!), 0);
  const complete = [...expected].every(([key, quantity]) => (counts[key] ?? 0) === quantity);
  return { total, scanned, complete, percent: total ? Math.round((scanned / total) * 100) : 100 };
}

/** Thân lệnh `pack`: số quét theo biến thể và số đã cho vào hộp của từng dòng "không quản tồn" */
export function packPayload(lines: readonly Line[], counts: ScanCounts) {
  const packLines: { variantId: string; quantity: number }[] = [];
  const untrackedLines: { lineId: string; quantity: number }[] = [];
  for (const key of expectedScans(lines).keys()) {
    const quantity = counts[key] ?? 0;
    if (key.startsWith('variant:')) packLines.push({ variantId: key.slice('variant:'.length), quantity });
    else if (quantity > 0) untrackedLines.push({ lineId: key.slice('line:'.length), quantity });
  }
  return { lines: packLines, untrackedLines };
}
