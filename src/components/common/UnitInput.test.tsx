import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnitInput } from './UnitInput';

const describedBy = (html: string) => /<input[^>]*aria-describedby="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
const textOf = (html: string, id: string) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('UnitInput', () => {
  it('hiện đơn vị trong ô, props chuyển xuống input', () => {
    const html = renderToStaticMarkup(<UnitInput suffix="g" aria-label="Cân nặng" inputMode="numeric" />);
    expect(html).toContain('>g</span>');
    expect(html).toMatch(/<input[^>]*aria-label="Cân nặng"/);
    expect(html).toMatch(/<input[^>]*inputMode="numeric"|<input[^>]*inputmode="numeric"/);
  });

  it('trình đọc màn hình đọc được đơn vị qua aria-describedby, giữ mô tả sẵn có của ô', () => {
    const html = renderToStaticMarkup(<UnitInput suffix="mm" aria-label="Dài" aria-describedby="loi-dai" />);
    const ids = describedBy(html);
    expect(ids[0]).toBe('loi-dai');
    expect(ids).toHaveLength(2);
    expect(textOf(html, ids[1]!)).toBe('mm');
  });
});
