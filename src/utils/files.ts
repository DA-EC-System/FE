/** Tệp đính kèm chứng từ (ảnh hàng lỗi, biên bản giao nhận...), FE#55 */
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Ảnh minh chứng gửi lên sàn khi từ chối yêu cầu trả: Lazada chỉ nhận JPG, PNG (BE#437). */
export const EVIDENCE_IMAGE_TYPES = ['image/jpeg', 'image/png'];

const TYPE_LABELS: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'application/pdf': 'PDF' };

/** "JPG, PNG, WebP hoặc PDF" theo danh sách kiểu. */
export function typesLabel(types: readonly string[]): string {
  const names = types.map((t) => TYPE_LABELS[t] ?? t);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} hoặc ${names.at(-1)}` : (names[0] ?? '');
}

export function attachmentFileError(file: File, types: readonly string[] = ATTACHMENT_TYPES): string | null {
  if (!types.includes(file.type)) return `${file.name}: chỉ nhận ảnh ${typesLabel(types)}`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: tệp lớn hơn 10 MB`;
  return null;
}
