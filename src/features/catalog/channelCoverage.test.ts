import { describe, expect, it } from 'vitest';
import type { ProductShopCoverage } from '@/types/catalog';
import { coverageParts, coverageText, hasCoverageColumn } from './channelCoverage';

const shop = (over: Partial<ProductShopCoverage>): ProductShopCoverage => ({
  shopId: 's1',
  shopName: 'Shop 1',
  platform: 'lazada',
  listed: 0,
  missing: 0,
  ...over,
});

describe('coverageParts', () => {
  it('BE chưa trả hoặc mảng rỗng: không có phần nào', () => {
    expect(coverageParts(undefined)).toEqual([]);
    expect(coverageParts([])).toEqual([]);
  });

  it('mỗi sàn một gian hàng: dùng tên sàn, giữ thứ tự BE trả', () => {
    const parts = coverageParts([
      shop({ shopId: 'a', platform: 'tiktok', shopName: 'Đùi Gà', listed: 3 }),
      shop({ shopId: 'b', platform: 'lazada', shopName: 'Shop B', listed: 1, missing: 4 }),
    ]);
    expect(parts.map(coverageText)).toEqual(['TikTok Shop ✓', 'Lazada còn 4']);
    expect(parts.map((p) => p.platform)).toEqual(['tiktok', 'lazada']);
  });

  it('một sàn nhiều gian hàng: dùng tên gian hàng của sàn đó, sàn khác vẫn dùng tên sàn', () => {
    const parts = coverageParts([
      shop({ shopId: 'a', shopName: 'Shop HN', missing: 2 }),
      shop({ shopId: 'b', shopName: 'Shop HCM' }),
      shop({ shopId: 'c', platform: 'tiktok', shopName: 'TT', missing: 1 }),
    ]);
    expect(parts.map(coverageText)).toEqual(['Shop HN còn 2', 'Shop HCM ✓', 'TikTok Shop còn 1']);
  });
});

describe('hasCoverageColumn', () => {
  it('ẩn cột khi không dòng nào có độ phủ', () => {
    expect(hasCoverageColumn([{}, { channelCoverage: [] }])).toBe(false);
    expect(hasCoverageColumn([{ channelCoverage: [] }, { channelCoverage: [shop({})] }])).toBe(true);
  });
});
