import type { CompanyProfile, UpdateCompanyProfileInput } from '@/types/companySettings';

export interface CompanyProfileForm {
  address: string;
  responsibleName: string;
  responsibleAddress: string;
}

export const PROFILE_MAX = 500;

export const toProfileForm = (p: CompanyProfile): CompanyProfileForm => ({
  address: p.address ?? '',
  responsibleName: p.responsibleName ?? '',
  responsibleAddress: p.responsibleAddress ?? '',
});

const orNull = (v: string) => v.trim() || null;

/** Ô để trống gửi null: tổ chức chịu trách nhiệm theo tên, địa chỉ công ty (FE#267) */
export const toProfileBody = (v: CompanyProfileForm, version: number): UpdateCompanyProfileInput => ({
  address: orNull(v.address),
  responsibleName: orNull(v.responsibleName),
  responsibleAddress: orNull(v.responsibleAddress),
  version,
});
