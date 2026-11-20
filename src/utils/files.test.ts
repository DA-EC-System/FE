import { describe, expect, it } from 'vitest';
import { ATTACHMENT_TYPES, EVIDENCE_IMAGE_TYPES, attachmentFileError, typesLabel } from './files';

const file = (name: string, type: string, size = 1024) => new File([new Uint8Array(size)], name, { type });

describe('attachmentFileError', () => {
  it('mặc định nhận ảnh JPG, PNG, WebP và PDF', () => {
    expect(attachmentFileError(file('a.webp', 'image/webp'))).toBeNull();
    expect(attachmentFileError(file('a.gif', 'image/gif'))).toBe('a.gif: chỉ nhận ảnh JPG, PNG, WebP hoặc PDF');
  });

  it('ảnh minh chứng gửi sàn chỉ nhận JPG, PNG (BE#437)', () => {
    expect(attachmentFileError(file('a.png', 'image/png'), EVIDENCE_IMAGE_TYPES)).toBeNull();
    expect(attachmentFileError(file('a.webp', 'image/webp'), EVIDENCE_IMAGE_TYPES)).toBe('a.webp: chỉ nhận ảnh JPG hoặc PNG');
    expect(attachmentFileError(file('bb.pdf', 'application/pdf'), EVIDENCE_IMAGE_TYPES)).toBe('bb.pdf: chỉ nhận ảnh JPG hoặc PNG');
  });
});

describe('typesLabel', () => {
  it('nối tên kiểu bằng dấu phẩy và "hoặc"', () => {
    expect(typesLabel(ATTACHMENT_TYPES)).toBe('JPG, PNG, WebP hoặc PDF');
    expect(typesLabel(['image/png'])).toBe('PNG');
  });
});
