import { describe, expect, it } from 'vitest';
import type { CompanyProfile } from '@/types/companySettings';
import { toProfileBody, toProfileForm } from './companyProfile';

const profile: CompanyProfile = {
  id: 'c1',
  name: 'Công ty A',
  taxCode: '0312',
  address: '1 Lê Lợi',
  responsibleName: null,
  responsibleAddress: null,
  effectiveResponsible: { name: 'Công ty A', address: '1 Lê Lợi' },
  version: 3,
};

describe('Form hồ sơ công ty (FE#267)', () => {
  it('null hiện thành ô trống', () => {
    expect(toProfileForm(profile)).toEqual({ taxCode: '', address: '1 Lê Lợi', responsibleName: '', responsibleAddress: '' });
  });

  it('ô trống hay chỉ có khoảng trắng gửi null, còn lại cắt khoảng trắng, kèm version', () => {
    expect(toProfileBody({ taxCode: ' ', address: ' 2 Hai Bà Trưng ', responsibleName: '  ', responsibleAddress: '' }, 3)).toEqual({
      address: '2 Hai Bà Trưng',
      responsibleName: null,
      responsibleAddress: null,
      version: 3,
    });
  });

  it('mã số thuế chỉ gửi khi có nhập (commerio-backend#459)', () => {
    const body = toProfileBody({ taxCode: ' 0312345678 ', address: '', responsibleName: '', responsibleAddress: '' }, 4);
    expect(body).toMatchObject({ taxCode: '0312345678', version: 4 });
  });
});
