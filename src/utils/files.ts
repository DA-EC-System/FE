/** Tệp đính kèm chứng từ (ảnh hàng lỗi, biên bản giao nhận...), FE#55 */
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

export function attachmentFileError(file: File): string | null {
  if (!ATTACHMENT_TYPES.includes(file.type)) return `${file.name}: chỉ nhận ảnh JPG, PNG, WebP hoặc PDF`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: tệp lớn hơn 10 MB`;
  return null;
}
