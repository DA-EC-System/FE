import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnitInput } from './UnitInput';

describe('UnitInput', () => {
  it('hiện đơn vị trong ô, props chuyển xuống input', () => {
    const html = renderToStaticMarkup(<UnitInput suffix="g" aria-label="Cân nặng" inputMode="numeric" />);
    expect(html).toContain('>g</span>');
    expect(html).toMatch(/<input[^>]*aria-label="Cân nặng"/);
    expect(html).toMatch(/<input[^>]*inputMode="numeric"|<input[^>]*inputmode="numeric"/);
  });
});
