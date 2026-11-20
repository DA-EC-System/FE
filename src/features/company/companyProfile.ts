import type { CompanyProfile, UpdateCompanyProfileInput } from '@/types/companySettings';

export interface CompanyProfileForm {
  /** Chỉ hiện, chỉ gửi khi công ty chưa có mã số thuế (commerio-backend#459) */
  taxCode: string;
  address: string;
  responsibleName: string;
  responsibleAddress: string;
}

export const PROFILE_MAX = 500;

export const toProfileForm = (p: CompanyProfile): CompanyProfileForm => ({
  taxCode: '',
  address: p.address ?? '',
  responsibleName: p.responsibleName ?? '',
  responsibleAddress: p.responsibleAddress ?? '',
});

const orNull = (v: string) => v.trim() || null;

/**
 * Ô để trống gửi null: tổ chức chịu trách nhiệm theo tên, địa chỉ công ty (FE#267). Mã số thuế chỉ gửi khi có nhập
 * (BE nhận khi công ty đang không có mã, commerio-backend#459).
 */
export const toProfileBody = (v: CompanyProfileForm, version: number): UpdateCompanyProfileInput => ({
  ...(v.taxCode.trim() ? { taxCode: v.taxCode.trim() } : {}),
  address: orNull(v.address),
  responsibleName: orNull(v.responsibleName),
  responsibleAddress: orNull(v.responsibleAddress),
  version,
});
