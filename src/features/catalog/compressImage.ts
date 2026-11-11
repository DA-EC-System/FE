import { IMAGE_TYPES, MAX_IMAGE_BYTES, MIN_IMAGE_SIDE } from './shared';

/** Cạnh dài tối đa sau khi thu nhỏ; ảnh sàn hiển thị không cần lớn hơn */
export const MAX_IMAGE_SIDE = 2000;
/** Ảnh gốc quá cỡ này thì không đọc, tránh treo trình duyệt */
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

const QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
const MIN_SCALE_STEP = 0.8;

export class ImagePrepareError extends Error {}

export type Encoder = (opts: { width: number; height: number; type: 'image/jpeg' | 'image/png'; quality?: number }) => Promise<Blob>;

/** Cỡ sau khi thu nhỏ để cạnh dài ≤ `max`, giữ tỉ lệ */
export function fitSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Chọn cách xuất ảnh ≤ 1 MB (FE#205):
 * - PNG có nền trong suốt: giữ PNG nếu vừa 1 MB;
 * - còn lại xuất JPEG, giảm chất lượng dần; vẫn quá thì thu nhỏ thêm, không nhỏ hơn 330 px cạnh ngắn.
 */
export async function encodeUnderLimit(
  size: { width: number; height: number },
  encode: Encoder,
  opts: { keepPng: boolean; limit?: number },
): Promise<Blob> {
  const limit = opts.limit ?? MAX_IMAGE_BYTES;
  let { width, height } = size;
  if (opts.keepPng) {
    const png = await encode({ width, height, type: 'image/png' });
    if (png.size <= limit) return png;
  }
  for (;;) {
    for (const quality of QUALITIES) {
      const jpeg = await encode({ width, height, type: 'image/jpeg', quality });
      if (jpeg.size <= limit) return jpeg;
    }
    const shortSide = Math.min(width, height);
    if (shortSide <= MIN_IMAGE_SIDE) throw new ImagePrepareError('không nén được xuống dưới 1 MB');
    const scale = Math.max(MIN_SCALE_STEP, MIN_IMAGE_SIDE / shortSide);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
}

const renamed = (name: string, type: string) =>
  `${name.replace(/\.[^.]+$/, '') || 'anh'}.${type === 'image/png' ? 'png' : 'jpg'}`;

function hasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/**
 * Chuẩn bị ảnh sản phẩm trước khi xin vé tải lên: đọc ảnh, chặn ảnh nhỏ hơn 330×330, thu nhỏ cạnh dài về 2000 px,
 * đổi WebP sang JPEG, nén xuống ≤ 1 MB. Ảnh JPG/PNG đã đạt mọi điều kiện thì gửi nguyên tệp.
 * `contentType`, `sizeBytes` gửi lên `POST /files/uploads` lấy từ tệp trả về, vì URL PUT ký đúng cỡ và kiểu đó.
 */
export async function prepareProductImage(file: File): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImagePrepareError('ảnh gốc lớn hơn 30 MB');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePrepareError('không đọc được ảnh');
  }
  try {
    if (bitmap.width < MIN_IMAGE_SIDE || bitmap.height < MIN_IMAGE_SIDE) {
      throw new ImagePrepareError(
        `ảnh ${bitmap.width}×${bitmap.height} nhỏ hơn ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE}, sàn không nhận`,
      );
    }
    const target = fitSize(bitmap.width, bitmap.height);
    const unchanged = target.width === bitmap.width && target.height === bitmap.height;
    if (unchanged && IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES) return file;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ImagePrepareError('trình duyệt không nén được ảnh');
    const draw = (width: number, height: number, background: string | null) => {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
    };
    draw(target.width, target.height, null);
    const keepPng = file.type === 'image/png' && hasAlpha(ctx, target.width, target.height);

    const encode: Encoder = ({ width, height, type, quality }) => {
      // JPEG không có nền trong suốt: lót nền trắng
      draw(width, height, type === 'image/jpeg' ? '#ffffff' : null);
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new ImagePrepareError('không nén được ảnh'))), type, quality),
      );
    };
    const blob = await encodeUnderLimit(target, encode, { keepPng });
    return new File([blob], renamed(file.name, blob.type), { type: blob.type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
