import { describe, expect, it } from 'vitest';
import { editMoneyInput } from './moneyInputEdit';

/** Gõ chữ `ch` vào `text` tại vị trí `at` */
const type = (text: string, at: number, ch: string) => editMoneyInput(text, text.slice(0, at) + ch + text.slice(at), at + ch.length, 'insertText');
const backspace = (text: string, at: number) =>
  editMoneyInput(text, text.slice(0, at - 1) + text.slice(at), at - 1, 'deleteContentBackward');
const del = (text: string, at: number) => editMoneyInput(text, text.slice(0, at) + text.slice(at + 1), at, 'deleteContentForward');
const paste = (text: string, pasted: string) => editMoneyInput(text, pasted, pasted.length, 'insertFromPaste');

describe('editMoneyInput (FE#385)', () => {
  it('gõ 1500000 từng chữ số thấy 1.500.000', () => {
    let s = { text: '', caret: 0 };
    for (const ch of '1500000') s = type(s.text, s.caret, ch);
    expect(s).toEqual({ text: '1.500.000', caret: 9 });
  });

  it('chèn chữ số giữa chuỗi giữ con trỏ sau chữ số vừa gõ', () => {
    // "1.5|00.000" gõ 9 → "15.900.000", con trỏ sau 9
    expect(type('1.500.000', 3, '9')).toEqual({ text: '15.900.000', caret: 4 });
    // "1|.500" gõ 2 → "12.500", con trỏ sau 2
    expect(type('1.500', 1, '2')).toEqual({ text: '12.500', caret: 2 });
  });

  it('xoá chữ số giữa chuỗi giữ con trỏ', () => {
    // "15.9|00.000" Backspace → "1.500.000", con trỏ sau 5
    expect(backspace('15.900.000', 4)).toEqual({ text: '1.500.000', caret: 3 });
    // "1.|500" Delete → "100"
    expect(del('1.500', 2)).toEqual({ text: '100', caret: 1 });
  });

  it('Backspace trúng dấu chấm xoá chữ số bên trái, Delete xoá chữ số bên phải', () => {
    // "12.|500" Backspace xoá "." → xoá luôn "2"
    expect(backspace('12.500', 3)).toEqual({ text: '1.500', caret: 1 });
    // "12|.500" Delete xoá "." → xoá luôn "5"
    expect(del('12.500', 2)).toEqual({ text: '1.200', caret: 3 });
  });

  it('xoá hết còn chuỗi rỗng, bỏ số 0 đầu', () => {
    expect(backspace('5', 1)).toEqual({ text: '', caret: 0 });
    expect(type('0', 1, '5')).toEqual({ text: '5', caret: 1 });
  });

  it('dán chuỗi hợp lệ thì định dạng lại', () => {
    expect(paste('', '1,500,000')).toEqual({ text: '1.500.000', caret: 9 });
    expect(paste('', '1500000')).toEqual({ text: '1.500.000', caret: 9 });
    expect(paste('', '1.500.000 đ')).toEqual({ text: '1.500.000', caret: 9 });
  });

  it('dán hoặc gõ chuỗi mơ hồ thì giữ nguyên chữ người dùng, không đoán', () => {
    expect(paste('', '150.5')).toEqual({ text: '150.5', caret: 5 });
    expect(paste('', '1.500.000,50')).toEqual({ text: '1.500.000,50', caret: 12 });
    expect(type('1.500', 5, ',')).toEqual({ text: '1.500,', caret: 6 });
    expect(type('150', 3, 'a')).toEqual({ text: '150a', caret: 4 });
  });

  it('gõ tay có dấu chấm: định dạng lại khi chuỗi thành hợp lệ', () => {
    let s = { text: '1.500', caret: 5 };
    for (const ch of '.000') s = type(s.text, s.caret, ch);
    expect(s).toEqual({ text: '1.500.000', caret: 9 });
  });
});
