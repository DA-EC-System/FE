import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HelpTip } from './HelpTip';
import { countSentences, helpTipLabel, helpTipMode } from './helpTipMode';

const SHORT = 'Hàng đã có trong kho, kể cả phần đang giữ cho đơn.';
const TWO = 'Dòng ước tính được ghi khi kiện giao xong. Sàn quyết toán thì thay bằng dòng thực tế.';
const THREE = 'Câu một. Câu hai. Câu ba.';

describe('helpTipMode', () => {
  it('chuỗi ≤ 2 câu: Tooltip', () => {
    expect(helpTipMode(SHORT)).toBe('tooltip');
    expect(helpTipMode(TWO)).toBe('tooltip');
  });

  it('chuỗi từ 3 câu hoặc quá dài: Popover', () => {
    expect(helpTipMode(THREE)).toBe('popover');
    expect(helpTipMode('a'.repeat(161))).toBe('popover');
  });

  it('nội dung không phải chuỗi (có thể chứa link) hoặc có link hướng dẫn: Popover', () => {
    expect(helpTipMode(<a href="/x">Xem</a>)).toBe('popover');
    expect(helpTipMode(SHORT, { hasLink: true })).toBe('popover');
  });

  it('màn cảm ứng luôn Popover vì Tooltip không mở khi chạm', () => {
    expect(helpTipMode(SHORT, { touch: true })).toBe('popover');
  });
});

describe('countSentences', () => {
  it('đếm theo dấu kết câu, câu cuối không có dấu chấm vẫn tính', () => {
    expect(countSentences(SHORT)).toBe(1);
    expect(countSentences('Một câu. Câu hai không chấm')).toBe(2);
    expect(countSentences('Giá 1.500.000 đồng.')).toBe(1);
  });
});

describe('HelpTip', () => {
  it('aria-label kèm chủ đề; không có chủ đề thì là "Giải thích"', () => {
    expect(helpTipLabel('Tồn thực')).toBe('Giải thích: Tồn thực');
    expect(helpTipLabel()).toBe('Giải thích');
    expect(renderToStaticMarkup(<HelpTip topic="Tồn thực" content={SHORT} />)).toContain(
      'aria-label="Giải thích: Tồn thực"',
    );
  });

  it('nút "?" là button, chọn Tooltip hay Popover theo độ dài', () => {
    const short = renderToStaticMarkup(<HelpTip content={SHORT} />);
    expect(short).toMatch(/^<button type="button"/);
    expect(short).toContain('data-help-mode="tooltip"');
    expect(renderToStaticMarkup(<HelpTip content={THREE} />)).toContain('data-help-mode="popover"');
    expect(renderToStaticMarkup(<HelpTip content={SHORT} onTour={() => {}} />)).toContain('data-help-mode="popover"');
  });

  it('nội dung chưa hiện khi chưa mở', () => {
    expect(renderToStaticMarkup(<HelpTip content={SHORT} />)).not.toContain(SHORT);
  });
});
