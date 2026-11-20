import { describe, expect, it } from 'vitest';
import type { Membership } from '@/types/auth';
import { companyEntry } from './companyEntry';

function m(companyName: string, opts: Partial<Membership> = {}): Membership {
  return {
    companyId: `id-${companyName}`,
    companyName,
    companyStatus: 'active',
    status: 'active',
    roles: ['CEO'],
    ...opts,
  };
}

describe('companyEntry (US-CT-02)', () => {
  it('không thuộc công ty nào: none', () => {
    expect(companyEntry([])).toEqual({ kind: 'none' });
  });

  it('một công ty: vào thẳng, không thông báo', () => {
    expect(companyEntry([m('A')])).toEqual({ kind: 'auto', companyId: 'id-A', lockedNotice: null });
  });

  it('hai công ty dùng được: chọn trong danh sách', () => {
    expect(companyEntry([m('A'), m('B')])).toEqual({ kind: 'choose' });
  });

  it('hai công ty dùng được, một bị khoá: vẫn chọn', () => {
    expect(companyEntry([m('A'), m('B'), m('C', { companyStatus: 'locked' })])).toEqual({ kind: 'choose' });
  });

  it('một dùng được, một công ty bị khoá: vào thẳng công ty còn lại, báo công ty khoá', () => {
    const entry = companyEntry([m('Công ty A', { companyStatus: 'locked' }), m('B')]);
    expect(entry).toEqual({
      kind: 'auto',
      companyId: 'id-B',
      lockedNotice: 'Công ty A đang bị khoá, dữ liệu vẫn giữ nguyên. Liên hệ CEO công ty đó.',
    });
  });

  it('nhiều chỗ khoá gộp một câu; tài khoản bị khoá ở công ty ghi riêng', () => {
    const entry = companyEntry([
      m('A', { companyStatus: 'locked' }),
      m('B', { companyStatus: 'locked' }),
      m('C', { status: 'locked' }),
      m('D'),
    ]);
    expect(entry).toEqual({
      kind: 'auto',
      companyId: 'id-D',
      lockedNotice:
        'A, B đang bị khoá, dữ liệu vẫn giữ nguyên; tài khoản của bạn bị khoá ở C. Liên hệ CEO công ty đó.',
    });
  });

  it('mọi công ty đều bị khoá: all_locked', () => {
    expect(companyEntry([m('A', { companyStatus: 'locked' }), m('B', { status: 'locked' })])).toEqual({
      kind: 'all_locked',
    });
  });
});
