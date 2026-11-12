import { describe, expect, it } from 'vitest';
import { ImagePrepareError, encodeUnderLimit, fitSize, type Encoder } from './compressImage';
import { imageFileError, sourceImageError } from './shared';

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

/** Bộ mã giả: cỡ tệp tỉ lệ với số điểm ảnh và chất lượng; PNG gấp đôi */
const fakeEncoder = (bytesPerPixel: number) => {
  const calls: Parameters<Encoder>[0][] = [];
  const encode: Encoder = async (o) => {
    calls.push(o);
    const factor = o.type === 'image/png' ? 2 : (o.quality ?? 1);
    return new Blob([new Uint8Array(Math.round(o.width * o.height * bytesPerPixel * factor))], { type: o.type });
  };
  return { encode, calls };
};

describe('fitSize', () => {
  it('thu cạnh dài về 2000 px, giữ tỉ lệ; ảnh nhỏ giữ nguyên', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('encodeUnderLimit', () => {
  it('giảm chất lượng JPEG tới khi ≤ giới hạn', async () => {
    const { encode, calls } = fakeEncoder(1);
    const blob = await encodeUnderLimit({ width: 1000, height: 1000 }, encode, { keepPng: false, limit: 700_000 });
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeLessThanOrEqual(700_000);
    expect(calls.map((c) => c.quality)).toEqual([0.9, 0.82, 0.74, 0.66]);
  });

  it('PNG trong suốt vừa giới hạn thì giữ PNG, quá thì đổi JPEG', async () => {
    const small = fakeEncoder(0.1);
    const png = await encodeUnderLimit({ width: 1000, height: 1000 }, small.encode, { keepPng: true, limit: 300_000 });
    expect(png.type).toBe('image/png');
    const big = fakeEncoder(1);
    const blob = await encodeUnderLimit({ width: 1000, height: 1000 }, big.encode, { keepPng: true, limit: 900_000 });
    expect(blob.type).toBe('image/jpeg');
    expect(big.calls[0].type).toBe('image/png');
  });

  it('chất lượng thấp nhất vẫn quá thì thu nhỏ thêm, không dưới 330 px cạnh ngắn', async () => {
    const { encode, calls } = fakeEncoder(4);
    const blob = await encodeUnderLimit({ width: 2000, height: 1000 }, encode, { keepPng: false, limit: 1_000_000 });
    expect(blob.size).toBeLessThanOrEqual(1_000_000);
    expect(Math.min(...calls.map((c) => c.height))).toBeGreaterThanOrEqual(330);
    expect(calls.at(-1)!.width).toBeLessThan(2000);
  });

  it('tới 330 px vẫn quá thì báo lỗi', async () => {
    const { encode } = fakeEncoder(100);
    await expect(encodeUnderLimit({ width: 400, height: 400 }, encode, { keepPng: false })).rejects.toBeInstanceOf(
      ImagePrepareError,
    );
  });
});

describe('kiểm tệp', () => {
  it('chọn được JPG, PNG, WebP; tệp khác báo chỉ nhận JPG hoặc PNG', () => {
    expect(sourceImageError(file('a.webp', 'image/webp'))).toBeNull();
    expect(sourceImageError(file('a.gif', 'image/gif'))).toBe('a.gif: chỉ nhận ảnh JPG hoặc PNG');
  });

  it('tệp đã nén phải là JPG/PNG ≤ 1 MB', () => {
    expect(imageFileError(file('a.jpg', 'image/jpeg', 1024 * 1024))).toBeNull();
    expect(imageFileError(file('a.jpg', 'image/jpeg', 1024 * 1024 + 1))).toBe('a.jpg: ảnh lớn hơn 1 MB');
    expect(imageFileError(file('a.webp', 'image/webp'))).toBe('a.webp: chỉ nhận ảnh JPG hoặc PNG');
  });
});
